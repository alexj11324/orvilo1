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
