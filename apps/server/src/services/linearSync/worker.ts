import { randomUUID } from 'node:crypto';

import type {
  LinearCommentSnapshot,
  LinearExternalCommentOutboxPayload,
  LinearExternalRelationOutboxPayload,
  LinearIssueSnapshot,
  LinearProjectBindingSettings,
  LinearProjectSnapshot,
  LinearRelationKind,
  LinearRelationSnapshot,
  LinearSyncTombstone,
  TaskItem,
  TaskWorkflowCategory,
} from '@orvilo/types';
import { eq, inArray } from 'drizzle-orm';

import {
  LINEAR_SYNC_DEFAULT_LEASE_MS,
  LINEAR_SYNC_MAX_ATTEMPTS,
  linearBindingReadEnabled,
  linearBindingWriteEnabled,
  type LinearSyncLease,
  LinearSyncModel,
  linearSyncRetryDelayMs,
} from '@/database/models/linearSync';
import { ProjectModel } from '@/database/models/project';
import type { TaskModel } from '@/database/models/task';
import { TeamModel } from '@/database/models/team';
import { tasks } from '@/database/schemas/task';
import type { LobeChatDatabase } from '@/database/type';

import { LinearIntegrationTaskService } from './integrationTask';
import {
  changedLinearIssueFields,
  mergeLinearIssueSnapshots,
  taskLinearIssueSnapshot,
} from './merge';
import {
  type LinearIssueProvider,
  type LinearIssueUpdateInput,
  LinearRemoteAuthError,
  LinearRemoteResourceError,
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

class LinearCreateOutcomeUnknownError extends Error {
  constructor() {
    super('Linear issue creation outcome is unknown and requires reconciliation');
    this.name = 'LinearCreateOutcomeUnknownError';
  }
}

class LinearSyncPausedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinearSyncPausedError';
  }
}

class LinearProviderWriteAttemptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinearProviderWriteAttemptedError';
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

/** Linear workflow-state `type` → the board's stable local category. */
const linearStateCategory = (type: string | null): TaskWorkflowCategory => {
  switch (type) {
    case 'started': {
      return 'in_progress';
    }
    case 'completed': {
      return 'done';
    }
    case 'canceled': {
      return 'canceled';
    }
    case 'triage': {
      return 'triage';
    }
    case 'unstarted': {
      return 'todo';
    }
    default: {
      return 'backlog';
    }
  }
};

const isLinearFieldHumanLocked = (task: TaskItem, field: keyof LinearIssueSnapshot) => {
  if (field === 'title' || field === 'description') return task.requirementLocked;
  if (field === 'assigneeId') return task.assigneeLocked;
  if (field === 'priority') return task.priorityLocked;
  if (field === 'stateId') return task.workflowLocked;
  return false;
};

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

  if (
    remoteChanged.includes('title') &&
    !localChanged.has('title') &&
    !isLinearFieldHumanLocked(task, 'title')
  ) {
    patch.name = merged.title;
  }
  if (
    remoteChanged.includes('description') &&
    !localChanged.has('description') &&
    !isLinearFieldHumanLocked(task, 'description')
  ) {
    patch.description = merged.description?.slice(0, 255);
    patch.editorData = null;
    patch.instruction = merged.description ?? '';
  }
  if (
    remoteChanged.includes('priority') &&
    !localChanged.has('priority') &&
    !isLinearFieldHumanLocked(task, 'priority')
  ) {
    patch.priority = taskPriority(merged.priority);
  }
  if (
    remoteChanged.includes('stateId') &&
    !localChanged.has('stateId') &&
    !isLinearFieldHumanLocked(task, 'stateId')
  ) {
    const statusMapping = settings.statusMappings?.find(
      (mapping) => mapping.linearStateId === merged.stateId,
    );
    patch.workflowStateId = merged.stateId;
    if (statusMapping?.workflowCategory) {
      patch.workflowCategory = statusMapping.workflowCategory;
    }
  }
  if (
    remoteChanged.includes('assigneeId') &&
    !localChanged.has('assigneeId') &&
    !isLinearFieldHumanLocked(task, 'assigneeId')
  ) {
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

export const projectLinearRelation = (input: {
  kind: LinearRelationSnapshot['kind'];
  sameProject: boolean;
  sourceTaskId: string | null;
  targetTaskId: string | null;
}) => {
  const resolved = Boolean(input.sameProject && input.sourceTaskId && input.targetTaskId);
  if (!resolved)
    return { dependency: null, parentTaskId: null, resolutionState: 'unresolved' as const };
  if (input.kind === 'parent') {
    return {
      dependency: null,
      parentTaskId: input.targetTaskId,
      resolutionState: 'resolved' as const,
    };
  }
  return {
    dependency: {
      dependsOnTaskId: input.kind === 'blocks' ? input.sourceTaskId : input.targetTaskId,
      taskId: input.kind === 'blocks' ? input.targetTaskId : input.sourceTaskId,
      type: input.kind as Exclude<LinearRelationKind, 'parent'>,
    },
    parentTaskId: null,
    resolutionState: 'resolved' as const,
  };
};

const retryAt = (attempts: number) => new Date(Date.now() + linearSyncRetryDelayMs(attempts));

type LinearInboundRow = {
  action?: string;
  eventType?: string;
  id: string;
  installationId: string;
  payload?: unknown;
  subjectId: string | null;
};

type SignedIssueRemovalSnapshot = Pick<LinearIssueSnapshot, 'id'> &
  Partial<Omit<LinearIssueSnapshot, 'id'>>;

const issueFromSignedRemovePayload = (row: LinearInboundRow): SignedIssueRemovalSnapshot => {
  const payload = row.payload;
  const value =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).data
      : undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Linear remove webhook payload does not contain an issue snapshot');
  }
  const issueId = (value as { id?: unknown }).id;
  if (typeof issueId !== 'string' || issueId !== row.subjectId) {
    throw new Error('Linear remove webhook payload does not match its subject');
  }
  try {
    return normalizeLinearIssue(value);
  } catch {
    // Remove webhooks are authenticated, but Linear may send only identity and
    // scope fields after the remote issue has already disappeared. The durable
    // issue link supplies the last complete snapshot in processIssueDeletionRow.
    return { id: issueId };
  }
};

export const issueRelationsWithParent = (
  issue: LinearIssueSnapshot,
  relations: LinearRelationSnapshot[],
): LinearRelationSnapshot[] => {
  const withoutParent = relations.filter(
    (relation) => !(relation.kind === 'parent' && relation.sourceIssueId === issue.id),
  );
  return issue.parentId
    ? [
        ...withoutParent,
        {
          id: `parent:${issue.id}`,
          kind: 'parent',
          sourceIssueId: issue.id,
          targetIssueId: issue.parentId,
        },
      ]
    : withoutParent;
};

const isRemoteRemoval = (action: string) =>
  action === 'delete' || action === 'deleted' || action === 'remove';

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

  private async ensureCurrentOutboxLease(
    row: Awaited<ReturnType<LinearSyncModel['claimOutbox']>>[number],
    lease: LinearSyncLease,
  ) {
    if (!(await this.model.hasCurrentOutboxLease(row.id, lease))) {
      throw new LinearSyncLeaseLostError();
    }
  }

  private async ensureOutboundIssueScope(
    row: Awaited<ReturnType<LinearSyncModel['claimOutbox']>>[number],
    issueLink: NonNullable<Awaited<ReturnType<LinearSyncModel['findIssueLinkById']>>>,
    provider: LinearIssueProvider,
  ) {
    const [binding, installation, teamLink] = await Promise.all([
      issueLink.bindingId ? this.model.findBindingById(issueLink.bindingId) : Promise.resolve(null),
      this.model.findInstallationById(issueLink.installationId),
      // Team-scope links carry bindingId = null — their write scope is the
      // team link established by the workspace import, not a project binding.
      !issueLink.bindingId && issueLink.linearTeamId
        ? this.model.findTeamLinkByLinearTeamId(issueLink.linearTeamId)
        : Promise.resolve(null),
    ]);
    if (
      (!binding && !teamLink) ||
      !installation ||
      installation.status !== 'active' ||
      row.installationId !== installation.id ||
      (binding && binding.installationId !== installation.id) ||
      issueLink.organizationId !== installation.organizationId
    ) {
      throw new LinearSyncPausedError('Linear external write scope is unavailable');
    }
    if (binding && !linearBindingWriteEnabled(binding)) {
      throw new LinearSyncPausedError('Linear external write binding is disabled');
    }
    if (!binding && teamLink!.syncState !== 'synced') {
      throw new LinearSyncPausedError('Linear external write team link is not synced');
    }
    const remoteIssue = await provider.getIssue(issueLink.linearIssueId);
    const integrationTasks = new LinearIntegrationTaskService(
      this.db,
      this.workspaceId,
      installation.id,
    );
    const task = await integrationTasks.findPublicTask(issueLink.taskId);
    if (binding) {
      if (
        !task ||
        task.visibility !== 'public' ||
        task.projectId !== binding.projectId ||
        remoteIssue.projectId !== binding.linearProjectId ||
        !(await integrationTasks.validateIssueScope({ binding, installation, issue: remoteIssue }))
      ) {
        throw new Error('Linear external write is outside the validated public binding scope');
      }
    } else {
      if (
        !task ||
        task.visibility !== 'public' ||
        task.teamId !== teamLink!.teamId ||
        remoteIssue.teamId !== teamLink!.linearTeamId
      ) {
        throw new Error('Linear external write is outside the validated team scope');
      }
      if (remoteIssue.projectId) {
        // The remote issue moved into a Linear project — pause until the
        // inbound pass attaches a binding to the link, then write through
        // the binding path.
        throw new LinearSyncPausedError('Linear issue moved into a project scope');
      }
    }
    return { binding, installation, remoteIssue, task, teamLink };
  }

  private async ensureExternalMutationAllowed(
    row: Awaited<ReturnType<LinearSyncModel['claimOutbox']>>[number],
    scope: Awaited<ReturnType<LinearSyncWorker['ensureOutboundIssueScope']>>,
    lease: LinearSyncLease,
  ) {
    await this.ensureCurrentOutboxLease(row, lease);
    if (scope.binding) {
      const binding = await this.model.findBindingById(scope.binding.id);
      if (!binding || !linearBindingWriteEnabled(binding)) {
        throw new LinearSyncPausedError('Linear external write binding is disabled');
      }
      return;
    }
    if (scope.teamLink) {
      const teamLink = await this.model.findTeamLinkByLinearTeamId(scope.teamLink.linearTeamId);
      if (!teamLink || teamLink.syncState !== 'synced') {
        throw new LinearSyncPausedError('Linear external write team link is not synced');
      }
    }
  }

  private async runExternalMutation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof LinearRemoteAuthError) throw error;
      throw new LinearProviderWriteAttemptedError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async requireExternalSettlement<T>(
    row: Awaited<ReturnType<LinearSyncModel['claimOutbox']>>[number],
    lease: LinearSyncLease,
    settled: T | null,
  ): Promise<T> {
    if (settled) return settled;
    await this.model.markOutboxOutcomeUnknownAfterFence(row.id, lease.fence);
    throw new LinearSyncLeaseLostError();
  }

  private async clearCrossProjectEdgesBeforeMove(
    db: LobeChatDatabase,
    integrationTasks: LinearIntegrationTaskService,
    task: TaskItem,
    destinationProjectId: string,
    deliveryId: string,
    historicalImport: boolean,
  ) {
    const [parent, dependencies, dependents] = await Promise.all([
      task.parentTaskId
        ? db
            .select({ id: tasks.id, projectId: tasks.projectId })
            .from(tasks)
            .where(eq(tasks.id, task.parentTaskId))
            .limit(1)
        : Promise.resolve([]),
      integrationTasks.getPublicDependencies(task.id),
      integrationTasks.getPublicDependents(task.id),
    ]);
    const edgeTaskIds = [
      ...parent.map(({ id }) => id),
      ...dependencies.map(({ dependsOnId }) => dependsOnId),
      ...dependents.map(({ taskId }) => taskId),
    ];
    const projectRows =
      edgeTaskIds.length > 0
        ? await db
            .select({ id: tasks.id, projectId: tasks.projectId })
            .from(tasks)
            .where(inArray(tasks.id, edgeTaskIds))
        : [];
    const projectByTaskId = new Map(projectRows.map((row) => [row.id, row.projectId]));
    const crossesBoundary = (otherTaskId: string) => {
      const otherProjectId = projectByTaskId.get(otherTaskId);
      return Boolean(
        (otherProjectId || destinationProjectId) && otherProjectId !== destinationProjectId,
      );
    };
    const mutationForEdge = (edgeKey: string) => ({
      eventId: `${deliveryId}:${edgeKey}`,
      idempotencyKey: `linear:project-move:${deliveryId}:${edgeKey}`,
      source: 'linear' as const,
      suppressDomainEvent: historicalImport,
      suppressLinearOutbox: true,
    });

    if (parent[0] && crossesBoundary(parent[0].id)) {
      await integrationTasks.updatePublicTask(
        task.id,
        { parentTaskId: null },
        mutationForEdge(`parent:${task.id}:${parent[0].id}`),
      );
    }
    for (const dependency of dependencies) {
      if (crossesBoundary(dependency.dependsOnId)) {
        await integrationTasks.removePublicDependency(
          task.id,
          dependency.dependsOnId,
          mutationForEdge(`dependency:${task.id}:${dependency.dependsOnId}`),
        );
      }
    }
    for (const dependent of dependents) {
      if (crossesBoundary(dependent.taskId)) {
        await integrationTasks.removePublicDependency(
          dependent.taskId,
          task.id,
          mutationForEdge(`dependency:${dependent.taskId}:${task.id}`),
        );
      }
    }
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
        const installation = await this.model.findInstallationById(row.installationId);
        if (!installation || installation.status !== 'active') {
          const status = installation?.status === 'revoked' ? 'revoked' : 'paused';
          await this.model.updateInbox(
            row.id,
            {
              availableAt: new Date(Date.now() + 60_000),
              lastError:
                status === 'revoked'
                  ? 'Linear installation is revoked; reauthorization is required'
                  : 'Linear installation is paused',
              lockedUntil: null,
              processedAt: null,
              status: 'paused',
            },
            lease,
          );
          continue;
        }
        // Provider I/O stays outside the database transaction. Once the issue
        // snapshot is available, the Task/link/event/receipt mutations commit
        // together so a crash can only replay the complete local command.
        let outcome: 'imported' | 'paused' | 'pending-binding' | 'processed' = 'processed';
        if (row.eventType === 'Comment' && row.subjectId && isRemoteRemoval(row.action)) {
          outcome = await this.model.transaction((model, db) =>
            this.processCommentDeletionRow(row, { db, model }),
          );
        } else if (row.eventType === 'Comment' && row.subjectId) {
          const comment = await provider.getComment(row.subjectId);
          outcome = await this.model.transaction((model, db) =>
            this.processCommentRow(row, comment, { db, model }),
          );
        } else if (
          row.eventType === 'IssueRelation' &&
          row.subjectId &&
          isRemoteRemoval(row.action)
        ) {
          outcome = await this.model.transaction((model, db) =>
            this.processRelationDeletionRow(row, { db, model }),
          );
        } else if (row.eventType === 'IssueRelation' && row.subjectId) {
          const relation = await provider.getRelation(row.subjectId);
          outcome = await this.model.transaction((model, db) =>
            this.processRelationRow(row, relation, { db, model }),
          );
        } else if (row.eventType === 'Issue' && row.subjectId && isRemoteRemoval(row.action)) {
          outcome = await this.model.transaction((model) =>
            this.processIssueDeletionRow(row, model, issueFromSignedRemovePayload(row)),
          );
        } else if (row.eventType === 'Issue' && row.subjectId) {
          const knownIssue = await provider.getIssue(row.subjectId);
          const knownRelations = issueRelationsWithParent(
            knownIssue,
            await provider.listRelations(knownIssue.id),
          );
          outcome = await this.model.transaction((model, db) =>
            this.processRow(row, provider, { db, knownIssue, knownRelations, model }),
          );
        }
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
        if (error instanceof LinearRemoteAuthError) {
          const settled = await this.model.updateInbox(
            row.id,
            {
              availableAt: new Date(Date.now() + 60_000),
              lastError: error.message,
              lockedUntil: null,
              processedAt: null,
              status: 'paused',
            },
            lease,
          );
          if (settled) result.failed += 1;
          continue;
        }
        if (await this.handleRemoteTombstone(row, error)) {
          const settled = await this.model.updateInbox(
            row.id,
            { lastError: null, lockedUntil: null, processedAt: new Date(), status: 'processed' },
            lease,
          );
          if (settled) result.processed += 1;
          continue;
        }
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
        if (row.operation?.startsWith('linear-issue:create:')) {
          const settled = await this.processCreateIssueOutboxRow(row, provider, lease);
          if (!settled) continue;
          result.sent += 1;
          continue;
        }
        const outboxInstallation = await this.model.findInstallationById(row.installationId);
        if (!outboxInstallation || outboxInstallation.status !== 'active') {
          throw new LinearSyncPausedError('Linear installation is not active');
        }
        if (row.operation?.startsWith('linear-comment:')) {
          const settled = await this.processCommentOutboxRow(row, provider, lease);
          if (!settled) continue;
          result.sent += 1;
          continue;
        }
        if (row.operation?.startsWith('linear-relation:')) {
          const settled = await this.processRelationOutboxRow(row, provider, lease);
          if (!settled) continue;
          result.sent += 1;
          continue;
        }
        if (!row.linkId) throw new Error('Linear outbox row has no issue link');
        const issueLink = await this.model.findIssueLinkById(row.linkId);
        if (!issueLink) throw new Error('Linear issue link no longer exists');
        if (issueLink.bindingId) {
          const binding = await this.model.findBindingById(issueLink.bindingId);
          if (binding && !linearBindingWriteEnabled(binding)) {
            throw new LinearSyncPausedError('Linear project binding is disabled');
          }
        }

        const [binding, installation] = await Promise.all([
          issueLink.bindingId
            ? this.model.findBindingById(issueLink.bindingId)
            : Promise.resolve(null),
          this.model.findInstallationById(issueLink.installationId),
        ]);
        // Team-scope links carry bindingId = null — their write scope is the
        // team link established by the workspace import, not a project binding.
        const teamLink =
          !binding && issueLink.linearTeamId
            ? await this.model.findTeamLinkByLinearTeamId(issueLink.linearTeamId)
            : null;
        if ((!binding && !teamLink) || !installation || installation.status !== 'active') {
          throw new Error('Linear issue link scope is unavailable');
        }
        if (
          binding &&
          (binding.installationId !== installation.id ||
            issueLink.organizationId !== installation.organizationId)
        ) {
          throw new Error('Linear issue link installation scope does not match');
        }
        const writeEnabled = binding
          ? linearBindingWriteEnabled(binding)
          : teamLink!.syncState === 'synced';
        if (!writeEnabled) {
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
        if (binding) {
          if (
            !task ||
            task.visibility !== 'public' ||
            task.projectId !== binding.projectId ||
            current.projectId !== binding.linearProjectId ||
            !(await integrationTasks.validateIssueScope({ binding, installation, issue: current }))
          ) {
            throw new Error('Linear outbound write is outside the validated public binding scope');
          }
        } else {
          if (
            !task ||
            task.visibility !== 'public' ||
            task.teamId !== teamLink!.teamId ||
            current.teamId !== teamLink!.linearTeamId
          ) {
            throw new Error('Linear outbound write is outside the validated team scope');
          }
          if (current.projectId) {
            // The remote issue moved into a Linear project — pause until the
            // inbound pass attaches a binding to the link, then write through
            // the binding path.
            await this.model.updateOutbox(
              row.id,
              { availableAt: new Date(), lastError: null, lockedUntil: null, status: 'paused' },
              lease,
            );
            continue;
          }
        }

        const base = issueLink.lastConfirmedSnapshot;
        const local = { ...base, ...updateInput };
        const merged = mergeLinearIssueSnapshots({ base, local, remote: current });
        if (merged.conflicts) {
          const conflict = {
            ...merged.conflicts,
            localRevision: task.domainRevision ?? row.expectedLocalRevision,
            remoteUpdatedAt: current.updatedAt ?? null,
          };
          await this.model.updateIssueLink(issueLink.id, {
            conflict,
            remoteSnapshot: current,
            remoteUpdatedAt: current.updatedAt ? new Date(current.updatedAt) : null,
            syncState: 'conflict',
          });
          const settled = await this.model.updateOutbox(
            row.id,
            {
              availableAt: new Date(),
              lastError: `Linear issue conflict on ${conflict.fields.join(', ')}`,
              lockedUntil: null,
              outcomeUnknownAt: null,
              status: 'failed',
            },
            lease,
          );
          if (settled) result.failed += 1;
          continue;
        }

        const localChanged = changedLinearIssueFields(base, local);
        const mergedInput = Object.fromEntries(
          localChanged
            .filter(
              (field) =>
                !remoteMatchesUpdate(current, {
                  [field]: merged.merged[field],
                } as LinearIssueUpdateInput),
            )
            .map((field) => [field, merged.merged[field]]),
        ) as LinearIssueUpdateInput;
        if (binding) {
          const latestBinding = await this.model.findBindingById(binding.id);
          if (!latestBinding || !linearBindingWriteEnabled(latestBinding)) {
            await this.model.updateOutbox(
              row.id,
              { availableAt: new Date(), lastError: null, lockedUntil: null, status: 'paused' },
              lease,
            );
            continue;
          }
        }
        const updated =
          Object.keys(mergedInput).length === 0
            ? current
            : await (async () => {
                if (!(await this.model.hasCurrentOutboxLease(row.id, lease))) {
                  throw new LinearSyncLeaseLostError();
                }
                const beforeMutationBinding = binding
                  ? await this.model.findBindingById(binding.id)
                  : null;
                const beforeMutationTeamLink = teamLink
                  ? await this.model.findTeamLinkByLinearTeamId(teamLink.linearTeamId)
                  : null;
                if (
                  (binding &&
                    (!beforeMutationBinding ||
                      !linearBindingWriteEnabled(beforeMutationBinding))) ||
                  (teamLink &&
                    (!beforeMutationTeamLink || beforeMutationTeamLink.syncState !== 'synced'))
                ) {
                  await this.model.updateOutbox(
                    row.id,
                    {
                      availableAt: new Date(),
                      lastError: null,
                      lockedUntil: null,
                      status: 'paused',
                    },
                    lease,
                  );
                  throw new LinearSyncLeaseLostError();
                }
                providerWriteAttempted = true;
                return provider.updateIssue(issueLink.linearIssueId, mergedInput);
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
        if (error instanceof LinearRemoteAuthError) {
          const settled = await this.model.updateOutbox(
            row.id,
            {
              availableAt: new Date(Date.now() + 60_000),
              lastError: error.message,
              lockedUntil: null,
              outcomeUnknownAt: null,
              status: 'paused',
            },
            lease,
          );
          if (settled) result.failed += 1;
          continue;
        }
        if (error instanceof LinearSyncPausedError) {
          await this.model.updateOutbox(
            row.id,
            {
              availableAt: new Date(Date.now() + 60_000),
              lastError: null,
              lockedUntil: null,
              outcomeUnknownAt: null,
              status: 'paused',
            },
            lease,
          );
          continue;
        }

        const message = error instanceof Error ? error.message : String(error);
        const settled = await this.model.updateOutbox(
          row.id,
          {
            availableAt: retryAt(row.attempts),
            lastError: message.slice(0, 2_000),
            lockedUntil: null,
            outcomeUnknownAt:
              providerWriteAttempted ||
              error instanceof LinearProviderWriteAttemptedError ||
              error instanceof LinearCreateOutcomeUnknownError
                ? new Date()
                : null,
            status:
              row.attempts >= LINEAR_SYNC_MAX_ATTEMPTS
                ? 'dead_letter'
                : providerWriteAttempted ||
                    error instanceof LinearProviderWriteAttemptedError ||
                    error instanceof LinearCreateOutcomeUnknownError
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

  private async processCreateIssueOutboxRow(
    row: Awaited<ReturnType<LinearSyncModel['claimOutbox']>>[number],
    provider: LinearIssueProvider,
    lease: LinearSyncLease,
  ) {
    if (!(await this.model.hasCurrentOutboxLease(row.id, lease))) {
      throw new LinearSyncLeaseLostError();
    }
    const payload = row.payload as Record<string, unknown>;
    const bindingId = typeof payload.bindingId === 'string' ? payload.bindingId : null;
    const projectId = typeof payload.projectId === 'string' ? payload.projectId : null;
    const teamId = typeof payload.teamId === 'string' ? payload.teamId : null;
    const remoteIssueId = typeof payload.remoteIssueId === 'string' ? payload.remoteIssueId : null;
    const title = typeof payload.title === 'string' ? payload.title : null;
    const description = typeof payload.description === 'string' ? payload.description : null;
    if (!bindingId || !projectId || !teamId || !title || !remoteIssueId || !row.taskId) {
      throw new Error('Linear create_issue outbox payload is incomplete');
    }
    const binding = await this.model.findBindingById(bindingId);
    const installation = await this.model.findInstallationById(row.installationId);
    if (
      !binding ||
      !linearBindingWriteEnabled(binding) ||
      !installation ||
      installation.status !== 'active'
    ) {
      throw new LinearSyncPausedError('Linear create_issue binding is not active');
    }
    if (
      binding.installationId !== installation.id ||
      binding.linearProjectId !== projectId ||
      !binding.teamIds.includes(teamId) ||
      installation.organizationId.length === 0
    ) {
      throw new Error('Linear create_issue scope does not match the persisted public binding');
    }
    const integrationTasks = new LinearIntegrationTaskService(
      this.db,
      this.workspaceId,
      installation.id,
    );
    const task = await integrationTasks.findPublicTask(row.taskId);
    if (!task || task.visibility !== 'public' || task.projectId !== binding.projectId) {
      throw new Error('Linear create_issue task is outside the validated public binding scope');
    }
    const existingIssue = await provider.findIssueById(remoteIssueId);
    if (existingIssue) {
      if (
        existingIssue.id !== remoteIssueId ||
        existingIssue.projectId !== binding.linearProjectId ||
        !(await integrationTasks.validateIssueScope({
          binding,
          installation,
          issue: existingIssue,
        }))
      ) {
        throw new Error('Existing Linear create_issue identity is outside the validated scope');
      }
      return this.model.settleCreateIssueOutbox(row.id, lease, {
        bindingId: binding.id,
        installationId: installation.id,
        linearIdentifier: existingIssue.identifier,
        linearIssueId: existingIssue.id,
        organizationId: installation.organizationId,
        remoteSnapshot: existingIssue,
        taskId: row.taskId,
      });
    }
    await this.ensureCurrentOutboxLease(row, lease);
    const latestBinding = await this.model.findBindingById(binding.id);
    if (!latestBinding || !linearBindingWriteEnabled(latestBinding)) {
      throw new LinearSyncPausedError('Linear create_issue binding is disabled');
    }
    let issue: Awaited<ReturnType<LinearIssueProvider['createIssue']>>;
    try {
      issue = await provider.createIssue({
        description,
        id: remoteIssueId,
        projectId,
        teamId,
        title,
      });
    } catch (error) {
      if (error instanceof LinearRemoteAuthError) throw error;
      throw new LinearProviderWriteAttemptedError(
        error instanceof Error ? error.message : String(error),
      );
    }
    if (issue.id !== remoteIssueId) {
      throw new LinearProviderWriteAttemptedError(
        'Linear create_issue returned an unexpected remote identity',
      );
    }
    return this.model.settleCreateIssueOutbox(row.id, lease, {
      bindingId: binding.id,
      installationId: installation.id,
      linearIdentifier: issue.identifier,
      linearIssueId: issue.id,
      organizationId: installation.organizationId,
      remoteSnapshot: issue,
      taskId: row.taskId,
    });
  }

  private async processCommentOutboxRow(
    row: Awaited<ReturnType<LinearSyncModel['claimOutbox']>>[number],
    provider: LinearIssueProvider,
    lease: LinearSyncLease,
  ) {
    const payload = row.payload as Partial<LinearExternalCommentOutboxPayload> & {
      mappingId?: string;
    };
    const mappingId = typeof payload.mappingId === 'string' ? payload.mappingId : null;
    if (!mappingId) throw new Error('Linear comment outbox has no mapping');
    const mapping = await this.model.findExternalCommentById(mappingId);
    if (!mapping) throw new Error('Linear external comment mapping no longer exists');
    const issueLink = await this.model.findIssueLinkById(mapping.issueLinkId);
    if (!issueLink) throw new Error('Linear issue link no longer exists');
    const scope = await this.ensureOutboundIssueScope(row, issueLink, provider);
    const action = payload.action;

    if (action === 'create') {
      if (!mapping.linearCommentId) throw new Error('Linear comment has no preallocated identity');
      const existingComment = await provider.findCommentById(mapping.linearCommentId);
      if (existingComment) {
        if (existingComment.issueId !== issueLink.linearIssueId) {
          throw new Error('Linear comment identity belongs to another issue');
        }
        return this.model.settleExternalCommentOutbox(row.id, lease, {
          linearCommentId: existingComment.id,
          mappingId,
          remoteSnapshot: existingComment,
        });
      }
      if (typeof payload.body !== 'string') throw new Error('Linear comment body is missing');
      await this.ensureExternalMutationAllowed(row, scope, lease);
      const comment = await this.runExternalMutation(() =>
        provider.createComment({
          body: payload.body!,
          id: mapping.linearCommentId!,
          issueId: issueLink.linearIssueId,
        }),
      );
      if (comment.id !== mapping.linearCommentId || comment.issueId !== issueLink.linearIssueId) {
        throw new LinearProviderWriteAttemptedError(
          'Linear commentCreate returned an unexpected remote identity',
        );
      }
      return this.requireExternalSettlement(
        row,
        lease,
        await this.model.settleExternalCommentOutbox(row.id, lease, {
          linearCommentId: comment.id,
          mappingId,
          remoteSnapshot: comment,
        }),
      );
    }

    if (!mapping.linearCommentId) throw new Error('Linear comment has no remote identity');
    if (action === 'update') {
      if (typeof payload.body !== 'string') throw new Error('Linear comment body is missing');
      await this.ensureExternalMutationAllowed(row, scope, lease);
      const comment = await this.runExternalMutation(() =>
        provider.updateComment(mapping.linearCommentId!, { body: payload.body! }),
      );
      return this.requireExternalSettlement(
        row,
        lease,
        await this.model.settleExternalCommentOutbox(row.id, lease, {
          mappingId,
          remoteSnapshot: comment,
        }),
      );
    }
    if (action !== 'delete') throw new Error('Unknown Linear comment outbox action');
    await this.ensureExternalMutationAllowed(row, scope, lease);
    await this.runExternalMutation(() => provider.deleteComment(mapping.linearCommentId!));
    const tombstone: LinearSyncTombstone = {
      at: new Date().toISOString(),
      kind: 'deleted',
      source: 'orvilo',
    };
    return this.requireExternalSettlement(
      row,
      lease,
      await this.model.settleExternalCommentOutbox(row.id, lease, { mappingId, tombstone }),
    );
  }

  private async processCommentDeletionRow(
    row: { id: string; installationId: string; subjectId: string | null },
    context: { db: LobeChatDatabase; model: LinearSyncModel },
  ): Promise<'paused' | 'processed'> {
    if (!row.subjectId) return 'processed';
    const { db, model } = context;
    const mapping = await model.findExternalCommentByRemoteId(row.subjectId);
    if (!mapping || mapping.confirmationState === 'tombstoned') return 'processed';
    const issueLink = await model.findIssueLinkById(mapping.issueLinkId);
    const binding = issueLink?.bindingId ? await model.findBindingById(issueLink.bindingId) : null;
    if (binding && !linearBindingReadEnabled(binding)) return 'paused';
    const installation = await model.findInstallationById(row.installationId);
    if (!installation || installation.status !== 'active') {
      throw new LinearSyncPausedError('Linear installation is not active');
    }
    const integrationTasks = new LinearIntegrationTaskService(
      db,
      this.workspaceId,
      installation.id,
    );
    if (mapping.localCommentId) {
      await integrationTasks.deletePublicComment(mapping.localCommentId, {
        eventId: row.id,
        idempotencyKey: `linear:comment:delete:${row.id}`,
        source: 'linear',
        suppressLinearOutbox: true,
      });
    }
    await model.upsertExternalComment({
      id: mapping.id,
      confirmationState: 'tombstoned',
      issueLinkId: mapping.issueLinkId,
      lastConfirmedSnapshot: mapping.lastConfirmedSnapshot,
      lastInboundDeliveryId: row.id,
      linearCommentId: mapping.linearCommentId,
      linearIssueId: mapping.linearIssueId,
      localCommentId: mapping.localCommentId,
      origin: 'inbound',
      remoteSnapshot: mapping.remoteSnapshot,
      source: 'linear',
      tombstone: { at: new Date().toISOString(), kind: 'deleted', source: 'linear' },
    });
    return 'processed';
  }

  private async processRelationDeletionRow(
    row: { id: string; installationId: string; subjectId: string | null },
    context: { db: LobeChatDatabase; model: LinearSyncModel },
  ): Promise<'paused' | 'processed'> {
    if (!row.subjectId) return 'processed';
    const mapping = await context.model.findExternalRelationByRemoteId(row.subjectId);
    if (!mapping || mapping.confirmationState === 'tombstoned') return 'processed';
    const issueLink = mapping.issueLinkId
      ? await context.model.findIssueLinkById(mapping.issueLinkId)
      : null;
    const binding = issueLink?.bindingId
      ? await context.model.findBindingById(issueLink.bindingId)
      : null;
    if (binding && !linearBindingReadEnabled(binding)) return 'paused';
    const installation = await context.model.findInstallationById(row.installationId);
    if (!installation || installation.status !== 'active') {
      throw new LinearSyncPausedError('Linear installation is not active');
    }
    const integrationTasks = new LinearIntegrationTaskService(
      context.db,
      this.workspaceId,
      installation.id,
    );
    await this.tombstoneRelationMapping(
      context.model,
      context.db,
      integrationTasks,
      mapping,
      row.id,
    );
    return 'processed';
  }

  private async processIssueDeletionRow(
    row: { id: string; subjectId: string | null },
    model: LinearSyncModel,
    snapshot: SignedIssueRemovalSnapshot,
  ): Promise<'paused' | 'processed'> {
    if (!row.subjectId) return 'processed';
    const link = await model.findIssueLinkByExternalId(row.subjectId);
    if (!link || link.tombstone?.kind === 'deleted') return 'processed';
    const binding = link.bindingId ? await model.findBindingById(link.bindingId) : null;
    if (binding && !linearBindingReadEnabled(binding)) return 'paused';
    const tombstoneSnapshot: LinearIssueSnapshot = {
      ...link.lastConfirmedSnapshot,
      ...snapshot,
      id: link.linearIssueId,
    };
    await model.recordIssueTombstone({
      deliveryId: row.id,
      idempotencyKey: `linear:tombstone:${row.id}:deleted`,
      issueLinkId: link.id,
      kind: 'deleted',
      linearIssueId: row.subjectId,
      origin: 'inbound',
      reason: 'Linear issue removal webhook',
      snapshot: tombstoneSnapshot,
    });
    return 'processed';
  }

  private async processRelationOutboxRow(
    row: Awaited<ReturnType<LinearSyncModel['claimOutbox']>>[number],
    provider: LinearIssueProvider,
    lease: LinearSyncLease,
  ) {
    const payload = row.payload as Partial<LinearExternalRelationOutboxPayload> & {
      mappingId?: string;
    };
    const mappingId = typeof payload.mappingId === 'string' ? payload.mappingId : null;
    if (!mappingId) throw new Error('Linear relation outbox has no mapping');
    const mapping = await this.model.findExternalRelationById(mappingId);
    if (!mapping) throw new Error('Linear external relation mapping no longer exists');
    const relation = payload.relation;
    if (!relation) throw new Error('Linear relation outbox has no relation payload');
    const sourceLink = await this.model.findIssueLinkByTaskId(relation.sourceTaskId);
    if (!sourceLink) throw new Error('Linear relation source issue link no longer exists');
    const targetLink = relation.targetTaskId
      ? await this.model.findIssueLinkByTaskId(relation.targetTaskId)
      : null;
    if (relation.kind !== 'parent' && !targetLink) {
      throw new Error('Linear relation target issue link is not available');
    }
    const sourceScope = await this.ensureOutboundIssueScope(row, sourceLink, provider);
    const targetScope = targetLink
      ? await this.ensureOutboundIssueScope(row, targetLink, provider)
      : null;
    if (
      targetLink &&
      ((targetScope?.binding?.id ?? null) !== (sourceScope.binding?.id ?? null) ||
        (targetScope?.teamLink?.id ?? null) !== (sourceScope.teamLink?.id ?? null) ||
        targetScope.installation.id !== sourceScope.installation.id ||
        targetLink.organizationId !== sourceLink.organizationId)
    ) {
      throw new Error('Linear relation endpoints are outside one validated binding scope');
    }
    if (relation.kind === 'parent') {
      await this.ensureExternalMutationAllowed(row, sourceScope, lease);
      const updated = await this.runExternalMutation(() =>
        provider.updateIssue(sourceLink.linearIssueId, {
          parentId: targetLink?.linearIssueId ?? null,
        }),
      );
      if (updated.id !== sourceLink.linearIssueId) {
        throw new LinearProviderWriteAttemptedError(
          'Linear parent update returned an unexpected issue identity',
        );
      }
      if (targetLink) {
        return this.requireExternalSettlement(
          row,
          lease,
          await this.model.settleExternalRelationOutbox(row.id, lease, {
            mappingId,
            remoteSnapshot: {
              id: `parent:${sourceLink.linearIssueId}`,
              kind: 'parent',
              sourceIssueId: sourceLink.linearIssueId,
              targetIssueId: targetLink.linearIssueId,
            },
          }),
        );
      }
      return this.requireExternalSettlement(
        row,
        lease,
        await this.model.settleExternalRelationOutbox(row.id, lease, {
          mappingId,
          tombstone: { at: new Date().toISOString(), kind: 'deleted', source: 'orvilo' },
        }),
      );
    }

    if (payload.action === 'upsert') {
      if (!mapping.linearRelationId)
        throw new Error('Linear relation has no preallocated identity');
      const existingRelation = await provider.findRelationById(mapping.linearRelationId);
      if (existingRelation) {
        if (
          existingRelation.kind !== relation.kind ||
          existingRelation.sourceIssueId !== sourceLink.linearIssueId ||
          existingRelation.targetIssueId !== targetLink!.linearIssueId
        ) {
          throw new Error('Linear relation identity belongs to different endpoints');
        }
        return this.requireExternalSettlement(
          row,
          lease,
          await this.model.settleExternalRelationOutbox(row.id, lease, {
            linearRelationId: existingRelation.id,
            mappingId,
            remoteSnapshot: existingRelation,
          }),
        );
      }
      await this.ensureExternalMutationAllowed(row, sourceScope, lease);
      const remote = await this.runExternalMutation(() =>
        provider.createRelation({
          id: mapping.linearRelationId!,
          kind: relation.kind === 'parent' ? 'relates' : relation.kind,
          sourceIssueId: sourceLink.linearIssueId,
          targetIssueId: targetLink!.linearIssueId,
        }),
      );
      if (
        remote.id !== mapping.linearRelationId ||
        remote.kind !== relation.kind ||
        remote.sourceIssueId !== sourceLink.linearIssueId ||
        remote.targetIssueId !== targetLink!.linearIssueId
      ) {
        throw new LinearProviderWriteAttemptedError(
          'Linear relationCreate returned an unexpected remote identity',
        );
      }
      return this.requireExternalSettlement(
        row,
        lease,
        await this.model.settleExternalRelationOutbox(row.id, lease, {
          linearRelationId: remote.id,
          mappingId,
          remoteSnapshot: remote,
        }),
      );
    }
    if (!mapping.linearRelationId) {
      return this.requireExternalSettlement(
        row,
        lease,
        await this.model.settleExternalRelationOutbox(row.id, lease, {
          mappingId,
          tombstone: { at: new Date().toISOString(), kind: 'deleted', source: 'orvilo' },
        }),
      );
    }
    await this.ensureExternalMutationAllowed(row, sourceScope, lease);
    await this.runExternalMutation(() => provider.deleteRelation(mapping.linearRelationId!));
    return this.requireExternalSettlement(
      row,
      lease,
      await this.model.settleExternalRelationOutbox(row.id, lease, {
        mappingId,
        tombstone: { at: new Date().toISOString(), kind: 'deleted', source: 'orvilo' },
      }),
    );
  }

  private async processCommentRow(
    row: { id: string; installationId: string },
    comment: LinearCommentSnapshot,
    context: { db: LobeChatDatabase; historicalImport?: boolean; model: LinearSyncModel },
  ): Promise<'paused' | 'pending-binding' | 'processed'> {
    const { db, model } = context;
    const issueLink = await model.findIssueLinkByExternalId(comment.issueId);
    if (!issueLink) return 'pending-binding';
    // Team-scope links have bindingId = null — their scope gate was the team
    // link at import time, so comments proceed without a binding.
    const binding = issueLink.bindingId ? await model.findBindingById(issueLink.bindingId) : null;
    if (issueLink.bindingId && !binding) return 'pending-binding';
    if (binding && !linearBindingReadEnabled(binding)) return 'paused';
    const installation = await model.findInstallationById(row.installationId);
    if (!installation || installation.status !== 'active') {
      throw new LinearSyncPausedError('Linear installation is not active');
    }
    const integrationTasks = new LinearIntegrationTaskService(
      db,
      this.workspaceId,
      installation.id,
    );
    const existing = await model.findExternalCommentByRemoteId(comment.id);
    const outboundEcho =
      existing?.source === 'orvilo' && existing.confirmationState === 'unconfirmed';
    if (comment.deletedAt) {
      if (existing?.localCommentId) {
        await integrationTasks.deletePublicComment(existing.localCommentId, {
          eventId: row.id,
          idempotencyKey: `linear:comment:delete:${row.id}`,
          source: 'linear',
          suppressDomainEvent: context.historicalImport,
          suppressLinearOutbox: true,
        });
      }
      await model.upsertExternalComment({
        id: existing?.id,
        confirmationState: 'tombstoned',
        issueLinkId: issueLink.id,
        lastConfirmedSnapshot: existing?.lastConfirmedSnapshot ?? comment,
        linearCommentId: comment.id,
        linearIssueId: comment.issueId,
        localCommentId: existing?.localCommentId,
        origin: 'inbound',
        remoteSnapshot: comment,
        source: 'linear',
        tombstone: { at: new Date().toISOString(), kind: 'deleted', source: 'linear' },
        lastInboundDeliveryId: row.id,
      });
      return 'processed';
    }

    let localCommentId = existing?.localCommentId ?? null;
    const localComment = localCommentId
      ? await integrationTasks.findPublicComment(localCommentId)
      : undefined;
    let confirmationState: 'confirmed' | 'conflict' = 'confirmed';
    if (!localComment && outboundEcho) {
      await model.upsertExternalComment({
        id: existing?.id,
        confirmationState: 'confirmed',
        issueLinkId: issueLink.id,
        lastConfirmedSnapshot: comment,
        linearCommentId: comment.id,
        linearIssueId: comment.issueId,
        localCommentId: null,
        origin: 'inbound',
        remoteSnapshot: comment,
        source: 'linear',
        tombstone: null,
        lastInboundDeliveryId: row.id,
      });
      return 'processed';
    }
    if (!localComment) {
      const created = await integrationTasks.addPublicComment(issueLink.taskId, comment.body, {
        eventId: row.id,
        idempotencyKey: `linear:comment:create:${row.id}`,
        source: 'linear',
        suppressDomainEvent: context.historicalImport,
        suppressLinearOutbox: true,
      });
      localCommentId = created.id;
    } else if (localComment.content !== comment.body) {
      const baseline = existing?.lastConfirmedSnapshot?.body;
      if (outboundEcho) {
        confirmationState = 'conflict';
      } else if (baseline === undefined || localComment.content === baseline) {
        await integrationTasks.updatePublicComment(localComment.id, comment.body, {
          eventId: row.id,
          idempotencyKey: `linear:comment:update:${row.id}`,
          source: 'linear',
          suppressDomainEvent: context.historicalImport,
          suppressLinearOutbox: true,
        });
      } else {
        confirmationState = 'conflict';
      }
    }

    await model.upsertExternalComment({
      id: existing?.id,
      confirmationState,
      issueLinkId: issueLink.id,
      lastConfirmedSnapshot:
        confirmationState === 'confirmed' ? comment : existing?.lastConfirmedSnapshot,
      linearCommentId: comment.id,
      linearIssueId: comment.issueId,
      localCommentId,
      origin: 'inbound',
      remoteSnapshot: comment,
      source: 'linear',
      tombstone: null,
      lastInboundDeliveryId: row.id,
    });
    return 'processed';
  }

  private async processRelationRow(
    row: { id: string; installationId: string },
    relation: LinearRelationSnapshot,
    context: { db: LobeChatDatabase; model: LinearSyncModel },
  ): Promise<'paused' | 'processed'> {
    const installation = await context.model.findInstallationById(row.installationId);
    if (!installation || installation.status !== 'active') {
      throw new LinearSyncPausedError('Linear installation is not active');
    }
    const [sourceLink, targetLink] = await Promise.all([
      context.model.findIssueLinkByExternalId(relation.sourceIssueId),
      context.model.findIssueLinkByExternalId(relation.targetIssueId),
    ]);
    const bindingIds = [...new Set([sourceLink?.bindingId, targetLink?.bindingId].filter(Boolean))];
    const bindings = await Promise.all(bindingIds.map((id) => context.model.findBindingById(id!)));
    if (bindings.some((binding) => binding && !linearBindingReadEnabled(binding))) return 'paused';
    const integrationTasks = new LinearIntegrationTaskService(
      context.db,
      this.workspaceId,
      installation.id,
    );
    await this.reconcileOneRelation(
      context.model,
      context.db,
      integrationTasks,
      relation,
      row.id,
      false,
    );
    return 'processed';
  }

  private async reconcileRelationsForIssue(
    model: LinearSyncModel,
    db: LobeChatDatabase,
    integrationTasks: LinearIntegrationTaskService,
    _binding: Awaited<ReturnType<LinearSyncModel['findBindingById']>> | null,
    _taskId: string,
    issueId: string,
    relations: LinearRelationSnapshot[],
    deliveryId: string,
    historicalImport = false,
  ) {
    const currentIds = new Set(relations.map(({ id }) => id));
    for (const relation of relations) {
      await this.reconcileOneRelation(
        model,
        db,
        integrationTasks,
        relation,
        deliveryId,
        historicalImport,
      );
    }

    const existing = await model.listExternalRelationsForIssue(issueId);
    for (const mapping of existing) {
      if (
        mapping.confirmationState === 'tombstoned' ||
        !mapping.linearRelationId ||
        currentIds.has(mapping.linearRelationId)
      ) {
        continue;
      }
      await this.tombstoneRelationMapping(model, db, integrationTasks, mapping, deliveryId);
    }
  }

  private async reconcileOneRelation(
    model: LinearSyncModel,
    db: LobeChatDatabase,
    integrationTasks: LinearIntegrationTaskService,
    relation: LinearRelationSnapshot,
    deliveryId: string,
    historicalImport: boolean,
    projectOverride?: { projectId: string | null; taskId: string },
  ) {
    const sourceLink = await model.findIssueLinkByExternalId(relation.sourceIssueId);
    const targetLink = await model.findIssueLinkByExternalId(relation.targetIssueId);
    const existing = await model.findExternalRelationByRemoteId(relation.id);
    const sourceTaskId = sourceLink?.taskId ?? null;
    const targetTaskId = targetLink?.taskId ?? null;
    const [sourceTask] = sourceLink
      ? await db
          .select({ projectId: tasks.projectId })
          .from(tasks)
          .where(eq(tasks.id, sourceLink.taskId))
          .limit(1)
      : [];
    const [targetTask] = targetLink
      ? await db
          .select({ projectId: tasks.projectId })
          .from(tasks)
          .where(eq(tasks.id, targetLink.taskId))
          .limit(1)
      : [];
    const sourceProjectId =
      sourceLink?.taskId === projectOverride?.taskId
        ? projectOverride.projectId
        : sourceTask?.projectId;
    const targetProjectId =
      targetLink?.taskId === projectOverride?.taskId
        ? projectOverride.projectId
        : targetTask?.projectId;
    const sameProject = Boolean(sourceTask && targetTask && sourceProjectId === targetProjectId);
    const projection = projectLinearRelation({
      kind: relation.kind,
      sameProject,
      sourceTaskId,
      targetTaskId,
    });
    const resolved = projection.resolutionState === 'resolved';
    const localRelationKey =
      relation.kind === 'parent'
        ? `parent:${sourceTaskId ?? relation.sourceIssueId}`
        : relation.kind === 'blocks'
          ? `blocks:${sourceTaskId ?? relation.sourceIssueId}:${targetTaskId ?? relation.targetIssueId}`
          : `relates:${[sourceTaskId ?? relation.sourceIssueId, targetTaskId ?? relation.targetIssueId].sort().join(':')}`;

    if (existing?.resolutionState === 'resolved' && !resolved) {
      await this.removeLocalRelation(db, integrationTasks, existing, deliveryId);
    }
    if (projection.parentTaskId && sourceLink) {
      const [task] = await db
        .select({ parentTaskId: tasks.parentTaskId })
        .from(tasks)
        .where(eq(tasks.id, sourceLink.taskId))
        .limit(1);
      if (task?.parentTaskId !== targetLink.taskId) {
        await integrationTasks.updatePublicTask(
          sourceLink.taskId,
          { parentTaskId: projection.parentTaskId },
          {
            eventId: deliveryId,
            idempotencyKey: `linear:relation:parent:${relation.id}:${deliveryId}`,
            source: 'linear',
            suppressLinearOutbox: true,
            suppressDomainEvent: historicalImport,
          },
        );
      }
    } else if (projection.dependency) {
      if (!projection.dependency.taskId || !projection.dependency.dependsOnTaskId) {
        throw new Error('Linear dependency projection is missing task identities');
      }
      await integrationTasks.addPublicDependency(
        projection.dependency.taskId,
        projection.dependency.dependsOnTaskId,
        projection.dependency.type,
        {
          eventId: deliveryId,
          idempotencyKey: `linear:relation:${relation.id}:${deliveryId}`,
          source: 'linear',
          suppressDomainEvent: historicalImport,
          suppressLinearOutbox: true,
        },
      );
    }

    await model.upsertExternalRelation({
      confirmationState: 'confirmed',
      issueLinkId: sourceLink?.id ?? targetLink?.id,
      kind: relation.kind,
      lastConfirmedSnapshot: relation,
      linearRelationId: relation.id,
      localRelationKey,
      localSourceTaskId: sourceTaskId,
      localTargetTaskId: targetTaskId,
      origin: historicalImport ? 'reconciliation' : 'inbound',
      remoteSnapshot: relation,
      resolutionState: resolved ? 'resolved' : 'unresolved',
      source: 'linear',
      sourceIssueId: relation.sourceIssueId,
      targetIssueId: relation.targetIssueId,
      tombstone: null,
    });
  }

  private async removeLocalRelation(
    db: LobeChatDatabase,
    integrationTasks: LinearIntegrationTaskService,
    mapping: Awaited<ReturnType<LinearSyncModel['findExternalRelationById']>>,
    deliveryId: string,
  ) {
    if (!mapping?.localSourceTaskId || !mapping.localTargetTaskId) return;
    if (mapping.kind === 'parent') {
      const [task] = await db
        .select({ parentTaskId: tasks.parentTaskId })
        .from(tasks)
        .where(eq(tasks.id, mapping.localSourceTaskId))
        .limit(1);
      if (task?.parentTaskId === mapping.localTargetTaskId) {
        await integrationTasks.updatePublicTask(
          mapping.localSourceTaskId,
          { parentTaskId: null },
          {
            eventId: deliveryId,
            idempotencyKey: `linear:relation:remove:${mapping.id}:${deliveryId}`,
            source: 'linear',
            suppressDomainEvent: false,
            suppressLinearOutbox: true,
          },
        );
      }
      return;
    }
    await integrationTasks.removePublicDependency(
      mapping.kind === 'relates' ? mapping.localSourceTaskId : mapping.localTargetTaskId,
      mapping.kind === 'relates' ? mapping.localTargetTaskId : mapping.localSourceTaskId,
      {
        eventId: deliveryId,
        idempotencyKey: `linear:relation:remove:${mapping.id}:${deliveryId}`,
        source: 'linear',
        suppressDomainEvent: false,
        suppressLinearOutbox: true,
      },
    );
  }

  private async tombstoneRelationMapping(
    model: LinearSyncModel,
    db: LobeChatDatabase,
    integrationTasks: LinearIntegrationTaskService,
    mapping: Awaited<ReturnType<LinearSyncModel['findExternalRelationById']>>,
    deliveryId: string,
  ) {
    if (!mapping) return;
    await this.removeLocalRelation(db, integrationTasks, mapping, deliveryId);
    await model.upsertExternalRelation({
      confirmationState: 'tombstoned',
      issueLinkId: mapping.issueLinkId,
      kind: mapping.kind,
      lastConfirmedSnapshot: mapping.lastConfirmedSnapshot,
      linearRelationId: mapping.linearRelationId,
      localRelationKey: mapping.localRelationKey,
      localSourceTaskId: mapping.localSourceTaskId,
      localTargetTaskId: mapping.localTargetTaskId,
      origin: 'inbound',
      remoteSnapshot: mapping.remoteSnapshot,
      resolutionState: mapping.resolutionState,
      source: 'linear',
      sourceIssueId: mapping.sourceIssueId,
      targetIssueId: mapping.targetIssueId,
      tombstone: { at: new Date().toISOString(), kind: 'deleted', source: 'linear' },
    });
  }

  private async handleRemoteTombstone(
    row: { eventType: string; id: string; installationId: string; subjectId: string | null },
    error: unknown,
  ) {
    if (!(error instanceof LinearRemoteResourceError)) return false;
    const kind = error.reason === 'forbidden' ? 'forbidden' : 'deleted';
    if (error.resource === 'issue') {
      const link = await this.model.findIssueLinkByExternalId(error.resourceId);
      if (!link) return true;
      await this.model.recordIssueTombstone({
        deliveryId: row.id,
        idempotencyKey: `linear:tombstone:${row.id}:${kind}`,
        issueLinkId: link.id,
        kind,
        linearIssueId: error.resourceId,
        origin: 'inbound',
        reason: error.message,
      });
      return true;
    }
    if (error.resource === 'comment') {
      const mapping = await this.model.findExternalCommentByRemoteId(error.resourceId);
      if (!mapping) return true;
      const installation = await this.model.findInstallationById(row.installationId);
      if (kind === 'deleted' && mapping.localCommentId && installation) {
        const integrationTasks = new LinearIntegrationTaskService(
          this.db,
          this.workspaceId,
          installation.id,
        );
        await integrationTasks.deletePublicComment(mapping.localCommentId, {
          source: 'linear',
          suppressDomainEvent: false,
          suppressLinearOutbox: true,
        });
      }
      await this.model.upsertExternalComment({
        confirmationState: kind === 'deleted' ? 'tombstoned' : 'unresolved',
        issueLinkId: mapping.issueLinkId,
        lastConfirmedSnapshot: mapping.lastConfirmedSnapshot,
        linearCommentId: mapping.linearCommentId,
        linearIssueId: mapping.linearIssueId,
        localCommentId: mapping.localCommentId,
        origin: 'inbound',
        remoteSnapshot: mapping.remoteSnapshot,
        source: 'linear',
        tombstone: { at: new Date().toISOString(), kind, source: 'linear' },
      });
      return true;
    }
    const mapping = await this.model.findExternalRelationByRemoteId(error.resourceId);
    if (!mapping) return true;
    const installation = await this.model.findInstallationById(row.installationId);
    if (installation) {
      const integrationTasks = new LinearIntegrationTaskService(
        this.db,
        this.workspaceId,
        installation.id,
      );
      if (kind === 'deleted') {
        await this.tombstoneRelationMapping(this.model, this.db, integrationTasks, mapping, row.id);
      } else {
        await this.model.upsertExternalRelation({
          confirmationState: 'unresolved',
          issueLinkId: mapping.issueLinkId,
          kind: mapping.kind,
          lastConfirmedSnapshot: mapping.lastConfirmedSnapshot,
          linearRelationId: mapping.linearRelationId,
          localRelationKey: mapping.localRelationKey,
          localSourceTaskId: mapping.localSourceTaskId,
          localTargetTaskId: mapping.localTargetTaskId,
          origin: 'inbound',
          remoteSnapshot: mapping.remoteSnapshot,
          resolutionState: 'unresolved',
          source: 'linear',
          sourceIssueId: mapping.sourceIssueId,
          targetIssueId: mapping.targetIssueId,
          tombstone: { at: new Date().toISOString(), kind, source: 'linear' },
        });
      }
    }
    return true;
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
    if (installation.status !== 'active') {
      throw new LinearSyncPausedError('Linear installation is not active');
    }

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

  // ── Workspace-scope import (linear-workspace-v3) ────────────────────────

  /**
   * Advance the durable workspace import by one bounded step. Each call claims
   * the scope lease, finishes one phase (teams → projects) or one page of one
   * team's issues, persists the cursor, and releases the lease — so closing a
   * browser or killing a worker never loses progress, and there is never more
   * than one writer for a run.
   */
  async importScope(
    provider: LinearIssueProvider,
    scopeId: string,
    limit = 50,
  ): Promise<LinearWorkerResult & { claimed: boolean; completed: boolean; phase: string | null }> {
    const scope = await this.model.findScopeById(scopeId);
    if (!scope) throw new Error('Linear sync scope not found');
    const installation = await this.model.findInstallationById(scope.installationId);
    if (!installation) throw new Error('Linear installation not found');
    if (installation.status !== 'active') {
      throw new LinearSyncPausedError('Linear installation is not active');
    }

    const claimed = await this.model.claimScopeImport({
      leaseOwner: this.leaseOwner,
      lockMs: LINEAR_SYNC_DEFAULT_LEASE_MS,
      scopeId: scope.id,
    });
    if (!claimed) {
      return {
        claimed: false,
        completed: false,
        failed: 0,
        imported: 0,
        pendingBinding: 0,
        phase: scope.importPhase,
        processed: 0,
      };
    }

    try {
      const phase = claimed.importPhase ?? 'teams';
      const result: LinearWorkerResult & {
        claimed: boolean;
        completed: boolean;
        phase: string | null;
      } = {
        claimed: true,
        completed: false,
        failed: 0,
        imported: 0,
        pendingBinding: 0,
        phase,
        processed: 0,
      };

      if (phase === 'teams' || phase === 'workflow_states') {
        await this.importScopeTeams(provider, claimed, installation);
        return { ...result, phase: 'projects' };
      }
      if (phase === 'projects') {
        await this.importScopeProjects(provider, claimed, installation);
        return { ...result, phase: 'issues' };
      }
      if (phase === 'issues' || phase === 'reconciliation' || phase === 'relations') {
        const outcome = await this.importScopeIssues(
          provider,
          claimed,
          installation,
          limit,
          phase === 'issues' ? 'initial' : 'reconciliation',
        );
        return {
          ...result,
          completed: outcome.completed,
          failed: outcome.failed,
          imported: outcome.imported,
          pendingBinding: outcome.pendingBinding,
          phase: outcome.phase,
          processed: outcome.processed,
        };
      }
      return { ...result, completed: true, phase: 'completed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.model.updateScopeImportState(scope.id, {
        lastError: message.slice(0, 2_000),
        status: error instanceof LinearRemoteAuthError ? 'paused' : 'failed',
      });
      throw error;
    } finally {
      await this.model.releaseScopeImport({
        leaseFence: claimed.leaseFence,
        leaseOwner: this.leaseOwner,
        scopeId: scope.id,
      });
    }
  }

  /** Teams phase: link every approved remote team and mirror its states. */
  private async importScopeTeams(
    provider: LinearIssueProvider,
    scope: NonNullable<Awaited<ReturnType<LinearSyncModel['findScopeById']>>>,
    installation: NonNullable<Awaited<ReturnType<LinearSyncModel['findInstallationById']>>>,
  ) {
    const remoteTeams = await provider.listTeams();
    const settings = scope.settings ?? {};
    const eligible = remoteTeams.filter(
      (team) =>
        (settings.approvedTeamIds === undefined || settings.approvedTeamIds.includes(team.id)) &&
        !(settings.privateTeamPolicy === 'skip' && team.visibility === 'private'),
    );

    const installer = installation.installedByUserId;
    const teamModel = installer ? new TeamModel(this.db, installer, this.workspaceId) : null;
    let linked = 0;
    for (const remote of eligible) {
      let localTeamId = (await this.model.findTeamLinkByLinearTeamId(remote.id))?.teamId;
      if (!localTeamId && teamModel) {
        localTeamId =
          (await teamModel.findByKey(remote.key))?.id ??
          (
            await teamModel.create({
              key: remote.key,
              name: remote.name,
              visibility: remote.visibility === 'private' ? 'private' : 'public',
            })
          ).id;
      }
      if (!localTeamId || !teamModel) continue;

      for (const state of remote.workflowStates ?? []) {
        await teamModel.upsertWorkflowStateByRemoteId({
          category: linearStateCategory(state.type),
          name: state.name,
          position: state.position,
          remoteStateId: state.id,
          teamId: localTeamId,
        });
      }
      for (const cycle of remote.cycles ?? []) {
        await teamModel.upsertCycleByRemoteId({
          endsAt: cycle.endsAt ? new Date(cycle.endsAt) : null,
          name: cycle.name,
          number: cycle.number,
          remoteCycleId: cycle.id,
          startsAt: cycle.startsAt ? new Date(cycle.startsAt) : null,
          teamId: localTeamId,
        });
      }
      await this.model.upsertTeamLink({
        installationId: installation.id,
        linearTeamId: remote.id,
        linearTeamKey: remote.key,
        remoteSnapshot: remote,
        scopeId: scope.id,
        syncState: 'synced',
        teamId: localTeamId,
      });
      linked += 1;
    }

    await this.model.updateScopeImportState(scope.id, {
      importPhase: 'projects',
      teamsLinked: linked,
    });
  }

  /** Projects phase: link/create local projects and attach participating teams. */
  private async importScopeProjects(
    provider: LinearIssueProvider,
    scope: NonNullable<Awaited<ReturnType<LinearSyncModel['findScopeById']>>>,
    installation: NonNullable<Awaited<ReturnType<LinearSyncModel['findInstallationById']>>>,
  ) {
    const remoteProjects = await provider.listProjects();
    const approved = scope.settings?.approvedTeamIds;
    const eligible = remoteProjects.filter(
      (project) =>
        approved === undefined || project.teamIds.some((teamId) => approved.includes(teamId)),
    );
    const teamLinks = new Map(
      (await this.model.listTeamLinks({ installationId: installation.id }))
        .filter((link) => link.syncState === 'synced')
        .map((link) => [link.linearTeamId, link.teamId]),
    );

    const installer = installation.installedByUserId;
    const teamModel = installer ? new TeamModel(this.db, installer, this.workspaceId) : null;
    const projectModel = installer ? new ProjectModel(this.db, installer, this.workspaceId) : null;
    let linked = 0;
    for (const remote of eligible) {
      const existing = await this.model.findBindingByLinearProjectId(remote.id);
      let localProjectId: string | undefined = existing?.projectId;
      if (!localProjectId && projectModel) {
        localProjectId = (await this.createImportedProject(projectModel, installation, remote))?.id;
      }
      if (!localProjectId) continue;

      await this.model.upsertBinding({
        defaultTeamId: remote.teamIds.find((teamId) => teamLinks.has(teamId)),
        installationId: installation.id,
        linearProjectId: remote.id,
        projectId: localProjectId,
        remoteSnapshot: remote,
        scopeId: scope.id,
        teamIds: remote.teamIds,
      });
      if (teamModel) {
        for (const remoteTeamId of remote.teamIds) {
          const localTeamId = teamLinks.get(remoteTeamId);
          if (localTeamId) await teamModel.linkProject(localProjectId, localTeamId);
        }
      }
      linked += 1;
    }

    await this.model.updateScopeImportState(scope.id, {
      importPhase: 'issues',
      projectsLinked: linked,
    });
  }

  /**
   * Create a local project for an imported Linear project. The installer owns
   * the coordinator agent (agents.user_id requires a real user); the
   * `createdBySubject*` columns record that Linear performed the creation, so
   * the row stays auditable and survives installer removal.
   */
  private async createImportedProject(
    projectModel: ProjectModel,
    installation: NonNullable<Awaited<ReturnType<LinearSyncModel['findInstallationById']>>>,
    remote: LinearProjectSnapshot,
  ) {
    const base =
      remote.name
        .replaceAll(/[^a-z0-9]/gi, '')
        .toUpperCase()
        .slice(0, 6)
        .padEnd(3, 'X') || 'LINPRJ';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const identifier = attempt === 0 ? base : `${base.slice(0, 5)}${attempt}`;
      try {
        return await projectModel.create({
          creationSubject: {
            id: `linear-installation:${installation.id}`,
            kind: 'integration',
            snapshot: {
              displayName: installation.organizationName || 'Linear',
              externalId: installation.organizationId,
              kind: 'integration',
            },
          },
          identifier,
          name: remote.name,
          visibility: 'public',
        });
      } catch (error) {
        if (attempt === 9) throw error;
      }
    }
    return null;
  }

  /**
   * Issues phase: process one page for the first team that still has pending
   * pages. `issuesByTeam[remoteTeamId]` is `undefined` until the team starts,
   * a cursor while paging, and `null` once exhausted. The reconciliation phase
   * reruns the same sweep but skips issues untouched since the run started.
   */
  private async importScopeIssues(
    provider: LinearIssueProvider,
    scope: NonNullable<Awaited<ReturnType<LinearSyncModel['findScopeById']>>>,
    installation: NonNullable<Awaited<ReturnType<LinearSyncModel['findInstallationById']>>>,
    limit: number,
    sweep: 'initial' | 'reconciliation',
  ) {
    const result = {
      completed: false,
      failed: 0,
      imported: 0,
      pendingBinding: 0,
      phase: sweep === 'initial' ? 'issues' : 'reconciliation',
      processed: 0,
    };
    const teamLinks = (await this.model.listTeamLinks({ installationId: installation.id }))
      .filter((link) => link.syncState === 'synced')
      .sort((a, b) => a.linearTeamId.localeCompare(b.linearTeamId));
    const issuesByTeam = { ...scope.cursors?.issuesByTeam };
    const pending = teamLinks.find((link) => issuesByTeam[link.linearTeamId] !== null);

    if (!pending) {
      if (sweep === 'initial') {
        // Fresh cursor map: a second sweep catches issues that changed while
        // the first pass was running.
        await this.model.updateScopeImportState(scope.id, {
          cursors: { issuesByTeam: {} },
          importPhase: 'reconciliation',
        });
        return { ...result, phase: 'reconciliation' };
      }
      await this.model.transaction(async (model) => {
        await model.updateScopeImportState(scope.id, {
          cursors: { issuesByTeam: {} },
          importCompletedAt: new Date(),
          importPhase: 'completed',
          status: 'active',
        });
        await model.recordDomainEvent({
          idempotencyKey: `linear:import-completed:${scope.id}:${scope.importRunId ?? ''}`,
          payload: {
            issuesImported: scope.issuesImported,
            projectsLinked: scope.projectsLinked,
            scopeId: scope.id,
            teamsLinked: scope.teamsLinked,
          },
          source: 'linear',
          type: 'linear.import.completed',
        });
      });
      return { ...result, completed: true, phase: 'completed' };
    }

    const watermark = scope.importStartedAt ?? new Date();
    const page = await provider.listTeamIssues(
      pending.linearTeamId,
      limit,
      issuesByTeam[pending.linearTeamId] ?? null,
    );
    const issueById = new Map(page.issues.map((issue) => [issue.id, issue]));
    const pageProvider: LinearIssueProvider = {
      ...provider,
      getIssue: async (id) => issueById.get(id) ?? provider.getIssue(id),
    };

    let pageBlocked = false;
    const seenIssueIds = new Set<string>();
    for (const issue of page.issues) {
      if (seenIssueIds.has(issue.id)) continue;
      seenIssueIds.add(issue.id);
      if (scope.settings?.includeProjectlessIssues === false && !issue.projectId) continue;
      if (
        sweep === 'reconciliation' &&
        issue.updatedAt &&
        new Date(issue.updatedAt).getTime() < watermark.getTime()
      )
        continue;
      try {
        const outcome = await this.processScopeIssue(
          {
            id: `linear-scope-import:${scope.id}:${issue.id}`,
            installationId: installation.id,
            subjectId: issue.id,
          },
          issue,
          pageProvider,
          pending.teamId,
          { historicalImport: true },
        );
        if (outcome === 'imported') result.imported += 1;
        if (outcome === 'pending-binding') result.pendingBinding += 1;
        if (outcome !== 'pending-binding' && outcome !== 'paused') result.processed += 1;
        if (outcome === 'pending-binding' || outcome === 'paused') pageBlocked = true;
      } catch (error) {
        pageBlocked = true;
        result.failed += 1;
        console.error('[linear:scope-import]', error);
      }
    }

    // A blocked page keeps its incoming cursor (undefined = not started, a
    // string = mid-pagination) so the next call refetches the same page —
    // processed issues dedupe on remoteUpdatedAt, failed ones get another
    // attempt instead of being skipped forever.
    if (!pageBlocked) {
      issuesByTeam[pending.linearTeamId] = page.hasNextPage ? page.endCursor : null;
    }
    await this.model.updateScopeImportState(scope.id, {
      cursors: { issuesByTeam },
      issuesFailed: scope.issuesFailed + result.failed,
      issuesImported: scope.issuesImported + result.imported,
    });
    return result;
  }

  /**
   * Team-scoped variant of {@link processRow}: resolves the local team through
   * `linear_team_links` so issues without a Linear project still import, and
   * keeps `bindingId`/`projectId` nullable end to end.
   */
  private async processScopeIssue(
    row: { id: string; installationId: string; subjectId: string | null },
    issue: LinearIssueSnapshot,
    provider: LinearIssueProvider,
    localTeamId: string,
    options: {
      db?: LobeChatDatabase;
      historicalImport?: boolean;
      knownRelations?: LinearRelationSnapshot[];
      model?: LinearSyncModel;
    } = {},
  ): Promise<'imported' | 'paused' | 'pending-binding' | 'processed'> {
    const [knownComments, fetchedRelations] = await Promise.all([
      provider.listComments ? provider.listComments(issue.id) : [],
      options.knownRelations ?? (provider.listRelations ? provider.listRelations(issue.id) : []),
    ]);
    const run = async (model: LinearSyncModel, db: LobeChatDatabase) => {
      const historicalImport = options.historicalImport ?? true;
      const relations = issueRelationsWithParent(issue, fetchedRelations);
      const existingLink = await model.findIssueLinkByExternalId(issue.id);
      const installation = await model.findInstallationById(row.installationId);
      if (!installation || installation.status !== 'active') {
        throw new LinearSyncPausedError('Linear installation is not active');
      }

      const teamLink = issue.teamId ? await model.findTeamLinkByLinearTeamId(issue.teamId) : null;
      const binding = issue.projectId
        ? await model.lockBindingByLinearProjectId(issue.projectId)
        : null;
      if (!teamLink || (issue.projectId && !binding)) {
        if (existingLink) {
          await model.recordIssueTombstone({
            deliveryId: row.id,
            idempotencyKey: `linear:tombstone:${row.id}:out_of_scope`,
            issueLinkId: existingLink.id,
            kind: 'out_of_scope',
            linearIssueId: issue.id,
            origin: historicalImport ? 'reconciliation' : 'inbound',
            reason: 'Issue is no longer inside an approved Linear sync scope',
            snapshot: issue,
          });
          return 'processed';
        }
        return 'pending-binding';
      }
      if (teamLink.teamId !== localTeamId) {
        // The page's team changed underneath the run — let the owning team's
        // sweep handle the issue instead of writing through a stale link.
        return 'pending-binding';
      }
      if (binding && !linearBindingReadEnabled(binding)) return 'paused';
      if (binding && binding.installationId !== installation.id) {
        throw new Error('Linear issue binding belongs to another installation');
      }

      const integrationTasks = new LinearIntegrationTaskService(
        db,
        this.workspaceId,
        installation.id,
      );
      if (
        binding &&
        !(await integrationTasks.validateIssueScope({ binding, installation, issue }))
      ) {
        if (existingLink) {
          await model.recordIssueTombstone({
            deliveryId: row.id,
            idempotencyKey: `linear:tombstone:${row.id}:out_of_scope`,
            issueLinkId: existingLink.id,
            kind: 'out_of_scope',
            linearIssueId: issue.id,
            origin: historicalImport ? 'reconciliation' : 'inbound',
            reason: 'Issue is outside the validated public team scope',
            snapshot: issue,
          });
        }
        return 'processed';
      }

      const incomingUpdatedAt = issue.updatedAt ? new Date(issue.updatedAt) : null;
      if (
        existingLink &&
        incomingUpdatedAt &&
        Number.isFinite(incomingUpdatedAt.getTime()) &&
        existingLink.remoteUpdatedAt &&
        incomingUpdatedAt.getTime() <= existingLink.remoteUpdatedAt.getTime()
      ) {
        await model.updateIssueLink(existingLink.id, { lastInboundDeliveryId: row.id });
        return 'processed';
      }

      if (existingLink && issue.archivedAt) {
        await model.recordIssueTombstone({
          deliveryId: row.id,
          idempotencyKey: `linear:tombstone:${row.id}:archived`,
          issueLinkId: existingLink.id,
          kind: 'archived',
          linearIssueId: issue.id,
          origin: historicalImport ? 'reconciliation' : 'inbound',
          reason: 'Linear issue is archived',
          snapshot: issue,
        });
        return 'processed';
      }

      const teamModel = installation.installedByUserId
        ? new TeamModel(db, installation.installedByUserId, this.workspaceId)
        : null;
      const workflowStateRefId =
        issue.stateId && teamModel
          ? ((await teamModel.findWorkflowStateByRemoteId(teamLink.teamId, issue.stateId))?.id ??
            null)
          : null;
      const cycleRefId =
        issue.cycleId && teamModel
          ? ((await teamModel.findCycleByRemoteId(teamLink.teamId, issue.cycleId))?.id ?? null)
          : null;
      const mutation = {
        eventId: row.id,
        idempotencyKey: `linear:import:${row.id}`,
        source: 'linear' as const,
        suppressDomainEvent: historicalImport,
        suppressLinearOutbox: true,
      };

      if (!existingLink) {
        if (issue.archivedAt) return 'processed';
        const task = await integrationTasks.createTeamScopedTask({
          cycleRefId,
          installation,
          issue,
          localTeamId: teamLink.teamId,
          mutation,
          projectId: binding?.projectId ?? null,
          settings: binding?.settings,
          workflowStateRefId,
        });
        if (!task) return 'processed';
        await model.createIssueLink({
          aliasIdentifiers: issue.identifier ? [issue.identifier] : [],
          bindingId: binding?.id ?? null,
          installationId: installation.id,
          linearIdentifier: issue.identifier,
          linearIssueId: issue.id,
          linearTeamId: issue.teamId,
          organizationId: installation.organizationId,
          remoteSnapshot: issue,
          taskId: task.id,
        });
        return 'imported';
      }

      if (
        existingLink.installationId !== installation.id ||
        existingLink.organizationId !== installation.organizationId
      ) {
        throw new Error('Linear issue link installation scope does not match');
      }
      if (existingLink.tombstone) await model.clearIssueTombstone(existingLink.id);

      const task = await integrationTasks.findPublicTask(existingLink.taskId);
      if (!task || task.visibility !== 'public') {
        await model.updateIssueLink(existingLink.id, {
          lastInboundDeliveryId: row.id,
          remoteSnapshot: issue,
          remoteUpdatedAt: incomingUpdatedAt,
          syncState: 'removed',
        });
        return 'processed';
      }

      const settings = binding?.settings ?? {};
      const local = taskLinearIssueSnapshot(
        task,
        issue,
        existingLink.lastConfirmedSnapshot,
        settings,
      );
      const merged = mergeLinearIssueSnapshots({
        base: existingLink.lastConfirmedSnapshot,
        local,
        remote: issue,
      });
      if (merged.conflicts) {
        await model.updateIssueLink(existingLink.id, {
          conflict: {
            ...merged.conflicts,
            localRevision: task.domainRevision,
            remoteUpdatedAt: issue.updatedAt ?? null,
          },
          lastInboundDeliveryId: row.id,
          remoteSnapshot: issue,
          remoteUpdatedAt: incomingUpdatedAt,
          syncState: 'conflict',
        });
        return 'processed';
      }

      const patch = remoteTaskPatch(
        task,
        merged.merged,
        existingLink.lastConfirmedSnapshot,
        local,
        issue,
        settings,
      );
      if (binding && issue.projectId !== existingLink.lastConfirmedSnapshot.projectId) {
        patch.projectId = binding.projectId;
      }
      if (workflowStateRefId && task.workflowStateRefId !== workflowStateRefId) {
        patch.workflowStateRefId = workflowStateRefId;
      }
      if (task.cycleRefId !== cycleRefId) {
        patch.cycleRefId = cycleRefId;
      }
      let taskAfterRemote = task;
      if (Object.keys(patch).length > 0) {
        const updatedTask = await integrationTasks.updatePublicTask(task.id, patch, {
          eventId: row.id,
          idempotencyKey: `linear:task-update:${row.id}`,
          source: 'linear',
          suppressDomainEvent: historicalImport,
          suppressLinearOutbox: true,
        });
        if (!updatedTask) throw new Error('Linear task update did not return a task');
        taskAfterRemote = updatedTask;
      }
      // A Linear-side team transfer goes through `moveToTeam` — not the field
      // patch — so the old and new planning scopes are both dirtied and the
      // move is recorded as a `task.moved` domain event.
      if (taskAfterRemote.teamId !== teamLink.teamId) {
        const moved = await integrationTasks.movePublicTaskToTeam(
          taskAfterRemote.id,
          teamLink.teamId,
          {
            eventId: row.id,
            idempotencyKey: `linear:task-move:${row.id}`,
            source: 'linear',
            suppressDomainEvent: historicalImport,
            suppressLinearOutbox: true,
          },
        );
        if (moved) taskAfterRemote = moved;
      }

      const localChanged = Array.from(
        new Set([
          ...changedLinearIssueFields(existingLink.lastConfirmedSnapshot, local),
          ...changedLinearIssueFields(existingLink.lastConfirmedSnapshot, issue).filter((field) =>
            isLinearFieldHumanLocked(task, field),
          ),
        ]),
      ).filter((field) => field !== 'labelIds');
      if (localChanged.length > 0 && !historicalImport) {
        const payload = Object.fromEntries(
          localChanged.flatMap((field) =>
            local[field] === undefined ? [] : [[field, local[field]]],
          ),
        );
        const writeEnabled = binding
          ? linearBindingWriteEnabled(binding)
          : teamLink.syncState === 'synced';
        await model.queueOutbox({
          expectedLocalRevision: taskAfterRemote.domainRevision,
          initialStatus: writeEnabled ? 'pending' : 'paused',
          installationId: installation.id,
          linkId: existingLink.id,
          operation: 'update_issue',
          payload,
          taskId: task.id,
        });
      }

      await model.updateIssueLink(existingLink.id, {
        // When the remote issue left its Linear project, the link must not
        // keep a stale binding — it falls back to pure team scope.
        bindingId: issue.projectId ? (binding?.id ?? existingLink.bindingId) : null,
        conflict: null,
        lastConfirmedSnapshot: issue,
        lastInboundDeliveryId: row.id,
        linearTeamId: issue.teamId ?? existingLink.linearTeamId,
        remoteSnapshot: issue,
        remoteUpdatedAt: incomingUpdatedAt,
        syncState: localChanged.length > 0 && !historicalImport ? 'pending' : 'synced',
      });
      await this.reconcileRelationsForIssue(
        model,
        db,
        integrationTasks,
        binding,
        task.id,
        issue.id,
        relations,
        row.id,
        historicalImport,
      );
      return 'processed';
    };
    const execute = async (model: LinearSyncModel, db: LobeChatDatabase) => {
      const outcome = await run(model, db);
      if (outcome !== 'pending-binding') {
        for (const comment of knownComments) {
          await this.processCommentRow(
            {
              id: `linear-import-comment:${row.id}:${comment.id}`,
              installationId: row.installationId,
            },
            comment,
            { db, historicalImport: options.historicalImport ?? true, model },
          );
        }
      }
      return outcome;
    };
    // Inside an existing transaction reuse its model/db; standalone calls open
    // one so task/link/event writes still commit atomically.
    if (options.model || options.db) {
      return execute(options.model ?? this.model, options.db ?? this.db);
    }
    return this.model.transaction(execute);
  }

  private async processImportIssue(
    row: { installationId: string; subjectId: string | null; id: string },
    issue: LinearIssueSnapshot,
    phase: 'initial' | 'reconciliation',
    provider: LinearIssueProvider,
  ) {
    const [knownComments, knownRelations] = await Promise.all([
      provider.listComments ? provider.listComments(issue.id) : [],
      provider.listRelations ? provider.listRelations(issue.id) : [],
    ]);
    return this.model.transaction(async (model, db) => {
      const outcome = await this.processRow(row, provider, {
        db,
        historicalImport: true,
        knownIssue: issue,
        knownRelations,
        model,
        phase,
      });
      if (outcome !== 'pending-binding') {
        for (const comment of knownComments) {
          await this.processCommentRow(
            {
              id: `linear-import-comment:${row.id}:${comment.id}`,
              installationId: row.installationId,
            },
            comment,
            { db, historicalImport: true, model },
          );
        }
      }
      return outcome;
    });
  }

  private async processRow(
    row: LinearInboundRow,
    provider: LinearIssueProvider,
    context: {
      db?: LobeChatDatabase;
      historicalImport?: boolean;
      knownIssue?: LinearIssueSnapshot;
      knownRelations?: LinearRelationSnapshot[];
      model?: LinearSyncModel;
      phase?: 'initial' | 'reconciliation';
    } = {},
  ): Promise<'imported' | 'paused' | 'pending-binding' | 'processed'> {
    if (!row.subjectId) return 'processed';

    const db = context.db ?? this.db;
    const model = context.model ?? this.model;
    const issue = context.knownIssue ?? (await provider.getIssue(row.subjectId));
    const knownRelations = issueRelationsWithParent(issue, context.knownRelations ?? []);
    const existingLink = await model.findIssueLinkByExternalId(issue.id);
    const installation = await model.findInstallationById(row.installationId);
    if (!installation || installation.status !== 'active') {
      throw new LinearSyncPausedError(
        installation?.status === 'revoked'
          ? 'Linear installation is revoked'
          : 'Linear installation is not active',
      );
    }

    const binding = issue.projectId
      ? await model.lockBindingByLinearProjectId(issue.projectId)
      : null;
    if (!binding) {
      // linear-workspace-v3: an issue outside every project binding can still
      // be in scope through its team's link (projectless or project pending).
      const teamLink = issue.teamId ? await model.findTeamLinkByLinearTeamId(issue.teamId) : null;
      if (teamLink) {
        return this.processScopeIssue(
          { id: row.id, installationId: row.installationId, subjectId: row.subjectId },
          issue,
          provider,
          teamLink.teamId,
          {
            db: context.db,
            historicalImport: context.historicalImport,
            knownRelations,
            model: context.model,
          },
        );
      }
      if (existingLink) {
        await model.recordIssueTombstone({
          deliveryId: row.id,
          idempotencyKey: `linear:tombstone:${row.id}:out_of_scope`,
          issueLinkId: existingLink.id,
          kind: 'out_of_scope',
          linearIssueId: issue.id,
          origin: context.historicalImport ? 'reconciliation' : 'inbound',
          reason: 'Issue is no longer inside an enabled Linear project binding',
          snapshot: issue,
        });
        return 'processed';
      }
      return 'pending-binding';
    }
    if (!linearBindingReadEnabled(binding)) return 'paused';
    if (binding.installationId !== installation.id) {
      throw new Error('Linear issue binding belongs to another installation');
    }

    const integrationTasks = new LinearIntegrationTaskService(
      db,
      this.workspaceId,
      installation.id,
    );
    if (!(await integrationTasks.validateIssueScope({ binding, installation, issue }))) {
      if (existingLink) {
        await model.recordIssueTombstone({
          deliveryId: row.id,
          idempotencyKey: `linear:tombstone:${row.id}:out_of_scope`,
          issueLinkId: existingLink.id,
          kind: 'out_of_scope',
          linearIssueId: issue.id,
          origin: context.historicalImport ? 'reconciliation' : 'inbound',
          reason: 'Issue is outside the validated public team scope',
          snapshot: issue,
        });
      }
      return 'processed';
    }

    if (row.action && isRemoteRemoval(row.action) && row.eventType === 'Issue') {
      return this.processIssueDeletionRow(row, model, issue);
    }

    const incomingUpdatedAt = issue.updatedAt ? new Date(issue.updatedAt) : null;
    if (
      existingLink &&
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

    if (existingLink && issue.archivedAt) {
      await model.recordIssueTombstone({
        deliveryId: row.id,
        idempotencyKey: `linear:tombstone:${row.id}:archived`,
        issueLinkId: existingLink.id,
        kind: 'archived',
        linearIssueId: issue.id,
        origin: context.historicalImport ? 'reconciliation' : 'inbound',
        reason: 'Linear issue is archived',
        snapshot: issue,
      });
      return 'processed';
    }

    if (!existingLink) {
      if (issue.archivedAt) return 'processed';
      const createIntent = await model.findCreateIntentByRemoteIssueId(issue.id);
      const intendedTask =
        createIntent?.taskId && createIntent.installationId === installation.id
          ? await integrationTasks.findPublicTask(createIntent.taskId)
          : null;
      const createTeamLink = issue.teamId
        ? await model.findTeamLinkByLinearTeamId(issue.teamId)
        : null;
      const createTeamModel = installation.installedByUserId
        ? new TeamModel(db, installation.installedByUserId, this.workspaceId)
        : null;
      const task =
        intendedTask?.projectId === binding.projectId && intendedTask.visibility === 'public'
          ? intendedTask
          : await integrationTasks.createPublicTask({
              binding,
              cycleRefId:
                issue.cycleId && createTeamLink && createTeamModel
                  ? ((
                      await createTeamModel.findCycleByRemoteId(
                        createTeamLink.teamId,
                        issue.cycleId,
                      )
                    )?.id ?? null)
                  : null,
              installation,
              issue,
              localTeamId: createTeamLink?.teamId ?? null,
              mutation: {
                eventId: row.id,
                idempotencyKey: `linear:import:${row.id}`,
                source: 'linear',
                suppressDomainEvent: context.historicalImport,
                suppressLinearOutbox: true,
              },
              workflowStateRefId:
                issue.stateId && createTeamLink && createTeamModel
                  ? ((
                      await createTeamModel.findWorkflowStateByRemoteId(
                        createTeamLink.teamId,
                        issue.stateId,
                      )
                    )?.id ?? null)
                  : null,
            });
      if (!task) return 'processed';
      await model.createIssueLink({
        aliasIdentifiers: issue.identifier ? [issue.identifier] : [],
        bindingId: binding.id,
        installationId: installation.id,
        linearIdentifier: issue.identifier,
        linearIssueId: issue.id,
        linearTeamId: issue.teamId,
        organizationId: installation.organizationId,
        remoteSnapshot: issue,
        taskId: task.id,
      });
      await this.reconcileRelationsForIssue(
        model,
        db,
        integrationTasks,
        binding,
        task.id,
        issue.id,
        knownRelations,
        row.id,
        context.historicalImport,
      );
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

    if (
      existingLink.installationId !== installation.id ||
      existingLink.organizationId !== installation.organizationId
    ) {
      throw new Error('Linear issue link installation scope does not match');
    }
    if (existingLink.tombstone) await model.clearIssueTombstone(existingLink.id);

    let task = await integrationTasks.findPublicTask(existingLink.taskId);
    if (!task || task.visibility !== 'public') {
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

    const remoteProjectMoved =
      issue.projectId !== existingLink.lastConfirmedSnapshot.projectId &&
      issue.projectId !== undefined;
    if (remoteProjectMoved) {
      await this.clearCrossProjectEdgesBeforeMove(
        db,
        integrationTasks,
        task,
        binding.projectId,
        row.id,
        Boolean(context.historicalImport),
      );
      for (const relation of knownRelations) {
        if (relation.sourceIssueId !== issue.id && relation.targetIssueId !== issue.id) continue;
        await this.reconcileOneRelation(
          model,
          db,
          integrationTasks,
          relation,
          row.id,
          Boolean(context.historicalImport),
          { projectId: binding.projectId, taskId: task.id },
        );
      }
    }

    const previousParentId = existingLink.lastConfirmedSnapshot.parentId;
    const [currentTaskBoundaryState] = await db
      .select({ parentTaskId: tasks.parentTaskId })
      .from(tasks)
      .where(eq(tasks.id, task.id))
      .limit(1);
    if (
      previousParentId &&
      issue.parentId !== previousParentId &&
      currentTaskBoundaryState?.parentTaskId
    ) {
      const parentLink = await model.findIssueLinkByTaskId(currentTaskBoundaryState.parentTaskId);
      if (parentLink?.linearIssueId === previousParentId) {
        await integrationTasks.updatePublicTask(
          task.id,
          { parentTaskId: null },
          {
            eventId: row.id,
            idempotencyKey: `linear:parent:clear:${row.id}`,
            source: 'linear',
            suppressDomainEvent: Boolean(context.historicalImport),
            suppressLinearOutbox: true,
          },
        );
      }
    }

    // Parent/dependency reconciliation above is itself a task mutation. Read
    // the task again before building a conflict or remote patch so the saved
    // localRevision fences the current task contract rather than the snapshot
    // from before that reconciliation.
    const refreshedTask = await integrationTasks.findPublicTask(existingLink.taskId);
    if (!refreshedTask) return 'processed';
    task = refreshedTask;

    const local = taskLinearIssueSnapshot(
      task,
      issue,
      existingLink.lastConfirmedSnapshot,
      binding.settings,
    );
    const merged = mergeLinearIssueSnapshots({
      base: existingLink.lastConfirmedSnapshot,
      local,
      remote: issue,
    });
    if (merged.conflicts) {
      await model.updateIssueLink(existingLink.id, {
        conflict: {
          ...merged.conflicts,
          localRevision: task.domainRevision,
          remoteUpdatedAt: issue.updatedAt ?? null,
        },
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
    if (
      issue.projectId !== existingLink.lastConfirmedSnapshot.projectId &&
      task.projectId !== binding.projectId
    ) {
      patch.projectId = binding.projectId;
    }
    // Mirror remote team/state/cycle refs for binding-scope issues too: a
    // Linear-side team transfer keeps the same project, and workflow-state /
    // cycle mirrors live on the owning team.
    const remoteTeamLink = issue.teamId
      ? await model.findTeamLinkByLinearTeamId(issue.teamId)
      : null;
    const remoteTeamModel = installation.installedByUserId
      ? new TeamModel(db, installation.installedByUserId, this.workspaceId)
      : null;
    if (issue.stateId && remoteTeamLink && remoteTeamModel) {
      const refId =
        (await remoteTeamModel.findWorkflowStateByRemoteId(remoteTeamLink.teamId, issue.stateId))
          ?.id ?? null;
      if (refId && task.workflowStateRefId !== refId) patch.workflowStateRefId = refId;
    }
    if (remoteTeamLink && remoteTeamModel) {
      const cycleRef = issue.cycleId
        ? ((await remoteTeamModel.findCycleByRemoteId(remoteTeamLink.teamId, issue.cycleId))?.id ??
          null)
        : null;
      if (task.cycleRefId !== cycleRef) patch.cycleRefId = cycleRef;
    }
    let taskAfterRemote = task;
    if (Object.keys(patch).length > 0) {
      const updatedTask = await integrationTasks.updatePublicTask(task.id, patch, {
        eventId: row.id,
        idempotencyKey: `linear:task-update:${row.id}`,
        source: 'linear',
        suppressDomainEvent: context.historicalImport,
        suppressLinearOutbox: true,
      });
      if (!updatedTask) throw new Error('Linear task update did not return a task');
      taskAfterRemote = updatedTask;
    }
    if (
      remoteTeamLink &&
      taskAfterRemote.teamId !== remoteTeamLink.teamId &&
      issue.teamId !== existingLink.linearTeamId
    ) {
      const moved = await integrationTasks.movePublicTaskToTeam(
        taskAfterRemote.id,
        remoteTeamLink.teamId,
        {
          eventId: row.id,
          idempotencyKey: `linear:task-move:${row.id}`,
          source: 'linear',
          suppressDomainEvent: context.historicalImport,
          suppressLinearOutbox: true,
        },
      );
      if (moved) taskAfterRemote = moved;
    }

    const localChanged = Array.from(
      new Set([
        ...changedLinearIssueFields(existingLink.lastConfirmedSnapshot, local),
        ...changedLinearIssueFields(existingLink.lastConfirmedSnapshot, issue).filter((field) =>
          isLinearFieldHumanLocked(task, field),
        ),
      ]),
    ).filter((field) => field !== 'labelIds');
    if (localChanged.length > 0) {
      const payload = Object.fromEntries(
        localChanged.flatMap((field) =>
          local[field] === undefined ? [] : [[field, local[field]]],
        ),
      );
      await model.queueOutbox({
        expectedLocalRevision: taskAfterRemote.domainRevision,
        initialStatus: linearBindingWriteEnabled(binding) ? 'pending' : 'paused',
        installationId: installation.id,
        linkId: existingLink.id,
        operation: 'update_issue',
        payload,
        taskId: task.id,
      });
    }

    await model.updateIssueLink(existingLink.id, {
      bindingId: binding.id,
      conflict: null,
      lastConfirmedSnapshot: issue,
      lastInboundDeliveryId: row.id,
      linearTeamId: issue.teamId ?? existingLink.linearTeamId,
      remoteSnapshot: issue,
      remoteUpdatedAt: incomingUpdatedAt,
      syncState: localChanged.length > 0 ? 'pending' : 'synced',
    });
    await this.reconcileRelationsForIssue(
      model,
      db,
      integrationTasks,
      binding,
      task.id,
      issue.id,
      knownRelations,
      row.id,
      context.historicalImport,
    );
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
