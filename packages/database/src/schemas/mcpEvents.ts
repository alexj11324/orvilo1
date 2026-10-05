import type {
  AutomationOccurrenceSnapshot,
  McpEventBinding,
  McpEventFilter,
  PersistedMcpInboxDelivery,
} from '@orvilo/types';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** Consumer bindings; canonical migration registration awaits the combined cloud schema. */
export const mcpEventBindings = pgTable(
  'mcp_event_bindings',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    connectorId: text('connector_id').notNull(),
    callbackToken: text('callback_token').notNull(),
    state: text('state').notNull(),
    remoteSubscriptionId: text('remote_subscription_id'),
    binding: jsonb('binding').$type<McpEventBinding>().notNull(),
  },
  (t) => [uniqueIndex('mcp_event_bindings_callback_token_unique').on(t.callbackToken)],
);

export const mcpEventInbox = pgTable(
  'mcp_event_inbox',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    subscriptionId: text('subscription_id').notNull(),
    eventId: text('event_id').notNull(),
    connectorId: text('connector_id').notNull(),
    schemaId: text('schema_id').notNull(),
    payloadHash: text('payload_hash').notNull(),
    delivery: jsonb('delivery').$type<PersistedMcpInboxDelivery>().notNull(),
    receivedAt: bigint('received_at', { mode: 'number' }).notNull(),
    status: text('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: bigint('available_at', { mode: 'number' }).notNull(),
    leaseToken: text('lease_token'),
    leaseUntil: bigint('lease_until', { mode: 'number' }),
    lastError: text('last_error'),
  },
  (t) => [
    uniqueIndex('mcp_event_inbox_delivery_unique').on(t.tenantId, t.subscriptionId, t.eventId),
    index('mcp_event_inbox_ready').on(t.status, t.availableAt, t.leaseUntil),
    check(
      'mcp_event_inbox_status_check',
      sql`${t.status} IN ('pending','processing','completed','dead')`,
    ),
  ],
);

export const mcpEventChallenges = pgTable(
  'mcp_event_challenges',
  {
    id: text('id').primaryKey(),
    bindingId: text('binding_id')
      .references(() => mcpEventBindings.id, { onDelete: 'cascade' })
      .notNull(),
    webhookId: text('webhook_id').notNull(),
    challengeHash: text('challenge_hash').notNull(),
    receivedAt: bigint('received_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    uniqueIndex('mcp_event_challenges_delivery_unique').on(t.bindingId, t.webhookId),
    uniqueIndex('mcp_event_challenges_value_unique').on(t.bindingId, t.challengeHash),
  ],
);

/** Scoped event matching configuration. Disabled drafts cannot dispatch. */
export const mcpEventTriggers = pgTable(
  'mcp_event_triggers',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    userId: text('user_id').notNull(),
    taskId: text('task_id').notNull(),
    subscriptionId: text('subscription_id').notNull(),
    sourceId: text('source_id').notNull(),
    revision: integer('revision').default(0).notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    filters: jsonb('filters').$type<McpEventFilter[]>().notNull(),
  },
  (t) => [
    uniqueIndex('mcp_event_triggers_task_unique').on(t.tenantId, t.taskId),
    index('mcp_event_triggers_subscription').on(t.tenantId, t.subscriptionId),
  ],
);

/** Durable fan-out decisions, separate from callback transport deduplication. */
export const mcpEventTriggerRuns = pgTable(
  'mcp_event_trigger_runs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    inboxId: text('inbox_id')
      .references(() => mcpEventInbox.id)
      .notNull(),
    triggerId: text('trigger_id')
      .references(() => mcpEventTriggers.id)
      .notNull(),
    triggerRevision: integer('trigger_revision').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').default('pending').notNull(),
    dispatchId: text('dispatch_id'),
    /** First-match snapshot survives task edits while admission is waiting. */
    automationOccurrence: jsonb('automation_occurrence').$type<AutomationOccurrenceSnapshot>(),
    reason: text('reason'),
  },
  (t) => [
    uniqueIndex('mcp_event_trigger_runs_key_unique').on(t.idempotencyKey),
    uniqueIndex('mcp_event_trigger_runs_occurrence_unique').on(t.tenantId, t.inboxId, t.triggerId),
    check(
      'mcp_event_trigger_runs_status_check',
      sql`${t.status} IN ('pending','accepted','filtered','denied')`,
    ),
  ],
);
