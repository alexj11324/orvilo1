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
  TaskPlanningScopeStatus,
  TaskPlanningScopeType,
  TaskPlanningTrigger,
} from '@orvilo/types';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { LinearSyncInboxItem, LinearSyncOutboxItem } from '../schemas';
import {
  linearInstallations,
  linearIssueLinks,
  linearProjectBindings,
  linearSyncInbox,
  linearSyncOutbox,
  taskDomainEvents,
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
    connectorId: string;
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
    leaseMs = 60_000,
    installationId?: string,
  ): Promise<LinearSyncInboxItem[]> {
    const lockedUntil = new Date(Date.now() + leaseMs);
    const installationFilter = installationId
      ? sql`AND installation_id = ${installationId}`
      : sql``;
    const result = await this.db.execute(sql`
      WITH candidates AS (
        SELECT id
        FROM linear_sync_inbox
        WHERE workspace_id = ${this.workspaceId}
          AND status IN ('received', 'pending_binding')
          AND available_at <= now()
          AND (locked_until IS NULL OR locked_until < now())
          ${installationFilter}
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE linear_sync_inbox AS inbox
      SET locked_until = ${lockedUntil},
          attempts = inbox.attempts + 1,
          updated_at = now()
      FROM candidates
      WHERE inbox.id = candidates.id
      RETURNING inbox.*
    `);

    return result.rows as unknown as LinearSyncInboxItem[];
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
  ) {
    const [row] = await this.db
      .update(linearSyncInbox)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(linearSyncInbox.id, id), eq(linearSyncInbox.workspaceId, this.workspaceId)))
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
            inArray(linearSyncOutbox.status, ['failed', 'pending']),
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
    leaseMs = 60_000,
    installationId?: string,
  ): Promise<LinearSyncOutboxItem[]> {
    const lockedUntil = new Date(Date.now() + leaseMs);
    const installationFilter = installationId
      ? sql`AND installation_id = ${installationId}`
      : sql``;
    const result = await this.db.execute(sql`
      WITH candidates AS (
        SELECT id
        FROM linear_sync_outbox
        WHERE workspace_id = ${this.workspaceId}
          AND status IN ('failed', 'pending')
          AND available_at <= now()
          AND (locked_until IS NULL OR locked_until < now())
          ${installationFilter}
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE linear_sync_outbox AS outbox
      SET locked_until = ${lockedUntil},
          attempts = outbox.attempts + 1,
          status = 'sending',
          updated_at = now()
      FROM candidates
      WHERE outbox.id = candidates.id
      RETURNING outbox.*
    `);

    return result.rows as unknown as LinearSyncOutboxItem[];
  }

  async updateOutbox(
    id: string,
    patch: {
      availableAt?: Date;
      lastError?: string | null;
      lockedUntil?: Date | null;
      sentAt?: Date | null;
      status?: LinearSyncOutboxStatus;
    },
  ) {
    const [row] = await this.db
      .update(linearSyncOutbox)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(linearSyncOutbox.id, id), eq(linearSyncOutbox.workspaceId, this.workspaceId)))
      .returning();
    return row ?? null;
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
      eventType: TaskDomainEventType;
      source: TaskDomainEventSource;
      task: TaskItem;
    },
  ) {
    const link = await this.findIssueLinkByTaskId(input.task.id);
    if (!link) return null;

    const installation = await this.findInstallationById(link.installationId);
    if (!installation) return null;

    const payload = {
      description: input.task.instruction,
      priority: input.task.priority,
      projectId: input.task.projectId,
      title: input.task.name || input.task.identifier,
    };
    const event = await this.recordDomainEventInDatabase(db, {
      idempotencyKey: `task:${input.task.id}:${input.task.updatedAt.toISOString()}`,
      payload,
      projectId: input.task.projectId,
      source: input.source,
      taskId: input.task.id,
      type: input.eventType,
    });
    const outbox = await this.queueOutbox({
      expectedLocalRevision: input.task.updatedAt.getTime(),
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
