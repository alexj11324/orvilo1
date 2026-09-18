import type {
  EventConsumerName,
  NavigationFavoriteTargetType,
  SavedViewVisibility,
  WorkQuery,
  WorkQueryEntityType,
  WorkQueryLayout,
} from '@orvilo/types';
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { createdAt, timestamps, timestamptz, varchar255 } from './_helpers';
import { tasks } from './task';
import { teams } from './team';
import { users } from './user';
import { workspaces } from './workspace';

/** Independent ACK per outbox consumer so two scanners never share `delivered`. */
export const eventConsumerReceipts = pgTable(
  'event_consumer_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    consumer: text('consumer').$type<EventConsumerName>().notNull(),
    eventId: text('event_id').notNull(),
    outboxId: text('outbox_id'),
    status: text('status').$type<'delivered' | 'failed' | 'pending'>().notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamptz('next_attempt_at'),
    ackedAt: timestamptz('acked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('event_consumer_receipts_consumer_event_unique').on(t.consumer, t.eventId),
    index('event_consumer_receipts_pending_idx').on(t.status, t.nextAttemptAt),
  ],
);

/** Dedup of a projected notification episode for one recipient. */
export const notificationEventReceipts = pgTable(
  'notification_event_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    consumer: text('consumer').notNull(),
    eventId: text('event_id').notNull(),
    recipientUserId: text('recipient_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    kind: text('kind').notNull(),
    notificationId: uuid('notification_id'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('notification_event_receipts_unique').on(
      t.consumer,
      t.eventId,
      t.recipientUserId,
      t.kind,
    ),
  ],
);

/** Per-user/scope monotonic feed revision. Never a global sequence high-water. */
export const notificationFeedState = pgTable(
  'notification_feed_state',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    scopeKey: text('scope_key').notNull(),
    revision: integer('revision').notNull().default(0),
    updatedAt: timestamptz('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('notification_feed_state_user_scope_unique').on(t.userId, t.scopeKey)],
);

export const taskSubscriptions = pgTable(
  'task_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    taskId: text('task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull().default('manual'),
    unsubscribedAt: timestamptz('unsubscribed_at'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('task_subscriptions_task_user_unique').on(t.taskId, t.userId),
    index('task_subscriptions_user_id_idx').on(t.userId),
  ],
);

export const savedViews = pgTable(
  'saved_views',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => idGenerator('savedViews'))
      .notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerUserId: text('owner_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    teamId: text('team_id').references(() => teams.id, { onDelete: 'set null' }),
    name: varchar255('name').notNull(),
    entityType: text('entity_type').$type<WorkQueryEntityType>().notNull(),
    queryAst: jsonb('query_ast').$type<WorkQuery>().notNull(),
    layout: text('layout').$type<WorkQueryLayout>().notNull().default('list'),
    displayOptions: jsonb('display_options').$type<Record<string, unknown>>().notNull().default({}),
    visibility: text('visibility').$type<SavedViewVisibility>().notNull().default('private'),
    definitionVersion: integer('definition_version').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index('saved_views_owner_idx').on(t.ownerUserId, t.workspaceId),
    index('saved_views_workspace_visibility_idx').on(t.workspaceId, t.visibility),
  ],
);

export const navigationFavorites = pgTable(
  'navigation_favorites',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    scopeKey: text('scope_key').notNull(),
    targetType: text('target_type').$type<NavigationFavoriteTargetType>().notNull(),
    targetId: text('target_id').notNull(),
    rank: integer('rank').notNull().default(0),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('navigation_favorites_user_scope_target_unique').on(
      t.userId,
      t.scopeKey,
      t.targetType,
      t.targetId,
    ),
    index('navigation_favorites_user_scope_idx').on(t.userId, t.scopeKey),
  ],
);

export type EventConsumerReceiptItem = typeof eventConsumerReceipts.$inferSelect;
export type NewEventConsumerReceipt = typeof eventConsumerReceipts.$inferInsert;
export type NotificationEventReceiptItem = typeof notificationEventReceipts.$inferSelect;
export type NotificationFeedStateItem = typeof notificationFeedState.$inferSelect;
export type TaskSubscriptionItem = typeof taskSubscriptions.$inferSelect;
export type SavedViewItem = typeof savedViews.$inferSelect;
export type NewSavedView = typeof savedViews.$inferInsert;
export type NavigationFavoriteItem = typeof navigationFavorites.$inferSelect;
