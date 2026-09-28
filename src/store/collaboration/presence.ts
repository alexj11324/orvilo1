import type {
  PresenceBroadcast,
  PresenceEntry,
  RoomCollaboration,
  ServerActivityEvent,
} from './types';

/**
 * Pure presence/activity reducers — the unit-tested core of the ephemeral
 * store. Nothing here touches React or the store; the action class delegates
 * to these so the rules stay testable.
 *
 * Timing notes:
 * - `PRESENCE_TTL_MS` is the local liveness cutoff for a silent disconnect —
 *   the gateway should have sent `presence-gone`, so a stale entry past this
 *   window is dropped rather than rendered as still-online.
 * - `ACTIVITY_PRUNE_GRACE_MS` keeps just-expired events briefly so a late
 *   frame doesn't make a bubble flicker out and back.
 */
export const PRESENCE_TTL_MS = 45_000;
export const ACTIVITY_PRUNE_GRACE_MS = 2_000;

/** Max simultaneous remote cursors rendered; the rest stay avatar/badges. */
export const MAX_DYNAMIC_CURSORS = 8;
/** Max expanded agent-action bubbles on screen; the rest merge into a count. */
export const MAX_EXPANDED_BUBBLES = 3;

export const applyPresenceBroadcast = (
  presence: Record<string, PresenceEntry>,
  broadcast: PresenceBroadcast,
  receivedAt: number,
): Record<string, PresenceEntry> => ({
  ...presence,
  [broadcast.connectionId]: { ...broadcast, receivedAt },
});

export const dropPresence = (
  presence: Record<string, PresenceEntry>,
  connectionId: string,
): Record<string, PresenceEntry> => {
  if (!presence[connectionId]) return presence;
  const next = { ...presence };
  delete next[connectionId];
  return next;
};

/** Drop entries whose last update is older than the liveness window. */
export const pruneStalePresence = (
  presence: Record<string, PresenceEntry>,
  now: number,
  ttlMs = PRESENCE_TTL_MS,
): Record<string, PresenceEntry> => {
  let changed = false;
  const next: Record<string, PresenceEntry> = {};
  for (const [connectionId, entry] of Object.entries(presence)) {
    if (now - entry.receivedAt > ttlMs) {
      changed = true;
    } else {
      next[connectionId] = entry;
    }
  }
  return changed ? next : presence;
};

/** Insert or replace an activity event keyed by its stable eventId. */
export const upsertActivity = (
  activities: Record<string, ServerActivityEvent>,
  event: ServerActivityEvent,
): Record<string, ServerActivityEvent> => ({ ...activities, [event.eventId]: event });

/** Drop activities whose animation window has fully expired (+grace). */
export const pruneExpiredActivities = (
  activities: Record<string, ServerActivityEvent>,
  now: number,
): Record<string, ServerActivityEvent> => {
  let changed = false;
  const next: Record<string, ServerActivityEvent> = {};
  for (const [eventId, event] of Object.entries(activities)) {
    if (new Date(event.expiresAt).getTime() + ACTIVITY_PRUNE_GRACE_MS <= now) {
      changed = true;
    } else {
      next[eventId] = event;
    }
  }
  return changed ? next : activities;
};

export interface ActorPresenceSummary {
  actor: PresenceEntry['actor'];
  /** Distinct live connections behind this identity — 2 tabs means 2. */
  connectionCount: number;
  /** One representative connection for follow/highlight affordances. */
  connectionId: string;
}

/**
 * Collapse presence into one entry per actor identity. The same human in two
 * tabs produces two `connectionId`s but one avatar; an agent appearing in two
 * runs likewise merges. Order is stable (first-seen connection wins) so the
 * stack doesn't reshuffle on every presence refresh.
 */
export const dedupePresenceByActor = (
  presence: Record<string, PresenceEntry>,
): ActorPresenceSummary[] => {
  const byActor = new Map<string, ActorPresenceSummary>();
  for (const entry of Object.values(presence)) {
    const key = `${entry.actor.kind}:${entry.actor.id}`;
    const existing = byActor.get(key);
    if (existing) {
      existing.connectionCount += 1;
    } else {
      byActor.set(key, {
        actor: entry.actor,
        connectionCount: 1,
        connectionId: entry.connectionId,
      });
    }
  }
  return [...byActor.values()];
};

/** Human presence entries that carry a live cursor worth rendering. */
export const cursorPresence = (
  room: RoomCollaboration | undefined,
  viewKey: string | undefined,
  now: number,
): PresenceEntry[] => {
  if (!room) return [];
  return Object.values(room.presence).filter((entry) => {
    if (entry.actor.kind !== 'human') return false;
    const cursor = entry.state.cursor;
    if (!cursor) return false;
    if (now - entry.receivedAt > PRESENCE_TTL_MS) return false;
    // Only shared views resolve positions — different filters/sorts/layouts
    // would point at the wrong card, which is worse than no cursor at all.
    if (viewKey && cursor.viewKey && cursor.viewKey !== viewKey) return false;
    return true;
  });
};

/** Activities still inside their display window, newest first. */
export const liveActivities = (
  room: RoomCollaboration | undefined,
  now: number,
): ServerActivityEvent[] => {
  if (!room) return [];
  return Object.values(room.activities)
    .filter((event) => new Date(event.expiresAt).getTime() > now)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
};
