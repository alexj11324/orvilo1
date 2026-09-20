import { randomUUID } from 'node:crypto';

import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import type { EventOutboxItem } from '../schemas/eventOutbox';
import { eventOutbox } from '../schemas/eventOutbox';
import type { OrviloDatabase, Transaction } from '../type';

/** Default ceiling before a pending event is parked as terminally 'failed'. */
const DEFAULT_MAX_ATTEMPTS = 10;

/** Dedup key for one outbox event — consumers treat a repeated eventId as a no-op. */
export const newEventId = (): string => randomUUID();

/**
 * Standalone form of `EventOutboxModel.insertOutboxEvent` for call sites that
 * already hold the enclosing transaction — the row commits atomically with the
 * business change it announces.
 */
export const insertOutboxEvent = (executor: Transaction | OrviloDatabase, params: NewOutboxEvent) =>
  new EventOutboxModel(executor as OrviloDatabase).insertOutboxEvent(executor, params);

export interface NewOutboxEvent {
  aggregateId: string;
  aggregateType: string;
  eventId: string;
  eventType: string;
  /**
   * Visibility gate for the sweeps (`fetchPending`/`claimPending`): rows stay
   * hidden until this instant. Delivery-ledger receipts pass their deadline
   * here so the room projector cannot mark them `delivered` before expiry.
   */
  nextAttemptAt?: Date;
  payload?: Record<string, unknown>;
  workspaceId?: string;
}

/**
 * Transactional outbox writer/reader. `insertOutboxEvent` runs on the caller's
 * executor so the event commits atomically with the business change; the
 * worker side (`fetchPending` → `markDelivered` / `markFailed`) provides
 * at-least-once delivery with bounded retries — `markFailed` keeps the row
 * 'pending' with a deferred `nextAttemptAt` until `maxAttempts`, then parks it
 * as 'failed' for inspection.
 */
export class EventOutboxModel {
  private readonly db: OrviloDatabase;

  constructor(db: OrviloDatabase) {
    this.db = db;
  }

  /** Insert inside the enclosing transaction — pass the tx, never this.db from outside it. */
  insertOutboxEvent = async (
    executor: Transaction | OrviloDatabase,
    params: NewOutboxEvent,
  ): Promise<EventOutboxItem> => {
    const [row] = await executor
      .insert(eventOutbox)
      .values({
        aggregateId: params.aggregateId,
        aggregateType: params.aggregateType,
        eventId: params.eventId,
        eventType: params.eventType,
        nextAttemptAt: params.nextAttemptAt,
        payload: params.payload ?? {},
        workspaceId: params.workspaceId,
      })
      .returning();
    return row;
  };

  /** Due pending rows, oldest first: `nextAttemptAt` NULL or already past `now`. */
  fetchPending = async (params: { limit: number; now?: Date }): Promise<EventOutboxItem[]> => {
    const now = params.now ?? new Date();
    return this.db
      .select()
      .from(eventOutbox)
      .where(
        and(
          eq(eventOutbox.status, 'pending'),
          or(isNull(eventOutbox.nextAttemptAt), lt(eventOutbox.nextAttemptAt, now)),
        ),
      )
      .orderBy(asc(eventOutbox.createdAt), asc(eventOutbox.id))
      .limit(params.limit);
  };

  /**
   * Atomically claim due pending rows for one worker tick: each claimed row's
   * `nextAttemptAt` becomes a visibility timeout so a concurrent or rescheduled
   * sweep skips it. `FOR UPDATE SKIP LOCKED` makes the selection race-safe —
   * two overlapping workers never take the same row. A worker that dies before
   * finishing simply lets the timeout expire and the row resurfaces
   * (at-least-once); `markFailed`/`markDelivered` proceed unchanged.
   */
  claimPending = async (params: {
    limit: number;
    now?: Date;
    visibilityTimeoutMs: number;
  }): Promise<EventOutboxItem[]> => {
    const now = params.now ?? new Date();
    const visibleUntil = new Date(now.getTime() + params.visibilityTimeoutMs);
    return this.db
      .update(eventOutbox)
      .set({ nextAttemptAt: visibleUntil })
      .where(
        inArray(
          eventOutbox.id,
          this.db
            .select({ id: eventOutbox.id })
            .from(eventOutbox)
            .where(
              and(
                eq(eventOutbox.status, 'pending'),
                or(isNull(eventOutbox.nextAttemptAt), lt(eventOutbox.nextAttemptAt, now)),
              ),
            )
            .orderBy(asc(eventOutbox.createdAt), asc(eventOutbox.id))
            .limit(params.limit)
            .for('update', { skipLocked: true }),
        ),
      )
      .returning();
  };

  /** pending → delivered, stamping the delivery time. No-op on other statuses. */
  markDelivered = async (id: string): Promise<boolean> => {
    const updated = await this.db
      .update(eventOutbox)
      .set({ deliveredAt: new Date(), status: 'delivered' })
      .where(and(eq(eventOutbox.id, id), eq(eventOutbox.status, 'pending')))
      .returning({ id: eventOutbox.id });
    return updated.length > 0;
  };

  /**
   * `markDelivered` addressed by the producer-chosen `eventId` — for consumers
   * that know the dedupe key but not the row id.
   */
  markDeliveredByEventId = async (eventId: string): Promise<boolean> => {
    const updated = await this.db
      .update(eventOutbox)
      .set({ deliveredAt: new Date(), status: 'delivered' })
      .where(and(eq(eventOutbox.eventId, eventId), eq(eventOutbox.status, 'pending')))
      .returning({ id: eventOutbox.id });
    return updated.length > 0;
  };

  /**
   * Insert the event unless its `eventId` already exists (the dedupe contract),
   * then optionally flip it to delivered in the same call. Returns the row's
   * outcome so callers can distinguish a fresh persist from a replay.
   */
  upsertDeliveryReceipt = async (params: {
    delivered?: boolean;
    event: NewOutboxEvent;
  }): Promise<'delivered' | 'inserted' | 'replayed'> => {
    const inserted = await this.db
      .insert(eventOutbox)
      .values({
        aggregateId: params.event.aggregateId,
        aggregateType: params.event.aggregateType,
        eventId: params.event.eventId,
        eventType: params.event.eventType,
        nextAttemptAt: params.event.nextAttemptAt,
        payload: params.event.payload ?? {},
        status: 'pending',
        workspaceId: params.event.workspaceId,
      })
      .onConflictDoNothing({ target: eventOutbox.eventId })
      .returning({ id: eventOutbox.id });

    if (params.delivered) {
      await this.markDeliveredByEventId(params.event.eventId);
      return 'delivered';
    }
    return inserted.length > 0 ? 'inserted' : 'replayed';
  };

  /**
   * Delivery-ledger transition `received` → `offered` addressed by `eventId`.
   * Idempotent: rows already `offered` (or past it) are untouched, so a
   * replayed settle never downgrades an `acked`/`superseded` receipt.
   */
  offerDeliveryReceiptByEventId = async (eventId: string): Promise<boolean> => {
    const updated = await this.db
      .update(eventOutbox)
      .set({
        payload: sql`jsonb_set(${eventOutbox.payload}, '{deliveryState}', '"offered"', true)`,
      })
      .where(
        and(
          eq(eventOutbox.eventId, eventId),
          eq(eventOutbox.status, 'pending'),
          sql`${eventOutbox.payload}->>'deliveryState' = 'received'`,
        ),
      )
      .returning({ id: eventOutbox.id });
    return updated.length > 0;
  };

  /**
   * Parent-side durable inbox ACK: the ONLY transition that marks a
   * child-result receipt consumed — `deliveryState` → `acked`, status
   * → `delivered`. Callers pass `aggregateId` so a leaked/forged eventId can
   * never ack another operation's receipt.
   */
  ackDeliveryReceiptByEventId = async (params: {
    aggregateId: string;
    eventId: string;
  }): Promise<boolean> => {
    const updated = await this.db
      .update(eventOutbox)
      .set({
        deliveredAt: new Date(),
        payload: sql`jsonb_set(${eventOutbox.payload}, '{deliveryState}', '"acked"', true)`,
        status: 'delivered',
      })
      .where(
        and(
          eq(eventOutbox.eventId, params.eventId),
          eq(eventOutbox.aggregateId, params.aggregateId),
          eq(eventOutbox.status, 'pending'),
          sql`${eventOutbox.payload}->>'deliveryState' <> 'superseded'`,
        ),
      )
      .returning({ id: eventOutbox.id });
    return updated.length > 0;
  };

  /**
   * First-winner CAS recording the human decision on a pending tool-approval
   * receipt. The update only lands while the receipt is still unconsumed and
   * undecided — a second submit, or a submit after consumption, is dropped.
   * `resolutionRequestId` dedupes client retries.
   *
   * `expectedWindowId` binds the submit to the exact window the card showed:
   * when provided, the CAS only lands while the receipt still carries that
   * window (an absent receipt window is treated as legacy and always
   * matches). The stored decision is stamped with the row's current
   * `windowId` server-side so a renewed window can never inherit it.
   */
  recordToolApprovalDecision = async (params: {
    decision: Record<string, unknown>;
    eventId: string;
    expectedWindowId?: string;
  }): Promise<'already_decided' | 'closed' | 'decided' | 'stale_window'> => {
    const updated = await this.db
      .update(eventOutbox)
      .set({
        // create_missing=true lands the key on the first submit; the WHERE
        // clause below (decision absent or JSON-null) is the first-winner CAS.
        // The inner jsonb_set stamps the row's CURRENT windowId into the
        // decision so a later renew (window rotation) can never re-attribute
        // it — and the consume CAS can require decision.windowId = windowId.
        payload: sql`jsonb_set(${eventOutbox.payload}, '{decision}', jsonb_set(${JSON.stringify(
          params.decision,
        )}::jsonb, '{windowId}', COALESCE(${eventOutbox.payload}->'windowId', 'null'::jsonb), true), true)`,
      })
      .where(
        and(
          eq(eventOutbox.eventId, params.eventId),
          eq(eventOutbox.status, 'pending'),
          sql`COALESCE(${eventOutbox.payload}->>'consumedAt', '') = ''`,
          sql`COALESCE(${eventOutbox.payload}->>'decision', '') = ''`,
          // Window contract: an explicit `expectedWindowId` must match the
          // row's live window (legacy windowless rows still accept); a submit
          // WITHOUT one may only decide legacy windowless receipts — a stale
          // old client can never write the live window's decision.
          ...(params.expectedWindowId === undefined
            ? [sql`COALESCE(${eventOutbox.payload}->>'windowId', '') = ''`]
            : [
                sql`(COALESCE(${eventOutbox.payload}->>'windowId', '') = '' OR ${eventOutbox.payload}->>'windowId' = ${params.expectedWindowId})`,
              ]),
        ),
      )
      .returning({ id: eventOutbox.id });
    if (updated.length > 0) return 'decided';

    const [row] = await this.db
      .select({ payload: eventOutbox.payload })
      .from(eventOutbox)
      .where(eq(eventOutbox.eventId, params.eventId));
    if (!row) return 'closed';
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    if (payload.decision !== null && payload.decision !== undefined) return 'already_decided';
    if (
      params.expectedWindowId !== undefined &&
      typeof payload.windowId === 'string' &&
      payload.windowId.length > 0 &&
      payload.windowId !== params.expectedWindowId
    ) {
      return 'stale_window';
    }
    return 'closed';
  };

  /**
   * One-time consume of an approved tool-approval receipt. Succeeds only when
   * the receipt is pending, approved, unexpired, unconsumed, the call
   * presents the same `argsHash` AND the full `scopeHash` the approval
   * covered, and the recorded decision belongs to the receipt's current
   * window — the UPDATE itself is the CAS, so two racing executions cannot
   * both observe the grant. The winning invocation id is reserved in the same
   * write (`consumedInvocationId`) for audit and result-level dedupe.
   *
   * Legacy receipts minted before `scopeHash`/`windowId` existed can never
   * satisfy these clauses — they fail closed instead of upgrading an
   * incomplete approval into a strong authorization.
   */
  consumeToolApprovalReceipt = async (params: {
    argsHash: string;
    eventId: string;
    invocationId: string;
    now: number;
    scopeHash: string;
  }): Promise<boolean> => {
    const updated = await this.db
      .update(eventOutbox)
      .set({
        payload: sql`${eventOutbox.payload} || jsonb_build_object(
          'consumedAt', ${params.now}::numeric,
          'consumedInvocationId', ${params.invocationId}::text
        )`,
      })
      .where(
        and(
          eq(eventOutbox.eventId, params.eventId),
          eq(eventOutbox.status, 'pending'),
          sql`COALESCE(${eventOutbox.payload}->>'consumedAt', '') = ''`,
          sql`${eventOutbox.payload}->'decision'->>'action' = 'approved'`,
          sql`(${eventOutbox.payload}->>'expiresAt')::numeric > ${params.now}`,
          sql`${eventOutbox.payload}->>'argsHash' = ${params.argsHash}`,
          sql`${eventOutbox.payload}->>'scopeHash' = ${params.scopeHash}`,
          sql`${eventOutbox.payload}->'decision'->>'windowId' = ${eventOutbox.payload}->>'windowId'`,
        ),
      )
      .returning({ id: eventOutbox.id });
    return updated.length > 0;
  };

  /**
   * Re-pend an EXPIRED, still-undecided-or-unconsumed approval receipt under a
   * fresh window. Every renew rotates `windowId` to the caller-minted value
   * and bumps `windowVersion`, re-binds the receipt to the calling scope
   * (`scopeHash`), and clears any stale decision so an approval recorded
   * inside the dead window can never ride the new one. Denied or consumed
   * receipts stay terminal — the denied-guard below makes resurrection
   * impossible and the caller's read-back classifies them.
   */
  renewToolApprovalReceipt = async (params: {
    eventId: string;
    expiresAt: number;
    now: number;
    scopeHash: string;
    windowId: string;
  }): Promise<boolean> => {
    const updated = await this.db
      .update(eventOutbox)
      .set({
        nextAttemptAt: new Date(params.expiresAt),
        payload: sql`(${eventOutbox.payload} #- '{decision}') || jsonb_build_object(
          'expiresAt', ${params.expiresAt}::numeric,
          'requestedAt', ${params.now}::numeric,
          'scopeHash', ${params.scopeHash}::text,
          'windowId', ${params.windowId}::text,
          'windowVersion', COALESCE((${eventOutbox.payload}->>'windowVersion')::numeric, 0) + 1
        )`,
      })
      .where(
        and(
          eq(eventOutbox.eventId, params.eventId),
          eq(eventOutbox.status, 'pending'),
          sql`COALESCE(${eventOutbox.payload}->>'consumedAt', '') = ''`,
          sql`(${eventOutbox.payload}->>'expiresAt')::numeric <= ${params.now}`,
          sql`COALESCE(${eventOutbox.payload}->'decision'->>'action', '') <> 'denied'`,
        ),
      )
      .returning({ id: eventOutbox.id });
    return updated.length > 0;
  };

  /**
   * Authoritative consume-state read for a delivery receipt, optionally
   * aggregate-scoped so an id belonging to another operation is never
   * mistaken for ours. Callers use it to verify the REAL receipt state after
   * an ack attempt — an already-`acked` row is an idempotent success, not a
   * failure.
   */
  getDeliveryReceiptState = async (params: {
    aggregateId?: string;
    eventId: string;
  }): Promise<{ deliveryState?: string; status: string } | undefined> => {
    const [row] = await this.db
      .select({
        aggregateId: eventOutbox.aggregateId,
        payload: eventOutbox.payload,
        status: eventOutbox.status,
      })
      .from(eventOutbox)
      .where(eq(eventOutbox.eventId, params.eventId));
    if (!row) return undefined;
    if (params.aggregateId !== undefined && row.aggregateId !== params.aggregateId) {
      return undefined;
    }
    const payload = row.payload as { deliveryState?: unknown } | null;
    return {
      deliveryState: typeof payload?.deliveryState === 'string' ? payload.deliveryState : undefined,
      status: row.status,
    };
  };

  /**
   * Read-back for the approval/consume paths: the raw payload after a CAS
   * attempt decides which refusal reason applies.
   */
  getDeliveryReceiptPayload = async (
    eventId: string,
  ): Promise<Record<string, unknown> | undefined> => {
    const [row] = await this.db
      .select({ payload: eventOutbox.payload })
      .from(eventOutbox)
      .where(eq(eventOutbox.eventId, eventId));
    return row?.payload as Record<string, unknown> | undefined;
  };

  /**
   * Record a failed attempt: `attempts` + 1 and the next try deferred by
   * `retryDelayMs`. The row stays 'pending' until it crosses `maxAttempts`,
   * where it parks as 'failed' — one atomic CASE so racing workers can't
   * disagree on which side of the ceiling the attempt landed.
   */
  markFailed = async (
    id: string,
    params: { maxAttempts?: number; retryDelayMs: number },
  ): Promise<EventOutboxItem | undefined> => {
    const maxAttempts = params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const [updated] = await this.db
      .update(eventOutbox)
      .set({
        attempts: sql`${eventOutbox.attempts} + 1`,
        nextAttemptAt: new Date(Date.now() + params.retryDelayMs),
        status: sql<EventOutboxItem['status']>`case
          when ${eventOutbox.attempts} + 1 >= ${maxAttempts} then 'failed'
          else 'pending'
        end`,
      })
      .where(and(eq(eventOutbox.id, id), eq(eventOutbox.status, 'pending')))
      .returning();
    return updated;
  };
}
