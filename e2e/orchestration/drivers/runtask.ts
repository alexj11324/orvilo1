/**
 * Orchestration-scenario harness driver: fires N concurrent
 * TaskRunnerService.runTask calls against one task with distinct idempotency
 * keys — the durable-dispatch CAS must admit exactly one active dispatch and
 * reject the rest with TaskDispatchConflictError (TRPCError CONFLICT).
 *
 *   bunx vite-node --config apps/server/viteNodeServer.config.ts \
 *     e2e/orchestration/drivers/runtask.ts --task <taskId> --count 2
 */
import { TaskRunnerService } from '../../../apps/server/src/services/taskRunner';
import { getServerDB } from '../../../packages/database/src/server';

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

const taskId = arg('--task');
const count = Number(arg('--count') ?? 2);
// 'manual' skips the project-policy admission gate (which only applies to
// orchestrator/schedule/heartbeat/event triggers) so the loser reaches the
// per-task dispatch fence instead of parking on project_concurrency_limit.
const trigger = (arg('--trigger') ?? 'manual') as 'manual' | 'orchestrator';
if (!taskId) {
  console.error('usage: runtask --task <taskId> --count <n> [--trigger manual]');
  process.exit(2);
}

const db = await getServerDB();
const userId = process.env.ORCH_USER_ID ?? 'user_agent_testing_001';
const workspaceId = process.env.ORCH_WORKSPACE_ID ?? 'ws_e2e';

const results = await Promise.allSettled(
  Array.from({ length: count }, (_, i) =>
    new TaskRunnerService(db, userId, workspaceId).runTask({
      idempotencyKey: `orch-scenario3:${taskId}:attempt:${i}`,
      requestedBy: 'orchestration_scenario_harness',
      taskId,
      trigger,
    }),
  ),
);

results.forEach((result, i) => {
  if (result.status === 'fulfilled') {
    const value = result.value as {
      dispatchId?: string;
      operationId?: string;
      status?: string;
      taskIdentifier?: string;
      topicId?: string;
    };
    console.log(
      `===RUNTASK|${i}|FULFILLED|dispatch=${value?.dispatchId} op=${value?.operationId} status=${value?.status} task=${value?.taskIdentifier}`,
    );
  } else {
    const error = result.reason as {
      cause?: { code?: string; message?: string };
      code?: string;
      message?: string;
      name?: string;
    };
    const code = error?.cause?.code ?? error?.code ?? error?.name ?? 'UNKNOWN';
    console.log(
      `===RUNTASK|${i}|REJECTED|${error?.name}:${code}|${error?.cause?.message ?? error?.message ?? ''}`,
    );
  }
});
process.exit(0);
