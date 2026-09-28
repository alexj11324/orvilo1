import { index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { createNanoId } from '../utils/idGenerator';
import { createdAt, timestamptz } from './_helpers';
import { workspaces } from './workspace';

/** 'pending' | 'delivered' | 'failed' */
export type EventOutboxStatus = 'delivered' | 'failed' | 'pending';

/**
 * Transactional outbox for durable domain-event delivery. Business mutations
 * insert a row in the same transaction as the resource change, so a commit
 * always carries its event; a worker then delivers it (realtime invalidation,
 * email, replanning) at least once — consumers deduplicate on `eventId`.
 *
 * `nextAttemptAt` gates retries: after a failed attempt the row stays
 * 'pending' with a bumped `attempts` and a deferred `nextAttemptAt` until the
 * model marks it terminally 'failed'.
 */
export const eventOutbox = pgTable(
  'event_outbox',
  {
    id: text('id')
      .$defaultFn(() => createNanoId(16)())
      .notNull()
      .primaryKey(),
    /** Producer-chosen dedup key; consumers treat a repeated eventId as a no-op. */
    eventId: text('event_id').notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: text('status').$type<EventOutboxStatus>().notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    /** Earliest time a worker may pick this row up; NULL means immediately. */
    nextAttemptAt: timestamptz('next_attempt_at'),
    createdAt: createdAt(),
    deliveredAt: timestamptz('delivered_at'),
  },
  (t) => [
    uniqueIndex('event_outbox_event_id_unique').on(t.eventId),
    index('event_outbox_status_next_attempt_at_idx').on(t.status, t.nextAttemptAt),
    index('event_outbox_workspace_aggregate_idx').on(t.workspaceId, t.aggregateType, t.aggregateId),
  ],
);

export type NewEventOutboxEvent = typeof eventOutbox.$inferInsert;
export type EventOutboxItem = typeof eventOutbox.$inferSelect;
