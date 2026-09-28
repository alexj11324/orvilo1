import { EVENT_CONSUMERS, type EventConsumerName } from '@orvilo/types';
import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import type { EventConsumerReceiptItem } from '../schemas/workAttention';
import { eventConsumerReceipts } from '../schemas/workAttention';
import type { OrviloDatabase, Transaction } from '../type';

const DEFAULT_MAX_ATTEMPTS = 10;

const REGISTERED_CONSUMERS: EventConsumerName[] = [
  EVENT_CONSUMERS.COLLABORATION_REALTIME,
  EVENT_CONSUMERS.NOTIFICATION_PROJECTION,
];

/**
 * Per-consumer ACK for outbox events. The dispatcher fans out one receipt per
 * registered consumer and then marks the parent outbox row delivered; each
 * consumer retries independently and cannot swallow another consumer's work.
 */
export class EventConsumerReceiptModel {
  constructor(private readonly db: OrviloDatabase) {}

  /** Insert receipts for every registered consumer. Idempotent on (consumer, eventId). */
  fanOut = async (
    executor: Transaction | OrviloDatabase,
    params: { eventId: string; outboxId: string },
  ): Promise<void> => {
    await executor
      .insert(eventConsumerReceipts)
      .values(
        REGISTERED_CONSUMERS.map((consumer) => ({
          consumer,
          eventId: params.eventId,
          outboxId: params.outboxId,
        })),
      )
      .onConflictDoNothing({
        target: [eventConsumerReceipts.consumer, eventConsumerReceipts.eventId],
      });
  };

  claimPending = async (params: {
    consumer: EventConsumerName;
    limit: number;
    now?: Date;
    visibilityTimeoutMs: number;
  }): Promise<EventConsumerReceiptItem[]> => {
    const now = params.now ?? new Date();
    const visibleUntil = new Date(now.getTime() + params.visibilityTimeoutMs);
    return this.db
      .update(eventConsumerReceipts)
      .set({ nextAttemptAt: visibleUntil })
      .where(
        inArray(
          eventConsumerReceipts.id,
          this.db
            .select({ id: eventConsumerReceipts.id })
            .from(eventConsumerReceipts)
            .where(
              and(
                eq(eventConsumerReceipts.consumer, params.consumer),
                eq(eventConsumerReceipts.status, 'pending'),
                or(
                  isNull(eventConsumerReceipts.nextAttemptAt),
                  lt(eventConsumerReceipts.nextAttemptAt, now),
                ),
              ),
            )
            .orderBy(asc(eventConsumerReceipts.createdAt), asc(eventConsumerReceipts.id))
            .limit(params.limit)
            .for('update', { skipLocked: true }),
        ),
      )
      .returning();
  };

  markDelivered = async (id: string): Promise<boolean> => {
    const updated = await this.db
      .update(eventConsumerReceipts)
      .set({ ackedAt: new Date(), status: 'delivered' })
      .where(and(eq(eventConsumerReceipts.id, id), eq(eventConsumerReceipts.status, 'pending')))
      .returning({ id: eventConsumerReceipts.id });
    return updated.length > 0;
  };

  markFailed = async (
    id: string,
    params: { maxAttempts?: number; retryDelayMs: number },
  ): Promise<EventConsumerReceiptItem | undefined> => {
    const maxAttempts = params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const [updated] = await this.db
      .update(eventConsumerReceipts)
      .set({
        attempts: sql`${eventConsumerReceipts.attempts} + 1`,
        nextAttemptAt: new Date(Date.now() + params.retryDelayMs),
        status: sql<EventConsumerReceiptItem['status']>`case
          when ${eventConsumerReceipts.attempts} + 1 >= ${maxAttempts} then 'failed'
          else 'pending'
        end`,
      })
      .where(and(eq(eventConsumerReceipts.id, id), eq(eventConsumerReceipts.status, 'pending')))
      .returning();
    return updated;
  };
}
