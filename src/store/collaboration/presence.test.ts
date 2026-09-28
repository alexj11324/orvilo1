import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_PRUNE_GRACE_MS,
  applyPresenceBroadcast,
  cursorPresence,
  dedupePresenceByActor,
  dropPresence,
  liveActivities,
  PRESENCE_TTL_MS,
  pruneExpiredActivities,
  pruneStalePresence,
  upsertActivity,
} from './presence';
import type { PresenceBroadcast, PresenceEntry, ServerActivityEvent } from './types';

const broadcast = (overrides: Partial<PresenceBroadcast> = {}): PresenceBroadcast => ({
  actor: { id: 'user-1', kind: 'human', name: 'Ada' },
  connectionId: 'conn-1',
  state: {},
  ...overrides,
});

const entry = (overrides: Partial<PresenceEntry> = {}): PresenceEntry => ({
  ...broadcast(),
  receivedAt: 1_000,
  ...overrides,
});

const activity = (overrides: Partial<ServerActivityEvent> = {}): ServerActivityEvent => ({
  action: 'task.update',
  actor: { id: 'agent-1', kind: 'agent' },
  entityVersion: 1,
  eventId: 'evt-1',
  expiresAt: new Date(10_000).toISOString(),
  occurredAt: new Date(5_000).toISOString(),
  phase: 'started',
  projectId: 'project-1',
  target: { anchor: 'card', entityId: 'task-1', entityType: 'task' },
  workspaceId: 'ws-1',
  ...overrides,
});

describe('applyPresenceBroadcast', () => {
  it('inserts a new connection and dedupes repeat updates by connectionId', () => {
    const first = applyPresenceBroadcast({}, broadcast(), 100);
    expect(Object.keys(first)).toEqual(['conn-1']);
    expect(first['conn-1'].receivedAt).toBe(100);

    const second = applyPresenceBroadcast(first, broadcast({ state: { typing: true } }), 200);
    expect(Object.keys(second)).toEqual(['conn-1']);
    expect(second['conn-1'].state.typing).toBe(true);
    expect(second['conn-1'].receivedAt).toBe(200);
  });

  it('keeps separate connectionIds side by side', () => {
    const next = applyPresenceBroadcast(
      applyPresenceBroadcast({}, broadcast(), 100),
      broadcast({ connectionId: 'conn-2' }),
      100,
    );
    expect(Object.keys(next).sort()).toEqual(['conn-1', 'conn-2']);
  });
});

describe('dropPresence', () => {
  it('removes an existing connection', () => {
    const presence = { 'conn-1': entry() };
    expect(dropPresence(presence, 'conn-1')).toEqual({});
  });

  it('returns the same object for a missing connection (no useless write)', () => {
    const presence = { 'conn-1': entry() };
    expect(dropPresence(presence, 'conn-missing')).toBe(presence);
  });
});

describe('pruneStalePresence', () => {
  it('drops entries older than the TTL and keeps fresh ones', () => {
    const now = 100_000;
    const presence = {
      fresh: entry({ connectionId: 'fresh', receivedAt: now - 1_000 }),
      stale: entry({ connectionId: 'stale', receivedAt: now - PRESENCE_TTL_MS - 1 }),
    };
    const next = pruneStalePresence(presence, now);
    expect(Object.keys(next)).toEqual(['fresh']);
  });

  it('returns the same object when nothing is stale', () => {
    const now = 100_000;
    const presence = { fresh: entry({ connectionId: 'fresh', receivedAt: now }) };
    expect(pruneStalePresence(presence, now)).toBe(presence);
  });

  it('keeps an entry exactly at the TTL boundary', () => {
    const now = 100_000;
    const presence = {
      edge: entry({ connectionId: 'edge', receivedAt: now - PRESENCE_TTL_MS }),
    };
    expect(pruneStalePresence(presence, now)).toBe(presence);
  });
});

describe('dedupePresenceByActor', () => {
  it('merges multiple connections of the same actor into one summary', () => {
    const summaries = dedupePresenceByActor({
      'conn-1': entry(),
      'conn-2': entry({ connectionId: 'conn-2' }),
      'conn-3': entry({
        actor: { id: 'user-2', kind: 'human' },
        connectionId: 'conn-3',
      }),
    });

    expect(summaries).toHaveLength(2);
    const user1 = summaries.find((s) => s.actor.id === 'user-1');
    expect(user1?.connectionCount).toBe(2);
    expect(user1?.connectionId).toBe('conn-1');
  });

  it('distinguishes actor kind — an agent with the same id is a separate actor', () => {
    const summaries = dedupePresenceByActor({
      'conn-1': entry(),
      'conn-2': entry({
        actor: { id: 'user-1', kind: 'agent' },
        connectionId: 'conn-2',
      }),
    });
    expect(summaries).toHaveLength(2);
  });
});

describe('cursorPresence', () => {
  const cursor = {
    entityId: 'task-1',
    entityType: 'task',
    u: 0.5,
    v: 0.5,
  };

  it('returns human entries with a live cursor', () => {
    const room = {
      activities: {},
      presence: { 'conn-1': entry({ state: { cursor } }) },
      status: 'online' as const,
    };
    expect(cursorPresence(room, undefined, 2_000)).toHaveLength(1);
  });

  it('skips agents, cursor-less entries, and stale presence', () => {
    const room = {
      activities: {},
      presence: {
        'agent': entry({
          actor: { id: 'a', kind: 'agent' as const },
          connectionId: 'agent',
          state: { cursor },
        }),
        'no-cursor': entry({ connectionId: 'no-cursor' }),
        'stale': entry({
          connectionId: 'stale',
          receivedAt: 0,
          state: { cursor },
        }),
      },
      status: 'online' as const,
    };
    expect(cursorPresence(room, undefined, PRESENCE_TTL_MS + 1)).toHaveLength(0);
  });

  it('filters cursors whose viewKey differs from the local view', () => {
    const room = {
      activities: {},
      presence: {
        other: entry({
          connectionId: 'other',
          state: { cursor: { ...cursor, viewKey: 'list' } },
        }),
        same: entry({
          connectionId: 'same',
          state: { cursor: { ...cursor, viewKey: 'tasks' } },
        }),
        unscoped: entry({ connectionId: 'unscoped', state: { cursor } }),
      },
      status: 'online' as const,
    };
    const visible = cursorPresence(room, 'tasks', 2_000).map((e) => e.connectionId);
    expect(visible.sort()).toEqual(['same', 'unscoped']);
  });
});

describe('upsertActivity / pruneExpiredActivities / liveActivities', () => {
  it('keys activity by eventId and replaces in place', () => {
    const first = upsertActivity({}, activity());
    const second = upsertActivity(first, activity({ phase: 'committed' }));
    expect(Object.keys(second)).toEqual(['evt-1']);
    expect(second['evt-1'].phase).toBe('committed');
  });

  it('prunes only after expiry plus the grace window', () => {
    const activities = { 'evt-1': activity() };
    const expiry = new Date(activity().expiresAt).getTime();

    expect(pruneExpiredActivities(activities, expiry + ACTIVITY_PRUNE_GRACE_MS - 1)).toBe(
      activities,
    );
    expect(pruneExpiredActivities(activities, expiry + ACTIVITY_PRUNE_GRACE_MS)).toEqual({});
  });

  it('liveActivities returns unexpired events newest first', () => {
    const room = {
      activities: {
        a: activity({ eventId: 'a', occurredAt: new Date(1_000).toISOString() }),
        b: activity({ eventId: 'b', occurredAt: new Date(9_000).toISOString() }),
        gone: activity({
          eventId: 'gone',
          expiresAt: new Date(500).toISOString(),
        }),
      },
      presence: {},
      status: 'online' as const,
    };
    const live = liveActivities(room, 5_000).map((e) => e.eventId);
    expect(live).toEqual(['b', 'a']);
  });
});
