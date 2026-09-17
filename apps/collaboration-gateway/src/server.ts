import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import {
  parseRoomKey,
  type CollaborationClientMessage,
  type CollaborationServerMessage,
  type RoomPublishRequest,
} from '@orvilo/types';
import { WebSocketServer, type WebSocket } from 'ws';

import { PRESENCE_SWEEP_MS, RoomHub, type GatewayConnection } from './rooms';
import { verifyPublishToken, verifyRoomTicket, type GatewayTicket } from './ticket';

export interface GatewayOptions {
  hub?: RoomHub;
  /** Milliseconds between presence TTL sweeps; 0 disables the timer. */
  sweepIntervalMs?: number;
}

const WS_PATH = '/collaboration';

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
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const bearerToken = (req: IncomingMessage): string | null => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPublishRequest = (value: unknown): value is RoomPublishRequest =>
  isRecord(value) &&
  typeof value.room === 'string' &&
  isRecord(value.publish) &&
  (value.publish.kind === 'broadcast' || value.publish.kind === 'kick');

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
      sendJson(res, 200, { connections: hub.connectionCount, ok: true });
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
          // Kick scope is the workspace room the notice was projected for.
          const room = parseRoomKey(body.room);
          if (room?.scope === 'workspace') {
            hub.kick(room.id, body.publish.userId, body.publish.reason);
          }
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

  const wss = new WebSocketServer({ noServer: true });

  const handleConnection = (ws: WebSocket, ticket: GatewayTicket) => {
    const connectionId = randomUUID();

    const connection: GatewayConnection = {
      actor: ticket.actor,
      connectionId,
      room: ticket.room,
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
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
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
