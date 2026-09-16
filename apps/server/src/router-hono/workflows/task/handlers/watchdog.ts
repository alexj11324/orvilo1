import debug from 'debug';
import type { Context } from 'hono';

import { BriefModel } from '@/database/models/brief';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { getServerDB } from '@/database/server';
import { AiAgentService } from '@/server/services/aiAgent';
import { TaskIntegrationService } from '@/server/services/taskIntegration';
import { TaskResultBridgeService } from '@/server/services/taskResultBridge';
import { TaskResultCallbackRedisStore } from '@/server/services/taskResultBridge/redisStore';

const log = debug('lobe-server:workflows:task:watchdog');

/**
 * Cron-style watchdog. Scans all `running` tasks where
 * `lastHeartbeatAt + heartbeatTimeout < now()` and marks them `failed`,
 * leaving an urgent brief for the user.
 *
 * No per-user authentication: this is a global sweep registered as a QStash
 * Schedule (cron). Signature verification is handled by the `qstashAuth`
 * middleware mounted on the route.
 */
export async function watchdog(c: Context) {
  try {
    const db = await getServerDB();
    const stuckTasks = await TaskModel.findStuckTasks(db);
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
            if (!result.success || result.deviceCancellationConfirmed === false) {
              cancellationConfirmed = false;
              log(
                'Watchdog cancellation unconfirmed: task=%s operation=%s success=%s device=%s',
                task.identifier,
                operationId,
                result.success,
                result.deviceCancellationConfirmed,
              );
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

        for (const topic of runningTopics) {
          if (topic.topicId) await taskTopicModel.cancelIfRunning(task.id, topic.topicId);
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

      await new TaskIntegrationService(db, task.createdByUserId, wsId).cleanupTaskWorktrees(
        task.id,
      );

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

    const recoverableCallbacks = await TaskResultCallbackRedisStore.findRecoverableScopes();
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
    return c.json({
      checked: stuckTasks.length,
      canceled,
      cancellationRequired,
      failed,
      recoveredCallbacks,
      success: true,
    });
  } catch (error) {
    console.error('[task/watchdog] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
}
