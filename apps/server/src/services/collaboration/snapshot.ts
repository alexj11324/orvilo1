import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';

import type { RoomSnapshotResult, ServerActivityEvent } from '@orvilo/types';
import type { LobeChatDatabase } from '@/database/type';

import { eventOutbox } from './contractTables';
import { outboxRowToActivityEvent } from './projection';
import { getRoomPublisher } from './roomPublisher';

const SNAPSHOT_PAGE_SIZE = 50;

/**
 * Transactions stamp `createdAt` at statement start but commit out of order —
 * a row inserted at t=100 can commit after one stamped t=110. The watermark
 * only serves rows older than this lag so in-flight commits land before a
 * snapshot claims them; incremental pages then replay an overlap window this
 * wide behind the cursor so a transaction that outlived the lag (committed
 * late with an already-passed stamp) is re-served instead of skipped. Rows in
 * the window were already delivered once — clients MUST dedup on `eventId`
 * (see `RoomSnapshotResult`).
 */
const COMMIT_LAG_MS = 5_000;

/**
 * Opaque replay cursor over the committed outbox log: the boundary row's
 * `createdAt` (epoch ms) plus its eventId. `i` is retained for cursor
 * stability/debugging — the overlap window below makes the lower bound a
 * pure timestamp comparison, so eventId no longer participates in the filter.
 */
interface SnapshotCursor {
  /** eventId of the boundary row. */
  i: string;
  /** createdAt of the boundary row, epoch ms. */
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
 * With a cursor the call is incremental: it replays the overlap window
 * (`cursor.t - COMMIT_LAG_MS`) plus everything newer, so previously delivered
 * rows may reappear — clients dedup on `eventId`. Without a cursor it returns
 * the newest page, ascending. Either way `nextCursor` lets the next poll
 * continue without gaps.
 */
export const buildRoomSnapshot = async (
  db: LobeChatDatabase,
  params: { aggregateId: string; aggregateType: string; cursor?: string; room: string },
): Promise<RoomSnapshotResult> => {
  const cursor = decodeCursor(params.cursor);
  const watermark = new Date(Date.now() - COMMIT_LAG_MS);

  const rows = await db
    .select()
    .from(eventOutbox)
    .where(
      and(
        eq(eventOutbox.aggregateType, params.aggregateType),
        eq(eventOutbox.aggregateId, params.aggregateId),
        lte(eventOutbox.createdAt, watermark),
        // Overlap window instead of a strict `createdAt > cursor.t`: a
        // transaction open longer than COMMIT_LAG_MS commits a row stamped
        // behind the cursor, and a strict bound would lose it forever.
        // Duplicates are safe — consumers dedup on `eventId`.
        ...(cursor
          ? [gte(eventOutbox.createdAt, new Date(cursor.t - COMMIT_LAG_MS))]
          : []),
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
  // Advance only when the page reached rows newer than the incoming cursor —
  // a page of pure overlap replays must leave the cursor in place, or the
  // lag-window rows it still expects to catch would be skipped next poll.
  const nextCursor =
    newest && (!cursor || newest.createdAt.getTime() > cursor.t)
      ? encodeCursor({ i: newest.eventId, t: newest.createdAt.getTime() })
      : params.cursor;

  const presence = (await getRoomPublisher().presence?.(params.room)) ?? [];

  return { activities, nextCursor, presence };
};
