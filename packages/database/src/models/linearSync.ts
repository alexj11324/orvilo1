import { randomUUID } from 'node:crypto';

import type {
  LinearCommentSnapshot,
  LinearExternalCommentOutboxPayload,
  LinearExternalConfirmationState,
  LinearExternalRelationOutboxPayload,
  LinearExternalSyncOrigin,
  LinearExternalSyncSource,
  LinearInstallationRecoveryState,
  LinearIssueLinkSyncState,
  LinearIssueSnapshot,
  LinearProjectBindingSettings,
  LinearProjectSnapshot,
  LinearRelationKind,
  LinearRelationSnapshot,
  LinearSyncConflict,
  LinearSyncImportPhase,
  LinearSyncInboxStatus,
  LinearSyncOutboxStatus,
  LinearSyncRecoveryKind,
  LinearSyncRecoveryRow,
  LinearSyncScopeCursors,
  LinearSyncScopeSettings,
  LinearSyncScopeStatus,
  LinearSyncTombstone,
  LinearTeamLinkSyncState,
  LinearTeamSnapshot,
  LinearTombstoneKind,
  TaskDomainEventSource,
  TaskDomainEventType,
  TaskItem,
  TaskPlanningProposal,
  TaskPlanningRevisionStatus,
  TaskPlanningScopeStatus,
  TaskPlanningScopeType,
  TaskPlanningTrigger,
} from '@orvilo/types';
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

import type {
  LinearSyncInboxItem,
  LinearSyncOutboxItem,
  TaskDomainEventItem,
  TaskPlanningRevisionItem,
  TaskPlanningScopeItem,
} from '../schemas';
import {
  linearExternalComments,
  linearExternalRelations,
  linearInstallations,
  linearIssueLinks,
  linearIssueTombstones,
  linearProjectBindings,
  linearSyncImportReceipts,
  linearSyncInbox,
  linearSyncOutbox,
  linearSyncScopes,
  linearTeamLinks,
  taskDomainEvents,
  taskPlanningRevisions,
  taskPlanningScopes,
  tasks,
  teamWorkflowStates,
} from '../schemas';
import type { OrviloDatabase } from '../type';

export interface RecordTaskDomainEventInput {
  action?: string;
  eventId?: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  projectId?: string | null;
  source: TaskDomainEventSource;
  taskId?: string | null;
  /** Team scope the event affects (linear-workspace-v3). */
  teamId?: string | null;
  type: TaskDomainEventType;
}

export interface QueueLinearSyncInput {
  expectedLocalRevision: number;
  initialStatus?: 'paused' | 'pending';
  installationId: string;
  linkId?: string | null;
  operation: string;
  payload: Record<string, unknown>;
  taskId?: string | null;
}

export interface CaptureLinearDeliveryInput {
  action: string;
  deliveryId: string;
  eventType: string;
  installationId: string;
  organizationId: string;
  payload: Record<string, unknown>;
  subjectId?: string | null;
  webhookId?: string | null;
}

export interface LinearSyncLease {
  fence: number;
  owner: string;
}

export const LINEAR_SYNC_DEFAULT_LEASE_MS = 60_000;
export const LINEAR_SYNC_MAX_ATTEMPTS = 5;
export const LINEAR_SYNC_RETRY_BASE_MS = 1_000;
export const LINEAR_SYNC_RETRY_MAX_MS = 60_000;
/** Maximum number of task ids accepted by a task-scoped link lookup. */
export const LINEAR_ISSUE_LINK_TASK_ID_CAP = 100;
export const LINEAR_ISSUE_LINK_LIST_DEFAULT_LIMIT = 100;

/**
 * PostgreSQL stores timestamptz values with microsecond precision while the
 * API exposes JavaScript Dates with millisecond precision. Compare the
 * millisecond value the caller observed so a returned row can be retried on
 * both PGlite and node-postgres without losing the CAS guard.
 */
const sameObservedUpdatedAt = (column: unknown, expected: Date) =>
  sql`date_trunc('milliseconds', ${column}) = date_trunc('milliseconds', ${expected}::timestamptz)`;

/** Provider errors are user-visible diagnostics; expose only a safe classification. */
export const sanitizeLinearSyncError = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (
    /oauth|authorization|bearer|access[_ -]?token|refresh[_ -]?token|invalid[_ -]?grant|\b401\b|\b403\b/i.test(
      normalized,
    )
  ) {
    return 'Linear authorization required';
  }
  if (/timeout|timed out|rate limit|\b429\b|unavailable|network/i.test(normalized)) {
    return 'Linear provider unavailable';
  }
  if (/outcome[_ -]?unknown/i.test(normalized)) return 'Linear write outcome is unknown';
  if (/conflict/i.test(normalized)) return 'Linear synchronization conflict';
  return 'Linear synchronization failed';
};

/** Deterministic backoff keeps retries bounded and makes queue behavior testable. */
export const linearSyncRetryDelayMs = (attempts: number) =>
  Math.min(
    LINEAR_SYNC_RETRY_MAX_MS,
    LINEAR_SYNC_RETRY_BASE_MS * 2 ** Math.max(0, Math.min(attempts, 16) - 1),
  );

/** Resolve the additive rollout flags while keeping old bindings unchanged. */
export const linearBindingReadEnabled = (binding: {
  settings: LinearProjectBindingSettings;
  syncEnabled: boolean;
}) => binding.settings.readEnabled ?? binding.syncEnabled;

export const linearBindingWriteEnabled = (binding: {
  settings: LinearProjectBindingSettings;
  syncEnabled: boolean;
}) => binding.settings.writeEnabled ?? binding.syncEnabled;

export class LinearInstallationUnavailableError extends Error {
  readonly code = 'LINEAR_INSTALLATION_UNAVAILABLE';

  constructor(message = 'Linear installation is not active') {
    super(message);
    this.name = 'LinearInstallationUnavailableError';
  }
}

const linearInstallationPublicSelection = {
  accessTokenExpiresAt: linearInstallations.accessTokenExpiresAt,
  actor: linearInstallations.actor,
  appActorId: linearInstallations.appActorId,
  appActorName: linearInstallations.appActorName,
  connectorId: linearInstallations.connectorId,
  createdAt: linearInstallations.createdAt,
  id: linearInstallations.id,
  installedByUserId: linearInstallations.installedByUserId,
  lastError: linearInstallations.lastError,
  lastSyncAt: linearInstallations.lastSyncAt,
  oauthClientId: linearInstallations.oauthClientId,
  organizationId: linearInstallations.organizationId,
  organizationName: linearInstallations.organizationName,
  refreshFence: linearInstallations.refreshFence,
  revokedAt: linearInstallations.revokedAt,
  revocationReason: linearInstallations.revocationReason,
  scopes: linearInstallations.scopes,
  status: linearInstallations.status,
  tokenVersion: linearInstallations.tokenVersion,
  updatedAt: linearInstallations.updatedAt,
  workspaceId: linearInstallations.workspaceId,
};

export class LinearSyncModel {
  private readonly db: OrviloDatabase;
  private readonly workspaceId: string;

  constructor(db: OrviloDatabase, workspaceId: string) {
    this.db = db;
    this.workspaceId = workspaceId;
  }

  async findInstallationByOrganization(organizationId: string) {
    const [row] = await this.db
      .select(linearInstallationPublicSelection)
      .from(linearInstallations)
      .where(
        and(
          eq(linearInstallations.workspaceId, this.workspaceId),
          eq(linearInstallations.organizationId, organizationId),
        ),
      )
      .limit(1);
    return row ? { ...row, lastError: sanitizeLinearSyncError(row.lastError) } : null;
  }

  async findInstallationById(id: string) {
    const [row] = await this.db
      .select(linearInstallationPublicSelection)
      .from(linearInstallations)
      .where(
        and(eq(linearInstallations.id, id), eq(linearInstallations.workspaceId, this.workspaceId)),
      )
      .limit(1);
    return row ? { ...row, lastError: sanitizeLinearSyncError(row.lastError) } : null;
  }

  async listInstallations() {
    const rows = await this.db
      .select(linearInstallationPublicSelection)
      .from(linearInstallations)
      .where(eq(linearInstallations.workspaceId, this.workspaceId))
      .orderBy(desc(linearInstallations.createdAt));
    return rows.map((row) => ({ ...row, lastError: sanitizeLinearSyncError(row.lastError) }));
  }

  async listInstallationRecoveryState(): Promise<LinearInstallationRecoveryState[]> {
    const rows = await this.db
      .select({
        accessTokenExpiresAt: linearInstallations.accessTokenExpiresAt,
        id: linearInstallations.id,
        lastError: linearInstallations.lastError,
        lastSyncAt: linearInstallations.lastSyncAt,
        organizationId: linearInstallations.organizationId,
        organizationName: linearInstallations.organizationName,
        status: linearInstallations.status,
      })
      .from(linearInstallations)
      .where(eq(linearInstallations.workspaceId, this.workspaceId))
      .orderBy(desc(linearInstallations.updatedAt));

    return rows.map((row) => ({
      ...row,
      lastError: sanitizeLinearSyncError(row.lastError),
      reauthRequired: row.status !== 'active',
    }));
  }

  /** Server-only webhook verification candidates; never return secret refs to clients. */
  async listInstallationWebhookCandidates() {
    return this.db
      .select({
        id: linearInstallations.id,
        status: linearInstallations.status,
        webhookSecretRef: linearInstallations.webhookSecretRef,
      })
      .from(linearInstallations)
      .where(eq(linearInstallations.workspaceId, this.workspaceId));
  }

  /** Full installation row for server-side credential resolution only. */
  async findInstallationForAuth(id: string) {
    const [row] = await this.db
      .select()
      .from(linearInstallations)
      .where(
        and(eq(linearInstallations.id, id), eq(linearInstallations.workspaceId, this.workspaceId)),
      )
      .limit(1);
    return row ?? null;
  }

  async upsertOAuthInstallation(input: {
    installedByUserId: string;
    organizationId: string;
    organizationName?: string;
    oauthClientId: string;
    appActorId: string;
    appActorName?: string;
    scopes: string[];
    accessTokenCiphertext: string;
    refreshTokenCiphertext: string;
    accessTokenExpiresAt: Date | null;
    webhookSecretRef?: string;
  }) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(linearInstallations)
        .values({
          accessTokenCiphertext: input.accessTokenCiphertext,
          accessTokenExpiresAt: input.accessTokenExpiresAt,
          actor: 'app',
          appActorId: input.appActorId,
          appActorName: input.appActorName,
          installedByUserId: input.installedByUserId,
          organizationId: input.organizationId,
          organizationName: input.organizationName,
          oauthClientId: input.oauthClientId,
          refreshTokenCiphertext: input.refreshTokenCiphertext,
          scopes: input.scopes,
          status: 'active',
          webhookSecretRef: input.webhookSecretRef,
          workspaceId: this.workspaceId,
        })
        .onConflictDoUpdate({
          target: [linearInstallations.workspaceId, linearInstallations.organizationId],
          set: {
            accessTokenCiphertext: input.accessTokenCiphertext,
            accessTokenExpiresAt: input.accessTokenExpiresAt,
            actor: 'app',
            appActorId: input.appActorId,
            appActorName: input.appActorName,
            installedByUserId: input.installedByUserId,
            lastError: null,
            organizationName: input.organizationName,
            oauthClientId: input.oauthClientId,
            refreshFence: sql`${linearInstallations.refreshFence} + 1`,
            refreshLeaseUntil: null,
            refreshOwner: null,
            refreshTokenCiphertext: input.refreshTokenCiphertext,
            revokedAt: null,
            revocationReason: null,
            scopes: input.scopes,
            status: 'active',
            tokenVersion: sql`${linearInstallations.tokenVersion} + 1`,
            webhookSecretRef: input.webhookSecretRef,
            updatedAt: new Date(),
          },
        })
        .returning();

      const now = new Date();
      await tx
        .update(linearSyncInbox)
        .set({
          availableAt: now,
          lastError: null,
          lockedUntil: null,
          processedAt: null,
          status: 'received',
          updatedAt: now,
        })
        .where(
          and(
            eq(linearSyncInbox.workspaceId, this.workspaceId),
            eq(linearSyncInbox.installationId, row.id),
            eq(linearSyncInbox.status, 'paused'),
            isNotNull(linearSyncInbox.lastError),
          ),
        );
      await tx
        .update(linearSyncOutbox)
        .set({
          availableAt: now,
          lastError: null,
          lockedUntil: null,
          outcomeUnknownAt: null,
          status: 'pending',
          updatedAt: now,
        })
        .where(
          and(
            eq(linearSyncOutbox.workspaceId, this.workspaceId),
            eq(linearSyncOutbox.installationId, row.id),
            eq(linearSyncOutbox.status, 'paused'),
            isNotNull(linearSyncOutbox.lastError),
          ),
        );

      return row;
    });
  }

  /** Claim one refresh owner while keeping the expected token version fenced. */
  async claimTokenRefresh(
    id: string,
    expectedTokenVersion: number,
    owner: string,
    leaseMs = 120_000,
  ) {
    const leaseUntil = new Date(Date.now() + leaseMs);
    const [row] = await this.db
      .update(linearInstallations)
      .set({
        refreshFence: sql`${linearInstallations.refreshFence} + 1`,
        refreshLeaseUntil: leaseUntil,
        refreshOwner: owner,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linearInstallations.id, id),
          eq(linearInstallations.workspaceId, this.workspaceId),
          eq(linearInstallations.status, 'active'),
          eq(linearInstallations.tokenVersion, expectedTokenVersion),
          or(
            isNull(linearInstallations.refreshOwner),
            lte(linearInstallations.refreshLeaseUntil, new Date()),
          ),
        ),
      )
      .returning({
        refreshFence: linearInstallations.refreshFence,
        refreshLeaseUntil: linearInstallations.refreshLeaseUntil,
        refreshOwner: linearInstallations.refreshOwner,
        tokenVersion: linearInstallations.tokenVersion,
      });
    return row ?? null;
  }

  /** Persist a refresh response only if this owner still holds the fence. */
  async persistTokenRefresh(input: {
    accessTokenCiphertext: string;
    accessTokenExpiresAt: Date | null;
    expectedTokenVersion: number;
    id: string;
    owner: string;
    refreshFence: number;
    refreshTokenCiphertext: string;
    scopes: string[];
  }) {
    const [row] = await this.db
      .update(linearInstallations)
      .set({
        accessTokenCiphertext: input.accessTokenCiphertext,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        lastError: null,
        refreshLeaseUntil: null,
        refreshOwner: null,
        refreshTokenCiphertext: input.refreshTokenCiphertext,
        scopes: input.scopes,
        tokenVersion: input.expectedTokenVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linearInstallations.id, input.id),
          eq(linearInstallations.workspaceId, this.workspaceId),
          eq(linearInstallations.status, 'active'),
          eq(linearInstallations.tokenVersion, input.expectedTokenVersion),
          eq(linearInstallations.refreshOwner, input.owner),
          eq(linearInstallations.refreshFence, input.refreshFence),
        ),
      )
      .returning();
    return row ?? null;
  }

  async releaseTokenRefresh(id: string, owner: string, refreshFence: number) {
    await this.db
      .update(linearInstallations)
      .set({ refreshLeaseUntil: null, refreshOwner: null, updatedAt: new Date() })
      .where(
        and(
          eq(linearInstallations.id, id),
          eq(linearInstallations.workspaceId, this.workspaceId),
          eq(linearInstallations.refreshOwner, owner),
          eq(linearInstallations.refreshFence, refreshFence),
        ),
      );
  }

  /** Stop new provider work while preserving credentials and sync records. */
  async markInstallationUnavailable(
    id: string,
    input: { reason: string; status: 'error' | 'revoked'; message: string },
  ) {
    const [row] = await this.db
      .update(linearInstallations)
      .set({
        lastError: input.message.slice(0, 2_000),
        refreshLeaseUntil: null,
        refreshOwner: null,
        revokedAt: input.status === 'revoked' ? new Date() : undefined,
        revocationReason: input.reason,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(
        and(eq(linearInstallations.id, id), eq(linearInstallations.workspaceId, this.workspaceId)),
      )
      .returning(linearInstallationPublicSelection);
    return row ?? null;
  }

  async findBindingById(id: string) {
    const [row] = await this.db
      .select()
      .from(linearProjectBindings)
      .where(
        and(
          eq(linearProjectBindings.id, id),
          eq(linearProjectBindings.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findBindingByLinearProjectId(linearProjectId: string) {
    const [row] = await this.db
      .select()
      .from(linearProjectBindings)
      .where(
        and(
          eq(linearProjectBindings.workspaceId, this.workspaceId),
          eq(linearProjectBindings.linearProjectId, linearProjectId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Serialize inbound reconciliation with a binding rollout change. */
  async lockBindingByLinearProjectId(linearProjectId: string) {
    const [row] = await this.db
      .select()
      .from(linearProjectBindings)
      .where(
        and(
          eq(linearProjectBindings.workspaceId, this.workspaceId),
          eq(linearProjectBindings.linearProjectId, linearProjectId),
        ),
      )
      .for('update')
      .limit(1);
    return row ?? null;
  }

  async findBindingByProjectId(projectId: string) {
    const [row] = await this.db
      .select()
      .from(linearProjectBindings)
      .where(
        and(
          eq(linearProjectBindings.workspaceId, this.workspaceId),
          eq(linearProjectBindings.projectId, projectId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async lockBindingByProjectId(projectId: string) {
    const [row] = await this.db
      .select()
      .from(linearProjectBindings)
      .where(
        and(
          eq(linearProjectBindings.workspaceId, this.workspaceId),
          eq(linearProjectBindings.projectId, projectId),
        ),
      )
      .for('update')
      .limit(1);
    return row ?? null;
  }

  async findBindingByTaskId(taskId: string) {
    const [row] = await this.db
      .select({ binding: linearProjectBindings })
      .from(linearProjectBindings)
      .innerJoin(tasks, eq(tasks.projectId, linearProjectBindings.projectId))
      .where(
        and(
          eq(linearProjectBindings.workspaceId, this.workspaceId),
          eq(tasks.workspaceId, this.workspaceId),
          eq(tasks.id, taskId),
        ),
      )
      .limit(1);
    return row?.binding ?? null;
  }

  async listBindings() {
    return this.db
      .select()
      .from(linearProjectBindings)
      .where(eq(linearProjectBindings.workspaceId, this.workspaceId))
      .orderBy(desc(linearProjectBindings.updatedAt));
  }

  async upsertBinding(input: {
    defaultTeamId?: string;
    installationId: string;
    linearProjectId: string;
    projectId: string;
    remoteSnapshot?: LinearProjectSnapshot;
    scopeId?: string | null;
    settings?: LinearProjectBindingSettings;
    syncEnabled?: boolean;
    teamIds?: string[];
  }) {
    const settings = input.settings ?? {};
    const [row] = await this.db
      .insert(linearProjectBindings)
      .values({
        autoExecutionEnabled: settings.autoExecutionEnabled ?? false,
        defaultTeamId: input.defaultTeamId,
        installationId: input.installationId,
        linearProjectId: input.linearProjectId,
        projectId: input.projectId,
        remoteSnapshot: input.remoteSnapshot ?? null,
        replanningEnabled: settings.replanningEnabled ?? false,
        scopeId: input.scopeId ?? null,
        settings,
        syncEnabled: input.syncEnabled ?? true,
        teamIds: input.teamIds ?? [],
        workspaceId: this.workspaceId,
      })
      .onConflictDoUpdate({
        target: [linearProjectBindings.workspaceId, linearProjectBindings.projectId],
        set: {
          autoExecutionEnabled: settings.autoExecutionEnabled ?? false,
          defaultTeamId: input.defaultTeamId,
          installationId: input.installationId,
          linearProjectId: input.linearProjectId,
          remoteSnapshot: input.remoteSnapshot ?? null,
          replanningEnabled: settings.replanningEnabled ?? false,
          scopeId: input.scopeId ?? null,
          settings,
          syncEnabled: input.syncEnabled ?? true,
          teamIds: input.teamIds ?? [],
          updatedAt: new Date(),
          version: sql`${linearProjectBindings.version} + 1`,
        },
      })
      .returning();

    return row;
  }

  /**
   * Change only the binding rollout controls. Queue rows are paused/requeued in
   * the same transaction so a worker cannot revive an old lease after a
   * rollback. No provider call is made by this method.
   */
  async updateBindingControls(input: {
    expectedVersion?: number;
    id: string;
    readEnabled?: boolean;
    writeEnabled?: boolean;
  }) {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(linearProjectBindings)
        .where(
          and(
            eq(linearProjectBindings.id, input.id),
            eq(linearProjectBindings.workspaceId, this.workspaceId),
            input.expectedVersion === undefined
              ? undefined
              : eq(linearProjectBindings.version, input.expectedVersion),
          ),
        )
        .for('update')
        .limit(1);
      if (!current) return null;

      const nextSettings: LinearProjectBindingSettings = {
        ...current.settings,
        ...(input.readEnabled === undefined ? {} : { readEnabled: input.readEnabled }),
        ...(input.writeEnabled === undefined ? {} : { writeEnabled: input.writeEnabled }),
      };
      const [binding] = await tx
        .update(linearProjectBindings)
        .set({ settings: nextSettings, updatedAt: new Date(), version: current.version + 1 })
        .where(eq(linearProjectBindings.id, current.id))
        .returning();

      const readChanged =
        input.readEnabled !== undefined && input.readEnabled !== linearBindingReadEnabled(current);
      const writeChanged =
        input.writeEnabled !== undefined &&
        input.writeEnabled !== linearBindingWriteEnabled(current);
      const bindingId = current.id;
      const installationId = current.installationId;
      const now = new Date();

      if (readChanged) {
        if (input.readEnabled === false) {
          await tx.execute(sql`
            UPDATE linear_sync_inbox AS inbox
            SET status = 'paused', locked_until = NULL, lease_owner = NULL,
                lease_fence = lease_fence + 1, updated_at = now()
            WHERE inbox.workspace_id = ${this.workspaceId}
              AND inbox.installation_id = ${installationId}
              AND inbox.status IN ('received', 'pending_binding', 'failed', 'processing')
              AND (
                EXISTS (
                  SELECT 1 FROM linear_issue_links AS link
                  WHERE link.workspace_id = inbox.workspace_id
                    AND link.linear_issue_id = inbox.subject_id
                    AND link.binding_id = ${bindingId}
                )
                OR inbox.payload -> 'data' -> 'project' ->> 'id' = ${current.linearProjectId}
              )
          `);
        } else {
          await tx.execute(sql`
            UPDATE linear_sync_inbox AS inbox
            SET status = CASE WHEN status = 'pending_binding' THEN 'pending_binding' ELSE 'received' END,
                available_at = ${now}, locked_until = NULL, lease_owner = NULL,
                updated_at = now()
            WHERE inbox.workspace_id = ${this.workspaceId}
              AND inbox.installation_id = ${installationId}
              AND inbox.status = 'paused'
              AND (
                EXISTS (
                  SELECT 1 FROM linear_issue_links AS link
                  WHERE link.workspace_id = inbox.workspace_id
                    AND link.linear_issue_id = inbox.subject_id
                    AND link.binding_id = ${bindingId}
                )
                OR inbox.payload -> 'data' -> 'project' ->> 'id' = ${current.linearProjectId}
              )
          `);
        }
      }

      if (writeChanged) {
        if (input.writeEnabled === false) {
          await tx.execute(sql`
            UPDATE linear_sync_outbox AS outbox
            SET status = CASE WHEN status = 'sending' THEN 'outcome_unknown' ELSE 'paused' END,
                outcome_unknown_at = CASE
                  WHEN status = 'sending' THEN now()
                  ELSE outcome_unknown_at
                END,
                locked_until = NULL, lease_owner = NULL,
                lease_fence = lease_fence + 1, updated_at = now()
            WHERE outbox.workspace_id = ${this.workspaceId}
              AND outbox.installation_id = ${installationId}
              AND outbox.status IN ('pending', 'failed', 'sending', 'outcome_unknown')
              AND (
                EXISTS (
                  SELECT 1 FROM linear_issue_links AS link
                  WHERE outbox.link_id = link.id AND link.binding_id = ${bindingId}
                )
                OR EXISTS (
                  SELECT 1 FROM tasks AS task
                  WHERE outbox.link_id IS NULL
                    AND outbox.operation LIKE 'linear-issue:create:%'
                    AND task.id = outbox.task_id
                    AND task.project_id = ${current.projectId}
                )
              )
          `);
        } else {
          await tx.execute(sql`
            UPDATE linear_sync_outbox AS outbox
            SET status = 'pending', available_at = ${now}, locked_until = NULL,
                lease_owner = NULL, last_error = NULL, updated_at = now()
            WHERE outbox.workspace_id = ${this.workspaceId}
              AND outbox.installation_id = ${installationId}
              AND outbox.status = 'paused'
              AND (
                EXISTS (
                  SELECT 1 FROM linear_issue_links AS link
                  WHERE outbox.link_id = link.id AND link.binding_id = ${bindingId}
                )
                OR EXISTS (
                  SELECT 1 FROM tasks AS task
                  WHERE outbox.link_id IS NULL
                    AND outbox.operation LIKE 'linear-issue:create:%'
                    AND task.id = outbox.task_id
                    AND task.project_id = ${current.projectId}
                )
              )
          `);
        }
      }

      return binding ?? null;
    });
  }

  async updateBindingImportCursor(id: string, cursor: string | null, completed: boolean) {
    const [row] = await this.db
      .update(linearProjectBindings)
      .set({
        importCompletedAt: completed ? new Date() : null,
        importCursor: cursor,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linearProjectBindings.id, id),
          eq(linearProjectBindings.workspaceId, this.workspaceId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async updateBindingImportState(
    id: string,
    patch: {
      importCompletedAt?: Date | null;
      importCursor?: string | null;
      importPhase?: 'initial' | 'reconciliation' | 'completed';
      importReconciliationCursor?: string | null;
      importStartedAt?: Date | null;
    },
  ) {
    const [row] = await this.db
      .update(linearProjectBindings)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(linearProjectBindings.id, id),
          eq(linearProjectBindings.workspaceId, this.workspaceId),
        ),
      )
      .returning();
    return row ?? null;
  }

  // ── Workspace sync scope + team links (linear-workspace-v3) ─────────────

  async findScopeByInstallation(installationId: string) {
    const [row] = await this.db
      .select()
      .from(linearSyncScopes)
      .where(
        and(
          eq(linearSyncScopes.installationId, installationId),
          eq(linearSyncScopes.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findScopeById(id: string) {
    const [row] = await this.db
      .select()
      .from(linearSyncScopes)
      .where(and(eq(linearSyncScopes.id, id), eq(linearSyncScopes.workspaceId, this.workspaceId)))
      .limit(1);
    return row ?? null;
  }

  /** Create or refresh the workspace-level scope for an installation. */
  async upsertScope(input: {
    installationId: string;
    settings?: LinearSyncScopeSettings;
    status?: LinearSyncScopeStatus;
  }) {
    const [installation] = await this.db
      .select({ id: linearInstallations.id })
      .from(linearInstallations)
      .where(
        and(
          eq(linearInstallations.id, input.installationId),
          eq(linearInstallations.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    if (!installation) {
      throw new Error('Linear installation does not belong to this workspace');
    }

    const [row] = await this.db
      .insert(linearSyncScopes)
      .values({
        installationId: input.installationId,
        settings: input.settings ?? {},
        status: input.status ?? 'active',
        workspaceId: this.workspaceId,
      })
      .onConflictDoUpdate({
        set: {
          ...(input.settings !== undefined ? { settings: input.settings } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          scopeRevision: sql`${linearSyncScopes.scopeRevision} + 1`,
          updatedAt: new Date(),
        },
        target: [linearSyncScopes.installationId],
      })
      .returning();
    return row;
  }

  /**
   * Atomically claim the import lease for a scope. Returns the claimed row,
   * or null when another worker holds an unexpired lease — callers must not
   * start a second writer for the same import run.
   */
  async claimScopeImport(input: { leaseOwner: string; lockMs?: number; scopeId: string }) {
    const lockUntil = new Date(Date.now() + (input.lockMs ?? 60_000));
    const [row] = await this.db
      .update(linearSyncScopes)
      .set({
        importRunId: input.leaseOwner,
        importStartedAt: sql`coalesce(${linearSyncScopes.importStartedAt}, now())`,
        leaseFence: sql`${linearSyncScopes.leaseFence} + 1`,
        leaseOwner: input.leaseOwner,
        lockedUntil: lockUntil,
        status: 'importing',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linearSyncScopes.id, input.scopeId),
          eq(linearSyncScopes.workspaceId, this.workspaceId),
          or(
            isNull(linearSyncScopes.lockedUntil),
            lt(linearSyncScopes.lockedUntil, new Date()),
            eq(linearSyncScopes.leaseOwner, input.leaseOwner),
          ),
        ),
      )
      .returning();
    return row ?? null;
  }

  /**
   * Atomically reset a scope for a fresh import run. The `status != importing`
   * predicate makes the check-and-reset a single statement so a worker that
   * just claimed the lease cannot have its cursors wiped mid-flight.
   */
  async resetScopeImport(id: string) {
    const [row] = await this.db
      .update(linearSyncScopes)
      .set({
        cursors: {},
        importCompletedAt: null,
        importPhase: 'teams',
        issuesFailed: 0,
        issuesImported: 0,
        projectsLinked: 0,
        status: 'importing',
        teamsLinked: 0,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linearSyncScopes.id, id),
          eq(linearSyncScopes.workspaceId, this.workspaceId),
          ne(linearSyncScopes.status, 'importing'),
        ),
      )
      .returning();
    return row ?? null;
  }

  /**
   * Commit one step of import progress. When `claim` is given the write is
   * fenced to it: owner + fence + run + scope revision must still match AND
   * the lease must still be live under the database clock — a worker that
   * lost its lease (expired, taken over, or reset) gets `null` back instead
   * of silently landing stale cursors, counters or failure states on top of
   * the new owner's run. Callers treating `null` as "claim lost" must stop;
   * control-plane paths (reset/trigger) omit the claim on purpose.
   */
  async updateScopeImportState(
    id: string,
    patch: {
      cursors?: LinearSyncScopeCursors;
      importCompletedAt?: Date | null;
      importPhase?: LinearSyncImportPhase | null;
      issuesFailed?: number;
      issuesImported?: number;
      lastError?: string | null;
      projectsLinked?: number;
      status?: LinearSyncScopeStatus;
      teamsLinked?: number;
    },
    claim?: {
      fence: number;
      importRunId: string | null;
      owner: string;
      scopeRevision: number;
    },
  ) {
    const [row] = await this.db
      .update(linearSyncScopes)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(linearSyncScopes.id, id),
          eq(linearSyncScopes.workspaceId, this.workspaceId),
          claim ? eq(linearSyncScopes.leaseOwner, claim.owner) : undefined,
          claim ? eq(linearSyncScopes.leaseFence, claim.fence) : undefined,
          claim
            ? claim.importRunId === null
              ? isNull(linearSyncScopes.importRunId)
              : eq(linearSyncScopes.importRunId, claim.importRunId)
            : undefined,
          claim ? eq(linearSyncScopes.scopeRevision, claim.scopeRevision) : undefined,
          claim ? gt(linearSyncScopes.lockedUntil, sql`now()`) : undefined,
        ),
      )
      .returning();
    return row ?? null;
  }

  /**
   * Extend the live claim's lease without touching progress fields. Phases do
   * unbounded work — teams/projects/issue pages — against a fixed-duration
   * lease, so the owner must renew or its own commits start failing the
   * `lockedUntil > now()` fence. Same predicates as
   * `updateScopeImportState`: a renewal that no longer matches owner/fence/
   * run/revision, or whose lease already lapsed on the database clock,
   * returns null and the caller treats it as lease loss.
   */
  async renewScopeImportLease(
    id: string,
    claim: {
      fence: number;
      importRunId: string | null;
      owner: string;
      scopeRevision: number;
    },
    lockMs: number = LINEAR_SYNC_DEFAULT_LEASE_MS,
  ) {
    const [row] = await this.db
      .update(linearSyncScopes)
      .set({
        lockedUntil: sql`now() + ${lockMs} * interval '1 millisecond'`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linearSyncScopes.id, id),
          eq(linearSyncScopes.workspaceId, this.workspaceId),
          eq(linearSyncScopes.leaseOwner, claim.owner),
          eq(linearSyncScopes.leaseFence, claim.fence),
          claim.importRunId === null
            ? isNull(linearSyncScopes.importRunId)
            : eq(linearSyncScopes.importRunId, claim.importRunId),
          eq(linearSyncScopes.scopeRevision, claim.scopeRevision),
          gt(linearSyncScopes.lockedUntil, sql`now()`),
        ),
      )
      .returning({ lockedUntil: linearSyncScopes.lockedUntil });
    return row ?? null;
  }

  async releaseScopeImport(input: { leaseFence: number; leaseOwner: string; scopeId: string }) {
    const [row] = await this.db
      .update(linearSyncScopes)
      .set({ leaseOwner: null, lockedUntil: null, updatedAt: new Date() })
      .where(
        and(
          eq(linearSyncScopes.id, input.scopeId),
          eq(linearSyncScopes.leaseOwner, input.leaseOwner),
          eq(linearSyncScopes.leaseFence, input.leaseFence),
          eq(linearSyncScopes.workspaceId, this.workspaceId),
        ),
      )
      .returning();
    return row ?? null;
  }

  // ── Team links ─────────────────────────────────────────────────────────

  async findTeamLinkByLinearTeamId(linearTeamId: string) {
    const [row] = await this.db
      .select()
      .from(linearTeamLinks)
      .where(
        and(
          eq(linearTeamLinks.linearTeamId, linearTeamId),
          eq(linearTeamLinks.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findTeamLinkByTeamId(teamId: string) {
    const [row] = await this.db
      .select()
      .from(linearTeamLinks)
      .where(
        and(eq(linearTeamLinks.teamId, teamId), eq(linearTeamLinks.workspaceId, this.workspaceId)),
      )
      .limit(1);
    return row ?? null;
  }

  async listTeamLinks(filter: { installationId?: string } = {}) {
    return this.db
      .select()
      .from(linearTeamLinks)
      .where(
        and(
          eq(linearTeamLinks.workspaceId, this.workspaceId),
          filter.installationId
            ? eq(linearTeamLinks.installationId, filter.installationId)
            : undefined,
        ),
      );
  }

  async upsertTeamLink(input: {
    installationId: string;
    linearTeamId: string;
    linearTeamKey?: string | null;
    remoteSnapshot?: LinearTeamSnapshot;
    scopeId?: string | null;
    syncState?: LinearTeamLinkSyncState;
    teamId: string;
  }) {
    const [row] = await this.db
      .insert(linearTeamLinks)
      .values({
        installationId: input.installationId,
        linearTeamId: input.linearTeamId,
        linearTeamKey: input.linearTeamKey ?? null,
        remoteSnapshot: input.remoteSnapshot,
        scopeId: input.scopeId ?? null,
        syncState: input.syncState ?? 'synced',
        teamId: input.teamId,
        workspaceId: this.workspaceId,
      })
      .onConflictDoUpdate({
        set: {
          installationId: input.installationId,
          linearTeamKey: input.linearTeamKey ?? null,
          remoteSnapshot: input.remoteSnapshot,
          scopeId: input.scopeId ?? null,
          syncState: input.syncState ?? 'synced',
          updatedAt: new Date(),
        },
        target: [linearTeamLinks.workspaceId, linearTeamLinks.linearTeamId],
      })
      .returning();
    return row;
  }

  /**
   * Unlink synced team links whose remote team is no longer approved by the
   * installation's scope (removed from `approvedTeamIds` or excluded by the
   * private-team policy). The link row stays for audit; `syncState` leaving
   * 'synced' is what stops team-scope outbound writes. Re-approving the team
   * in a later import flips it back via `upsertTeamLink`.
   */
  async markTeamLinksUnlinkedOutsideScope(input: {
    installationId: string;
    keepLinearTeamIds: string[];
  }) {
    await this.db
      .update(linearTeamLinks)
      .set({ syncState: 'unlinked', updatedAt: new Date() })
      .where(
        and(
          eq(linearTeamLinks.workspaceId, this.workspaceId),
          eq(linearTeamLinks.installationId, input.installationId),
          eq(linearTeamLinks.syncState, 'synced'),
          input.keepLinearTeamIds.length
            ? notInArray(linearTeamLinks.linearTeamId, input.keepLinearTeamIds)
            : sql`true`,
        ),
      );
  }

  /**
   * Requeue outbox rows paused while a team link was unlinked. Called when the
   * link returns to 'synced' so queued intents resume instead of staying
   * paused forever. The lease fence bump prevents a stale in-flight worker
   * from writing results into the revived row.
   */
  async requeueTeamLinkOutbox(linearTeamId: string) {
    await this.db.execute(sql`
      UPDATE linear_sync_outbox AS outbox
      SET status = 'pending', available_at = now(), locked_until = NULL,
          lease_owner = NULL, lease_fence = lease_fence + 1, updated_at = now()
      WHERE outbox.workspace_id = ${this.workspaceId}
        AND outbox.status = 'paused'
        AND EXISTS (
          SELECT 1 FROM linear_issue_links AS link
          WHERE link.id = outbox.link_id
            AND link.workspace_id = ${this.workspaceId}
            AND link.linear_team_id = ${linearTeamId}
        )
      `);
  }

  async listIssueLinksOutsideTeamScope(input: {
    installationId: string;
    keepLinearTeamIds: string[];
  }) {
    return this.db
      .select()
      .from(linearIssueLinks)
      .where(
        and(
          eq(linearIssueLinks.workspaceId, this.workspaceId),
          eq(linearIssueLinks.installationId, input.installationId),
          isNotNull(linearIssueLinks.linearTeamId),
          ne(linearIssueLinks.syncState, 'removed'),
          input.keepLinearTeamIds.length
            ? notInArray(linearIssueLinks.linearTeamId, input.keepLinearTeamIds)
            : sql`true`,
        ),
      );
  }

  async transaction<T>(callback: (model: LinearSyncModel, db: OrviloDatabase) => Promise<T>) {
    return this.db.transaction((tx) =>
      callback(
        new LinearSyncModel(tx as unknown as OrviloDatabase, this.workspaceId),
        tx as unknown as OrviloDatabase,
      ),
    );
  }

  async recordImportReceipt(input: {
    bindingId: string;
    lastError?: string | null;
    linearIssueId: string;
    phase: 'initial' | 'reconciliation';
    status: 'failed' | 'processed';
  }) {
    const [row] = await this.db
      .insert(linearSyncImportReceipts)
      .values({
        bindingId: input.bindingId,
        lastError: input.lastError,
        linearIssueId: input.linearIssueId,
        phase: input.phase,
        processedAt: input.status === 'processed' ? new Date() : null,
        status: input.status,
        workspaceId: this.workspaceId,
      })
      .onConflictDoUpdate({
        target: [linearSyncImportReceipts.bindingId, linearSyncImportReceipts.linearIssueId],
        set: {
          lastError: input.lastError,
          phase: input.phase,
          processedAt: input.status === 'processed' ? new Date() : null,
          status: input.status,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async findIssueLinkByExternalId(linearIssueId: string) {
    const [row] = await this.db
      .select()
      .from(linearIssueLinks)
      .where(
        and(
          eq(linearIssueLinks.workspaceId, this.workspaceId),
          eq(linearIssueLinks.linearIssueId, linearIssueId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findIssueLinkById(id: string) {
    const [row] = await this.db
      .select()
      .from(linearIssueLinks)
      .where(and(eq(linearIssueLinks.workspaceId, this.workspaceId), eq(linearIssueLinks.id, id)))
      .limit(1);
    return row ?? null;
  }

  async findIssueLinkByTaskId(taskId: string) {
    const [row] = await this.db
      .select()
      .from(linearIssueLinks)
      .where(
        and(
          eq(linearIssueLinks.workspaceId, this.workspaceId),
          eq(linearIssueLinks.taskId, taskId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findTaskForIssueLink(issueLinkId: string) {
    const [row] = await this.db
      .select({ id: tasks.id, projectId: tasks.projectId })
      .from(tasks)
      .innerJoin(linearIssueLinks, eq(linearIssueLinks.taskId, tasks.id))
      .where(
        and(
          eq(linearIssueLinks.id, issueLinkId),
          eq(linearIssueLinks.workspaceId, this.workspaceId),
          eq(tasks.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listIssueLinks(
    input: {
      bindingId?: string;
      limit?: number;
      offset?: number;
      taskIds?: readonly string[];
    } = {},
  ) {
    const { bindingId, limit = LINEAR_ISSUE_LINK_LIST_DEFAULT_LIMIT, offset = 0, taskIds } = input;
    if (taskIds && (taskIds.length === 0 || taskIds.length > LINEAR_ISSUE_LINK_TASK_ID_CAP)) {
      throw new RangeError(
        `Linear issue link taskIds must contain 1-${LINEAR_ISSUE_LINK_TASK_ID_CAP} items`,
      );
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > LINEAR_ISSUE_LINK_TASK_ID_CAP) {
      throw new RangeError(
        `Linear issue link limit must be between 1 and ${LINEAR_ISSUE_LINK_TASK_ID_CAP}`,
      );
    }
    if (!Number.isInteger(offset) || offset < 0) {
      throw new RangeError('Linear issue link offset must be a non-negative integer');
    }
    return this.db
      .select()
      .from(linearIssueLinks)
      .where(
        and(
          eq(linearIssueLinks.workspaceId, this.workspaceId),
          bindingId ? eq(linearIssueLinks.bindingId, bindingId) : undefined,
          taskIds ? inArray(linearIssueLinks.taskId, taskIds) : undefined,
        ),
      )
      .orderBy(desc(linearIssueLinks.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  async listIssueConflicts(bindingId?: string, limit = 50) {
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return this.db
      .select()
      .from(linearIssueLinks)
      .where(
        and(
          eq(linearIssueLinks.workspaceId, this.workspaceId),
          eq(linearIssueLinks.syncState, 'conflict'),
          isNotNull(linearIssueLinks.conflict),
          bindingId ? eq(linearIssueLinks.bindingId, bindingId) : undefined,
        ),
      )
      .orderBy(desc(linearIssueLinks.updatedAt))
      .limit(boundedLimit);
  }

  /** Lock every local row whose versions fence a manual conflict resolution. */
  async lockIssueConflictContext(issueLinkId: string) {
    const [row] = await this.db
      .select({
        binding: linearProjectBindings,
        installation: linearInstallations,
        issueLink: linearIssueLinks,
        task: tasks,
      })
      .from(linearIssueLinks)
      .innerJoin(tasks, eq(tasks.id, linearIssueLinks.taskId))
      .innerJoin(linearInstallations, eq(linearInstallations.id, linearIssueLinks.installationId))
      .innerJoin(linearProjectBindings, eq(linearProjectBindings.id, linearIssueLinks.bindingId))
      .where(
        and(
          eq(linearIssueLinks.id, issueLinkId),
          eq(linearIssueLinks.workspaceId, this.workspaceId),
          eq(tasks.workspaceId, this.workspaceId),
          eq(linearInstallations.workspaceId, this.workspaceId),
        ),
      )
      .for('update')
      .limit(1);
    return row ?? null;
  }

  async createIssueLink(input: {
    aliasIdentifiers?: string[];
    bindingId?: string | null;
    installationId: string;
    linearIdentifier: string;
    linearIssueId: string;
    linearTeamId?: string | null;
    organizationId: string;
    remoteSnapshot?: LinearIssueSnapshot;
    taskId: string;
  }) {
    const snapshot = input.remoteSnapshot ?? {
      id: input.linearIssueId,
      identifier: input.linearIdentifier,
      title: input.linearIdentifier,
    };
    const [row] = await this.db
      .insert(linearIssueLinks)
      .values({
        aliasIdentifiers: input.aliasIdentifiers ?? [],
        bindingId: input.bindingId,
        installationId: input.installationId,
        lastConfirmedSnapshot: snapshot,
        linearIdentifier: input.linearIdentifier,
        linearIssueId: input.linearIssueId,
        linearTeamId: input.linearTeamId ?? null,
        organizationId: input.organizationId,
        remoteSnapshot: input.remoteSnapshot,
        remoteUpdatedAt: input.remoteSnapshot?.updatedAt
          ? new Date(input.remoteSnapshot.updatedAt)
          : undefined,
        taskId: input.taskId,
        workspaceId: this.workspaceId,
      })
      .onConflictDoNothing()
      .returning();
    if (row) return row;

    const [existing] = await this.db
      .select()
      .from(linearIssueLinks)
      .where(
        and(
          eq(linearIssueLinks.workspaceId, this.workspaceId),
          or(
            eq(linearIssueLinks.taskId, input.taskId),
            eq(linearIssueLinks.linearIssueId, input.linearIssueId),
          ),
        ),
      )
      .limit(1);
    if (!existing) throw new Error('Failed to create Linear issue link');
    return existing;
  }

  async findExternalCommentByRemoteId(linearCommentId: string) {
    const [row] = await this.db
      .select()
      .from(linearExternalComments)
      .where(
        and(
          eq(linearExternalComments.workspaceId, this.workspaceId),
          eq(linearExternalComments.linearCommentId, linearCommentId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findExternalCommentById(id: string) {
    const [row] = await this.db
      .select()
      .from(linearExternalComments)
      .where(
        and(
          eq(linearExternalComments.workspaceId, this.workspaceId),
          eq(linearExternalComments.id, id),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findExternalCommentByLocalId(localCommentId: string) {
    const [row] = await this.db
      .select()
      .from(linearExternalComments)
      .where(
        and(
          eq(linearExternalComments.workspaceId, this.workspaceId),
          eq(linearExternalComments.localCommentId, localCommentId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listExternalComments(issueLinkId?: string) {
    return this.db
      .select()
      .from(linearExternalComments)
      .where(
        and(
          eq(linearExternalComments.workspaceId, this.workspaceId),
          issueLinkId ? eq(linearExternalComments.issueLinkId, issueLinkId) : undefined,
        ),
      )
      .orderBy(linearExternalComments.createdAt);
  }

  async upsertExternalComment(input: {
    id?: string;
    confirmationState: LinearExternalConfirmationState;
    issueLinkId: string;
    lastConfirmedSnapshot?: LinearCommentSnapshot | null;
    linearCommentId?: string | null;
    linearIssueId: string;
    localCommentId?: string | null;
    origin: LinearExternalSyncOrigin;
    remoteSnapshot?: LinearCommentSnapshot | null;
    source: LinearExternalSyncSource;
    tombstone?: LinearSyncTombstone | null;
    lastInboundDeliveryId?: string | null;
  }) {
    const existing =
      (input.id && (await this.findExternalCommentById(input.id))) ||
      (input.linearCommentId &&
        (await this.findExternalCommentByRemoteId(input.linearCommentId))) ||
      (input.localCommentId && (await this.findExternalCommentByLocalId(input.localCommentId)));
    const values = {
      confirmationState: input.confirmationState,
      issueLinkId: input.issueLinkId,
      lastConfirmedSnapshot: input.lastConfirmedSnapshot ?? null,
      ...(input.lastInboundDeliveryId !== undefined
        ? { lastInboundDeliveryId: input.lastInboundDeliveryId }
        : {}),
      linearCommentId: input.linearCommentId ?? null,
      linearIssueId: input.linearIssueId,
      localCommentId: input.localCommentId ?? null,
      origin: input.origin,
      remoteSnapshot: input.remoteSnapshot ?? null,
      source: input.source,
      tombstone: input.tombstone ?? null,
      updatedAt: new Date(),
      workspaceId: this.workspaceId,
    };
    if (existing) {
      const [row] = await this.db
        .update(linearExternalComments)
        .set(values)
        .where(
          and(
            eq(linearExternalComments.id, existing.id),
            eq(linearExternalComments.workspaceId, this.workspaceId),
          ),
        )
        .returning();
      return row ?? existing;
    }
    const [row] = await this.db.insert(linearExternalComments).values(values).returning();
    return row;
  }

  async markExternalCommentOutboundOperation(mappingId: string, operationId: string) {
    const [row] = await this.db
      .update(linearExternalComments)
      .set({ lastOutboundOperationId: operationId, updatedAt: new Date() })
      .where(
        and(
          eq(linearExternalComments.id, mappingId),
          eq(linearExternalComments.workspaceId, this.workspaceId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async findExternalRelationByRemoteId(linearRelationId: string) {
    const [row] = await this.db
      .select()
      .from(linearExternalRelations)
      .where(
        and(
          eq(linearExternalRelations.workspaceId, this.workspaceId),
          eq(linearExternalRelations.linearRelationId, linearRelationId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findExternalRelationById(id: string) {
    const [row] = await this.db
      .select()
      .from(linearExternalRelations)
      .where(
        and(
          eq(linearExternalRelations.workspaceId, this.workspaceId),
          eq(linearExternalRelations.id, id),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findExternalRelationByLocalKey(localRelationKey: string) {
    const [row] = await this.db
      .select()
      .from(linearExternalRelations)
      .where(
        and(
          eq(linearExternalRelations.workspaceId, this.workspaceId),
          eq(linearExternalRelations.localRelationKey, localRelationKey),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listExternalRelationsForIssue(linearIssueId: string) {
    return this.db
      .select()
      .from(linearExternalRelations)
      .where(
        and(
          eq(linearExternalRelations.workspaceId, this.workspaceId),
          or(
            eq(linearExternalRelations.sourceIssueId, linearIssueId),
            eq(linearExternalRelations.targetIssueId, linearIssueId),
          ),
        ),
      )
      .orderBy(linearExternalRelations.createdAt);
  }

  async upsertExternalRelation(input: {
    confirmationState: LinearExternalConfirmationState;
    issueLinkId?: string | null;
    kind: LinearRelationKind;
    lastConfirmedSnapshot?: LinearRelationSnapshot | null;
    linearRelationId?: string | null;
    localRelationKey: string;
    localSourceTaskId?: string | null;
    localTargetTaskId?: string | null;
    origin: LinearExternalSyncOrigin;
    remoteSnapshot?: LinearRelationSnapshot | null;
    resolutionState: 'resolved' | 'unresolved';
    source: LinearExternalSyncSource;
    sourceIssueId?: string | null;
    targetIssueId?: string | null;
    tombstone?: LinearSyncTombstone | null;
  }) {
    const existing =
      (input.linearRelationId &&
        (await this.findExternalRelationByRemoteId(input.linearRelationId))) ||
      (await this.findExternalRelationByLocalKey(input.localRelationKey));
    const values = {
      confirmationState: input.confirmationState,
      issueLinkId: input.issueLinkId ?? null,
      kind: input.kind,
      lastConfirmedSnapshot: input.lastConfirmedSnapshot ?? null,
      linearRelationId: input.linearRelationId ?? null,
      localRelationKey: input.localRelationKey,
      localSourceTaskId: input.localSourceTaskId ?? null,
      localTargetTaskId: input.localTargetTaskId ?? null,
      origin: input.origin,
      remoteSnapshot: input.remoteSnapshot ?? null,
      resolutionState: input.resolutionState,
      source: input.source,
      sourceIssueId: input.sourceIssueId ?? null,
      targetIssueId: input.targetIssueId ?? null,
      tombstone: input.tombstone ?? null,
      updatedAt: new Date(),
      workspaceId: this.workspaceId,
    };
    if (existing) {
      const [row] = await this.db
        .update(linearExternalRelations)
        .set(values)
        .where(
          and(
            eq(linearExternalRelations.id, existing.id),
            eq(linearExternalRelations.workspaceId, this.workspaceId),
          ),
        )
        .returning();
      return row ?? existing;
    }
    const [row] = await this.db.insert(linearExternalRelations).values(values).returning();
    return row;
  }

  async markExternalRelationOutboundOperation(mappingId: string, operationId: string) {
    const [row] = await this.db
      .update(linearExternalRelations)
      .set({ lastOutboundOperationId: operationId, updatedAt: new Date() })
      .where(
        and(
          eq(linearExternalRelations.id, mappingId),
          eq(linearExternalRelations.workspaceId, this.workspaceId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async recordIssueTombstone(input: {
    deliveryId?: string | null;
    idempotencyKey: string;
    issueLinkId: string;
    linearIssueId: string;
    kind: LinearTombstoneKind;
    origin: LinearExternalSyncOrigin;
    reason?: string;
    snapshot?: LinearIssueSnapshot;
  }) {
    const at = new Date();
    const tombstone = {
      at: at.toISOString(),
      kind: input.kind,
      ...(input.reason ? { reason: input.reason } : {}),
      source: 'linear' as const,
      ...(input.snapshot ? { snapshot: input.snapshot } : {}),
    };
    await this.db
      .insert(linearIssueTombstones)
      .values({
        deliveryId: input.deliveryId,
        idempotencyKey: input.idempotencyKey,
        issueLinkId: input.issueLinkId,
        kind: input.kind,
        linearIssueId: input.linearIssueId,
        observedAt: at,
        origin: input.origin,
        reason: input.reason,
        snapshot: input.snapshot,
        source: 'linear',
        workspaceId: this.workspaceId,
      })
      .onConflictDoNothing({
        target: [linearIssueTombstones.workspaceId, linearIssueTombstones.idempotencyKey],
      });
    return this.updateIssueLink(input.issueLinkId, {
      lastInboundDeliveryId: input.deliveryId,
      remoteSnapshot: input.snapshot,
      syncState: 'removed',
      tombstone,
    });
  }

  async listIssueTombstones(issueLinkId: string) {
    return this.db
      .select()
      .from(linearIssueTombstones)
      .where(
        and(
          eq(linearIssueTombstones.workspaceId, this.workspaceId),
          eq(linearIssueTombstones.issueLinkId, issueLinkId),
        ),
      )
      .orderBy(linearIssueTombstones.observedAt);
  }

  async clearIssueTombstone(id: string) {
    return this.updateIssueLink(id, { syncState: 'synced', tombstone: null });
  }

  async captureDelivery(input: CaptureLinearDeliveryInput) {
    const [row] = await this.db
      .insert(linearSyncInbox)
      .values({
        action: input.action,
        deliveryId: input.deliveryId,
        eventType: input.eventType,
        installationId: input.installationId,
        organizationId: input.organizationId,
        payload: input.payload,
        subjectId: input.subjectId,
        webhookId: input.webhookId,
        workspaceId: this.workspaceId,
      })
      .onConflictDoNothing({
        target: [linearSyncInbox.installationId, linearSyncInbox.deliveryId],
      })
      .returning();

    if (row) return { inserted: true, row };

    const [existing] = await this.db
      .select()
      .from(linearSyncInbox)
      .where(
        and(
          eq(linearSyncInbox.installationId, input.installationId),
          eq(linearSyncInbox.deliveryId, input.deliveryId),
        ),
      )
      .limit(1);
    return { inserted: false, row: existing ?? null };
  }

  /** Claim inbox rows with a lease so a crashed worker can be replaced safely. */
  async claimInbox(
    limit = 20,
    leaseMs = LINEAR_SYNC_DEFAULT_LEASE_MS,
    installationId?: string,
    leaseOwner = randomUUID(),
  ): Promise<LinearSyncInboxItem[]> {
    const lockedUntil = new Date(Date.now() + leaseMs);
    const installationFilter = installationId
      ? sql`AND installation_id = ${installationId}`
      : sql``;
    return this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT id
          FROM linear_sync_inbox
          WHERE workspace_id = ${this.workspaceId}
            AND status IN ('received', 'pending_binding', 'failed', 'processing')
            AND available_at <= now()
            AND (locked_until IS NULL OR locked_until < now())
            AND NOT EXISTS (
              SELECT 1
              FROM linear_project_bindings AS binding
              WHERE binding.workspace_id = linear_sync_inbox.workspace_id
                AND binding.installation_id = linear_sync_inbox.installation_id
                AND COALESCE((binding.settings ->> 'readEnabled')::boolean, binding.sync_enabled) = false
                AND (
                  EXISTS (
                    SELECT 1 FROM linear_issue_links AS link
                    WHERE link.workspace_id = linear_sync_inbox.workspace_id
                      AND link.linear_issue_id = linear_sync_inbox.subject_id
                      AND link.binding_id = binding.id
                  )
                  OR linear_sync_inbox.payload -> 'data' -> 'project' ->> 'id' = binding.linear_project_id
                )
            )
            ${installationFilter}
          ORDER BY created_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE linear_sync_inbox AS inbox
        SET locked_until = ${lockedUntil},
            lease_owner = ${leaseOwner},
            lease_fence = inbox.lease_fence + 1,
            attempts = inbox.attempts + 1,
            status = 'processing',
            updated_at = now()
        FROM candidates
        WHERE inbox.id = candidates.id
        RETURNING inbox.id
      `);
      const ids = result.rows.map((row) => String((row as { id: string }).id));
      if (ids.length === 0) return [];
      return tx
        .select()
        .from(linearSyncInbox)
        .where(
          and(eq(linearSyncInbox.workspaceId, this.workspaceId), inArray(linearSyncInbox.id, ids)),
        )
        .orderBy(linearSyncInbox.createdAt);
    });
  }

  async updateInbox(
    id: string,
    patch: {
      attempts?: number;
      availableAt?: Date;
      lastError?: string | null;
      lockedUntil?: Date | null;
      processedAt?: Date | null;
      status?: LinearSyncInboxStatus;
    },
    lease?: LinearSyncLease,
  ) {
    const values = {
      ...patch,
      ...(lease ? { leaseOwner: null } : {}),
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .update(linearSyncInbox)
      .set(values)
      .where(
        and(
          eq(linearSyncInbox.id, id),
          eq(linearSyncInbox.workspaceId, this.workspaceId),
          lease ? eq(linearSyncInbox.leaseOwner, lease.owner) : undefined,
          lease ? eq(linearSyncInbox.leaseFence, lease.fence) : undefined,
        ),
      )
      .returning();
    return row ?? null;
  }

  async findCreateIntentByTaskId(taskId: string) {
    const [row] = await this.db
      .select()
      .from(linearSyncOutbox)
      .where(
        and(
          eq(linearSyncOutbox.workspaceId, this.workspaceId),
          eq(linearSyncOutbox.taskId, taskId),
          eq(linearSyncOutbox.operation, `linear-issue:create:${taskId}`),
          sql`${linearSyncOutbox.status} <> 'cancelled'`,
        ),
      )
      .orderBy(desc(linearSyncOutbox.createdAt))
      .limit(1);
    return row ?? null;
  }

  async findCreateIntentByRemoteIssueId(remoteIssueId: string) {
    const [row] = await this.db
      .select()
      .from(linearSyncOutbox)
      .where(
        and(
          eq(linearSyncOutbox.workspaceId, this.workspaceId),
          sql`${linearSyncOutbox.operation} like 'linear-issue:create:%'`,
          sql`${linearSyncOutbox.payload}->>'remoteIssueId' = ${remoteIssueId}`,
          sql`${linearSyncOutbox.status} <> 'cancelled'`,
        ),
      )
      .orderBy(desc(linearSyncOutbox.createdAt))
      .limit(1);
    return row ?? null;
  }

  async cancelOutbox(id: string, reason: string) {
    const [row] = await this.db
      .update(linearSyncOutbox)
      .set({
        availableAt: new Date(),
        lastError: reason.slice(0, 2_000),
        lockedUntil: null,
        leaseOwner: null,
        outcomeUnknownAt: null,
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(and(eq(linearSyncOutbox.id, id), eq(linearSyncOutbox.workspaceId, this.workspaceId)))
      .returning();
    return row ?? null;
  }

  /**
   * Replace the failed update that produced a conflict with the exact patch
   * chosen by the user. A provider mutation already in flight is a hard fence:
   * its outcome must be reconciled before a manual resolution can continue.
   */
  async replaceIssueConflictOutbox(input: {
    expectedLocalRevision: number;
    initialStatus: 'paused' | 'pending';
    installationId: string;
    linkId: string;
    payload: Record<string, unknown> | null;
    reason: string;
    taskId: string;
  }) {
    const activeRows = await this.db
      .select({ id: linearSyncOutbox.id, status: linearSyncOutbox.status })
      .from(linearSyncOutbox)
      .where(
        and(
          eq(linearSyncOutbox.workspaceId, this.workspaceId),
          eq(linearSyncOutbox.linkId, input.linkId),
          eq(linearSyncOutbox.operation, 'update_issue'),
          inArray(linearSyncOutbox.status, [
            'dead_letter',
            'failed',
            'outcome_unknown',
            'paused',
            'pending',
            'sending',
          ]),
        ),
      )
      .for('update');

    if (activeRows.some((row) => row.status === 'sending' || row.status === 'outcome_unknown')) {
      throw new Error('Linear conflict has an in-flight or unknown write outcome');
    }

    const cancellableIds = activeRows.map((row) => row.id);
    if (cancellableIds.length > 0) {
      await this.db
        .update(linearSyncOutbox)
        .set({
          availableAt: new Date(),
          lastError: input.reason.slice(0, 2_000),
          lockedUntil: null,
          leaseOwner: null,
          outcomeUnknownAt: null,
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(linearSyncOutbox.workspaceId, this.workspaceId),
            inArray(linearSyncOutbox.id, cancellableIds),
          ),
        );
    }

    if (!input.payload || Object.keys(input.payload).length === 0) return null;
    const [outbox] = await this.db
      .insert(linearSyncOutbox)
      .values({
        expectedLocalRevision: input.expectedLocalRevision,
        installationId: input.installationId,
        linkId: input.linkId,
        operation: 'update_issue',
        payload: input.payload,
        status: input.initialStatus,
        taskId: input.taskId,
        workspaceId: this.workspaceId,
      })
      .returning();
    if (!outbox) throw new Error('Failed to persist resolved Linear outbox intent');
    return outbox;
  }

  async queueOutbox(input: QueueLinearSyncInput) {
    const installation = await this.findInstallationById(input.installationId);
    if (!installation)
      throw new LinearInstallationUnavailableError('Linear installation not found');
    if (installation.status !== 'active') {
      throw new LinearInstallationUnavailableError(
        `Linear installation is ${installation.status} and cannot accept new sync work`,
      );
    }

    if (input.linkId || input.taskId) {
      const [existing] = await this.db
        .select()
        .from(linearSyncOutbox)
        .where(
          and(
            eq(linearSyncOutbox.workspaceId, this.workspaceId),
            input.linkId
              ? eq(linearSyncOutbox.linkId, input.linkId)
              : eq(linearSyncOutbox.taskId, input.taskId!),
            eq(linearSyncOutbox.operation, input.operation),
            inArray(linearSyncOutbox.status, ['cancelled', 'failed', 'paused', 'pending']),
          ),
        )
        .orderBy(desc(linearSyncOutbox.createdAt))
        .limit(1);

      if (existing) {
        const [row] = await this.db
          .update(linearSyncOutbox)
          .set({
            availableAt: new Date(),
            expectedLocalRevision: input.expectedLocalRevision,
            installationId: input.installationId,
            lastError: null,
            lockedUntil: null,
            leaseOwner: null,
            outcomeUnknownAt: null,
            payload: {
              ...(existing.payload as Record<string, unknown>),
              ...input.payload,
            },
            status: input.initialStatus ?? 'pending',
            updatedAt: new Date(),
          })
          .where(eq(linearSyncOutbox.id, existing.id))
          .returning();
        return row;
      }
    }

    const [row] = await this.db
      .insert(linearSyncOutbox)
      .values({
        expectedLocalRevision: input.expectedLocalRevision,
        installationId: input.installationId,
        linkId: input.linkId,
        operation: input.operation,
        payload: input.payload,
        status: input.initialStatus ?? 'pending',
        taskId: input.taskId,
        workspaceId: this.workspaceId,
      })
      .onConflictDoNothing()
      .returning();
    if (row) return row;

    const [existing] = await this.db
      .select()
      .from(linearSyncOutbox)
      .where(
        and(
          eq(linearSyncOutbox.workspaceId, this.workspaceId),
          eq(linearSyncOutbox.operation, input.operation),
        ),
      )
      .orderBy(desc(linearSyncOutbox.createdAt))
      .limit(1);
    if (!existing) throw new Error('Failed to persist Linear outbox intent');
    return existing;
  }

  async listOutbox(status?: LinearSyncOutboxStatus) {
    return this.db
      .select()
      .from(linearSyncOutbox)
      .where(
        and(
          eq(linearSyncOutbox.workspaceId, this.workspaceId),
          status ? eq(linearSyncOutbox.status, status) : undefined,
        ),
      )
      .orderBy(linearSyncOutbox.createdAt);
  }

  /** Return only safe operational metadata; queue payloads never leave the server. */
  async listRecoveryRows(limit = 50): Promise<LinearSyncRecoveryRow[]> {
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const [inboxRows, outboxRows, planningRows] = await Promise.all([
      this.db
        .select({
          availableAt: linearSyncInbox.availableAt,
          attempts: linearSyncInbox.attempts,
          createdAt: linearSyncInbox.createdAt,
          id: linearSyncInbox.id,
          installationId: linearSyncInbox.installationId,
          lastError: linearSyncInbox.lastError,
          status: linearSyncInbox.status,
          updatedAt: linearSyncInbox.updatedAt,
        })
        .from(linearSyncInbox)
        .where(
          and(
            eq(linearSyncInbox.workspaceId, this.workspaceId),
            inArray(linearSyncInbox.status, ['failed', 'dead_letter']),
          ),
        )
        .orderBy(desc(linearSyncInbox.updatedAt))
        .limit(boundedLimit),
      this.db
        .select({
          availableAt: linearSyncOutbox.availableAt,
          attempts: linearSyncOutbox.attempts,
          createdAt: linearSyncOutbox.createdAt,
          id: linearSyncOutbox.id,
          installationId: linearSyncOutbox.installationId,
          lastError: linearSyncOutbox.lastError,
          status: linearSyncOutbox.status,
          updatedAt: linearSyncOutbox.updatedAt,
        })
        .from(linearSyncOutbox)
        .where(
          and(
            eq(linearSyncOutbox.workspaceId, this.workspaceId),
            inArray(linearSyncOutbox.status, ['failed', 'dead_letter', 'outcome_unknown']),
          ),
        )
        .orderBy(desc(linearSyncOutbox.updatedAt))
        .limit(boundedLimit),
      this.db
        .select({
          attempts: sql<number>`0`,
          createdAt: taskPlanningScopes.createdAt,
          id: taskPlanningScopes.id,
          lastError: taskPlanningScopes.lastError,
          scopeId: taskPlanningScopes.id,
          status: taskPlanningScopes.status,
          updatedAt: taskPlanningScopes.updatedAt,
        })
        .from(taskPlanningScopes)
        .where(
          and(
            eq(taskPlanningScopes.workspaceId, this.workspaceId),
            eq(taskPlanningScopes.status, 'failed'),
          ),
        )
        .orderBy(desc(taskPlanningScopes.updatedAt))
        .limit(boundedLimit),
    ]);

    return [
      ...inboxRows.map((row) => ({
        ...row,
        kind: 'inbox' as const,
        lastError: sanitizeLinearSyncError(row.lastError),
        scopeId: null,
      })),
      ...outboxRows.map((row) => ({
        ...row,
        kind: 'outbox' as const,
        lastError: sanitizeLinearSyncError(row.lastError),
        scopeId: null,
      })),
      ...planningRows.map((row) => ({
        availableAt: null,
        ...row,
        installationId: null,
        kind: 'planning' as const,
        lastError: sanitizeLinearSyncError(row.lastError),
      })),
    ]
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, boundedLimit);
  }

  async retryInbox(id: string, expectedUpdatedAt: Date) {
    const now = new Date();
    const [row] = await this.db
      .update(linearSyncInbox)
      .set({
        availableAt: now,
        attempts: 0,
        lastError: null,
        leaseFence: sql`${linearSyncInbox.leaseFence} + 1`,
        leaseOwner: null,
        lockedUntil: null,
        status: 'received',
        updatedAt: now,
      })
      .where(
        and(
          eq(linearSyncInbox.id, id),
          eq(linearSyncInbox.workspaceId, this.workspaceId),
          inArray(linearSyncInbox.status, ['failed', 'dead_letter']),
          sameObservedUpdatedAt(linearSyncInbox.updatedAt, expectedUpdatedAt),
          or(isNull(linearSyncInbox.lockedUntil), lt(linearSyncInbox.lockedUntil, now)),
        ),
      )
      .returning({ id: linearSyncInbox.id, installationId: linearSyncInbox.installationId });
    return row ?? null;
  }

  async retryOutbox(id: string, expectedUpdatedAt: Date) {
    const now = new Date();
    const [row] = await this.db
      .update(linearSyncOutbox)
      .set({
        availableAt: now,
        attempts: 0,
        lastError: null,
        leaseFence: sql`${linearSyncOutbox.leaseFence} + 1`,
        leaseOwner: null,
        lockedUntil: null,
        outcomeUnknownAt: null,
        sentAt: null,
        status: 'pending',
        updatedAt: now,
      })
      .where(
        and(
          eq(linearSyncOutbox.id, id),
          eq(linearSyncOutbox.workspaceId, this.workspaceId),
          inArray(linearSyncOutbox.status, ['failed', 'dead_letter', 'outcome_unknown']),
          sameObservedUpdatedAt(linearSyncOutbox.updatedAt, expectedUpdatedAt),
          or(isNull(linearSyncOutbox.lockedUntil), lt(linearSyncOutbox.lockedUntil, now)),
          sql`NOT EXISTS (
            SELECT 1
            FROM linear_sync_outbox AS earlier
            WHERE earlier.workspace_id = ${this.workspaceId}
              AND (
                (
                  linear_sync_outbox.link_id IS NOT NULL
                  AND earlier.link_id = linear_sync_outbox.link_id
                )
                OR (
                  linear_sync_outbox.link_id IS NULL
                  AND linear_sync_outbox.task_id IS NOT NULL
                  AND earlier.link_id IS NULL
                  AND earlier.task_id = linear_sync_outbox.task_id
                )
              )
              AND (
                earlier.created_at < linear_sync_outbox.created_at
                OR (
                  earlier.created_at = linear_sync_outbox.created_at
                  AND earlier.id < linear_sync_outbox.id
                )
              )
              AND earlier.status IN ('pending', 'sending', 'failed', 'dead_letter', 'outcome_unknown')
          )`,
        ),
      )
      .returning({ id: linearSyncOutbox.id, installationId: linearSyncOutbox.installationId });
    return row ?? null;
  }

  async retryPlanningScope(id: string, expectedUpdatedAt: Date) {
    const now = new Date();
    const [row] = await this.db
      .update(taskPlanningScopes)
      .set({ lastError: null, lockedUntil: null, status: 'queued', updatedAt: now })
      .where(
        and(
          eq(taskPlanningScopes.id, id),
          eq(taskPlanningScopes.workspaceId, this.workspaceId),
          eq(taskPlanningScopes.status, 'failed'),
          gt(taskPlanningScopes.dirtyRevision, taskPlanningScopes.plannedRevision),
          sameObservedUpdatedAt(taskPlanningScopes.updatedAt, expectedUpdatedAt),
          or(isNull(taskPlanningScopes.lockedUntil), lt(taskPlanningScopes.lockedUntil, now)),
        ),
      )
      .returning({ id: taskPlanningScopes.id, installationId: sql<string | null>`null` });
    return row ?? null;
  }

  async retryRecoveryRow(input: {
    expectedUpdatedAt: Date;
    id: string;
    kind: LinearSyncRecoveryKind;
  }) {
    if (input.kind === 'inbox') return this.retryInbox(input.id, input.expectedUpdatedAt);
    if (input.kind === 'outbox') return this.retryOutbox(input.id, input.expectedUpdatedAt);
    return this.retryPlanningScope(input.id, input.expectedUpdatedAt);
  }

  async claimOutbox(
    limit = 20,
    leaseMs = LINEAR_SYNC_DEFAULT_LEASE_MS,
    installationId?: string,
    leaseOwner = randomUUID(),
  ): Promise<LinearSyncOutboxItem[]> {
    const lockedUntil = new Date(Date.now() + leaseMs);
    const installationFilter = installationId
      ? sql`AND candidate.installation_id = ${installationId}`
      : sql``;
    return this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT candidate.id
          FROM linear_sync_outbox AS candidate
          WHERE candidate.workspace_id = ${this.workspaceId}
            AND candidate.status IN ('failed', 'pending', 'sending', 'outcome_unknown')
            AND candidate.available_at <= now()
            AND (candidate.locked_until IS NULL OR candidate.locked_until < now())
            AND NOT EXISTS (
              SELECT 1
              FROM linear_issue_links AS link
              JOIN linear_project_bindings AS binding ON binding.id = link.binding_id
              WHERE link.id = candidate.link_id
                AND link.workspace_id = candidate.workspace_id
                AND COALESCE((binding.settings ->> 'writeEnabled')::boolean, binding.sync_enabled) = false
            )
            AND NOT EXISTS (
              SELECT 1
              FROM tasks AS task
              JOIN linear_project_bindings AS binding ON binding.project_id = task.project_id
              WHERE candidate.link_id IS NULL
                AND candidate.operation LIKE 'linear-issue:create:%'
                AND task.id = candidate.task_id
                AND task.workspace_id = candidate.workspace_id
                AND binding.workspace_id = candidate.workspace_id
                AND binding.installation_id = candidate.installation_id
                AND COALESCE((binding.settings ->> 'writeEnabled')::boolean, binding.sync_enabled) = false
            )
            ${installationFilter}
            AND NOT EXISTS (
              SELECT 1
              FROM linear_sync_outbox AS earlier
              WHERE earlier.workspace_id = candidate.workspace_id
                AND (
                  (candidate.link_id IS NOT NULL AND earlier.link_id = candidate.link_id)
                  OR (
                    candidate.link_id IS NULL
                    AND earlier.link_id IS NULL
                    AND candidate.task_id IS NOT NULL
                    AND earlier.task_id = candidate.task_id
                  )
                )
                AND earlier.status IN (
                  'dead_letter',
                  'failed',
                  'paused',
                  'pending',
                  'sending',
                  'outcome_unknown'
                )
                AND (
                  earlier.expected_local_revision < candidate.expected_local_revision
                  OR (
                    earlier.expected_local_revision = candidate.expected_local_revision
                    AND (
                      earlier.created_at < candidate.created_at
                      OR (
                        earlier.created_at = candidate.created_at
                        AND earlier.id < candidate.id
                      )
                    )
                  )
              )
            )
          ORDER BY candidate.expected_local_revision, candidate.created_at, candidate.id
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE linear_sync_outbox AS outbox
        SET locked_until = ${lockedUntil},
            lease_owner = ${leaseOwner},
            lease_fence = outbox.lease_fence + 1,
            attempts = outbox.attempts + 1,
            status = 'sending',
            updated_at = now()
        FROM candidates
        WHERE outbox.id = candidates.id
        RETURNING outbox.id
      `);
      const ids = result.rows.map((row) => String((row as { id: string }).id));
      if (ids.length === 0) return [];
      return tx
        .select()
        .from(linearSyncOutbox)
        .where(
          and(
            eq(linearSyncOutbox.workspaceId, this.workspaceId),
            inArray(linearSyncOutbox.id, ids),
          ),
        )
        .orderBy(linearSyncOutbox.createdAt);
    });
  }

  async updateOutbox(
    id: string,
    patch: {
      availableAt?: Date;
      lastError?: string | null;
      lockedUntil?: Date | null;
      outcomeUnknownAt?: Date | null;
      sentAt?: Date | null;
      status?: LinearSyncOutboxStatus;
    },
    lease?: LinearSyncLease,
  ) {
    const values = {
      ...patch,
      ...(lease ? { leaseOwner: null } : {}),
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .update(linearSyncOutbox)
      .set(values)
      .where(
        and(
          eq(linearSyncOutbox.id, id),
          eq(linearSyncOutbox.workspaceId, this.workspaceId),
          lease ? eq(linearSyncOutbox.leaseOwner, lease.owner) : undefined,
          lease ? eq(linearSyncOutbox.leaseFence, lease.fence) : undefined,
        ),
      )
      .returning();
    return row ?? null;
  }

  /** Preserve uncertainty when a provider call raced a control rollback. */
  async markOutboxOutcomeUnknownAfterFence(
    id: string,
    previousFence: number,
    message = 'Linear write may have completed while outbound sync was disabled',
  ) {
    const [row] = await this.db
      .update(linearSyncOutbox)
      .set({
        lastError: message,
        outcomeUnknownAt: new Date(),
        status: 'outcome_unknown',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linearSyncOutbox.id, id),
          eq(linearSyncOutbox.workspaceId, this.workspaceId),
          inArray(linearSyncOutbox.status, ['paused', 'outcome_unknown']),
          gt(linearSyncOutbox.leaseFence, previousFence),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** Earliest time a crashed/retried inbox or outbox row can be claimed again. */
  async nextSyncWakeAt(installationId?: string): Promise<Date | null> {
    const installationFilter = installationId
      ? sql`AND installation_id = ${installationId}`
      : sql``;
    const result = await this.db.execute(sql`
      WITH wakeups AS (
        SELECT greatest(available_at, coalesce(locked_until, available_at)) AS wake_at
        FROM linear_sync_inbox
        WHERE workspace_id = ${this.workspaceId}
          AND status IN ('received', 'failed', 'processing')
          ${installationFilter}
        UNION ALL
        SELECT greatest(available_at, coalesce(locked_until, available_at)) AS wake_at
        FROM linear_sync_outbox
        WHERE workspace_id = ${this.workspaceId}
          AND status IN ('pending', 'failed', 'sending', 'outcome_unknown')
          ${installationFilter}
      )
      SELECT min(wake_at) AS next_wake_at FROM wakeups
    `);
    const nextWakeAt = (result.rows[0] as { next_wake_at?: Date | string | null } | undefined)
      ?.next_wake_at;
    return nextWakeAt ? new Date(nextWakeAt) : null;
  }

  async hasCurrentOutboxLease(id: string, lease: LinearSyncLease) {
    const [row] = await this.db
      .select({ id: linearSyncOutbox.id })
      .from(linearSyncOutbox)
      .where(
        and(
          eq(linearSyncOutbox.id, id),
          eq(linearSyncOutbox.workspaceId, this.workspaceId),
          eq(linearSyncOutbox.leaseOwner, lease.owner),
          eq(linearSyncOutbox.leaseFence, lease.fence),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /** Complete a provider write and its local receipt under the same lease fence. */
  async settleOutbox(
    id: string,
    lease: LinearSyncLease,
    input: { issueLinkId: string; remoteSnapshot: LinearIssueSnapshot },
  ) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [outbox] = await tx
        .update(linearSyncOutbox)
        .set({
          lastError: null,
          lockedUntil: null,
          leaseOwner: null,
          outcomeUnknownAt: null,
          sentAt: now,
          status: 'sent',
          updatedAt: now,
        })
        .where(
          and(
            eq(linearSyncOutbox.id, id),
            eq(linearSyncOutbox.workspaceId, this.workspaceId),
            eq(linearSyncOutbox.leaseOwner, lease.owner),
            eq(linearSyncOutbox.leaseFence, lease.fence),
          ),
        )
        .returning();

      if (!outbox) return null;

      const [newerIntent] = outbox.linkId
        ? await tx
            .select({ id: linearSyncOutbox.id })
            .from(linearSyncOutbox)
            .where(
              and(
                eq(linearSyncOutbox.workspaceId, this.workspaceId),
                eq(linearSyncOutbox.linkId, outbox.linkId),
                gt(linearSyncOutbox.expectedLocalRevision, outbox.expectedLocalRevision),
                inArray(linearSyncOutbox.status, [
                  'failed',
                  'outcome_unknown',
                  'pending',
                  'sending',
                ]),
              ),
            )
            .limit(1)
        : [];

      const [link] = await tx
        .update(linearIssueLinks)
        .set({
          ...(newerIntent ? {} : { conflict: null }),
          lastConfirmedSnapshot: input.remoteSnapshot,
          lastOutboundRevision: sql`greatest(${linearIssueLinks.lastOutboundRevision}, ${outbox.expectedLocalRevision})`,
          remoteSnapshot: input.remoteSnapshot,
          remoteUpdatedAt: input.remoteSnapshot.updatedAt
            ? new Date(input.remoteSnapshot.updatedAt)
            : undefined,
          syncState: newerIntent ? 'pending' : 'synced',
          updatedAt: now,
        })
        .where(
          and(
            eq(linearIssueLinks.id, input.issueLinkId),
            eq(linearIssueLinks.workspaceId, this.workspaceId),
          ),
        )
        .returning();

      if (!link) throw new Error('Linear issue link no longer exists');
      return { link, outbox };
    });
  }

  async settleExternalCommentOutbox(
    id: string,
    lease: LinearSyncLease,
    input: {
      linearCommentId?: string;
      mappingId: string;
      remoteSnapshot?: LinearCommentSnapshot;
      tombstone?: LinearSyncTombstone | null;
    },
  ) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [outbox] = await tx
        .update(linearSyncOutbox)
        .set({
          lastError: null,
          lockedUntil: null,
          leaseOwner: null,
          outcomeUnknownAt: null,
          sentAt: now,
          status: 'sent',
          updatedAt: now,
        })
        .where(
          and(
            eq(linearSyncOutbox.id, id),
            eq(linearSyncOutbox.workspaceId, this.workspaceId),
            eq(linearSyncOutbox.leaseOwner, lease.owner),
            eq(linearSyncOutbox.leaseFence, lease.fence),
          ),
        )
        .returning();
      if (!outbox) return null;

      const [currentMapping] = await tx
        .select()
        .from(linearExternalComments)
        .where(
          and(
            eq(linearExternalComments.id, input.mappingId),
            eq(linearExternalComments.workspaceId, this.workspaceId),
          ),
        )
        .limit(1);
      if (!currentMapping) throw new Error('Linear external comment mapping no longer exists');
      const remoteIdentityConflict = Boolean(
        currentMapping.linearCommentId &&
        input.linearCommentId &&
        currentMapping.linearCommentId !== input.linearCommentId,
      );
      const [mapping] = await tx
        .update(linearExternalComments)
        .set({
          ...(input.linearCommentId
            ? { linearCommentId: currentMapping.linearCommentId ?? input.linearCommentId }
            : {}),
          ...(input.remoteSnapshot
            ? {
                lastConfirmedSnapshot: input.remoteSnapshot,
                remoteSnapshot: input.remoteSnapshot,
              }
            : {}),
          confirmationState: input.tombstone
            ? 'tombstoned'
            : remoteIdentityConflict
              ? 'conflict'
              : 'confirmed',
          lastOutboundOperationId: outbox.id,
          tombstone: input.tombstone ?? null,
          updatedAt: now,
        })
        .where(
          and(
            eq(linearExternalComments.id, input.mappingId),
            eq(linearExternalComments.workspaceId, this.workspaceId),
          ),
        )
        .returning();
      if (!mapping) throw new Error('Linear external comment mapping no longer exists');
      return { mapping, outbox };
    });
  }

  async settleCreateIssueOutbox(
    id: string,
    lease: LinearSyncLease,
    input: {
      bindingId: string;
      installationId: string;
      linearIdentifier: string;
      linearIssueId: string;
      organizationId: string;
      remoteSnapshot: LinearIssueSnapshot;
      taskId: string;
    },
  ) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [outbox] = await tx
        .update(linearSyncOutbox)
        .set({
          lastError: null,
          lockedUntil: null,
          leaseOwner: null,
          outcomeUnknownAt: null,
          sentAt: now,
          status: 'sent',
          updatedAt: now,
        })
        .where(
          and(
            eq(linearSyncOutbox.id, id),
            eq(linearSyncOutbox.workspaceId, this.workspaceId),
            eq(linearSyncOutbox.leaseOwner, lease.owner),
            eq(linearSyncOutbox.leaseFence, lease.fence),
          ),
        )
        .returning();
      if (!outbox) return null;

      const [link] = await tx
        .insert(linearIssueLinks)
        .values({
          bindingId: input.bindingId,
          installationId: input.installationId,
          lastConfirmedSnapshot: input.remoteSnapshot,
          linearIdentifier: input.linearIdentifier,
          linearIssueId: input.linearIssueId,
          organizationId: input.organizationId,
          remoteSnapshot: input.remoteSnapshot,
          syncState: 'synced',
          taskId: input.taskId,
          workspaceId: this.workspaceId,
        })
        .onConflictDoNothing({
          target: [linearIssueLinks.workspaceId, linearIssueLinks.taskId],
        })
        .returning();
      const existing =
        link ??
        (
          await tx
            .select()
            .from(linearIssueLinks)
            .where(
              and(
                eq(linearIssueLinks.workspaceId, this.workspaceId),
                or(
                  eq(linearIssueLinks.taskId, input.taskId),
                  eq(linearIssueLinks.linearIssueId, input.linearIssueId),
                ),
              ),
            )
            .limit(1)
        )[0];
      if (!existing) throw new Error('Failed to settle Linear issue creation');
      if (
        existing.taskId !== input.taskId ||
        existing.linearIssueId !== input.linearIssueId ||
        existing.installationId !== input.installationId ||
        existing.organizationId !== input.organizationId ||
        existing.bindingId !== input.bindingId ||
        input.remoteSnapshot.id !== input.linearIssueId
      ) {
        throw new Error('Linear issue creation identity conflicts with an existing link');
      }
      return { link: existing, outbox };
    });
  }

  async settleExternalRelationOutbox(
    id: string,
    lease: LinearSyncLease,
    input: {
      linearRelationId?: string;
      mappingId: string;
      remoteSnapshot?: LinearRelationSnapshot;
      tombstone?: LinearSyncTombstone | null;
    },
  ) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [outbox] = await tx
        .update(linearSyncOutbox)
        .set({
          lastError: null,
          lockedUntil: null,
          leaseOwner: null,
          outcomeUnknownAt: null,
          sentAt: now,
          status: 'sent',
          updatedAt: now,
        })
        .where(
          and(
            eq(linearSyncOutbox.id, id),
            eq(linearSyncOutbox.workspaceId, this.workspaceId),
            eq(linearSyncOutbox.leaseOwner, lease.owner),
            eq(linearSyncOutbox.leaseFence, lease.fence),
          ),
        )
        .returning();
      if (!outbox) return null;

      const [currentMapping] = await tx
        .select()
        .from(linearExternalRelations)
        .where(
          and(
            eq(linearExternalRelations.id, input.mappingId),
            eq(linearExternalRelations.workspaceId, this.workspaceId),
          ),
        )
        .limit(1);
      if (!currentMapping) throw new Error('Linear external relation mapping no longer exists');
      const remoteIdentityConflict = Boolean(
        currentMapping.linearRelationId &&
        input.linearRelationId &&
        currentMapping.linearRelationId !== input.linearRelationId,
      );
      const [mapping] = await tx
        .update(linearExternalRelations)
        .set({
          ...(input.linearRelationId
            ? {
                linearRelationId: currentMapping.linearRelationId ?? input.linearRelationId,
              }
            : {}),
          ...(input.remoteSnapshot
            ? {
                lastConfirmedSnapshot: input.remoteSnapshot,
                remoteSnapshot: input.remoteSnapshot,
              }
            : {}),
          confirmationState: input.tombstone
            ? 'tombstoned'
            : remoteIdentityConflict
              ? 'conflict'
              : 'confirmed',
          lastOutboundOperationId: outbox.id,
          tombstone: input.tombstone ?? null,
          updatedAt: now,
        })
        .where(
          and(
            eq(linearExternalRelations.id, input.mappingId),
            eq(linearExternalRelations.workspaceId, this.workspaceId),
          ),
        )
        .returning();
      if (!mapping) throw new Error('Linear external relation mapping no longer exists');
      return { mapping, outbox };
    });
  }

  async findPlanningScope(scopeType: TaskPlanningScopeType, scopeId: string) {
    const [row] = await this.db
      .select()
      .from(taskPlanningScopes)
      .where(
        and(
          eq(taskPlanningScopes.workspaceId, this.workspaceId),
          eq(taskPlanningScopes.scopeType, scopeType),
          eq(taskPlanningScopes.scopeId, scopeId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findPlanningScopeById(id: string) {
    const [row] = await this.db
      .select()
      .from(taskPlanningScopes)
      .where(
        and(eq(taskPlanningScopes.id, id), eq(taskPlanningScopes.workspaceId, this.workspaceId)),
      )
      .limit(1);
    return row ?? null;
  }

  async lockPlanningScope(id: string) {
    const [row] = await this.db
      .select()
      .from(taskPlanningScopes)
      .where(
        and(eq(taskPlanningScopes.id, id), eq(taskPlanningScopes.workspaceId, this.workspaceId)),
      )
      .for('update')
      .limit(1);
    return row ?? null;
  }

  async listPlanningScopes() {
    return this.db
      .select()
      .from(taskPlanningScopes)
      .where(eq(taskPlanningScopes.workspaceId, this.workspaceId))
      .orderBy(desc(taskPlanningScopes.updatedAt));
  }

  async listPlanningRevisions(scopeId: string, limit = 20) {
    return this.db
      .select()
      .from(taskPlanningRevisions)
      .where(
        and(
          eq(taskPlanningRevisions.workspaceId, this.workspaceId),
          eq(taskPlanningRevisions.scopeId, scopeId),
        ),
      )
      .orderBy(desc(taskPlanningRevisions.createdAt))
      .limit(limit);
  }

  async findPlanningRevisionById(id: string) {
    const [row] = await this.db
      .select()
      .from(taskPlanningRevisions)
      .where(
        and(
          eq(taskPlanningRevisions.id, id),
          eq(taskPlanningRevisions.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findPlanningRevisionByInputRevision(inputRevision: number) {
    const [row] = await this.db
      .select()
      .from(taskPlanningRevisions)
      .where(
        and(
          eq(taskPlanningRevisions.workspaceId, this.workspaceId),
          eq(taskPlanningRevisions.inputRevision, inputRevision),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Claim queued scopes without holding a database connection during planning. */
  async claimPlanningScopes(limit = 10, leaseMs = 120_000): Promise<TaskPlanningScopeItem[]> {
    const lockedUntil = new Date(Date.now() + leaseMs);
    return this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT id
          FROM task_planning_scopes
          WHERE workspace_id = ${this.workspaceId}
            AND dirty_revision > planned_revision
            AND (
              status = 'queued'
              OR (status = 'running' AND (locked_until IS NULL OR locked_until < now()))
            )
          ORDER BY dirty_revision, updated_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE task_planning_scopes AS scopes
        SET locked_until = ${lockedUntil},
            status = 'running',
            last_error = NULL,
            updated_at = now()
        FROM candidates
        WHERE scopes.id = candidates.id
        RETURNING scopes.id
      `);
      const ids = result.rows.map((row) => String((row as { id: string }).id));
      if (ids.length === 0) return [];
      return tx
        .select()
        .from(taskPlanningScopes)
        .where(
          and(
            eq(taskPlanningScopes.workspaceId, this.workspaceId),
            inArray(taskPlanningScopes.id, ids),
          ),
        )
        .orderBy(taskPlanningScopes.dirtyRevision, taskPlanningScopes.updatedAt);
    });
  }

  async listDomainEventsForPlanning(
    scope: TaskPlanningScopeItem,
    fromRevision: number,
    toRevision: number,
  ): Promise<TaskDomainEventItem[]> {
    return this.db
      .select()
      .from(taskDomainEvents)
      .where(
        and(
          eq(taskDomainEvents.workspaceId, this.workspaceId),
          gt(taskDomainEvents.revision, fromRevision),
          lte(taskDomainEvents.revision, toRevision),
          // A project task's events stay in its project scope even when a team
          // is set — the team scope owns only projectless work.
          scope.scopeType === 'project'
            ? eq(taskDomainEvents.projectId, scope.scopeId)
            : scope.scopeType === 'team'
              ? and(eq(taskDomainEvents.teamId, scope.scopeId), isNull(taskDomainEvents.projectId))
              : undefined,
        ),
      )
      .orderBy(taskDomainEvents.revision);
  }

  async createPlanningRevision(input: {
    eventIds: string[];
    inputRevision: number;
    inputSnapshot: Record<string, unknown>;
    proposal?: TaskPlanningProposal;
    scopeId: string;
    status?: TaskPlanningRevisionStatus;
    trigger: TaskPlanningTrigger;
  }): Promise<TaskPlanningRevisionItem> {
    const [inserted] = await this.db
      .insert(taskPlanningRevisions)
      .values({
        eventIds: input.eventIds,
        inputRevision: input.inputRevision,
        inputSnapshot: input.inputSnapshot,
        proposal: input.proposal,
        scopeId: input.scopeId,
        status: input.status ?? 'running',
        trigger: input.trigger,
        workspaceId: this.workspaceId,
      })
      .onConflictDoNothing({
        target: [taskPlanningRevisions.scopeId, taskPlanningRevisions.inputRevision],
      })
      .returning();

    if (inserted) return inserted;
    const [existing] = await this.db
      .select()
      .from(taskPlanningRevisions)
      .where(
        and(
          eq(taskPlanningRevisions.workspaceId, this.workspaceId),
          eq(taskPlanningRevisions.scopeId, input.scopeId),
          eq(taskPlanningRevisions.inputRevision, input.inputRevision),
        ),
      )
      .limit(1);
    if (!existing) throw new Error('Failed to persist planning revision');
    return existing;
  }

  async updatePlanningRevision(
    id: string,
    patch: {
      appliedAt?: Date | null;
      error?: string | null;
      proposal?: TaskPlanningProposal;
      status?: TaskPlanningRevisionStatus;
    },
    lease?: { lockedUntil: Date; scopeId: string },
  ) {
    const [row] = await this.db
      .update(taskPlanningRevisions)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(taskPlanningRevisions.id, id),
          eq(taskPlanningRevisions.workspaceId, this.workspaceId),
          lease
            ? sql`exists (
                select 1
                from ${taskPlanningScopes}
                where ${taskPlanningScopes.id} = ${lease.scopeId}
                  and ${taskPlanningScopes.workspaceId} = ${this.workspaceId}
                  and ${taskPlanningScopes.status} = 'running'
                  and ${taskPlanningScopes.lockedUntil} = ${lease.lockedUntil}
              )`
            : undefined,
        ),
      )
      .returning();
    return row ?? null;
  }

  /** Advance a scope cursor only when no newer event arrived during planning. */
  async finishPlanningScope(
    scopeId: string,
    inputRevision: number,
    status: TaskPlanningScopeStatus,
    expectedLockedUntil?: Date,
  ) {
    const [row] = await this.db
      .update(taskPlanningScopes)
      .set({
        lastError: null,
        lastPlannedAt: new Date(),
        lockedUntil: null,
        plannedRevision: sql`greatest(${taskPlanningScopes.plannedRevision}, ${inputRevision})`,
        status: sql`case when ${taskPlanningScopes.dirtyRevision} > ${inputRevision} then 'queued' else ${status} end`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(taskPlanningScopes.id, scopeId),
          eq(taskPlanningScopes.workspaceId, this.workspaceId),
          expectedLockedUntil ? eq(taskPlanningScopes.status, 'running') : undefined,
          expectedLockedUntil ? eq(taskPlanningScopes.lockedUntil, expectedLockedUntil) : undefined,
        ),
      )
      .returning();
    return row ?? null;
  }

  async failPlanningScope(scopeId: string, error: string, expectedLockedUntil?: Date) {
    const [row] = await this.db
      .update(taskPlanningScopes)
      .set({
        lastError: error.slice(0, 2_000),
        lockedUntil: null,
        status: 'failed',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(taskPlanningScopes.id, scopeId),
          eq(taskPlanningScopes.workspaceId, this.workspaceId),
          expectedLockedUntil ? eq(taskPlanningScopes.status, 'running') : undefined,
          expectedLockedUntil ? eq(taskPlanningScopes.lockedUntil, expectedLockedUntil) : undefined,
        ),
      )
      .returning();
    return row ?? null;
  }

  async requeuePlanningScope(scopeId: string) {
    const [row] = await this.db
      .update(taskPlanningScopes)
      .set({ lastError: null, status: 'queued', updatedAt: new Date() })
      .where(
        and(
          eq(taskPlanningScopes.id, scopeId),
          eq(taskPlanningScopes.workspaceId, this.workspaceId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async recordDomainEvent(input: RecordTaskDomainEventInput) {
    return this.db.transaction((tx) =>
      this.recordDomainEventInDatabase(tx as unknown as OrviloDatabase, input),
    );
  }

  /** Use when the caller already owns the transaction (for example TaskModel). */
  async recordDomainEventInTransaction(db: OrviloDatabase, input: RecordTaskDomainEventInput) {
    return this.recordDomainEventInDatabase(db, input);
  }

  private async recordDomainEventInDatabase(db: OrviloDatabase, input: RecordTaskDomainEventInput) {
    const [inserted] = await db
      .insert(taskDomainEvents)
      .values({
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        projectId: input.projectId,
        source: input.source,
        taskId: input.taskId,
        teamId: input.teamId,
        type: input.type,
        workspaceId: this.workspaceId,
      })
      .onConflictDoNothing({
        target: [taskDomainEvents.workspaceId, taskDomainEvents.idempotencyKey],
      })
      .returning();

    const event =
      inserted ??
      (
        await db
          .select()
          .from(taskDomainEvents)
          .where(
            and(
              eq(taskDomainEvents.workspaceId, this.workspaceId),
              eq(taskDomainEvents.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1)
      )[0];

    if (!event) throw new Error('Failed to persist task domain event');

    // A task with both a project and a team is planned by its project scope —
    // the team scope only owns projectless work (single-dispatch-owner rule).
    const scopeType: TaskPlanningScopeType = input.projectId
      ? 'project'
      : input.teamId
        ? 'team'
        : 'workspace';
    const scopeId = input.projectId ?? input.teamId ?? this.workspaceId;
    const trigger: TaskPlanningTrigger = {
      ...(input.action ? { action: input.action } : {}),
      ...(input.eventId ? { eventId: input.eventId } : {}),
      source: input.source,
      type: input.type,
    };

    const [scope] = await db
      .insert(taskPlanningScopes)
      .values({
        dirtyRevision: event.revision,
        lastError: null,
        lastTrigger: trigger,
        scopeId,
        scopeType,
        status: 'queued',
        workspaceId: this.workspaceId,
      })
      .onConflictDoUpdate({
        target: [
          taskPlanningScopes.workspaceId,
          taskPlanningScopes.scopeType,
          taskPlanningScopes.scopeId,
        ],
        set: {
          dirtyRevision: sql`greatest(${taskPlanningScopes.dirtyRevision}, ${event.revision})`,
          lastError: null,
          lastTrigger: trigger,
          status: sql`case
            when ${taskPlanningScopes.status} = 'running'
              and ${taskPlanningScopes.lockedUntil} >= now()
            then 'running'
            else 'queued'
          end`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return { event, scope };
  }

  /** Persist a local task change, its planner wakeup, and Linear outbox row together. */
  async recordTaskChangeInTransaction(
    db: OrviloDatabase,
    input: {
      changedFields: string[];
      eventId?: string;
      eventType: TaskDomainEventType;
      externalMappingId?: string;
      idempotencyKey: string;
      outboxPayload?: LinearExternalCommentOutboxPayload | LinearExternalRelationOutboxPayload;
      payload?: Record<string, unknown>;
      source: TaskDomainEventSource;
      suppressLinearOutbox?: boolean;
      task: TaskItem;
    },
  ) {
    const model = new LinearSyncModel(db, this.workspaceId);
    const event = await model.recordDomainEventInTransaction(db, {
      eventId: input.eventId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        aggregateRevision: input.task.domainRevision,
        changedFields: input.changedFields,
        ...input.payload,
        task: {
          assigneeAgentId: input.task.assigneeAgentId,
          assigneeUserId: input.task.assigneeUserId,
          executionGeneration: input.task.executionGeneration,
          policyRevision: input.task.policyRevision,
          requirementRevision: input.task.requirementRevision,
          status: input.task.status,
        },
      },
      projectId: input.task.projectId,
      source: input.source,
      taskId: input.task.id,
      teamId: input.task.teamId,
      type: input.eventType,
    });

    if (input.suppressLinearOutbox || input.source === 'linear') {
      return { event, link: null, outbox: null };
    }

    let link = await model.findIssueLinkByTaskId(input.task.id);

    const queueCreateIntent = async (
      binding: Awaited<ReturnType<LinearSyncModel['findBindingByProjectId']>>,
      installation: Awaited<ReturnType<LinearSyncModel['findInstallationById']>>,
      existingIntent?: Awaited<ReturnType<LinearSyncModel['findCreateIntentByTaskId']>>,
    ) => {
      if (!binding || !binding.syncEnabled || !binding.defaultTeamId) return null;
      if (!installation || installation.status !== 'active') return null;
      const existingRemoteIssueId = existingIntent?.payload
        ? (existingIntent.payload as { remoteIssueId?: unknown }).remoteIssueId
        : undefined;
      const remoteIssueId =
        typeof existingRemoteIssueId === 'string' ? existingRemoteIssueId : randomUUID();
      return model.queueOutbox({
        expectedLocalRevision: input.task.domainRevision,
        installationId: installation.id,
        operation: `linear-issue:create:${input.task.id}`,
        payload: {
          bindingId: binding.id,
          description: input.task.instruction,
          localTaskId: input.task.id,
          projectId: binding.linearProjectId,
          remoteIssueId,
          teamId: binding.defaultTeamId,
          title: input.task.name || input.task.identifier,
        },
        taskId: input.task.id,
      });
    };

    if (!link) {
      const binding = input.task.projectId
        ? await model.findBindingByProjectId(input.task.projectId)
        : null;
      const installation = binding
        ? await model.findInstallationById(binding.installationId)
        : null;
      const createIntent = await model.findCreateIntentByTaskId(input.task.id);

      if (!binding || !binding.syncEnabled || !binding.defaultTeamId || !installation) {
        if (createIntent) {
          await model.cancelOutbox(
            createIntent.id,
            'Local task no longer has an active Linear project binding',
          );
        }
        return { event, link: null, outbox: null };
      }

      const outbox = await queueCreateIntent(binding, installation, createIntent);
      return { event, link: null, outbox };
    }

    let installation = await model.findInstallationById(link.installationId);
    if (!installation || installation.status !== 'active') {
      return { event, link, outbox: null };
    }

    let binding = link.bindingId ? await model.findBindingById(link.bindingId) : null;
    if (binding && !linearBindingWriteEnabled(binding)) return { event, link, outbox: null };

    if (input.task.projectId && binding?.projectId !== input.task.projectId) {
      const nextBinding = await model.findBindingByProjectId(input.task.projectId);
      const nextInstallation = nextBinding
        ? await model.findInstallationById(nextBinding.installationId)
        : null;
      if (
        !nextBinding ||
        !linearBindingWriteEnabled(nextBinding) ||
        !nextInstallation ||
        nextInstallation.status !== 'active' ||
        nextInstallation.id !== installation.id ||
        nextInstallation.organizationId !== installation.organizationId
      ) {
        await model.updateIssueLink(link.id, {
          conflict: {
            base: { projectId: binding?.projectId ?? null },
            detectedAt: new Date().toISOString(),
            fields: ['projectId'],
            local: { projectId: input.task.projectId },
            remote: { projectId: link.remoteSnapshot?.projectId ?? null },
          },
          syncState: 'conflict',
        });
        return { event, link, outbox: null };
      }
      const rebound = await model.updateIssueLink(link.id, {
        bindingId: nextBinding.id,
        syncState: 'pending',
      });
      if (rebound) link = rebound;
      binding = nextBinding;
      installation = nextInstallation;
    }

    if (input.outboxPayload?.kind === 'comment') {
      const existing = input.externalMappingId
        ? await model.findExternalCommentById(input.externalMappingId)
        : await model.findExternalCommentByLocalId(input.outboxPayload.commentId);
      if (input.outboxPayload.action === 'create' && existing?.linearCommentId) {
        return { event, link, outbox: null };
      }
      const mapping = await model.upsertExternalComment({
        id: input.externalMappingId,
        confirmationState: 'unconfirmed',
        issueLinkId: link.id,
        lastConfirmedSnapshot: existing?.lastConfirmedSnapshot,
        linearCommentId:
          existing?.linearCommentId ??
          (input.outboxPayload.action === 'create' ? randomUUID() : null),
        linearIssueId: link.linearIssueId,
        localCommentId:
          input.outboxPayload.action === 'delete' ? null : input.outboxPayload.commentId,
        origin: 'outbound',
        remoteSnapshot: existing?.remoteSnapshot,
        source: 'orvilo',
        tombstone: null,
      });
      const outbox = await model.queueOutbox({
        expectedLocalRevision: input.task.domainRevision,
        installationId: installation.id,
        linkId: link.id,
        operation: `linear-comment:${input.outboxPayload.action}:${input.outboxPayload.commentId}`,
        payload: {
          ...input.outboxPayload,
          mappingId: input.externalMappingId ?? mapping.id,
          ...(mapping.linearCommentId ? { remoteCommentId: mapping.linearCommentId } : {}),
        },
        taskId: input.task.id,
      });
      await model.markExternalCommentOutboundOperation(mapping.id, outbox.id);
      return { event, link, outbox };
    }

    if (input.outboxPayload?.kind === 'relation') {
      const relation = input.outboxPayload.relation;
      const existing = await model.findExternalRelationByLocalKey(relation.localRelationKey);
      const mapping = await model.upsertExternalRelation({
        confirmationState: 'unconfirmed',
        issueLinkId: link.id,
        kind: relation.kind,
        lastConfirmedSnapshot: existing?.lastConfirmedSnapshot,
        linearRelationId:
          existing?.linearRelationId ??
          (relation.kind !== 'parent' && input.outboxPayload.action === 'upsert'
            ? randomUUID()
            : null),
        localRelationKey: relation.localRelationKey,
        localSourceTaskId: relation.sourceTaskId,
        localTargetTaskId: relation.targetTaskId,
        origin: 'outbound',
        remoteSnapshot: existing?.remoteSnapshot,
        resolutionState: relation.targetTaskId ? 'resolved' : 'unresolved',
        source: 'orvilo',
        tombstone: null,
      });
      const outbox = await model.queueOutbox({
        expectedLocalRevision: input.task.domainRevision,
        installationId: installation.id,
        linkId: link.id,
        operation: `linear-relation:${input.outboxPayload.action}:${relation.localRelationKey}`,
        payload: {
          ...input.outboxPayload,
          mappingId: mapping.id,
          ...(mapping.linearRelationId ? { remoteRelationId: mapping.linearRelationId } : {}),
        },
        taskId: input.task.id,
      });
      await model.markExternalRelationOutboundOperation(mapping.id, outbox.id);
      return { event, link, outbox };
    }
    const settings = binding?.settings;
    const changedFields = new Set(input.changedFields);
    const workflowChanged =
      changedFields.has('workflowCategory') || changedFields.has('workflowStateId');
    let statusId = settings?.statusMappings?.find(
      (mapping) =>
        mapping.workflowCategory === input.task.workflowCategory ||
        (!mapping.workflowCategory && mapping.localStatus === input.task.status),
    )?.linearStateId;
    // Team-scope links carry no binding.statusMappings — the remote state id
    // comes from the synced team workflow states matching the new category.
    if (
      statusId === undefined &&
      workflowChanged &&
      !binding &&
      link.linearTeamId &&
      input.task.teamId
    ) {
      const [teamState] = await db
        .select({ remoteStateId: teamWorkflowStates.remoteStateId })
        .from(teamWorkflowStates)
        .where(
          and(
            eq(teamWorkflowStates.teamId, input.task.teamId),
            eq(teamWorkflowStates.category, input.task.workflowCategory),
            isNotNull(teamWorkflowStates.remoteStateId),
          ),
        )
        .orderBy(teamWorkflowStates.position)
        .limit(1);
      statusId = teamState?.remoteStateId ?? undefined;
    }
    const assignmentId = settings?.assignmentMappings?.find(
      (mapping) =>
        mapping.orviloAgentId === input.task.assigneeAgentId ||
        mapping.orviloUserId === input.task.assigneeUserId,
    )?.linearUserId;
    const assignmentChanged =
      changedFields.has('assigneeAgentId') || changedFields.has('assigneeUserId');
    const shouldClearAssignment =
      assignmentChanged &&
      !input.task.assigneeAgentId &&
      !input.task.assigneeUserId &&
      Boolean(link.remoteSnapshot?.assigneeId);

    const payload = {
      ...(assignmentChanged && (assignmentId !== undefined || shouldClearAssignment)
        ? { assigneeId: assignmentId ?? null }
        : {}),
      ...(changedFields.has('description') ||
      changedFields.has('editorData') ||
      changedFields.has('instruction')
        ? { description: input.task.instruction }
        : {}),
      ...(changedFields.has('priority') ? { priority: input.task.priority } : {}),
      // Task.projectId is local to Orvilo. A Linear issue update must carry
      // the bound remote project UUID instead of leaking the local id.
      ...(changedFields.has('projectId')
        ? { projectId: binding?.linearProjectId ?? link.remoteSnapshot?.projectId ?? null }
        : {}),
      ...(workflowChanged && statusId !== undefined ? { stateId: statusId } : {}),
      ...(changedFields.has('name') ? { title: input.task.name || input.task.identifier } : {}),
    };
    if (Object.keys(payload).length === 0) return { event, link, outbox: null };
    const outbox = await model.queueOutbox({
      expectedLocalRevision: input.task.domainRevision,
      installationId: installation.id,
      linkId: link.id,
      operation: 'update_issue',
      payload,
      taskId: input.task.id,
    });

    return { event, link, outbox };
  }

  async updatePlanningScope(
    scopeType: TaskPlanningScopeType,
    scopeId: string,
    patch: {
      lastError?: string | null;
      plannedRevision?: number;
      status?: TaskPlanningScopeStatus;
    },
  ) {
    const [row] = await this.db
      .update(taskPlanningScopes)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(taskPlanningScopes.workspaceId, this.workspaceId),
          eq(taskPlanningScopes.scopeType, scopeType),
          eq(taskPlanningScopes.scopeId, scopeId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async updateIssueLink(
    id: string,
    patch: {
      aliasIdentifiers?: string[];
      bindingId?: string | null;
      conflict?: LinearSyncConflict | null;
      installationId?: string;
      lastInboundDeliveryId?: string | null;
      lastConfirmedSnapshot?: LinearIssueSnapshot;
      linearIdentifier?: string;
      linearTeamId?: string | null;
      remoteSnapshot?: LinearIssueSnapshot | null;
      remoteUpdatedAt?: Date | null;
      syncState?: LinearIssueLinkSyncState;
      tombstone?: LinearSyncTombstone | null;
    },
  ) {
    const [row] = await this.db
      .update(linearIssueLinks)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(linearIssueLinks.id, id), eq(linearIssueLinks.workspaceId, this.workspaceId)))
      .returning();
    return row ?? null;
  }
}
