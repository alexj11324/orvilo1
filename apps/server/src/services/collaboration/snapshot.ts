import { and, asc, desc, eq, gt, lte, or } from 'drizzle-orm';

import type { RoomSnapshotResult, ServerActivityEvent } from '@orvilo/types';
import type { LobeChatDatabase } from '@/database/type';

import { eventOutbox } from './contractTables';
import { outboxRowToActivityEvent } from './projection';
import { getRoomPublisher } from './roomPublisher';

const SNAPSHOT_PAGE_SIZE = 50;

/**
 * Transactions stamp `createdAt` at statement start but commit out of order —
 * a row inserted at t=100 can commit after one stamped t=110. Without a lag a
 * cursor advanced past the later row would silently skip the earlier one. The
 * watermark only serves rows older than this lag so in-flight commits always
 * land before the cursor claims them.
 */
const COMMIT_LAG_MS = 5_000;

/**
 * Opaque replay cursor over the committed outbox log. `createdAt` alone can't
 * order concurrent commits; the eventId tiebreak keeps the comparison strict.
 */
interface SnapshotCursor {
  /** eventId tiebreak for same-millisecond commits. */
  i: string;
  /** createdAt, epoch ms. */
  t: number;
}

export const encodeCursor = (cursor: SnapshotCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

export const decodeCursor = (raw: string | undefined): SnapshotCursor | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return typeof parsed?.t === 'number' && typeof parsed?.i === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Reconnect/polling snapshot: current presence (best-effort — the gateway
 * owns live presence, the local bus answers only when mounted in-process)
 * plus the room's recent authorized activity events.
 *
 * With a cursor the call is incremental: rows delivered after the cursor.
 * Without one it returns the newest page, ascending. Either way `nextCursor`
 * lets the next poll continue without overlap or gaps.
 */
export const buildRoomSnapshot = async (
  db: LobeChatDatabase,
  params: { aggregateId: string; aggregateType: string; cursor?: string; room: string },
): Promise<RoomSnapshotResult> => {
  const cursor = decodeCursor(params.cursor);
  const watermark = new Date(Date.now() - COMMIT_LAG_MS);

  const newerThan = cursor
    ? or(
        gt(eventOutbox.createdAt, new Date(cursor.t)),
        and(
          eq(eventOutbox.createdAt, new Date(cursor.t)),
          gt(eventOutbox.eventId, cursor.i),
        ),
      )
    : undefined;

  const rows = await db
    .select()
    .from(eventOutbox)
    .where(
      and(
        eq(eventOutbox.aggregateType, params.aggregateType),
        eq(eventOutbox.aggregateId, params.aggregateId),
        lte(eventOutbox.createdAt, watermark),
        ...(newerThan ? [newerThan] : []),
      ),
    )
    .orderBy(
      // First page serves newest-first (a page of recent history); increments
      // replay oldest-first so clients append in commit order.
      ...(cursor ? [asc(eventOutbox.createdAt), asc(eventOutbox.eventId)] : [desc(eventOutbox.createdAt), desc(eventOutbox.eventId)]),
    )
    .limit(SNAPSHOT_PAGE_SIZE);

  const ordered = cursor ? rows : rows.toReversed();
  const activities = ordered
    .map((row) => outboxRowToActivityEvent(row))
    .filter((event): event is ServerActivityEvent => event !== null);

  const newest = ordered.at(-1);
  const nextCursor = newest
    ? encodeCursor({ i: newest.eventId, t: newest.createdAt.getTime() })
    : params.cursor;

  const presence = (await getRoomPublisher().presence?.(params.room)) ?? [];

  return { activities, nextCursor, presence };
};
