import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import {
  COLLABORATION_GATEWAY_PROTOCOL_VERSION,
  type CollaborationClientMessage,
  type CollaborationServerMessage,
  GATEWAY_PROTOCOL_VERSION_HEADER,
  parseRoomKey,
  type RoomPublishRequest,
} from '@orvilo/types';
import { type WebSocket, WebSocketServer } from 'ws';

import { type GatewayConnection, PRESENCE_SWEEP_MS, RoomHub } from './rooms';
import { type GatewayTicket, verifyPublishToken, verifyRoomTicket } from './ticket';

export interface GatewayOptions {
  hub?: RoomHub;
  /** Milliseconds between presence TTL sweeps; 0 disables the timer. */
  sweepIntervalMs?: number;
}

const WS_PATH = '/collaboration';

/**
 * Hard bound on a single client frame. Presence payloads are small JSON and
 * the state fans out verbatim to the whole room — an unbounded frame would
 * let one client amplify a huge buffer through every peer's socket.
 * `maxPayload` is the transport-level enforcement; the byteLength check in
 * the message handler keeps oversized buffers out of `JSON.parse` even if a
 * frame slips through a non-ws path in tests.
 */
const MAX_MESSAGE_BYTES = 64 * 1024;

const readBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
};

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    // The projector treats a scoped kick acked without this marker as
    // undelivered — see `RoomPublisher` in apps/server.
    [GATEWAY_PROTOCOL_VERSION_HEADER]: String(COLLABORATION_GATEWAY_PROTOCOL_VERSION),
  });
  res.end(JSON.stringify(body));
};

const bearerToken = (req: IncomingMessage): string | null => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const KICK_SCOPES = new Set(['project', 'task', 'workspace']);

const isPublishRequest = (value: unknown): value is RoomPublishRequest =>
  isRecord(value) &&
  typeof value.room === 'string' &&
  isRecord(value.publish) &&
  (value.publish.kind === 'broadcast' ||
    value.publish.kind === 'presence-visibility' ||
    value.publish.kind === 'kick');

const presenceVisibilityParams = (
  publish: unknown,
): { epoch?: string; userId: string; visible: boolean } | null => {
  if (!isRecord(publish)) return null;
  if (
    (publish.epoch !== undefined && typeof publish.epoch !== 'string') ||
    typeof publish.userId !== 'string' ||
    typeof publish.visible !== 'boolean'
  )
    return null;
  const userId = publish.userId.trim();
  return userId === publish.userId &&
    userId.length > 0 &&
    userId.length <= 256 &&
    (publish.epoch === undefined || (publish.epoch.length > 0 && publish.epoch.length <= 128))
    ? { epoch: publish.epoch as string | undefined, userId, visible: publish.visible }
    : null;
};

/**
 * Normalize a kick envelope into hub parameters. New-style kicks carry the
 * revocation contract explicitly — scope/scopeId, tenant and the authz
 * version the revoking write stamped. The legacy `{reason,userId}` shape
 * coerces to a workspace kick only when published to a workspace room, so a
 * stale projector can never project-kick by accident. Returns null on any
 * malformed field — a kick that cannot be scoped must not fire at all.
 */
const kickParams = (publish: unknown, room: string) => {
  if (!isRecord(publish)) return null;
  if (typeof publish.userId !== 'string' || typeof publish.reason !== 'string') return null;
  if (
    publish.scope !== undefined ||
    publish.scopeId !== undefined ||
    publish.workspaceId !== undefined
  ) {
    if (
      !KICK_SCOPES.has(publish.scope as string) ||
      typeof publish.scopeId !== 'string' ||
      typeof publish.workspaceId !== 'string' ||
      (publish.authzVersion !== undefined && typeof publish.authzVersion !== 'number')
    ) {
      return null;
    }
    return {
      authzVersion: publish.authzVersion as number | undefined,
      reason: publish.reason,
      scope: publish.scope as 'project' | 'task' | 'workspace',
      scopeId: publish.scopeId,
      userId: publish.userId,
      workspaceId: publish.workspaceId,
    };
  }
  const parsed = parseRoomKey(room);
  if (parsed?.scope !== 'workspace') return null;
  return {
    reason: publish.reason,
    scope: 'workspace' as const,
    scopeId: parsed.id,
    userId: publish.userId,
    workspaceId: parsed.id,
  };
};

const isClientMessage = (value: unknown): value is CollaborationClientMessage =>
  isRecord(value) && (value.type === 'presence' || value.type === 'ping');

/**
 * The standalone gateway: one HTTP server carrying both surfaces —
 *
 * - WS upgrade on `/collaboration?room={scope}:{id}&token={ticket}`. The
 *   ticket's signed `room` claim must equal the requested room: naming a room
 *   grants nothing without a matching server-minted ticket.
 * - `/internal/publish` + `/internal/presence` for the server-side outbox
 *   projector, guarded by the `collaboration-gateway-publish` JWT purpose.
 * - `/health` for load-balancer probes.
 */
export const createGatewayServer = (options: GatewayOptions = {}) => {
  const hub = options.hub ?? new RoomHub();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        connections: hub.connectionCount,
        ok: true,
        protocol: COLLABORATION_GATEWAY_PROTOCOL_VERSION,
      });
      return;
    }

    if (url.pathname.startsWith('/internal/')) {
      const token = bearerToken(req);
      if (!token || !(await verifyPublishToken(token))) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/internal/presence') {
        const room = url.searchParams.get('room') ?? '';
        sendJson(res, 200, { presence: hub.presence(room) });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/internal/publish') {
        const body = await readBody(req);
        if (!isPublishRequest(body)) {
          sendJson(res, 400, { error: 'invalid publish request' });
          return;
        }
        if (body.publish.kind === 'kick') {
          const kick = kickParams(body.publish, body.room);
          // A kick that cannot be scoped to an explicit revocation contract
          // must not fire at all — closing "something" is worse than 400.
          if (!kick) {
            sendJson(res, 400, { error: 'invalid kick envelope' });
            return;
          }
          hub.kick(kick);
        } else if (body.publish.kind === 'presence-visibility') {
          const visibility = presenceVisibilityParams(body.publish);
          if (!visibility) {
            sendJson(res, 400, { error: 'invalid presence visibility envelope' });
            return;
          }
          hub.setUserPresenceVisibility(visibility.userId, visibility.visible, visibility.epoch);
        } else {
          hub.broadcast(body.room, body.publish.message);
        }
        sendJson(res, 202, { ok: true });
        return;
      }

      sendJson(res, 404, { error: 'not found' });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  });

  const wss = new WebSocketServer({ maxPayload: MAX_MESSAGE_BYTES, noServer: true });

  const handleConnection = (ws: WebSocket, ticket: GatewayTicket) => {
    const connectionId = randomUUID();

    const connection: GatewayConnection = {
      actor: ticket.actor,
      authzVersion: ticket.authzVersion,
      connectionId,
      presenceVisible: ticket.presenceVisible,
      presenceVisibilityEpoch: ticket.presenceVisibilityEpoch,
      projectId: ticket.projectId,
      room: ticket.room,
      ticketExpiresAt: ticket.expiresAt,
      userId: ticket.userId,
      workspaceId: ticket.workspaceId,
      close: (code, reason) => ws.close(code, reason),
      send: (message: CollaborationServerMessage) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
      },
    };

    const presence = hub.join(connection);
    connection.send({ activities: [], connectionId, presence, type: 'snapshot' });

    ws.on('message', (data) => {
      const bytes = Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
          ? Buffer.from(data)
          : data;
      if (bytes.byteLength > MAX_MESSAGE_BYTES) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(bytes.toString('utf8'));
      } catch {
        return;
      }
      if (!isClientMessage(parsed)) return;

      if (parsed.type === 'ping') {
        connection.send({ type: 'pong' });
        return;
      }
      hub.updatePresence(connectionId, connection.room, parsed.state);
    });

    ws.on('close', () => hub.leave(connectionId, connection.room));
    ws.on('error', () => {
      // 'close' follows 'error' on ws — presence cleanup happens there once.
    });
  };

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }

    const room = url.searchParams.get('room') ?? '';
    const token = url.searchParams.get('token') ?? '';
    const ticket = token ? await verifyRoomTicket(token) : null;

    // The ticket must exist AND name exactly this room — a ticket minted for
    // `task:a` never opens `task:b`, and a forged room param gains nothing.
    if (!ticket || ticket.room !== room || !parseRoomKey(room)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, ticket);
    });
  });

  const sweep =
    options.sweepIntervalMs === 0
      ? null
      : setInterval(() => hub.sweepExpired(), options.sweepIntervalMs ?? PRESENCE_SWEEP_MS);
  sweep?.unref();

  const close = async () => {
    if (sweep) clearInterval(sweep);
    for (const ws of wss.clients) ws.terminate();
    await new Promise<void>((resolve) => {
      wss.close(() => server.close(() => resolve()));
    });
  };

  return { close, hub, server, wss };
};

export const listenGateway = async (port: number, options?: GatewayOptions) => {
  const gateway = createGatewayServer(options);
  await new Promise<void>((resolve, reject) => {
    gateway.server.once('error', reject);
    gateway.server.listen(port, () => resolve());
  });
  return gateway;
};

export type { Server as GatewayHttpServer };
