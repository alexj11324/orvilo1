// @vitest-environment node
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LobeChatDatabase } from '@/database/type';

import { eventOutbox } from '../contractTables';
import { buildRoomSnapshot, decodeCursor, encodeCursor } from '../snapshot';

const AGGREGATE_ID = 'task_snapshot_test';

const seedEvents = (
  db: LobeChatDatabase,
  rows: { createdAt: Date; eventId: string; eventType?: string }[],
) =>
  db.insert(eventOutbox).values(
    rows.map((row) => ({
      aggregateId: AGGREGATE_ID,
      aggregateType: 'task',
      createdAt: row.createdAt,
      eventId: row.eventId,
      eventType: row.eventType ?? 'task.test',
      payload: {},
    })),
  );

describe('buildRoomSnapshot', () => {
  let db: LobeChatDatabase;

  beforeEach(async () => {
    db = await getTestDB();
    // No gateway env → the local-bus publisher answers presence with [].
    vi.stubEnv('COLLABORATION_GATEWAY_URL', '');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.delete(eventOutbox).where(eq(eventOutbox.aggregateId, AGGREGATE_ID));
  });

  it('replays the overlap window — a late-committing row stamped before the cursor is served', async () => {
    // Regression: db `createdAt` is stamped at transaction START, so a
    // transaction open longer than COMMIT_LAG_MS commits a row whose stamp
    // predates the cursor already served. A strict `createdAt > cursor`
    // filter would lose that row forever.
    const now = Date.now();
    const cursorTime = now - 10_000;
    await seedEvents(db, [
      // Predates the cursor but inside the lag window → replayed (dedup'd client-side).
      { createdAt: new Date(cursorTime - 2_000), eventId: 'evt_late' },
      // Older than the window → genuinely history, not served again.
      { createdAt: new Date(cursorTime - 8_000), eventId: 'evt_old' },
      // Newer than the cursor, older than the watermark → served once.
      { createdAt: new Date(now - 6_000), eventId: 'evt_new' },
      // Younger than the watermark (still inside commit lag) → held for later.
      { createdAt: new Date(now - 1_000), eventId: 'evt_fresh' },
    ]);

    const cursor = encodeCursor({ i: 'evt_prev', t: cursorTime });
    const snapshot = await buildRoomSnapshot(db, {
      aggregateId: AGGREGATE_ID,
      aggregateType: 'task',
      cursor,
      room: 'task:x',
    });

    expect(snapshot.activities.map((event) => event.eventId)).toEqual(['evt_late', 'evt_new']);
    expect(decodeCursor(snapshot.nextCursor)).toMatchObject({
      i: 'evt_new',
      t: now - 6_000,
    });
  });

  it('keeps the cursor in place when the page is pure overlap replays', async () => {
    const now = Date.now();
    const cursorTime = now - 10_000;
    await seedEvents(db, [{ createdAt: new Date(cursorTime - 2_000), eventId: 'evt_dup' }]);

    const cursor = encodeCursor({ i: 'evt_prev', t: cursorTime });
    const snapshot = await buildRoomSnapshot(db, {
      aggregateId: AGGREGATE_ID,
      aggregateType: 'task',
      cursor,
      room: 'task:x',
    });

    expect(snapshot.activities.map((event) => event.eventId)).toEqual(['evt_dup']);
    // The cursor must not advance over rows it only replayed — advancing
    // would re-open the skip-hole for late commits inside the window.
    expect(snapshot.nextCursor).toBe(cursor);
  });

  it('serves the newest page descending-then-ascending without a cursor', async () => {
    const now = Date.now();
    await seedEvents(db, [
      { createdAt: new Date(now - 9_000), eventId: 'evt_1' },
      { createdAt: new Date(now - 8_000), eventId: 'evt_2' },
    ]);

    const snapshot = await buildRoomSnapshot(db, {
      aggregateId: AGGREGATE_ID,
      aggregateType: 'task',
      room: 'task:x',
    });

    expect(snapshot.activities.map((event) => event.eventId)).toEqual(['evt_1', 'evt_2']);
    expect(decodeCursor(snapshot.nextCursor)).toMatchObject({ i: 'evt_2' });
  });
});

describe('snapshot cursor codec', () => {
  it('round-trips and rejects malformed input', () => {
    const cursor = encodeCursor({ i: 'evt-1', t: 1234 });
    expect(decodeCursor(cursor)).toEqual({ i: 'evt-1', t: 1234 });
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('!!!not-base64!!!')).toBeNull();
    expect(decodeCursor(Buffer.from('{"t":"nope"}', 'utf8').toString('base64url'))).toBeNull();
  });
});
