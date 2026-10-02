/**
 * Orchestration-scenario harness driver: transitions a task through the real
 * TaskService.updateStatus path — the same service the task.updateStatus tRPC
 * mutation calls — so status moves carry the product's side effects instead of
 * raw SQL writes. Two uses in the real-agent scenarios:
 *
 *   --status completed  force-completes a paused task the way a user accepts a
 *                       run at the review gate; fires cascadeOnCompletion so
 *                       blocked dependents are unlocked and run.
 *   --status backlog    requeues a paused/failed task the way a user retries;
 *                       the next backlog-intake pass re-dispatches it (and the
 *                       tiered matcher can escalate off the terminal dispatch).
 *
 *   bunx vite-node --config apps/server/viteNodeServer.config.ts \
 *     e2e/orchestration/drivers/setstatus.ts --task <taskId> --status completed
 */
import type { TaskStatus } from '@orvilo/types';

import { TaskService } from '../../../apps/server/src/services/task';
import { getServerDB } from '../../../packages/database/src/server';

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

const taskId = arg('--task');
const status = arg('--status');
const ALLOWED: ReadonlySet<string> = new Set(['backlog', 'completed']);
if (!taskId || !status || !ALLOWED.has(status)) {
  console.error('usage: setstatus --task <taskId> --status backlog|completed');
  process.exit(2);
}

const db = await getServerDB();
const userId = process.env.ORCH_USER_ID ?? 'user_agent_testing_001';
const workspaceId = process.env.ORCH_WORKSPACE_ID ?? 'ws_e2e';

const result = await new TaskService(db, userId, workspaceId).updateStatus(
  { id: taskId, status: status as TaskStatus },
  { userId },
);

console.log('===SETSTATUS_JSON===' + JSON.stringify(result));
process.exit(0);
