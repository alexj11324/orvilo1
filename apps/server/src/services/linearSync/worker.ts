import { randomUUID } from 'node:crypto';

import type { LinearIssueSnapshot, LinearProjectBindingSettings, TaskItem } from '@orvilo/types';

import {
  LINEAR_SYNC_DEFAULT_LEASE_MS,
  LINEAR_SYNC_MAX_ATTEMPTS,
  linearBindingReadEnabled,
  linearBindingWriteEnabled,
  type LinearSyncLease,
  LinearSyncModel,
  linearSyncRetryDelayMs,
} from '@/database/models/linearSync';
import type { TaskModel } from '@/database/models/task';
import type { LobeChatDatabase } from '@/database/type';

import { LinearIntegrationTaskService } from './integrationTask';
import { changedLinearIssueFields, mergeLinearIssueSnapshots } from './merge';
import {
  type LinearIssueProvider,
  type LinearIssueUpdateInput,
  normalizeLinearIssue,
} from './provider';

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
  baseline: LinearIssueSnapshot,
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
    settings.statusMappings?.find(
      (mapping) =>
        mapping.workflowCategory === task.workflowCategory ||
        (!mapping.workflowCategory && mapping.localStatus === task.status),
    )?.linearStateId ??
    task.workflowStateId ??
    issue.stateId,
  title: task.name || task.identifier,
  ...(Array.isArray(baseline.labelIds) ? { labelIds: baseline.labelIds } : {}),
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
  const localChanged = new Set(
    changedLinearIssueFields(base, local).filter((field) => field !== 'labelIds'),
  );

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
    patch.workflowStateId = merged.stateId;
    if (statusMapping?.workflowCategory) {
      patch.workflowCategory = statusMapping.workflowCategory;
    }
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
    'labelIds',
    'priority',
    'projectId',
    'stateId',
    'title',
  ];

  return fields.every((field) => {
    if (!(field in input)) return true;
    if (field === 'labelIds') {
      const remoteIds = remote.labelIds;
      const inputIds = input.labelIds;
      if (!Array.isArray(remoteIds) || !Array.isArray(inputIds)) return remoteIds === inputIds;
      return (
        JSON.stringify([...new Set(remoteIds)].sort()) ===
        JSON.stringify([...new Set(inputIds)].sort())
      );
    }
    return remote[field] === input[field];
  });
};

const retryAt = (attempts: number) => new Date(Date.now() + linearSyncRetryDelayMs(attempts));

type LinearInboundRow = {
  action?: string;
  eventType?: string;
  id: string;
  installationId: string;
  payload?: Record<string, unknown>;
  subjectId: string | null;
};

const issueFromSignedRemovePayload = (row: LinearInboundRow): LinearIssueSnapshot => {
  const issue = normalizeLinearIssue(row.payload?.data);
  if (issue.id !== row.subjectId) {
    throw new Error('Linear remove webhook payload does not match its subject');
  }
  return issue;
};

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
        let knownIssue: LinearIssueSnapshot | undefined;
        if (row.subjectId) {
          // A remove webhook is already authenticated and its exact body is
          // durable in the inbox. Reconcile from that signed snapshot instead
          // of issuing a provider read that may fail after deletion.
          knownIssue =
            row.action === 'remove' && row.eventType === 'Issue'
              ? issueFromSignedRemovePayload(row)
              : await provider.getIssue(row.subjectId);
        }
        const outcome = await this.model.transaction((model, db) =>
          this.processRow(row, provider, { db, knownIssue, model }),
        );
        const settled = await this.model.updateInbox(
          row.id,
          {
            availableAt: outcome === 'pending-binding' ? new Date(Date.now() + 60_000) : new Date(),
            lastError: null,
            lockedUntil: null,
            processedAt: outcome === 'pending-binding' || outcome === 'paused' ? null : new Date(),
            status:
              outcome === 'pending-binding'
                ? 'pending_binding'
                : outcome === 'paused'
                  ? 'paused'
                  : 'processed',
          },
          lease,
        );
        if (!settled) continue;
        if (outcome === 'imported') result.imported += 1;
        if (outcome === 'pending-binding') result.pendingBinding += 1;
        if (outcome !== 'pending-binding' && outcome !== 'paused') result.processed += 1;
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
        if (!row.linkId && row.taskId) {
          const taskBinding = await this.model.findBindingByTaskId(row.taskId);
          if (taskBinding && !linearBindingWriteEnabled(taskBinding)) {
            await this.model.updateOutbox(
              row.id,
              { availableAt: new Date(), lastError: null, lockedUntil: null, status: 'paused' },
              lease,
            );
            continue;
          }
        }
        if (!row.linkId) throw new Error('Linear outbox row has no issue link');
        const issueLink = await this.model.findIssueLinkById(row.linkId);
        if (!issueLink) throw new Error('Linear issue link no longer exists');

        const [binding, installation] = await Promise.all([
          this.model.findBindingById(issueLink.bindingId),
          this.model.findInstallationById(issueLink.installationId),
        ]);
        if (!binding || !installation || installation.status !== 'active') {
          throw new Error('Linear issue link scope is unavailable');
        }
        if (
          binding.installationId !== installation.id ||
          issueLink.organizationId !== installation.organizationId
        ) {
          throw new Error('Linear issue link installation scope does not match');
        }
        if (!linearBindingWriteEnabled(binding)) {
          await this.model.updateOutbox(
            row.id,
            { availableAt: new Date(), lastError: null, lockedUntil: null, status: 'paused' },
            lease,
          );
          continue;
        }

        const updateInput = row.payload as LinearIssueUpdateInput;
        const current = await provider.getIssue(issueLink.linearIssueId);
        const integrationTasks = new LinearIntegrationTaskService(
          this.db,
          this.workspaceId,
          installation.id,
        );
        const task = await integrationTasks.findPublicTask(issueLink.taskId);
        if (
          !task ||
          task.visibility !== 'public' ||
          task.projectId !== binding.projectId ||
          current.projectId !== binding.linearProjectId ||
          !(await integrationTasks.validateIssueScope({ binding, installation, issue: current }))
        ) {
          throw new Error('Linear outbound write is outside the validated public binding scope');
        }
        const latestBinding = await this.model.findBindingById(binding.id);
        if (!latestBinding || !linearBindingWriteEnabled(latestBinding)) {
          await this.model.updateOutbox(
            row.id,
            { availableAt: new Date(), lastError: null, lockedUntil: null, status: 'paused' },
            lease,
          );
          continue;
        }
        const updated = remoteMatchesUpdate(current, updateInput)
          ? current
          : await (async () => {
              if (!(await this.model.hasCurrentOutboxLease(row.id, lease))) {
                throw new LinearSyncLeaseLostError();
              }
              const beforeMutationBinding = await this.model.findBindingById(binding.id);
              if (!beforeMutationBinding || !linearBindingWriteEnabled(beforeMutationBinding)) {
                await this.model.updateOutbox(
                  row.id,
                  { availableAt: new Date(), lastError: null, lockedUntil: null, status: 'paused' },
                  lease,
                );
                throw new LinearSyncLeaseLostError();
              }
              providerWriteAttempted = true;
              return provider.updateIssue(issueLink.linearIssueId, updateInput);
            })();

        const settled = await this.model.settleOutbox(row.id, lease, {
          issueLinkId: issueLink.id,
          remoteSnapshot: updated,
        });
        if (!settled) {
          if (providerWriteAttempted) {
            await this.model.markOutboxOutcomeUnknownAfterFence(row.id, lease.fence);
          }
          continue;
        }
        result.sent += 1;
      } catch (error) {
        if (error instanceof LinearSyncLeaseLostError) {
          if (providerWriteAttempted) {
            await this.model.markOutboxOutcomeUnknownAfterFence(row.id, lease.fence);
          }
          continue;
        }

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

    if (!linearBindingReadEnabled(binding)) {
      return {
        failed: 0,
        imported: 0,
        pendingBinding: 0,
        processed: 0,
        completed: false,
        nextCursor:
          binding.importPhase === 'reconciliation'
            ? binding.importReconciliationCursor
            : binding.importCursor,
      };
    }

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
        if (outcome !== 'pending-binding' && outcome !== 'paused') result.processed += 1;
        if (outcome === 'pending-binding' || outcome === 'paused') pageBlocked = true;
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
    row: LinearInboundRow,
    provider: LinearIssueProvider,
    context: {
      db?: LobeChatDatabase;
      historicalImport?: boolean;
      knownIssue?: LinearIssueSnapshot;
      model?: LinearSyncModel;
      phase?: 'initial' | 'reconciliation';
    } = {},
  ): Promise<'imported' | 'paused' | 'pending-binding' | 'processed'> {
    if (!row.subjectId) return 'processed';

    const db = context.db ?? this.db;
    const model = context.model ?? this.model;
    const issue = context.knownIssue ?? (await provider.getIssue(row.subjectId));
    const existingLink = await model.findIssueLinkByExternalId(issue.id);
    const installation = await model.findInstallationById(row.installationId);
    if (!installation) throw new Error('Linear installation not found');
    if (installation.status !== 'active') throw new Error('Linear installation is unavailable');

    if (row.action === 'remove' && row.eventType === 'Issue') {
      if (existingLink) {
        await model.updateIssueLink(existingLink.id, {
          conflict: null,
          lastInboundDeliveryId: row.id,
          remoteSnapshot: issue,
          remoteUpdatedAt: issue.updatedAt ? new Date(issue.updatedAt) : null,
          syncState: 'removed',
        });
      }
      return 'processed';
    }

    const binding = issue.projectId
      ? await model.lockBindingByLinearProjectId(issue.projectId)
      : null;
    if (!binding) return 'pending-binding';
    if (!linearBindingReadEnabled(binding)) return 'paused';

    const integrationTasks = new LinearIntegrationTaskService(
      db,
      this.workspaceId,
      installation.id,
    );
    const inScope = await integrationTasks.validateIssueScope({
      binding,
      installation,
      issue,
    });
    if (!inScope) {
      if (existingLink) {
        await model.updateIssueLink(existingLink.id, {
          lastInboundDeliveryId: row.id,
          remoteSnapshot: issue,
          remoteUpdatedAt: issue.updatedAt ? new Date(issue.updatedAt) : null,
          syncState: 'removed',
        });
      }
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

    if (issue.archivedAt) {
      if (existingLink) {
        await model.updateIssueLink(existingLink.id, {
          conflict: null,
          lastInboundDeliveryId: row.id,
          remoteSnapshot: issue,
          remoteUpdatedAt: issue.updatedAt ? new Date(issue.updatedAt) : null,
          syncState: 'removed',
        });
      }
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

    if (!existingLink) {
      const task = await integrationTasks.createPublicTask({
        binding,
        installation,
        issue,
        mutation: {
          eventId: row.id,
          idempotencyKey: `linear:import:${row.id}`,
          source: 'linear',
          suppressDomainEvent: context.historicalImport,
          suppressLinearOutbox: true,
        },
      });
      if (!task) return 'processed';
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

    const incomingUpdatedAt = issue.updatedAt ? new Date(issue.updatedAt) : null;
    if (
      incomingUpdatedAt &&
      Number.isFinite(incomingUpdatedAt.getTime()) &&
      existingLink.remoteUpdatedAt &&
      incomingUpdatedAt.getTime() <= existingLink.remoteUpdatedAt.getTime()
    ) {
      await model.updateIssueLink(existingLink.id, { lastInboundDeliveryId: row.id });
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

    const task = await integrationTasks.findPublicTask(existingLink.taskId);
    if (!task || task.projectId !== binding.projectId || task.visibility !== 'public') {
      await model.updateIssueLink(existingLink.id, {
        lastInboundDeliveryId: row.id,
        remoteSnapshot: issue,
        remoteUpdatedAt: incomingUpdatedAt,
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
        remoteUpdatedAt: incomingUpdatedAt,
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

    const patch = remoteTaskPatch(
      task,
      merged.merged,
      existingLink.lastConfirmedSnapshot,
      local,
      issue,
      binding.settings,
    );
    if (Object.keys(patch).length > 0) {
      await integrationTasks.updatePublicTask(task.id, patch, {
        eventId: row.id,
        idempotencyKey: `linear:task-update:${row.id}`,
        source: 'linear',
        suppressDomainEvent: context.historicalImport,
        suppressLinearOutbox: true,
      });
    }

    const localChanged = changedLinearIssueFields(existingLink.lastConfirmedSnapshot, local).filter(
      (field) => field !== 'labelIds',
    );
    if (localChanged.length > 0) {
      const payload = Object.fromEntries(
        localChanged.flatMap((field) =>
          local[field] === undefined ? [] : [[field, local[field]]],
        ),
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
      remoteUpdatedAt: incomingUpdatedAt,
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
