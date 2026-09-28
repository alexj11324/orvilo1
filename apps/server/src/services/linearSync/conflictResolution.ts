import type { LinearIssueSnapshot } from '@orvilo/types';

import {
  linearBindingReadEnabled,
  linearBindingWriteEnabled,
  LinearSyncModel,
} from '@/database/models/linearSync';
import type { OrviloDatabase } from '@/database/type';

import { LinearIntegrationTaskService } from './integrationTask';
import {
  buildLinearConflictResolution,
  type LinearConflictFieldSource,
  type LinearConflictResolutionStrategy,
  taskLinearIssueSnapshot,
  taskPatchForResolvedLinearSnapshot,
} from './merge';

export type LinearConflictResolutionErrorCode =
  'CONFLICT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PRECONDITION_FAILED';

export class LinearConflictResolutionError extends Error {
  constructor(
    readonly code: LinearConflictResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LinearConflictResolutionError';
  }
}

export interface ResolveLinearConflictInput {
  expectedDetectedAt: string;
  expectedLocalRevision: number;
  expectedRemoteUpdatedAt: string | null;
  fieldSources?: Record<string, LinearConflictFieldSource>;
  issueLinkId: string;
  strategy: LinearConflictResolutionStrategy;
}

const normalizeTimestamp = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const sameTimestamp = (left: Date | string | null | undefined, right: string | null) =>
  normalizeTimestamp(left) === normalizeTimestamp(right);

const projectSource = (input: ResolveLinearConflictInput): LinearConflictFieldSource =>
  input.strategy === 'keep_local'
    ? 'local'
    : input.strategy === 'keep_linear'
      ? 'linear'
      : (input.fieldSources?.projectId ?? 'linear');

export class LinearConflictResolutionService {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly workspaceId: string,
  ) {}

  async resolve(input: ResolveLinearConflictInput) {
    return this.db.transaction(async (tx) => {
      const db = tx as unknown as OrviloDatabase;
      const model = new LinearSyncModel(db, this.workspaceId);
      const context = await model.lockIssueConflictContext(input.issueLinkId);
      if (!context) {
        throw new LinearConflictResolutionError('NOT_FOUND', 'Linear conflict was not found');
      }

      const { installation, issueLink, task } = context;
      const conflict = issueLink.conflict;
      if (!conflict || issueLink.syncState !== 'conflict') {
        throw new LinearConflictResolutionError(
          'CONFLICT',
          'Linear conflict has already changed; reload before resolving it',
        );
      }
      if (
        conflict.detectedAt !== input.expectedDetectedAt ||
        conflict.localRevision !== input.expectedLocalRevision ||
        task.domainRevision !== input.expectedLocalRevision ||
        !sameTimestamp(
          conflict.remoteUpdatedAt ?? issueLink.remoteUpdatedAt,
          input.expectedRemoteUpdatedAt,
        )
      ) {
        throw new LinearConflictResolutionError(
          'CONFLICT',
          'Linear conflict versions changed; reload before resolving it',
        );
      }
      if (installation.status !== 'active') {
        throw new LinearConflictResolutionError(
          'PRECONDITION_FAILED',
          'Linear installation must be reauthorized before resolving conflicts',
        );
      }
      if (!context.binding || context.binding.installationId !== installation.id) {
        throw new LinearConflictResolutionError(
          'PRECONDITION_FAILED',
          'Linear conflict no longer has a valid project binding',
        );
      }
      if (task.visibility !== 'public') {
        throw new LinearConflictResolutionError(
          'FORBIDDEN',
          'Only public tasks can resolve Linear synchronization conflicts',
        );
      }

      const remote = issueLink.remoteSnapshot;
      if (!remote) {
        throw new LinearConflictResolutionError(
          'PRECONDITION_FAILED',
          'Linear conflict has no current remote snapshot',
        );
      }

      let binding = context.binding;
      if (remote.projectId && remote.projectId !== binding.linearProjectId) {
        const remoteBinding = await model.lockBindingByLinearProjectId(remote.projectId);
        if (!remoteBinding || remoteBinding.installationId !== installation.id) {
          throw new LinearConflictResolutionError(
            'PRECONDITION_FAILED',
            'The current Linear project is outside the installed binding scope',
          );
        }
        binding = remoteBinding;
      }

      const choosesLocalProject =
        conflict.fields.includes('projectId') && projectSource(input) === 'local';
      if (choosesLocalProject) {
        if (!task.projectId) {
          throw new LinearConflictResolutionError(
            'PRECONDITION_FAILED',
            'The local task has no project binding to resolve',
          );
        }
        const localBinding = await model.lockBindingByProjectId(task.projectId);
        if (!localBinding || localBinding.installationId !== installation.id) {
          throw new LinearConflictResolutionError(
            'PRECONDITION_FAILED',
            'The local task project has no compatible Linear binding',
          );
        }
        binding = localBinding;
      }

      if (input.strategy === 'keep_linear' && !linearBindingReadEnabled(binding)) {
        throw new LinearConflictResolutionError(
          'PRECONDITION_FAILED',
          'Linear reads are disabled for this project binding',
        );
      }

      const local = taskLinearIssueSnapshot(
        task,
        remote,
        issueLink.lastConfirmedSnapshot,
        binding.settings,
      );
      const resolution = buildLinearConflictResolution({
        base: issueLink.lastConfirmedSnapshot,
        conflict,
        fieldSources: input.fieldSources,
        local,
        remote,
        strategy: input.strategy,
      });
      if (conflict.fields.includes('projectId')) {
        resolution.resolved.projectId = binding.linearProjectId;
        if (remote.projectId === binding.linearProjectId) {
          delete resolution.outboundPatch.projectId;
        } else {
          resolution.outboundPatch.projectId = binding.linearProjectId;
        }
      }

      const integrationTasks = new LinearIntegrationTaskService(
        db,
        this.workspaceId,
        installation.id,
      );
      const taskPatch = taskPatchForResolvedLinearSnapshot(
        task,
        local,
        resolution.resolved,
        binding.settings,
      );
      if (task.projectId !== binding.projectId) taskPatch.projectId = binding.projectId;

      const updatedTask =
        Object.keys(taskPatch).length > 0
          ? await integrationTasks.updatePublicTask(task.id, taskPatch, {
              idempotencyKey: `linear:conflict-resolution:${issueLink.id}:${conflict.detectedAt}`,
              source: 'linear',
              suppressLinearOutbox: true,
            })
          : task;
      if (!updatedTask) {
        throw new LinearConflictResolutionError(
          'CONFLICT',
          'The local task changed while resolving its Linear conflict',
        );
      }

      let outbox;
      try {
        outbox = await model.replaceIssueConflictOutbox({
          expectedLocalRevision: updatedTask.domainRevision,
          initialStatus: linearBindingWriteEnabled(binding) ? 'pending' : 'paused',
          installationId: installation.id,
          linkId: issueLink.id,
          payload: resolution.outboundPatch,
          reason: `Superseded by ${input.strategy} conflict resolution`,
          taskId: task.id,
        });
      } catch (error) {
        if (error instanceof Error && /in-flight|unknown write outcome/i.test(error.message)) {
          throw new LinearConflictResolutionError('CONFLICT', error.message);
        }
        throw error;
      }

      const syncState = outbox ? 'pending' : 'synced';
      const link = await model.updateIssueLink(issueLink.id, {
        bindingId: binding.id,
        conflict: null,
        lastConfirmedSnapshot: remote as LinearIssueSnapshot,
        remoteSnapshot: remote,
        remoteUpdatedAt: remote.updatedAt ? new Date(remote.updatedAt) : issueLink.remoteUpdatedAt,
        syncState,
      });
      if (!link) {
        throw new LinearConflictResolutionError(
          'CONFLICT',
          'Linear issue link changed while resolving its conflict',
        );
      }

      return {
        installationId: installation.id,
        issueLink: link,
        outboxQueued: Boolean(outbox),
        strategy: input.strategy,
      };
    });
  }
}
