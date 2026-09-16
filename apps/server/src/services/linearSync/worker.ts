import type { LinearIssueSnapshot, LinearProjectBindingSettings, TaskItem } from '@orvilo/types';
import { and, eq } from 'drizzle-orm';

import { LinearSyncModel } from '@/database/models/linearSync';
import { TaskModel } from '@/database/models/task';
import { tasks } from '@/database/schemas/task';
import type { LobeChatDatabase } from '@/database/type';
import { TaskService } from '@/server/services/task';

import { changedLinearIssueFields, mergeLinearIssueSnapshots } from './merge';
import type { LinearIssueProvider } from './provider';

export class LinearBindingPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinearBindingPendingError';
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

export class LinearSyncWorker {
  private readonly db: LobeChatDatabase;
  private readonly model: LinearSyncModel;
  private readonly workspaceId: string;

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
    const rows = await this.model.claimInbox(limit, 60_000, installationId);
    const result: LinearWorkerResult = {
      failed: 0,
      imported: 0,
      pendingBinding: 0,
      processed: 0,
    };

    for (const row of rows) {
      try {
        const outcome = await this.processRow(row, provider);
        if (outcome === 'imported') result.imported += 1;
        if (outcome === 'pending-binding') result.pendingBinding += 1;
        if (outcome !== 'pending-binding') result.processed += 1;

        await this.model.updateInbox(row.id, {
          availableAt: outcome === 'pending-binding' ? new Date(Date.now() + 60_000) : new Date(),
          lastError: null,
          lockedUntil: null,
          processedAt: outcome === 'pending-binding' ? null : new Date(),
          status: outcome === 'pending-binding' ? 'pending_binding' : 'processed',
        });
      } catch (error) {
        result.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        await this.model.updateInbox(row.id, {
          availableAt: new Date(Date.now() + 60_000),
          lastError: message.slice(0, 2_000),
          lockedUntil: null,
          status: 'failed',
        });
      }
    }

    return result;
  }

  async processOutbox(
    provider: LinearIssueProvider,
    limit = 20,
    installationId?: string,
  ): Promise<LinearOutboxWorkerResult> {
    const rows = await this.model.claimOutbox(limit, 60_000, installationId);
    const result: LinearOutboxWorkerResult = { failed: 0, sent: 0 };

    for (const row of rows) {
      try {
        if (!row.linkId) throw new Error('Linear outbox row has no issue link');
        const issueLink = await this.model.findIssueLinkById(row.linkId);
        if (!issueLink) throw new Error('Linear issue link no longer exists');

        const updated = await provider.updateIssue(
          issueLink.linearIssueId,
          row.payload as {
            assigneeId?: string | null;
            description?: string | null;
            priority?: number | null;
            projectId?: string | null;
            stateId?: string | null;
            title?: string;
          },
        );
        await this.model.updateIssueLink(issueLink.id, {
          conflict: null,
          lastConfirmedSnapshot: updated,
          remoteSnapshot: updated,
          syncState: 'synced',
        });
        await this.model.updateOutbox(row.id, {
          lastError: null,
          lockedUntil: null,
          sentAt: new Date(),
          status: 'sent',
        });
        result.sent += 1;
      } catch (error) {
        result.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        await this.model.updateOutbox(row.id, {
          availableAt: new Date(Date.now() + 60_000),
          lastError: message.slice(0, 2_000),
          lockedUntil: null,
          status: 'failed',
        });
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

    const page = await provider.listIssues(binding.linearProjectId, limit, binding.importCursor);
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

    for (const issue of page.issues) {
      try {
        const outcome = await this.processRow(
          {
            id: `linear-import:${binding.id}:${issue.id}`,
            installationId: installation.id,
            subjectId: issue.id,
          },
          pageProvider,
        );
        if (outcome === 'imported') result.imported += 1;
        if (outcome === 'pending-binding') result.pendingBinding += 1;
        if (outcome !== 'pending-binding') result.processed += 1;
      } catch (error) {
        result.failed += 1;
        console.error('[linear:import]', error);
      }
    }

    const nextCursor = page.hasNextPage ? page.endCursor : null;
    await this.model.updateBindingImportCursor(binding.id, nextCursor, !page.hasNextPage);
    return { ...result, completed: !page.hasNextPage, nextCursor };
  }

  private async processRow(
    row: { installationId: string; subjectId: string | null; id: string },
    provider: LinearIssueProvider,
  ): Promise<'imported' | 'pending-binding' | 'processed'> {
    if (!row.subjectId) return 'processed';

    const issue = await provider.getIssue(row.subjectId);
    const binding = issue.projectId
      ? await this.model.findBindingByLinearProjectId(issue.projectId)
      : null;
    if (!binding) return 'pending-binding';
    if (!binding.syncEnabled) return 'processed';

    const installation = await this.model.findInstallationById(row.installationId);
    if (!installation?.installedByUserId) {
      throw new Error('Linear installation has no active Orvilo owner');
    }

    const existingLink = await this.model.findIssueLinkByExternalId(issue.id);
    if (!existingLink) {
      if (!binding.defaultTeamId) {
        throw new Error('Linear project binding has no default team');
      }

      const task = await new TaskService(
        this.db,
        installation.installedByUserId,
        this.workspaceId,
      ).createTask({
        assigneeAgentId: settingsAssignmentAgent(binding.settings, issue.assigneeId),
        assigneeUserId: settingsAssignmentUser(binding.settings, issue.assigneeId),
        description: issue.description?.slice(0, 255),
        instruction: issue.description || issue.title,
        name: issue.title,
        priority: taskPriority(issue.priority),
        projectId: binding.projectId,
        visibility: 'public',
      });
      const initialStatus = binding.settings.statusMappings?.find(
        (mapping) => mapping.linearStateId === issue.stateId,
      )?.localStatus;
      if (initialStatus) {
        await new TaskModel(this.db, installation.installedByUserId, this.workspaceId).update(
          task.id,
          { status: initialStatus },
        );
      }
      await this.model.createIssueLink({
        bindingId: binding.id,
        installationId: installation.id,
        linearIdentifier: issue.identifier,
        linearIssueId: issue.id,
        organizationId: installation.organizationId,
        remoteSnapshot: issue,
        taskId: task.id,
      });
      await this.model.recordDomainEvent({
        eventId: row.id,
        idempotencyKey: `linear:import:${row.id}`,
        payload: { issueId: issue.id, taskId: task.id },
        projectId: binding.projectId,
        source: 'linear',
        taskId: task.id,
        type: 'task.created',
      });
      return 'imported';
    }

    const [task] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, existingLink.taskId), eq(tasks.workspaceId, this.workspaceId)))
      .limit(1);
    if (!task) {
      await this.model.updateIssueLink(existingLink.id, {
        lastInboundDeliveryId: row.id,
        remoteSnapshot: issue,
        syncState: 'removed',
      });
      return 'processed';
    }

    const local = taskSnapshot(task, issue, binding.settings);
    const merged = mergeLinearIssueSnapshots({
      base: existingLink.lastConfirmedSnapshot,
      local,
      remote: issue,
    });
    if (merged.conflicts) {
      await this.model.updateIssueLink(existingLink.id, {
        conflict: merged.conflicts,
        lastInboundDeliveryId: row.id,
        remoteSnapshot: issue,
        syncState: 'conflict',
      });
      return 'processed';
    }

    const taskModel = new TaskModel(this.db, task.createdByUserId, this.workspaceId);
    const patch = remoteTaskPatch(
      task,
      merged.merged,
      existingLink.lastConfirmedSnapshot,
      local,
      issue,
      binding.settings,
    );
    if (Object.keys(patch).length > 0) {
      const updatedTask = await taskModel.update(task.id, patch);
      if (updatedTask) {
        const eventType =
          patch.assigneeAgentId !== undefined || patch.assigneeUserId !== undefined
            ? 'task.assigned'
            : patch.status !== undefined
              ? 'task.status.changed'
              : 'task.requirement.changed';
        await this.model.recordDomainEvent({
          eventId: row.id,
          idempotencyKey: `linear:task-update:${row.id}`,
          payload: { issueId: issue.id, patch },
          projectId: binding.projectId,
          source: 'linear',
          taskId: task.id,
          type: eventType,
        });
      }
    }

    const localChanged = changedLinearIssueFields(existingLink.lastConfirmedSnapshot, local);
    if (localChanged.length > 0) {
      const payload = Object.fromEntries(
        localChanged.map((field) => [field, local[field] ?? null]),
      );
      await this.model.queueOutbox({
        expectedLocalRevision: task.updatedAt.getTime(),
        installationId: installation.id,
        linkId: existingLink.id,
        operation: 'update_issue',
        payload,
        taskId: task.id,
      });
    }

    await this.model.updateIssueLink(existingLink.id, {
      conflict: null,
      lastConfirmedSnapshot: issue,
      lastInboundDeliveryId: row.id,
      remoteSnapshot: issue,
      syncState: localChanged.length > 0 ? 'pending' : 'synced',
    });
    return 'processed';
  }
}

const settingsAssignmentAgent = (
  settings: LinearProjectBindingSettings,
  linearUserId?: string | null,
) => settings.assignmentMappings?.find((mapping) => mapping.linearUserId === linearUserId)?.orviloAgentId;

const settingsAssignmentUser = (
  settings: LinearProjectBindingSettings,
  linearUserId?: string | null,
) => settings.assignmentMappings?.find((mapping) => mapping.linearUserId === linearUserId)?.orviloUserId;
