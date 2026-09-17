import { randomUUID } from 'node:crypto';

import type { TaskItem, TaskRunTrigger } from '@orvilo/types';

import {
  TaskDispatchIdempotencyConflictError,
  TaskDispatchModel,
} from '@/database/models/taskDispatch';
import type { TaskDispatchItem } from '@/database/schemas/task';
import type { LobeChatDatabase } from '@/database/type';

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

export class TaskDispatchConflictError extends Error {
  constructor(
    message: string,
    readonly dispatchId: string,
  ) {
    super(message);
  }
}

export class TaskDispatchWaitingError extends Error {
  constructor(
    message: string,
    readonly dispatchId: string,
  ) {
    super(message);
  }
}

export interface PreparedTaskDispatch {
  dispatch: TaskDispatchItem;
  fence: number;
  owner: string;
  task: TaskItem;
}

export class TaskDispatchService {
  private readonly model: TaskDispatchModel;

  constructor(
    db: LobeChatDatabase,
    private readonly workspaceId?: string,
  ) {
    this.model = new TaskDispatchModel(db, workspaceId);
  }

  static allowsInboxFallback(task: TaskItem, trigger: TaskRunTrigger): boolean {
    return (
      trigger === 'manual' &&
      task.assignmentMode === 'manual' &&
      task.orchestrationOwner === 'manual' &&
      task.createdBySubjectKind !== 'integration' &&
      task.createdBySubjectKind !== 'system'
    );
  }

  async prepare(input: {
    idempotencyKey: string;
    planRevision?: number;
    requestedBy: string;
    task: TaskItem;
    trigger: TaskRunTrigger;
  }): Promise<PreparedTaskDispatch> {
    let requested;
    try {
      requested = await this.model.request({
        idempotencyKey: input.idempotencyKey,
        planRevision: input.planRevision,
        requestedBy: input.requestedBy,
        taskId: input.task.id,
        trigger: input.trigger,
      });
    } catch (error) {
      if (error instanceof TaskDispatchIdempotencyConflictError) {
        throw new TaskDispatchConflictError(error.message, input.idempotencyKey);
      }
      throw error;
    }
    if (requested.state === 'busy') {
      throw new TaskDispatchConflictError(
        `Task already has active dispatch ${requested.active.id}`,
        requested.active.id,
      );
    }

    const dispatch = requested.dispatch;
    const currentTask = requested.task;
    if (dispatch.phase === 'waiting') {
      throw new TaskDispatchWaitingError(
        dispatch.waitingReason ?? 'Task execution is waiting for project policy',
        dispatch.id,
      );
    }
    if (!dispatch.agentId && !TaskDispatchService.allowsInboxFallback(currentTask, input.trigger)) {
      await this.model.markWaiting(dispatch.id, 'no_eligible_agent');
      throw new TaskDispatchWaitingError('Task has no eligible execution Agent', dispatch.id);
    }
    if (!['requested', 'claimed'].includes(dispatch.phase)) {
      throw new TaskDispatchConflictError(
        `Dispatch ${dispatch.id} is already ${dispatch.phase}`,
        dispatch.id,
      );
    }

    const owner = `task-runner:${randomUUID()}`;
    const lease = await this.model.claimForProvisioning(dispatch.id, owner, DEFAULT_LEASE_MS);
    if (!lease) {
      throw new TaskDispatchConflictError(
        `Dispatch ${dispatch.id} could not be claimed`,
        dispatch.id,
      );
    }
    return { dispatch: lease.dispatch, fence: lease.fence, owner, task: currentTask };
  }

  async transition(
    prepared: PreparedTaskDispatch,
    input: Parameters<TaskDispatchModel['transition']>[0] & {
      dispatchId?: never;
      fence?: never;
      owner?: never;
    },
  ) {
    const updated = await this.model.transition({
      ...input,
      dispatchId: prepared.dispatch.id,
      fence: prepared.fence,
      owner: prepared.owner,
    });
    if (!updated) {
      throw new TaskDispatchConflictError(
        `Dispatch ${prepared.dispatch.id} lost its lease or changed phase`,
        prepared.dispatch.id,
      );
    }
    return updated;
  }

  async settle(prepared: PreparedTaskDispatch, phase: 'canceled' | 'failed' | 'succeeded') {
    return this.model.settle({
      dispatchId: prepared.dispatch.id,
      expected: [
        'requested',
        'claimed',
        'provisioning',
        'dispatched',
        'running',
        'waiting',
        'cancel_requested',
        'outcome_unknown',
      ],
      fence: prepared.fence,
      generation: prepared.dispatch.generation,
      phase,
    });
  }
}
