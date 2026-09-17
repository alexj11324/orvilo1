import { randomUUID } from 'node:crypto';

import type { LinearIssueSnapshot, LinearProjectBindingSettings, TaskItem } from '@orvilo/types';
import { and, eq } from 'drizzle-orm';

import {
  LINEAR_SYNC_DEFAULT_LEASE_MS,
  LINEAR_SYNC_MAX_ATTEMPTS,
  type LinearSyncLease,
  LinearSyncModel,
  linearSyncRetryDelayMs,
} from '@/database/models/linearSync';
import { TaskModel } from '@/database/models/task';
import { tasks } from '@/database/schemas/task';
import type { LobeChatDatabase } from '@/database/type';
import { TaskService } from '@/server/services/task';

import { changedLinearIssueFields, mergeLinearIssueSnapshots } from './merge';
import type { LinearIssueProvider, LinearIssueUpdateInput } from './provider';

export class LinearBindingPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinearBindingPendingError';
  }
}

class LinearSyncLeaseLostError extends Error {
  constructor() {
    super('Linear sync lease is no longer owned by this worker');
    this.name = 'LinearSyncLeaseLostError';
  }
}

export interface LinearWorkerResult {
  failed: number;
  imported: number;
  pendingBinding: number;
  processed: number;
}

export interface LinearOutboxWorkerResult {
  failed: number;
  sent: number;
}

const taskPriority = (priority: number | null | undefined) => {
  if (priority === null || priority === undefined) return 0;
  return Math.max(0, Math.min(4, priority));
};

const taskSnapshot = (
  task: TaskItem,
  issue: LinearIssueSnapshot,
  settings: LinearProjectBindingSettings,
): LinearIssueSnapshot => ({
  assigneeId:
    settings.assignmentMappings?.find(
      (mapping) =>
        mapping.orviloAgentId === task.assigneeAgentId ||
        mapping.orviloUserId === task.assigneeUserId,
    )?.linearUserId ?? issue.assigneeId,
  id: issue.id,
  identifier: issue.identifier,
  description: task.instruction,
  priority: task.priority,
  // Task.projectId is an Orvilo project id. The snapshot field is a Linear
  // project id, so it must remain on the remote identity side of the binding.
  projectId: issue.projectId,
  stateId:
    settings.statusMappings?.find((mapping) => mapping.localStatus === task.status)
      ?.linearStateId ?? issue.stateId,
  title: task.name || task.identifier,
});

const remoteTaskPatch = (
  task: TaskItem,
  merged: LinearIssueSnapshot,
  base: LinearIssueSnapshot,
  local: LinearIssueSnapshot,
  remote: LinearIssueSnapshot,
  settings: LinearProjectBindingSettings,
): Parameters<TaskModel['update']>[1] => {
  const patch: Parameters<TaskModel['update']>[1] = {};
  const remoteChanged = changedLinearIssueFields(base, remote);
  const localChanged = new Set(changedLinearIssueFields(base, local));

  if (remoteChanged.includes('title') && !localChanged.has('title')) {
    patch.name = merged.title;
  }
  if (remoteChanged.includes('description') && !localChanged.has('description')) {
    patch.description = merged.description?.slice(0, 255);
    patch.editorData = null;
    patch.instruction = merged.description ?? '';
  }
  if (remoteChanged.includes('priority') && !localChanged.has('priority')) {
    patch.priority = taskPriority(merged.priority);
  }
  if (remoteChanged.includes('stateId') && !localChanged.has('stateId')) {
    const statusMapping = settings.statusMappings?.find(
      (mapping) => mapping.linearStateId === merged.stateId,
    );
    if (statusMapping) patch.status = statusMapping.localStatus;
  }
  if (remoteChanged.includes('assigneeId') && !localChanged.has('assigneeId')) {
    if (merged.assigneeId === null) {
      patch.assigneeAgentId = null;
      patch.assigneeUserId = null;
    } else {
      const assignmentMapping = settings.assignmentMappings?.find(
        (mapping) => mapping.linearUserId === merged.assigneeId,
      );
      if (assignmentMapping) {
        patch.assigneeAgentId = assignmentMapping.orviloAgentId ?? null;
        patch.assigneeUserId = assignmentMapping.orviloUserId ?? null;
      }
    }
  }

  return patch;
};

const leaseForRow = (row: { leaseFence: number; leaseOwner: string | null }): LinearSyncLease => {
  if (!row.leaseOwner) throw new LinearSyncLeaseLostError();
  return { fence: row.leaseFence, owner: row.leaseOwner };
};

const remoteMatchesUpdate = (remote: LinearIssueSnapshot, input: LinearIssueUpdateInput) => {
  const fields: (keyof LinearIssueUpdateInput)[] = [
    'assigneeId',
    'description',
    'priority',
    'projectId',
    'stateId',
    'title',
  ];

  return fields.every((field) => {
    if (!(field in input)) return true;
    return remote[field] === input[field];
  });
};

const retryAt = (attempts: number) => new Date(Date.now() + linearSyncRetryDelayMs(attempts));

export class LinearSyncWorker {
  private readonly db: LobeChatDatabase;
  private readonly model: LinearSyncModel;
  private readonly workspaceId: string;
  private readonly leaseOwner = randomUUID();

  constructor(db: LobeChatDatabase, workspaceId: string) {
    this.db = db;
    this.model = new LinearSyncModel(db, workspaceId);
    this.workspaceId = workspaceId;
  }

  async processPending(
    provider: LinearIssueProvider,
    limit = 20,
    installationId?: string,
  ): Promise<LinearWorkerResult> {
    const rows = await this.model.claimInbox(
      limit,
      LINEAR_SYNC_DEFAULT_LEASE_MS,
      installationId,
      this.leaseOwner,
    );
    const result: LinearWorkerResult = {
      failed: 0,
      imported: 0,
      pendingBinding: 0,
      processed: 0,
    };

    for (const row of rows) {
      const lease = leaseForRow(row);
      try {
        // Provider I/O stays outside the database transaction. Once the issue
        // snapshot is available, the Task/link/event/receipt mutations commit
        // together so a crash can only replay the complete local command.
        const knownIssue = row.subjectId ? await provider.getIssue(row.subjectId) : undefined;
        const outcome = await this.model.transaction((model, db) =>
          this.processRow(row, provider, { db, knownIssue, model }),
        );
        const settled = await this.model.updateInbox(
          row.id,
          {
            availableAt: outcome === 'pending-binding' ? new Date(Date.now() + 60_000) : new Date(),
            lastError: null,
            lockedUntil: null,
            processedAt: outcome === 'pending-binding' ? null : new Date(),
            status: outcome === 'pending-binding' ? 'pending_binding' : 'processed',
          },
          lease,
        );
        if (!settled) continue;
        if (outcome === 'imported') result.imported += 1;
        if (outcome === 'pending-binding') result.pendingBinding += 1;
        if (outcome !== 'pending-binding') result.processed += 1;
      } catch (error) {
        if (error instanceof LinearSyncLeaseLostError) continue;
        const message = error instanceof Error ? error.message : String(error);
        const settled = await this.model.updateInbox(
          row.id,
          {
            availableAt: retryAt(row.attempts),
            lastError: message.slice(0, 2_000),
            lockedUntil: null,
            status: row.attempts >= LINEAR_SYNC_MAX_ATTEMPTS ? 'dead_letter' : 'failed',
          },
          lease,
        );
        if (settled) result.failed += 1;
      }
    }

    return result;
  }

  async processOutbox(
    provider: LinearIssueProvider,
    limit = 20,
    installationId?: string,
  ): Promise<LinearOutboxWorkerResult> {
    const rows = await this.model.claimOutbox(
      limit,
      LINEAR_SYNC_DEFAULT_LEASE_MS,
      installationId,
      this.leaseOwner,
    );
    const result: LinearOutboxWorkerResult = { failed: 0, sent: 0 };

    for (const row of rows) {
      const lease = leaseForRow(row);
      let providerWriteAttempted = false;
      try {
        if (!row.linkId) throw new Error('Linear outbox row has no issue link');
        const issueLink = await this.model.findIssueLinkById(row.linkId);
        if (!issueLink) throw new Error('Linear issue link no longer exists');

        const updateInput = row.payload as LinearIssueUpdateInput;
        const current = await provider.getIssue(issueLink.linearIssueId);
        const updated = remoteMatchesUpdate(current, updateInput)
          ? current
          : await (async () => {
              if (!(await this.model.hasCurrentOutboxLease(row.id, lease))) {
                throw new LinearSyncLeaseLostError();
              }
              providerWriteAttempted = true;
              return provider.updateIssue(issueLink.linearIssueId, updateInput);
            })();

        const settled = await this.model.settleOutbox(row.id, lease, {
          issueLinkId: issueLink.id,
          remoteSnapshot: updated,
        });
        if (!settled) continue;
        result.sent += 1;
      } catch (error) {
        if (error instanceof LinearSyncLeaseLostError) continue;

        const message = error instanceof Error ? error.message : String(error);
        const settled = await this.model.updateOutbox(
          row.id,
          {
            availableAt: retryAt(row.attempts),
            lastError: message.slice(0, 2_000),
            lockedUntil: null,
            outcomeUnknownAt: providerWriteAttempted ? new Date() : null,
            status:
              row.attempts >= LINEAR_SYNC_MAX_ATTEMPTS
                ? 'dead_letter'
                : providerWriteAttempted
                  ? 'outcome_unknown'
                  : 'failed',
          },
          lease,
        );
        if (settled) result.failed += 1;
      }
    }

    return result;
  }

  async importBinding(
    provider: LinearIssueProvider,
    bindingId: string,
    limit = 50,
  ): Promise<LinearWorkerResult & { completed: boolean; nextCursor: string | null }> {
    const binding = await this.model.findBindingById(bindingId);
    if (!binding) throw new Error('Linear project binding not found');
    const installation = await this.model.findInstallationById(binding.installationId);
    if (!installation) throw new Error('Linear installation not found');

    if (binding.importPhase === 'completed') {
      return {
        failed: 0,
        imported: 0,
        pendingBinding: 0,
        processed: 0,
        completed: true,
        nextCursor: null,
      };
    }
    const watermark = binding.importStartedAt ?? new Date();
    if (!binding.importStartedAt) {
      await this.model.updateBindingImportState(binding.id, {
        importPhase: 'initial',
        importStartedAt: watermark,
      });
    }
    const phase = binding.importPhase === 'reconciliation' ? 'reconciliation' : 'initial';
    const cursor = phase === 'initial' ? binding.importCursor : binding.importReconciliationCursor;
    const page = await provider.listIssues(binding.linearProjectId, limit, cursor);
    const issueById = new Map(page.issues.map((issue) => [issue.id, issue]));
    const pageProvider: LinearIssueProvider = {
      ...provider,
      getIssue: async (id) => issueById.get(id) ?? provider.getIssue(id),
    };
    const result: LinearWorkerResult = {
      failed: 0,
      imported: 0,
      pendingBinding: 0,
      processed: 0,
    };

    const seenIssueIds = new Set<string>();
    let pageBlocked = false;
    for (const issue of page.issues) {
      if (seenIssueIds.has(issue.id)) continue;
      seenIssueIds.add(issue.id);
      if (
        phase === 'reconciliation' &&
        issue.updatedAt &&
        new Date(issue.updatedAt).getTime() < watermark.getTime()
      )
        continue;
      try {
        const outcome = await this.processImportIssue(
          {
            id: `linear-import:${binding.id}:${issue.id}`,
            installationId: installation.id,
            subjectId: issue.id,
          },
          issue,
          phase,
          pageProvider,
        );
        if (outcome === 'imported') result.imported += 1;
        if (outcome === 'pending-binding') result.pendingBinding += 1;
        if (outcome !== 'pending-binding') result.processed += 1;
        if (outcome === 'pending-binding') pageBlocked = true;
      } catch (error) {
        pageBlocked = true;
        await this.model.recordImportReceipt({
          bindingId: binding.id,
          lastError: error instanceof Error ? error.message.slice(0, 2_000) : String(error),
          linearIssueId: issue.id,
          phase,
          status: 'failed',
        });
        result.failed += 1;
        console.error('[linear:import]', error);
      }
    }

    if (pageBlocked) return { ...result, completed: false, nextCursor: cursor };
    if (page.hasNextPage) {
      const nextCursor = page.endCursor;
      await this.model.updateBindingImportState(
        binding.id,
        phase === 'initial'
          ? { importCursor: nextCursor }
          : { importReconciliationCursor: nextCursor },
      );
      return { ...result, completed: false, nextCursor };
    }
    if (phase === 'initial') {
      await this.model.updateBindingImportState(binding.id, {
        importCursor: null,
        importPhase: 'reconciliation',
        importReconciliationCursor: null,
      });
      return { ...result, completed: false, nextCursor: null };
    }
    await this.model.transaction(async (model) => {
      await model.updateBindingImportState(binding.id, {
        importCompletedAt: new Date(),
        importPhase: 'completed',
        importReconciliationCursor: null,
      });
      await model.recordDomainEvent({
        idempotencyKey: `linear:import-completed:${binding.id}:${watermark.toISOString()}`,
        payload: { bindingId: binding.id, importedAt: new Date().toISOString() },
        projectId: binding.projectId,
        source: 'linear',
        type: 'linear.import.completed',
      });
    });
    return { ...result, completed: true, nextCursor: null };
  }

  private async processImportIssue(
    row: { installationId: string; subjectId: string | null; id: string },
    issue: LinearIssueSnapshot,
    phase: 'initial' | 'reconciliation',
    provider: LinearIssueProvider,
  ) {
    return this.model.transaction((model, db) =>
      this.processRow(row, provider, {
        db,
        historicalImport: true,
        knownIssue: issue,
        model,
        phase,
      }),
    );
  }

  private async processRow(
    row: { installationId: string; subjectId: string | null; id: string },
    provider: LinearIssueProvider,
    context: {
      db?: LobeChatDatabase;
      historicalImport?: boolean;
      knownIssue?: LinearIssueSnapshot;
      model?: LinearSyncModel;
      phase?: 'initial' | 'reconciliation';
    } = {},
  ): Promise<'imported' | 'pending-binding' | 'processed'> {
    if (!row.subjectId) return 'processed';

    const db = context.db ?? this.db;
    const model = context.model ?? this.model;
    const issue = context.knownIssue ?? (await provider.getIssue(row.subjectId));
    const binding = issue.projectId
      ? await model.findBindingByLinearProjectId(issue.projectId)
      : null;
    if (!binding) return 'pending-binding';
    if (!binding.syncEnabled) {
      if (context.phase) {
        await model.recordImportReceipt({
          bindingId: binding.id,
          linearIssueId: issue.id,
          phase: context.phase,
          status: 'processed',
        });
      }
      return 'processed';
    }

    const installation = await model.findInstallationById(row.installationId);
    if (!installation?.installedByUserId) {
      throw new Error('Linear installation has no active Orvilo owner');
    }

    const existingLink = await model.findIssueLinkByExternalId(issue.id);
    if (!existingLink) {
      if (!binding.defaultTeamId) {
        throw new Error('Linear project binding has no default team');
      }

      const task = await new TaskService(
        db,
        installation.installedByUserId,
        this.workspaceId,
      ).createTask(
        {
          assigneeAgentId: settingsAssignmentAgent(binding.settings, issue.assigneeId),
          assigneeUserId: settingsAssignmentUser(binding.settings, issue.assigneeId),
          creationSubject: {
            id: installation.id,
            kind: 'integration',
            snapshot: {
              displayName: installation.organizationName || 'Linear',
              externalId: installation.organizationId,
              kind: 'integration',
            },
          },
          description: issue.description?.slice(0, 255),
          instruction: issue.description || issue.title,
          name: issue.title,
          priority: taskPriority(issue.priority),
          projectId: binding.projectId,
          visibility: 'public',
        },
        {
          eventId: row.id,
          idempotencyKey: `linear:import:${row.id}`,
          source: 'linear',
          suppressDomainEvent: context.historicalImport,
          suppressLinearOutbox: true,
        },
      );
      const initialStatus = binding.settings.statusMappings?.find(
        (mapping) => mapping.linearStateId === issue.stateId,
      )?.localStatus;
      if (initialStatus) {
        await new TaskModel(db, installation.installedByUserId, this.workspaceId).update(
          task.id,
          { status: initialStatus },
          {
            eventId: row.id,
            idempotencyKey: `linear:initial-status:${row.id}`,
            source: 'linear',
            suppressDomainEvent: context.historicalImport,
            suppressLinearOutbox: true,
          },
        );
      }
      await model.createIssueLink({
        bindingId: binding.id,
        installationId: installation.id,
        linearIdentifier: issue.identifier,
        linearIssueId: issue.id,
        organizationId: installation.organizationId,
        remoteSnapshot: issue,
        taskId: task.id,
      });
      if (context.phase) {
        await model.recordImportReceipt({
          bindingId: binding.id,
          linearIssueId: issue.id,
          phase: context.phase,
          status: 'processed',
        });
      }
      return 'imported';
    }

    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, existingLink.taskId), eq(tasks.workspaceId, this.workspaceId)))
      .limit(1);
    if (!task) {
      await model.updateIssueLink(existingLink.id, {
        lastInboundDeliveryId: row.id,
        remoteSnapshot: issue,
        syncState: 'removed',
      });
      if (context.phase) {
        await model.recordImportReceipt({
          bindingId: binding.id,
          linearIssueId: issue.id,
          phase: context.phase,
          status: 'processed',
        });
      }
      return 'processed';
    }

    const local = taskSnapshot(task, issue, binding.settings);
    const merged = mergeLinearIssueSnapshots({
      base: existingLink.lastConfirmedSnapshot,
      local,
      remote: issue,
    });
    if (merged.conflicts) {
      await model.updateIssueLink(existingLink.id, {
        conflict: merged.conflicts,
        lastInboundDeliveryId: row.id,
        remoteSnapshot: issue,
        syncState: 'conflict',
      });
      if (context.phase) {
        await model.recordImportReceipt({
          bindingId: binding.id,
          linearIssueId: issue.id,
          phase: context.phase,
          status: 'processed',
        });
      }
      return 'processed';
    }

    const taskModel = new TaskModel(db, task.createdByUserId, this.workspaceId);
    const patch = remoteTaskPatch(
      task,
      merged.merged,
      existingLink.lastConfirmedSnapshot,
      local,
      issue,
      binding.settings,
    );
    if (Object.keys(patch).length > 0) {
      await taskModel.update(task.id, patch, {
        eventId: row.id,
        idempotencyKey: `linear:task-update:${row.id}`,
        source: 'linear',
        suppressDomainEvent: context.historicalImport,
        suppressLinearOutbox: true,
      });
    }

    const localChanged = changedLinearIssueFields(existingLink.lastConfirmedSnapshot, local);
    if (localChanged.length > 0) {
      const payload = Object.fromEntries(
        localChanged.map((field) => [field, local[field] ?? null]),
      );
      await model.queueOutbox({
        expectedLocalRevision: task.domainRevision,
        installationId: installation.id,
        linkId: existingLink.id,
        operation: 'update_issue',
        payload,
        taskId: task.id,
      });
    }

    await model.updateIssueLink(existingLink.id, {
      conflict: null,
      lastConfirmedSnapshot: issue,
      lastInboundDeliveryId: row.id,
      remoteSnapshot: issue,
      syncState: localChanged.length > 0 ? 'pending' : 'synced',
    });
    if (context.phase) {
      await model.recordImportReceipt({
        bindingId: binding.id,
        linearIssueId: issue.id,
        phase: context.phase,
        status: 'processed',
      });
    }
    return 'processed';
  }
}

const settingsAssignmentAgent = (
  settings: LinearProjectBindingSettings,
  linearUserId?: string | null,
) =>
  settings.assignmentMappings?.find((mapping) => mapping.linearUserId === linearUserId)
    ?.orviloAgentId;

const settingsAssignmentUser = (
  settings: LinearProjectBindingSettings,
  linearUserId?: string | null,
) =>
  settings.assignmentMappings?.find((mapping) => mapping.linearUserId === linearUserId)
    ?.orviloUserId;
