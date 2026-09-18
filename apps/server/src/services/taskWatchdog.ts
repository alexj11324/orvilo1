import debug from 'debug';

import { BriefModel } from '@/database/models/brief';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import type { OrviloDatabase } from '@/database/type';
import { AiAgentService } from '@/server/services/aiAgent';
import { TaskIntegrationService } from '@/server/services/taskIntegration';
import { TaskResultBridgeService } from '@/server/services/taskResultBridge';
import { TaskResultCallbackRedisStore } from '@/server/services/taskResultBridge/redisStore';

const log = debug('orvilo-server:task-watchdog');

export interface TaskWatchdogOptions {
  /** Restrict a manual/API sweep to tasks created by this user. */
  createdByUserId?: string;
  /** Workspace scope for a manual/API sweep; omitted means personal mode. */
  workspaceId?: string;
}

export interface TaskWatchdogResult {
  canceled: string[];
  cancellationRequired: string[];
  checked: number;
  failed: string[];
  recoveredCallbacks: string[];
  success: true;
}

/**
 * Scan heartbeat-expired tasks and reclaim them only after every live
 * operation confirms cancellation. The scheduled Hono endpoint calls this
 * without an owner filter; user/API callers pass their own creator scope.
 */
export async function runTaskWatchdog(
  db: OrviloDatabase,
  options: TaskWatchdogOptions = {},
): Promise<TaskWatchdogResult> {
  const stuckTasks = await TaskModel.findStuckTasks(db, options);
  const failed: string[] = [];
  const cancellationRequired: string[] = [];
  const canceled: string[] = [];

  for (const task of stuckTasks) {
    const wsId = task.workspaceId ?? undefined;
    const taskModel = new TaskModel(db, task.createdByUserId, wsId);
    const taskTopicModel = new TaskTopicModel(db, task.createdByUserId, wsId);
    const runningTopics = (await taskTopicModel.findByTaskId(task.id)).filter(
      (topic) => topic.status === 'running',
    );
    if (runningTopics.length > 0) {
      // A heartbeat deadline does not prove the external writer exited. Stop
      // every owned operation first; only an acknowledged interruption lets
      // the watchdog cancel its topic and reclaim run-owned worktrees.
      const aiAgentService = new AiAgentService(db, task.createdByUserId, {
        workspaceId: wsId,
      });
      const operationIds = [
        ...new Set(
          runningTopics
            .map((topic) => topic.operationId)
            .filter((operationId): operationId is string => Boolean(operationId)),
        ),
      ];
      let cancellationConfirmed = runningTopics.every((topic) => Boolean(topic.operationId));
      for (const operationId of operationIds) {
        try {
          const result = await aiAgentService.interruptTask({ operationId });
          const operationCancellationConfirmed =
            result.success && result.deviceCancellationConfirmed !== false;
          if (!operationCancellationConfirmed) {
            cancellationConfirmed = false;
            log(
              'Watchdog cancellation unconfirmed: task=%s operation=%s success=%s device=%s',
              task.identifier,
              operationId,
              result.success,
              result.deviceCancellationConfirmed,
            );
            continue;
          }

          // Persist each confirmed operation immediately. If a sibling
          // operation remains live, the next sweep must see this topic as
          // terminal instead of retrying an already-interrupted operation.
          for (const topic of runningTopics) {
            if (topic.operationId === operationId && topic.topicId) {
              await taskTopicModel.cancelIfRunning(task.id, topic.topicId);
            }
          }
        } catch (error) {
          cancellationConfirmed = false;
          log(
            'Watchdog cancellation failed: task=%s operation=%s error=%O',
            task.identifier,
            operationId,
            error,
          );
        }
      }
      if (!cancellationConfirmed) {
        // Preserve the live generation and its worktree for a retry. A later
        // sweep can address the same operation while the device identity is
        // still present in the topic metadata.
        cancellationRequired.push(task.identifier);
        continue;
      }
    }

    const failureExtra = {
      completedAt: new Date(),
      error: 'Heartbeat timeout',
      runReservationExpiresAt: null,
      runReservationId: null,
    } as const;
    const failedTask = task.runReservationId
      ? await taskModel.updateStatusIfReservation(
          task.id,
          task.runReservationId,
          'running',
          'failed',
          failureExtra,
        )
      : await taskModel.updateStatusIfCurrent(task.id, 'running', 'failed', failureExtra);
    if (!failedTask) {
      log('Watchdog failure ignored superseded task=%s', task.identifier);
      continue;
    }

    await new TaskIntegrationService(db, task.createdByUserId, wsId).cleanupTaskWorktrees(task.id);

    const briefModel = new BriefModel(db, task.createdByUserId, wsId);
    await briefModel.create({
      agentId: task.assigneeAgentId || undefined,
      priority: 'urgent',
      summary: `Task has been running without heartbeat update for more than ${task.heartbeatTimeout} seconds.`,
      taskId: task.id,
      title: `${task.identifier} heartbeat timeout`,
      trigger: 'task',
      type: 'error',
    });

    failed.push(task.identifier);
    if (runningTopics.length > 0) canceled.push(task.identifier);
  }

  const recoverableCallbacks = (await TaskResultCallbackRedisStore.findRecoverableScopes()).filter(
    (scope) => {
      if (!options.createdByUserId) return true;
      return (
        scope.userId === options.createdByUserId &&
        (options.workspaceId ? scope.workspaceId === options.workspaceId : !scope.workspaceId)
      );
    },
  );
  const recoveredCallbacks: string[] = [];
  for (const scope of recoverableCallbacks) {
    if (!scope.agentId) continue;
    try {
      const workspaceId = scope.workspaceId ?? undefined;
      const callbackStore = new TaskResultCallbackRedisStore(
        scope.userId,
        scope.originTopicId,
        workspaceId,
      );
      await callbackStore.resetStaleProcessing();
      await new TaskResultBridgeService(db, scope.userId, workspaceId).drain(
        scope.agentId,
        scope.originTopicId,
      );
      recoveredCallbacks.push(scope.originTopicId);
    } catch (error) {
      console.error(
        `[task/watchdog] Failed to recover creator callback scope ${scope.originTopicId}:`,
        error,
      );
    }
  }

  log(
    'Watchdog scan: checked=%d canceled=%d failed=%d callbacks=%d',
    stuckTasks.length,
    canceled.length,
    failed.length,
    recoveredCallbacks.length,
  );

  return {
    checked: stuckTasks.length,
    canceled,
    cancellationRequired,
    failed,
    recoveredCallbacks,
    success: true,
  };
}
