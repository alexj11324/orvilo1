import debug from 'debug';

import type { PresenceEntry, RoomPublishEnvelope } from '@orvilo/types';

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
  presence?(room: string): Promise<PresenceEntry[]>;
  publish(room: string, publish: RoomPublishEnvelope): Promise<void>;
}

/**
 * In-process adapter: the mounted gateway registers itself on a global bus key
 * so single-process dev (hono standalone + gateway attach) delivers without a
 * second process. Unmounted, every call is a deliberate no-op — polling
 * clients still converge through `snapshot`.
 */
export const LOCAL_ROOM_BUS_KEY = Symbol.for('orvilo.collaboration.localRoomBus');

export interface LocalRoomBus {
  kick(room: string, userId: string, reason: string): void;
  presence(room: string): PresenceEntry[];
  publish(room: string, message: unknown): void;
}

const getLocalBus = (): LocalRoomBus | null =>
  (globalThis as Record<symbol, unknown>)[LOCAL_ROOM_BUS_KEY] as LocalRoomBus | null;

const localRoomPublisher: RoomPublisher = {
  presence: async (room) => getLocalBus()?.presence(room) ?? [],
  publish: async (room, publish) => {
    const bus = getLocalBus();
    if (!bus) return;
    if (publish.kind === 'kick') bus.kick(room, publish.userId, publish.reason);
    else bus.publish(room, publish.message);
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
    authorization: `Bearer ${await signGatewayPublishToken()}`,
    'content-type': 'application/json',
  });

  return {
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
    publish: async (room, publish) => {
      const response = await fetch(publishUrl, {
        body: JSON.stringify({ publish, room }),
        headers: await authHeaders(),
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`gateway publish failed with HTTP ${response.status}`);
      }
    },
  };
};

/**
 * Publisher selection: `COLLABORATION_GATEWAY_URL` set → HTTP adapter for the
 * standalone gateway process; unset → the in-process local bus (no-op until a
 * gateway is mounted in this process).
 */
export const createRoomPublisher = (gatewayUrl = process.env.COLLABORATION_GATEWAY_URL) =>
  gatewayUrl ? httpRoomPublisher(gatewayUrl) : localRoomPublisher;

/** Resolved per call so dev env changes (and tests) don't require a reload. */
export const getRoomPublisher = (): RoomPublisher => createRoomPublisher();

/**
 * Public URL clients dial — what `collaboration.authorize` hands back.
 * Returns `null` when no gateway is configured: outside development an
 * unset gateway must fail closed, because the `localhost` default would send
 * a production browser to a WebSocket on the user's own machine. Callers must
 * treat `null` as "collaboration unavailable", not as a URL to ship.
 */
export const gatewayConnectUrl = (): string | null =>
  process.env.COLLABORATION_GATEWAY_PUBLIC_URL ||
  process.env.COLLABORATION_GATEWAY_URL ||
  (process.env.NODE_ENV === 'development' ? 'ws://localhost:3012/collaboration' : null);
