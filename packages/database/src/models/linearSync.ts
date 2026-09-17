import { randomUUID } from 'node:crypto';

import type {
  LinearIssueLinkSyncState,
  LinearIssueSnapshot,
  LinearProjectBindingSettings,
  LinearSyncConflict,
  LinearSyncInboxStatus,
  LinearSyncOutboxStatus,
  TaskDomainEventSource,
  TaskDomainEventType,
  TaskItem,
  TaskPlanningProposal,
  TaskPlanningRevisionStatus,
  TaskPlanningScopeStatus,
  TaskPlanningScopeType,
  TaskPlanningTrigger,
} from '@orvilo/types';
import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';

import type {
  LinearSyncInboxItem,
  LinearSyncOutboxItem,
  TaskDomainEventItem,
  TaskPlanningRevisionItem,
  TaskPlanningScopeItem,
} from '../schemas';
import {
  linearInstallations,
  linearIssueLinks,
  linearProjectBindings,
  linearSyncImportReceipts,
  linearSyncInbox,
  linearSyncOutbox,
  taskDomainEvents,
  taskPlanningRevisions,
  taskPlanningScopes,
} from '../schemas';
import type { LobeChatDatabase } from '../type';

export interface RecordTaskDomainEventInput {
  action?: string;
  eventId?: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  projectId?: string | null;
  source: TaskDomainEventSource;
  taskId?: string | null;
  type: TaskDomainEventType;
}

export interface QueueLinearSyncInput {
  expectedLocalRevision: number;
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

/** Deterministic backoff keeps retries bounded and makes queue behavior testable. */
export const linearSyncRetryDelayMs = (attempts: number) =>
  Math.min(
    LINEAR_SYNC_RETRY_MAX_MS,
    LINEAR_SYNC_RETRY_BASE_MS * 2 ** Math.max(0, Math.min(attempts, 16) - 1),
  );

export class LinearSyncModel {
  private readonly db: LobeChatDatabase;
  private readonly workspaceId: string;

  constructor(db: LobeChatDatabase, workspaceId: string) {
    this.db = db;
    this.workspaceId = workspaceId;
  }

  async findInstallationByOrganization(organizationId: string) {
    const [row] = await this.db
      .select()
      .from(linearInstallations)
      .where(
        and(
          eq(linearInstallations.workspaceId, this.workspaceId),
          eq(linearInstallations.organizationId, organizationId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findInstallationById(id: string) {
    const [row] = await this.db
      .select()
      .from(linearInstallations)
      .where(
        and(eq(linearInstallations.id, id), eq(linearInstallations.workspaceId, this.workspaceId)),
      )
      .limit(1);
    return row ?? null;
  }

  async listInstallations() {
    return this.db
      .select()
      .from(linearInstallations)
      .where(eq(linearInstallations.workspaceId, this.workspaceId))
      .orderBy(desc(linearInstallations.createdAt));
  }

  async upsertInstallation(input: {
    connectorId?: string;
    installedByUserId: string;
    organizationId: string;
    organizationName?: string;
    webhookSecretRef?: string;
  }) {
    const [row] = await this.db
      .insert(linearInstallations)
      .values({
        connectorId: input.connectorId,
        installedByUserId: input.installedByUserId,
        organizationId: input.organizationId,
        organizationName: input.organizationName,
        webhookSecretRef: input.webhookSecretRef,
        workspaceId: this.workspaceId,
      })
      .onConflictDoUpdate({
        target: [linearInstallations.workspaceId, linearInstallations.organizationId],
        set: {
          connectorId: input.connectorId,
          organizationName: input.organizationName,
          status: 'active',
          webhookSecretRef: input.webhookSecretRef,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
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
        replanningEnabled: settings.replanningEnabled ?? false,
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
          replanningEnabled: settings.replanningEnabled ?? false,
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

  async transaction<T>(callback: (model: LinearSyncModel, db: LobeChatDatabase) => Promise<T>) {
    return this.db.transaction((tx) =>
      callback(
        new LinearSyncModel(tx as unknown as LobeChatDatabase, this.workspaceId),
        tx as unknown as LobeChatDatabase,
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

  async listIssueLinks(bindingId?: string) {
    return this.db
      .select()
      .from(linearIssueLinks)
      .where(
        and(
          eq(linearIssueLinks.workspaceId, this.workspaceId),
          bindingId ? eq(linearIssueLinks.bindingId, bindingId) : undefined,
        ),
      )
      .orderBy(desc(linearIssueLinks.updatedAt));
  }

  async createIssueLink(input: {
    bindingId?: string | null;
    installationId: string;
    linearIdentifier: string;
    linearIssueId: string;
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
        bindingId: input.bindingId,
        installationId: input.installationId,
        lastConfirmedSnapshot: snapshot,
        linearIdentifier: input.linearIdentifier,
        linearIssueId: input.linearIssueId,
        organizationId: input.organizationId,
        remoteSnapshot: input.remoteSnapshot,
        remoteUpdatedAt: input.remoteSnapshot?.updatedAt
          ? new Date(input.remoteSnapshot.updatedAt)
          : undefined,
        taskId: input.taskId,
        workspaceId: this.workspaceId,
      })
      .returning();
    return row;
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

  async queueOutbox(input: QueueLinearSyncInput) {
    if (input.linkId) {
      const [existing] = await this.db
        .select()
        .from(linearSyncOutbox)
        .where(
          and(
            eq(linearSyncOutbox.workspaceId, this.workspaceId),
            eq(linearSyncOutbox.linkId, input.linkId),
            eq(linearSyncOutbox.operation, input.operation),
            inArray(linearSyncOutbox.status, ['failed', 'pending', 'outcome_unknown']),
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
            lastError: null,
            lockedUntil: null,
            leaseOwner: null,
            outcomeUnknownAt: null,
            payload: {
              ...(existing.payload as Record<string, unknown>),
              ...input.payload,
            },
            status: 'pending',
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
        taskId: input.taskId,
        workspaceId: this.workspaceId,
      })
      .returning();
    return row;
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

  async claimOutbox(
    limit = 20,
    leaseMs = LINEAR_SYNC_DEFAULT_LEASE_MS,
    installationId?: string,
    leaseOwner = randomUUID(),
  ): Promise<LinearSyncOutboxItem[]> {
    const lockedUntil = new Date(Date.now() + leaseMs);
    const installationFilter = installationId
      ? sql`AND installation_id = ${installationId}`
      : sql``;
    return this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT id
          FROM linear_sync_outbox
          WHERE workspace_id = ${this.workspaceId}
            AND status IN ('failed', 'pending', 'sending', 'outcome_unknown')
            AND available_at <= now()
            AND (locked_until IS NULL OR locked_until < now())
            ${installationFilter}
          ORDER BY created_at
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
          scope.scopeType === 'project' ? eq(taskDomainEvents.projectId, scope.scopeId) : undefined,
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
  ) {
    const [row] = await this.db
      .update(taskPlanningRevisions)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(taskPlanningRevisions.id, id),
          eq(taskPlanningRevisions.workspaceId, this.workspaceId),
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
        ),
      )
      .returning();
    return row ?? null;
  }

  async failPlanningScope(scopeId: string, error: string) {
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
      this.recordDomainEventInDatabase(tx as unknown as LobeChatDatabase, input),
    );
  }

  /** Use when the caller already owns the transaction (for example TaskModel). */
  async recordDomainEventInTransaction(db: LobeChatDatabase, input: RecordTaskDomainEventInput) {
    return this.recordDomainEventInDatabase(db, input);
  }

  private async recordDomainEventInDatabase(
    db: LobeChatDatabase,
    input: RecordTaskDomainEventInput,
  ) {
    const [inserted] = await db
      .insert(taskDomainEvents)
      .values({
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        projectId: input.projectId,
        source: input.source,
        taskId: input.taskId,
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

    const scopeType: TaskPlanningScopeType = input.projectId ? 'project' : 'workspace';
    const scopeId = input.projectId ?? this.workspaceId;
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
          status: 'queued',
          updatedAt: new Date(),
        },
      })
      .returning();

    return { event, scope };
  }

  /** Persist a local task change, its planner wakeup, and Linear outbox row together. */
  async recordTaskChangeInTransaction(
    db: LobeChatDatabase,
    input: {
      changedFields: string[];
      eventId?: string;
      eventType: TaskDomainEventType;
      idempotencyKey: string;
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
      type: input.eventType,
    });

    if (input.suppressLinearOutbox || input.source === 'linear') {
      return { event, link: null, outbox: null };
    }

    const link = await model.findIssueLinkByTaskId(input.task.id);
    if (!link) return { event, link: null, outbox: null };

    const installation = await model.findInstallationById(link.installationId);
    if (!installation || installation.status !== 'active') {
      return { event, link, outbox: null };
    }

    const binding = link.bindingId ? await model.findBindingById(link.bindingId) : null;
    if (binding && !binding.syncEnabled) return { event, link, outbox: null };

    const settings = binding?.settings;
    const statusId = settings?.statusMappings?.find(
      (mapping) => mapping.localStatus === input.task.status,
    )?.linearStateId;
    const assignmentId = settings?.assignmentMappings?.find(
      (mapping) =>
        mapping.orviloAgentId === input.task.assigneeAgentId ||
        mapping.orviloUserId === input.task.assigneeUserId,
    )?.linearUserId;
    const shouldClearAssignment =
      !input.task.assigneeAgentId &&
      !input.task.assigneeUserId &&
      Boolean(link.remoteSnapshot?.assigneeId);

    const payload = {
      ...(assignmentId !== undefined || shouldClearAssignment
        ? { assigneeId: assignmentId ?? null }
        : {}),
      description: input.task.instruction,
      priority: input.task.priority,
      // Task.projectId is local to Orvilo. A Linear issue update must carry
      // the bound remote project UUID instead of leaking the local id.
      projectId: binding?.linearProjectId ?? link.remoteSnapshot?.projectId ?? null,
      ...(statusId !== undefined ? { stateId: statusId } : {}),
      title: input.task.name || input.task.identifier,
    };
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
      conflict?: LinearSyncConflict | null;
      lastInboundDeliveryId?: string | null;
      lastConfirmedSnapshot?: LinearIssueSnapshot;
      remoteSnapshot?: LinearIssueSnapshot | null;
      remoteUpdatedAt?: Date | null;
      syncState?: LinearIssueLinkSyncState;
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
