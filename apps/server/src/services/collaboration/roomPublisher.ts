import {
  COLLABORATION_GATEWAY_PRESENCE_VISIBILITY_VERSION,
  COLLABORATION_GATEWAY_SCOPED_KICK_VERSION,
  GATEWAY_PROTOCOL_VERSION_HEADER,
  type PresenceEntry,
  type RoomKickParams,
  type RoomPublishEnvelope,
} from '@orvilo/types';
import debug from 'debug';

import { signGatewayPublishToken } from './ticket';

const log = debug('lobe-server:collaboration:publisher');

/**
 * Server-side publish hook the outbox projection writes through. `broadcast`
 * fans a protocol message out to the room; `kick` drops a member's live
 * connections (authz revocation). Publishing is best-effort by design: a
 * failed push never undoes the committed business write — reconnects recover
 * state through `collaboration.snapshot`.
 */
export interface RoomPublisher {
  /** Live presence for snapshot fallback; optional (empty when unavailable). */
  presence?: (room: string) => Promise<PresenceEntry[]>;
  publish: (room: string, publish: RoomPublishEnvelope) => Promise<void>;
  /** Immediately suppress one human user's presence on all existing sockets. */
  setUserPresenceVisibility: (userId: string, visible: boolean, epoch?: string) => Promise<void>;
}

/**
 * In-process adapter: the mounted gateway registers itself on a global bus key
 * so single-process dev (hono standalone + gateway attach) delivers without a
 * second process. Unmounted, every call is a deliberate no-op — polling
 * clients still converge through `snapshot`.
 */
export const LOCAL_ROOM_BUS_KEY = Symbol.for('orvilo.collaboration.localRoomBus');

export interface LocalRoomBus {
  kick: (room: string, userId: string, reason: string) => void;
  /**
   * Scoped-kick contract matching the v2 gateway: the full revocation
   * envelope (scope, tenant, authz version). Buses without it predate the
   * scoped protocol — the publisher then fails non-workspace kicks closed so
   * the outbox retries instead of marking the revocation delivered.
   */
  kickScoped?: (room: string, params: RoomKickParams) => void;
  presence: (room: string) => PresenceEntry[];
  publish: (room: string, message: unknown) => void;
  setUserPresenceVisibility?: (userId: string, visible: boolean, epoch?: string) => void;
}

const getLocalBus = (): LocalRoomBus | null =>
  (globalThis as Record<symbol, unknown>)[LOCAL_ROOM_BUS_KEY] as LocalRoomBus | null;

const setVisibilityOnLocalBus = (userId: string, visible: boolean, epoch?: string) => {
  const bus = getLocalBus();
  if (!bus) {
    // A configured gateway (including the development localhost default)
    // may hold stale visible sockets. Failing here keeps the setting mutation
    // truthful; a production deployment with collaboration fully disabled has
    // no sockets to conceal and can safely persist the preference.
    if (
      process.env.COLLABORATION_GATEWAY_PUBLIC_URL ||
      process.env.COLLABORATION_GATEWAY_URL ||
      process.env.NODE_ENV === 'development'
    ) {
      throw new Error('collaboration gateway conceal control is unavailable');
    }
    return;
  }
  if (!bus.setUserPresenceVisibility) {
    throw new Error('local room bus does not support presence visibility control');
  }
  bus.setUserPresenceVisibility(userId, visible, epoch);
};

const localRoomPublisher: RoomPublisher = {
  setUserPresenceVisibility: async (userId, visible, epoch) =>
    setVisibilityOnLocalBus(userId, visible, epoch),
  presence: async (room) => getLocalBus()?.presence(room) ?? [],
  publish: async (room, publish) => {
    if (publish.kind === 'presence-visibility') {
      setVisibilityOnLocalBus(publish.userId, publish.visible, publish.epoch);
      return;
    }
    const bus = getLocalBus();
    if (!bus) return;
    if (publish.kind === 'broadcast') {
      bus.publish(room, publish.message);
      return;
    }
    const { kind: _kind, ...params } = publish;
    if (bus.kickScoped) {
      bus.kickScoped(room, params);
      return;
    }
    // A pre-v2 bus only knows workspace teardown — a project/task kick that
    // reported success without firing would strand the member's sockets.
    if (params.scope !== 'workspace') {
      throw new Error(`local room bus cannot deliver ${params.scope}-scoped kicks`);
    }
    bus.kick(room, params.userId, params.reason);
  },
};

/**
 * HTTP adapter for the standalone gateway: `POST /internal/publish` guarded
 * by a short-lived server JWT (`collaboration-gateway-publish` purpose).
 */
const httpRoomPublisher = (gatewayUrl: string): RoomPublisher => {
  const publishUrl = `${gatewayUrl.replace(/\/$/, '')}/internal/publish`;
  const presenceUrl = `${gatewayUrl.replace(/\/$/, '')}/internal/presence`;

  const authHeaders = async () => ({
    'authorization': `Bearer ${await signGatewayPublishToken()}`,
    'content-type': 'application/json',
  });

  const publish = async (room: string, publish: RoomPublishEnvelope) => {
    const response = await fetch(publishUrl, {
      body: JSON.stringify({ publish, room }),
      headers: await authHeaders(),
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`gateway publish failed with HTTP ${response.status}`);
    }

    const requiredVersion =
      publish.kind === 'presence-visibility'
        ? COLLABORATION_GATEWAY_PRESENCE_VISIBILITY_VERSION
        : publish.kind === 'kick' && publish.scope !== 'workspace'
          ? COLLABORATION_GATEWAY_SCOPED_KICK_VERSION
          : null;
    if (requiredVersion === null) return;

    const raw = response.headers.get(GATEWAY_PROTOCOL_VERSION_HEADER);
    const version = raw === null ? null : Number(raw);
    if (version === null || !Number.isInteger(version) || version < requiredVersion) {
      const operation =
        publish.kind === 'kick' ? `${publish.scope}-scoped kicks` : 'presence visibility control';
      throw new Error(
        `gateway does not support ${operation} (protocol ${
          version === null ? `pre-v${requiredVersion}` : String(version)
        })`,
      );
    }
  };

  return {
    setUserPresenceVisibility: (userId, visible, epoch) =>
      publish('', { epoch, kind: 'presence-visibility', userId, visible }),
    presence: async (room) => {
      try {
        const response = await fetch(`${presenceUrl}?room=${encodeURIComponent(room)}`, {
          headers: await authHeaders(),
        });
        if (!response.ok) return [];
        const body = (await response.json()) as { presence?: PresenceEntry[] };
        return body.presence ?? [];
      } catch (error) {
        log('presence fetch failed for %s: %O', room, error);
        return [];
      }
    },
    publish,
  };
};

/**
 * Derives the gateway's internal HTTP base from the client-facing ws URL for
 * deployments that only set `COLLABORATION_GATEWAY_PUBLIC_URL` — otherwise
 * server-side publishes (concealment, scoped kicks) could never reach the
 * standalone gateway. `wss://host[/…/collaboration]` → `https://host[/…]`.
 */
const publicGatewayHttpUrl = (): string | undefined => {
  const url = process.env.COLLABORATION_GATEWAY_PUBLIC_URL;
  if (!url || !/^wss?:\/\//.test(url)) return undefined;
  return url.replace(/^ws/, 'http').replace(/\/collaboration\/?$/, '');
};

/**
 * Publisher selection: `COLLABORATION_GATEWAY_URL` set → HTTP adapter for the
 * standalone gateway process; else the in-process local bus when a gateway is
 * mounted here; else the public URL converted to its internal HTTP base; else
 * the standalone localhost gateway in development.
 */
export const createRoomPublisher = (gatewayUrl = process.env.COLLABORATION_GATEWAY_URL) => {
  if (gatewayUrl) return httpRoomPublisher(gatewayUrl);
  if (getLocalBus()) return localRoomPublisher;
  const publicHttp = publicGatewayHttpUrl();
  if (publicHttp) return httpRoomPublisher(publicHttp);
  if (process.env.NODE_ENV === 'development') return httpRoomPublisher('http://localhost:3012');
  return localRoomPublisher;
};

/** Resolved per call so dev env changes (and tests) don't require a reload. */
export const getRoomPublisher = (): RoomPublisher => createRoomPublisher();

/**
 * Public URL clients dial — what `collaboration.authorize` hands back.
 * Returns `null` when no gateway is configured: outside development an
 * unset gateway must fail closed, because the `localhost` default would send
 * a production browser to a WebSocket on the user's own machine. Callers must
 * treat `null` as "collaboration unavailable", not as a URL to ship.
 */
export const gatewayConnectUrl = (): string | null => {
  const url = process.env.COLLABORATION_GATEWAY_PUBLIC_URL || process.env.COLLABORATION_GATEWAY_URL;
  // Only ws(s) endpoints are client-dialable: deployments also point
  // COLLABORATION_GATEWAY_URL at the gateway's internal http base for
  // publish-side traffic, and handing that to a browser is not a WebSocket.
  if (url && /^wss?:\/\//.test(url)) return url;
  return process.env.NODE_ENV === 'development' ? 'ws://localhost:3012/collaboration' : null;
};
