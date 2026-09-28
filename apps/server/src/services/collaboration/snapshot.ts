import type { RoomSnapshotResult, ServerActivityEvent } from '@orvilo/types';
import { and, asc, desc, eq, gt, gte, lt, lte, or } from 'drizzle-orm';

import type { OrviloDatabase } from '@/database/type';

import { eventOutbox } from './contractTables';
import { outboxRowToActivityEvent } from './projection';
import { getRoomPublisher } from './roomPublisher';

const SNAPSHOT_PAGE_SIZE = 50;

/**
 * Upper bound on the overlap rows re-served per incremental page. The window
 * exists to catch rows whose commit outlived COMMIT_LAG_MS; a cap is needed
 * so re-serving can never starve the forward page — the previous design
 * applied one LIMIT to the union and stalled the cursor forever when the
 * window held ≥ SNAPSHOT_PAGE_SIZE rows. Windows denser than this bound are
 * outside the documented replay contract.
 */
const OVERLAP_PAGE_SIZE = 200;

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
 * `createdAt` (epoch ms) plus its eventId as the same-millisecond tiebreak —
 * forward pagination is a strict `(createdAt, eventId)` keyset, so bursts of
 * equal timestamps can't wedge the position or skip rows.
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
 * With a cursor the call is incremental and runs two independent reads:
 * a strict forward keyset `(createdAt, eventId) > cursor` that always
 * advances, and a bounded overlap re-serve of the lag window at-or-behind
 * the boundary for late commits (dedup'd on `eventId` client-side). Because
 * the reads are paged separately, a dense overlap window can never consume
 * the whole page and stall forward progress — the N07 failure mode.
 * Without a cursor it returns the newest page, ascending. Either way
 * `nextCursor` lets the next poll continue without gaps; an undecodable
 * cursor returns the newest page with `resyncRequired` instead of silently
 * continuing at an arbitrary position.
 */
export const buildRoomSnapshot = async (
  db: OrviloDatabase,
  params: { aggregateId: string; aggregateType: string; cursor?: string; room: string },
): Promise<RoomSnapshotResult> => {
  const cursor = decodeCursor(params.cursor);
  const resyncRequired = !!params.cursor && !cursor;
  const watermark = new Date(Date.now() - COMMIT_LAG_MS);
  const scope = and(
    eq(eventOutbox.aggregateType, params.aggregateType),
    eq(eventOutbox.aggregateId, params.aggregateId),
    lte(eventOutbox.createdAt, watermark),
  );

  let ordered: (typeof eventOutbox.$inferSelect)[];
  let boundary: typeof eventOutbox.$inferSelect | undefined;

  if (!cursor) {
    const rows = await db
      .select()
      .from(eventOutbox)
      .where(scope)
      .orderBy(desc(eventOutbox.createdAt), desc(eventOutbox.eventId))
      .limit(SNAPSHOT_PAGE_SIZE);
    // First page serves newest-first (a page of recent history); flip to
    // ascending so consumers see the same commit order as increments.
    ordered = rows.toReversed();
    boundary = ordered.at(-1);
  } else {
    const boundaryDate = new Date(cursor.t);
    // Forward read: strict keyset after the boundary — every row in this
    // page is new, so a full page is real progress, not re-served overlap.
    const forwardRows = await db
      .select()
      .from(eventOutbox)
      .where(
        and(
          scope,
          or(
            gt(eventOutbox.createdAt, boundaryDate),
            and(eq(eventOutbox.createdAt, boundaryDate), gt(eventOutbox.eventId, cursor.i)),
          ),
        ),
      )
      .orderBy(asc(eventOutbox.createdAt), asc(eventOutbox.eventId))
      .limit(SNAPSHOT_PAGE_SIZE);
    // Overlap re-serve: rows at-or-behind the boundary inside the lag
    // window, paged independently so they can never crowd out forward rows.
    const overlapRows = await db
      .select()
      .from(eventOutbox)
      .where(
        and(
          scope,
          gte(eventOutbox.createdAt, new Date(cursor.t - COMMIT_LAG_MS)),
          or(
            lt(eventOutbox.createdAt, boundaryDate),
            and(eq(eventOutbox.createdAt, boundaryDate), lte(eventOutbox.eventId, cursor.i)),
          ),
        ),
      )
      .orderBy(asc(eventOutbox.createdAt), asc(eventOutbox.eventId))
      .limit(OVERLAP_PAGE_SIZE);

    // Overlap stamps never exceed the boundary, so concatenating keeps the
    // page globally ascending.
    ordered = [...overlapRows, ...forwardRows];
    boundary = forwardRows.at(-1);
  }

  const activities = ordered
    .map((row) => outboxRowToActivityEvent(row))
    .filter((event): event is ServerActivityEvent => event !== null);

  // The cursor advances only on forward rows — a page of pure overlap
  // replays leaves it in place, or lag-window rows it still expects to
  // catch would be skipped next poll.
  const nextCursor = boundary
    ? encodeCursor({ i: boundary.eventId, t: boundary.createdAt.getTime() })
    : params.cursor;

  const presence = (await getRoomPublisher().presence?.(params.room)) ?? [];

  return { activities, nextCursor, presence, resyncRequired: resyncRequired || undefined };
};
