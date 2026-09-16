import type {
  LinearInstallationStatus,
  LinearIssueLinkSyncState,
  LinearIssueSnapshot,
  LinearProjectBindingSettings,
  LinearSyncConflict,
  LinearSyncInboxStatus,
  LinearSyncOutboxStatus,
  TaskDomainEventSource,
  TaskDomainEventType,
  TaskPlanningRevisionStatus,
  TaskPlanningScopeStatus,
  TaskPlanningScopeType,
  TaskPlanningTrigger,
} from '@orvilo/types';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, timestamptz, updatedAt } from './_helpers';
import { userConnectors } from './connector';
import { projects } from './project';
import { tasks } from './task';
import { users } from './user';
import { workspaces } from './workspace';

/** Monotonic revision shared by task-domain events and planning cursors. */
export const taskDomainEventRevisionSequence = pgSequence('task_domain_event_revision_seq');

/** A workspace-level Linear OAuth/connector installation. */
export const linearInstallations = pgTable(
  'linear_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    connectorId: uuid('connector_id')
      .references(() => userConnectors.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').notNull(),
    organizationName: text('organization_name'),
    /** Name of the secret in the deployment secret store, never the secret itself. */
    webhookSecretRef: text('webhook_secret_ref'),
    installedByUserId: text('installed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: text('status').$type<LinearInstallationStatus>().notNull().default('active'),
    lastError: text('last_error'),
    lastSyncAt: timestamptz('last_sync_at'),
    ...createdAtColumns(),
  },
  (table) => [
    uniqueIndex('linear_installations_workspace_organization_unique').on(
      table.workspaceId,
      table.organizationId,
    ),
    index('linear_installations_workspace_id_idx').on(table.workspaceId),
    index('linear_installations_connector_id_idx').on(table.connectorId),
  ],
);

/** Project-level scope and policy for a Linear project. */
export const linearProjectBindings = pgTable(
  'linear_project_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    installationId: uuid('installation_id')
      .references(() => linearInstallations.id, { onDelete: 'cascade' })
      .notNull(),
    linearProjectId: text('linear_project_id').notNull(),
    defaultTeamId: text('default_team_id'),
    teamIds: text('team_ids').array().notNull().default([]),
    settings: jsonb('settings').$type<LinearProjectBindingSettings>().notNull().default({}),
    syncEnabled: boolean('sync_enabled').notNull().default(true),
    autoExecutionEnabled: boolean('auto_execution_enabled').notNull().default(false),
    replanningEnabled: boolean('replanning_enabled').notNull().default(false),
    version: integer('version').notNull().default(1),
    importCursor: text('import_cursor'),
    importCompletedAt: timestamptz('import_completed_at'),
    ...createdAtColumns(),
  },
  (table) => [
    uniqueIndex('linear_project_bindings_workspace_project_unique').on(
      table.workspaceId,
      table.projectId,
    ),
    uniqueIndex('linear_project_bindings_workspace_linear_project_unique').on(
      table.workspaceId,
      table.linearProjectId,
    ),
    index('linear_project_bindings_installation_id_idx').on(table.installationId),
    index('linear_project_bindings_workspace_id_idx').on(table.workspaceId),
  ],
);

/** Stable one-to-one binding between a local Task and a Linear Issue. */
export const linearIssueLinks = pgTable(
  'linear_issue_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    taskId: text('task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    installationId: uuid('installation_id')
      .references(() => linearInstallations.id, { onDelete: 'cascade' })
      .notNull(),
    bindingId: uuid('binding_id').references(() => linearProjectBindings.id, {
      onDelete: 'set null',
    }),
    organizationId: text('organization_id').notNull(),
    linearIssueId: text('linear_issue_id').notNull(),
    linearIdentifier: text('linear_identifier').notNull(),
    lastConfirmedSnapshot: jsonb('last_confirmed_snapshot').$type<LinearIssueSnapshot>().notNull(),
    remoteSnapshot: jsonb('remote_snapshot').$type<LinearIssueSnapshot>(),
    conflict: jsonb('conflict').$type<LinearSyncConflict>(),
    syncState: text('sync_state').$type<LinearIssueLinkSyncState>().notNull().default('synced'),
    lastInboundDeliveryId: text('last_inbound_delivery_id'),
    lastOutboundRevision: bigint('last_outbound_revision', { mode: 'number' }).notNull().default(0),
    remoteUpdatedAt: timestamptz('remote_updated_at'),
    ...createdAtColumns(),
  },
  (table) => [
    uniqueIndex('linear_issue_links_workspace_task_unique').on(table.workspaceId, table.taskId),
    uniqueIndex('linear_issue_links_workspace_issue_unique').on(
      table.workspaceId,
      table.linearIssueId,
    ),
    index('linear_issue_links_binding_id_idx').on(table.bindingId),
    index('linear_issue_links_installation_id_idx').on(table.installationId),
    index('linear_issue_links_task_id_idx').on(table.taskId),
    index('linear_issue_links_sync_state_idx').on(table.workspaceId, table.syncState),
  ],
);

/** Inbox row written before any Linear event is interpreted. */
export const linearSyncInbox = pgTable(
  'linear_sync_inbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    installationId: uuid('installation_id')
      .references(() => linearInstallations.id, { onDelete: 'cascade' })
      .notNull(),
    deliveryId: text('delivery_id').notNull(),
    webhookId: text('webhook_id'),
    organizationId: text('organization_id').notNull(),
    eventType: text('event_type').notNull(),
    action: text('action').notNull(),
    subjectId: text('subject_id'),
    payload: jsonb('payload').notNull(),
    status: text('status').$type<LinearSyncInboxStatus>().notNull().default('received'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamptz('available_at').notNull().defaultNow(),
    lockedUntil: timestamptz('locked_until'),
    lastError: text('last_error'),
    processedAt: timestamptz('processed_at'),
    ...createdAtColumns(),
  },
  (table) => [
    uniqueIndex('linear_sync_inbox_installation_delivery_unique').on(
      table.installationId,
      table.deliveryId,
    ),
    index('linear_sync_inbox_claim_idx').on(table.status, table.availableAt),
    index('linear_sync_inbox_subject_idx').on(table.workspaceId, table.subjectId),
  ],
);

/** Outbox row for a local change that must be sent to Linear. */
export const linearSyncOutbox = pgTable(
  'linear_sync_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    installationId: uuid('installation_id')
      .references(() => linearInstallations.id, { onDelete: 'cascade' })
      .notNull(),
    linkId: uuid('link_id').references(() => linearIssueLinks.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    operation: text('operation').notNull(),
    payload: jsonb('payload').notNull(),
    expectedLocalRevision: bigint('expected_local_revision', { mode: 'number' }).notNull(),
    status: text('status').$type<LinearSyncOutboxStatus>().notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamptz('available_at').notNull().defaultNow(),
    lockedUntil: timestamptz('locked_until'),
    lastError: text('last_error'),
    outcomeUnknownAt: timestamptz('outcome_unknown_at'),
    sentAt: timestamptz('sent_at'),
    ...createdAtColumns(),
  },
  (table) => [
    index('linear_sync_outbox_claim_idx').on(table.status, table.availableAt),
    index('linear_sync_outbox_link_id_idx').on(table.linkId),
    index('linear_sync_outbox_task_id_idx').on(table.taskId),
    index('linear_sync_outbox_workspace_id_idx').on(table.workspaceId),
  ],
);

/** Append-only domain facts used to wake the correct planner scope. */
export const taskDomainEvents = pgTable(
  'task_domain_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    source: text('source').$type<TaskDomainEventSource>().notNull(),
    type: text('type').$type<TaskDomainEventType>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    revision: bigint('revision', { mode: 'number' })
      .notNull()
      .default(sql`nextval('task_domain_event_revision_seq')`),
    payload: jsonb('payload').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('task_domain_events_workspace_idempotency_unique').on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index('task_domain_events_scope_revision_idx').on(
      table.workspaceId,
      table.projectId,
      table.revision,
    ),
    index('task_domain_events_task_id_idx').on(table.taskId),
  ],
);

/** Coalescing cursor for incremental project/workspace replanning. */
export const taskPlanningScopes = pgTable(
  'task_planning_scopes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    scopeType: text('scope_type').$type<TaskPlanningScopeType>().notNull(),
    scopeId: text('scope_id').notNull(),
    dirtyRevision: bigint('dirty_revision', { mode: 'number' }).notNull().default(0),
    plannedRevision: bigint('planned_revision', { mode: 'number' }).notNull().default(0),
    status: text('status').$type<TaskPlanningScopeStatus>().notNull().default('idle'),
    lastTrigger: jsonb('last_trigger').$type<TaskPlanningTrigger>(),
    lastError: text('last_error'),
    lockedUntil: timestamptz('locked_until'),
    lastPlannedAt: timestamptz('last_planned_at'),
    ...createdAtColumns(),
  },
  (table) => [
    uniqueIndex('task_planning_scopes_workspace_type_id_unique').on(
      table.workspaceId,
      table.scopeType,
      table.scopeId,
    ),
    index('task_planning_scopes_ready_idx').on(table.status, table.dirtyRevision),
  ],
);

/** Immutable input/output record for one incremental planning attempt. */
export const taskPlanningRevisions = pgTable(
  'task_planning_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    scopeId: uuid('scope_id')
      .references(() => taskPlanningScopes.id, { onDelete: 'cascade' })
      .notNull(),
    inputRevision: bigint('input_revision', { mode: 'number' }).notNull(),
    status: text('status').$type<TaskPlanningRevisionStatus>().notNull().default('running'),
    trigger: jsonb('trigger').$type<TaskPlanningTrigger>().notNull(),
    eventIds: text('event_ids').array().notNull().default([]),
    inputSnapshot: jsonb('input_snapshot').notNull(),
    proposal: jsonb('proposal'),
    error: text('error'),
    appliedAt: timestamptz('applied_at'),
    ...createdAtColumns(),
  },
  (table) => [
    uniqueIndex('task_planning_revisions_scope_revision_unique').on(
      table.scopeId,
      table.inputRevision,
    ),
    index('task_planning_revisions_workspace_status_idx').on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    index('task_planning_revisions_scope_created_at_idx').on(table.scopeId, table.createdAt),
  ],
);

export type LinearInstallationItem = typeof linearInstallations.$inferSelect;
export type NewLinearInstallation = typeof linearInstallations.$inferInsert;
export type LinearProjectBindingItem = typeof linearProjectBindings.$inferSelect;
export type NewLinearProjectBinding = typeof linearProjectBindings.$inferInsert;
export type LinearIssueLinkItem = typeof linearIssueLinks.$inferSelect;
export type NewLinearIssueLink = typeof linearIssueLinks.$inferInsert;
export type LinearSyncInboxItem = typeof linearSyncInbox.$inferSelect;
export type NewLinearSyncInbox = typeof linearSyncInbox.$inferInsert;
export type LinearSyncOutboxItem = typeof linearSyncOutbox.$inferSelect;
export type NewLinearSyncOutbox = typeof linearSyncOutbox.$inferInsert;
export type TaskDomainEventItem = typeof taskDomainEvents.$inferSelect;
export type NewTaskDomainEvent = typeof taskDomainEvents.$inferInsert;
export type TaskPlanningScopeItem = typeof taskPlanningScopes.$inferSelect;
export type NewTaskPlanningScope = typeof taskPlanningScopes.$inferInsert;
export type TaskPlanningRevisionItem = typeof taskPlanningRevisions.$inferSelect;
export type NewTaskPlanningRevision = typeof taskPlanningRevisions.$inferInsert;

/** Keep creation and update columns consistent without repeating them per table. */
function createdAtColumns() {
  return {
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  };
}
