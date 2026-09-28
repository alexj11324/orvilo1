import type {
  LinearCommentSnapshot,
  LinearExternalConfirmationState,
  LinearExternalSyncOrigin,
  LinearExternalSyncSource,
  LinearInstallationActor,
  LinearInstallationStatus,
  LinearIssueLinkSyncState,
  LinearIssueSnapshot,
  LinearProjectBindingSettings,
  LinearProjectLinkSyncState,
  LinearProjectSnapshot,
  LinearRelationKind,
  LinearRelationSnapshot,
  LinearSyncConflict,
  LinearSyncImportPhase,
  LinearSyncInboxStatus,
  LinearSyncOutboxStatus,
  LinearSyncScopeCursors,
  LinearSyncScopeSettings,
  LinearSyncScopeStatus,
  LinearSyncTombstone,
  LinearTeamLinkSyncState,
  LinearTeamSnapshot,
  LinearTombstoneKind,
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
import { taskComments, tasks } from './task';
import { teams } from './team';
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
    // Legacy connector link is optional compatibility metadata. Linear auth is
    // owned by this installation, so deleting a user connector must not delete
    // the workspace installation or its durable app credentials.
    connectorId: uuid('connector_id').references(() => userConnectors.id, { onDelete: 'set null' }),
    organizationId: text('organization_id').notNull(),
    organizationName: text('organization_name'),
    /** OAuth client that owns the app/service identity in Linear. */
    oauthClientId: text('oauth_client_id'),
    /** Workspace-specific Linear app user returned by `viewer` after actor=app OAuth. */
    appActorId: text('app_actor_id'),
    appActorName: text('app_actor_name'),
    actor: text('actor').$type<LinearInstallationActor>().notNull().default('app'),
    /** Effective scopes returned by Linear, never a client-supplied scope claim. */
    scopes: text('scopes').array().notNull().default([]),
    /** AES-GCM ciphertexts owned by this durable installation, never sent to clients. */
    accessTokenCiphertext: text('access_token_ciphertext'),
    refreshTokenCiphertext: text('refresh_token_ciphertext'),
    accessTokenExpiresAt: timestamptz('access_token_expires_at'),
    /** CAS version for refresh-token rotation. */
    tokenVersion: integer('token_version').notNull().default(0),
    /** Short-lived single-owner refresh lease and its fence. */
    refreshOwner: text('refresh_owner'),
    refreshLeaseUntil: timestamptz('refresh_lease_until'),
    refreshFence: integer('refresh_fence').notNull().default(0),
    /** Name of the secret in the deployment secret store, never the secret itself. */
    webhookSecretRef: text('webhook_secret_ref'),
    installedByUserId: text('installed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: text('status').$type<LinearInstallationStatus>().notNull().default('active'),
    lastError: text('last_error'),
    revokedAt: timestamptz('revoked_at'),
    revocationReason: text('revocation_reason'),
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

/**
 * Workspace-level sync scope (linear-workspace-v3): the single durable record
 * of which Linear teams/projects/issues an installation may mirror, plus the
 * resumable import run (per-phase cursors + counters). Closing the browser
 * never interrupts the import — the worker resumes from `cursors`.
 */
export const linearSyncScopes = pgTable(
  'linear_sync_scopes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    installationId: uuid('installation_id')
      .references(() => linearInstallations.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').$type<LinearSyncScopeStatus>().notNull().default('active'),
    /** Bumped on every scope-settings change; import runs capture one revision. */
    scopeRevision: integer('scope_revision').notNull().default(1),
    settings: jsonb('settings').$type<LinearSyncScopeSettings>().notNull().default({}),
    /** Per-phase pagination cursors for the current import run. */
    cursors: jsonb('cursors').$type<LinearSyncScopeCursors>().notNull().default({}),
    importRunId: text('import_run_id'),
    importPhase: text('import_phase').$type<LinearSyncImportPhase>(),
    importStartedAt: timestamptz('import_started_at'),
    importCompletedAt: timestamptz('import_completed_at'),
    teamsLinked: integer('teams_linked').notNull().default(0),
    projectsLinked: integer('projects_linked').notNull().default(0),
    issuesImported: integer('issues_imported').notNull().default(0),
    issuesFailed: integer('issues_failed').notNull().default(0),
    lastError: text('last_error'),
    /** Short-lived single-writer lease for the import worker. */
    leaseOwner: text('lease_owner'),
    lockedUntil: timestamptz('locked_until'),
    leaseFence: integer('lease_fence').notNull().default(0),
    ...createdAtColumns(),
  },
  (table) => [
    uniqueIndex('linear_sync_scopes_installation_unique').on(table.installationId),
    index('linear_sync_scopes_workspace_id_idx').on(table.workspaceId),
    index('linear_sync_scopes_status_idx').on(table.status, table.lockedUntil),
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
    /** Workspace sync scope this link operates under (null = legacy binding). */
    scopeId: uuid('scope_id').references(() => linearSyncScopes.id, { onDelete: 'set null' }),
    settings: jsonb('settings').$type<LinearProjectBindingSettings>().notNull().default({}),
    syncEnabled: boolean('sync_enabled').notNull().default(true),
    /** Link lifecycle — existing rows stay 'synced'. */
    syncState: text('sync_state').$type<LinearProjectLinkSyncState>().notNull().default('synced'),
    lastConfirmedSnapshot: jsonb('last_confirmed_snapshot').$type<LinearProjectSnapshot>(),
    remoteSnapshot: jsonb('remote_snapshot').$type<LinearProjectSnapshot>(),
    conflict: jsonb('conflict').$type<LinearSyncConflict>(),
    tombstone: jsonb('tombstone').$type<LinearSyncTombstone>(),
    lastInboundDeliveryId: text('last_inbound_delivery_id'),
    lastOutboundRevision: bigint('last_outbound_revision', { mode: 'number' }).notNull().default(0),
    autoExecutionEnabled: boolean('auto_execution_enabled').notNull().default(false),
    replanningEnabled: boolean('replanning_enabled').notNull().default(false),
    version: integer('version').notNull().default(1),
    importCursor: text('import_cursor'),
    importPhase: text('import_phase')
      .$type<'initial' | 'reconciliation' | 'completed'>()
      .notNull()
      .default('initial'),
    importReconciliationCursor: text('import_reconciliation_cursor'),
    importStartedAt: timestamptz('import_started_at'),
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

/** Durable per-issue receipt for the resumable historical import. */
export const linearSyncImportReceipts = pgTable(
  'linear_sync_import_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    bindingId: uuid('binding_id')
      .references(() => linearProjectBindings.id, { onDelete: 'cascade' })
      .notNull(),
    linearIssueId: text('linear_issue_id').notNull(),
    phase: text('phase').$type<'initial' | 'reconciliation'>().notNull(),
    status: text('status').$type<'failed' | 'processed'>().notNull(),
    lastError: text('last_error'),
    processedAt: timestamptz('processed_at'),
    ...createdAtColumns(),
  },
  (table) => [
    uniqueIndex('linear_sync_import_receipts_binding_issue_unique').on(
      table.bindingId,
      table.linearIssueId,
    ),
    index('linear_sync_import_receipts_workspace_idx').on(table.workspaceId, table.status),
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
    /** Remote Linear team UUID owning the issue (may differ per issue). */
    linearTeamId: text('linear_team_id'),
    /**
     * Prior display identifiers retained across renames/rekeys (e.g. ENG-4 →
     * DES-9). Identity stays `linear_issue_id`; aliases only aid lookup.
     */
    aliasIdentifiers: text('alias_identifiers').array().notNull().default([]),
    lastConfirmedSnapshot: jsonb('last_confirmed_snapshot').$type<LinearIssueSnapshot>().notNull(),
    remoteSnapshot: jsonb('remote_snapshot').$type<LinearIssueSnapshot>(),
    conflict: jsonb('conflict').$type<LinearSyncConflict>(),
    tombstone: jsonb('tombstone').$type<LinearSyncTombstone>(),
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
    index('linear_issue_links_linear_team_idx').on(table.workspaceId, table.linearTeamId),
  ],
);

/**
 * Durable link between a local team and a remote Linear team — same
 * confirmed/remote/conflict/tombstone shape as issue links.
 */
export const linearTeamLinks = pgTable(
  'linear_team_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    teamId: text('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    installationId: uuid('installation_id')
      .references(() => linearInstallations.id, { onDelete: 'cascade' })
      .notNull(),
    scopeId: uuid('scope_id').references(() => linearSyncScopes.id, { onDelete: 'set null' }),
    linearTeamId: text('linear_team_id').notNull(),
    linearTeamKey: text('linear_team_key'),
    lastConfirmedSnapshot: jsonb('last_confirmed_snapshot').$type<LinearTeamSnapshot>(),
    remoteSnapshot: jsonb('remote_snapshot').$type<LinearTeamSnapshot>(),
    conflict: jsonb('conflict').$type<LinearSyncConflict>(),
    tombstone: jsonb('tombstone').$type<LinearSyncTombstone>(),
    syncState: text('sync_state').$type<LinearTeamLinkSyncState>().notNull().default('synced'),
    lastInboundDeliveryId: text('last_inbound_delivery_id'),
    lastOutboundRevision: bigint('last_outbound_revision', { mode: 'number' }).notNull().default(0),
    ...createdAtColumns(),
  },
  (table) => [
    uniqueIndex('linear_team_links_workspace_team_unique').on(table.workspaceId, table.teamId),
    uniqueIndex('linear_team_links_workspace_linear_team_unique').on(
      table.workspaceId,
      table.linearTeamId,
    ),
    index('linear_team_links_installation_id_idx').on(table.installationId),
    index('linear_team_links_sync_state_idx').on(table.workspaceId, table.syncState),
  ],
);

/** Stable mapping between one Linear comment and one local task comment. */
export const linearExternalComments = pgTable(
  'linear_external_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    issueLinkId: uuid('issue_link_id')
      .references(() => linearIssueLinks.id, { onDelete: 'cascade' })
      .notNull(),
    localCommentId: text('local_comment_id').references(() => taskComments.id, {
      onDelete: 'set null',
    }),
    linearIssueId: text('linear_issue_id').notNull(),
    linearCommentId: text('linear_comment_id'),
    source: text('source').$type<LinearExternalSyncSource>().notNull(),
    origin: text('origin').$type<LinearExternalSyncOrigin>().notNull(),
    confirmationState: text('confirmation_state')
      .$type<LinearExternalConfirmationState>()
      .notNull()
      .default('unconfirmed'),
    lastConfirmedSnapshot: jsonb('last_confirmed_snapshot').$type<LinearCommentSnapshot>(),
    remoteSnapshot: jsonb('remote_snapshot').$type<LinearCommentSnapshot>(),
    tombstone: jsonb('tombstone').$type<LinearSyncTombstone>(),
    lastInboundDeliveryId: text('last_inbound_delivery_id'),
    lastOutboundOperationId: text('last_outbound_operation_id'),
    ...createdAtColumns(),
  },
  (table) => [
    uniqueIndex('linear_external_comments_workspace_remote_unique').on(
      table.workspaceId,
      table.linearCommentId,
    ),
    uniqueIndex('linear_external_comments_workspace_local_unique').on(
      table.workspaceId,
      table.localCommentId,
    ),
    index('linear_external_comments_issue_link_idx').on(table.issueLinkId),
    index('linear_external_comments_issue_idx').on(table.workspaceId, table.linearIssueId),
  ],
);

/** Stable mapping for parent, blocks, and relates business relations. */
export const linearExternalRelations = pgTable(
  'linear_external_relations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    issueLinkId: uuid('issue_link_id').references(() => linearIssueLinks.id, {
      onDelete: 'set null',
    }),
    localRelationKey: text('local_relation_key').notNull(),
    linearRelationId: text('linear_relation_id'),
    sourceIssueId: text('source_issue_id'),
    targetIssueId: text('target_issue_id'),
    localSourceTaskId: text('local_source_task_id').references(() => tasks.id, {
      onDelete: 'set null',
    }),
    localTargetTaskId: text('local_target_task_id').references(() => tasks.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').$type<LinearRelationKind>().notNull(),
    source: text('source').$type<LinearExternalSyncSource>().notNull(),
    origin: text('origin').$type<LinearExternalSyncOrigin>().notNull(),
    confirmationState: text('confirmation_state')
      .$type<LinearExternalConfirmationState>()
      .notNull()
      .default('unconfirmed'),
    resolutionState: text('resolution_state').$type<'resolved' | 'unresolved'>().notNull(),
    lastConfirmedSnapshot: jsonb('last_confirmed_snapshot').$type<LinearRelationSnapshot>(),
    remoteSnapshot: jsonb('remote_snapshot').$type<LinearRelationSnapshot>(),
    tombstone: jsonb('tombstone').$type<LinearSyncTombstone>(),
    lastInboundDeliveryId: text('last_inbound_delivery_id'),
    lastOutboundOperationId: text('last_outbound_operation_id'),
    ...createdAtColumns(),
  },
  (table) => [
    uniqueIndex('linear_external_relations_workspace_local_unique').on(
      table.workspaceId,
      table.localRelationKey,
    ),
    uniqueIndex('linear_external_relations_workspace_remote_unique').on(
      table.workspaceId,
      table.linearRelationId,
    ),
    index('linear_external_relations_source_issue_idx').on(table.workspaceId, table.sourceIssueId),
    index('linear_external_relations_target_issue_idx').on(table.workspaceId, table.targetIssueId),
    index('linear_external_relations_target_task_idx').on(
      table.workspaceId,
      table.localTargetTaskId,
      table.kind,
    ),
  ],
);

/** Append-only reason history for an issue that left the active sync scope. */
export const linearIssueTombstones = pgTable(
  'linear_issue_tombstones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    issueLinkId: uuid('issue_link_id')
      .references(() => linearIssueLinks.id, { onDelete: 'cascade' })
      .notNull(),
    linearIssueId: text('linear_issue_id').notNull(),
    kind: text('kind').$type<LinearTombstoneKind>().notNull(),
    source: text('source').$type<LinearExternalSyncSource>().notNull(),
    origin: text('origin').$type<LinearExternalSyncOrigin>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    deliveryId: text('delivery_id'),
    reason: text('reason'),
    snapshot: jsonb('snapshot').$type<LinearIssueSnapshot>(),
    observedAt: timestamptz('observed_at').notNull(),
    ...createdAtColumns(),
  },
  (table) => [
    uniqueIndex('linear_issue_tombstones_workspace_idempotency_unique').on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index('linear_issue_tombstones_link_idx').on(table.issueLinkId, table.observedAt),
    index('linear_issue_tombstones_issue_idx').on(table.workspaceId, table.linearIssueId),
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
    leaseOwner: text('lease_owner'),
    leaseFence: integer('lease_fence').notNull().default(0),
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
    leaseOwner: text('lease_owner'),
    leaseFence: integer('lease_fence').notNull().default(0),
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
    uniqueIndex('linear_sync_outbox_create_operation_unique')
      .on(table.workspaceId, table.operation)
      .where(sql`${table.operation} like 'linear-issue:create:%'`),
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
    /** Team scope the event affects (linear-workspace-v3). */
    teamId: text('team_id').references(() => teams.id, { onDelete: 'set null' }),
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
    index('task_domain_events_team_revision_idx').on(
      table.workspaceId,
      table.teamId,
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
export type LinearSyncScopeItem = typeof linearSyncScopes.$inferSelect;
export type NewLinearSyncScope = typeof linearSyncScopes.$inferInsert;
export type LinearTeamLinkItem = typeof linearTeamLinks.$inferSelect;
export type NewLinearTeamLink = typeof linearTeamLinks.$inferInsert;
export type LinearProjectBindingItem = typeof linearProjectBindings.$inferSelect;
export type NewLinearProjectBinding = typeof linearProjectBindings.$inferInsert;
export type LinearIssueLinkItem = typeof linearIssueLinks.$inferSelect;
export type NewLinearIssueLink = typeof linearIssueLinks.$inferInsert;
export type LinearExternalCommentItem = typeof linearExternalComments.$inferSelect;
export type NewLinearExternalComment = typeof linearExternalComments.$inferInsert;
export type LinearExternalRelationItem = typeof linearExternalRelations.$inferSelect;
export type NewLinearExternalRelation = typeof linearExternalRelations.$inferInsert;
export type LinearIssueTombstoneItem = typeof linearIssueTombstones.$inferSelect;
export type NewLinearIssueTombstone = typeof linearIssueTombstones.$inferInsert;
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
