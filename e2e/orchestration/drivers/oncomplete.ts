/**
 * Orchestration-scenario harness driver: delivers the on-topic-complete
 * lifecycle webhook in-process (the same handler the Hatchet worker POSTs to).
 * Ids are read from the DB for the given --task, so the run must be a real
 * minted or fabricated dispatch + operation + topic triple.
 *
 *   bunx vite-node --config apps/server/viteNodeServer.config.ts \
 *     e2e/orchestration/drivers/oncomplete.ts --task <taskId> [--reason done]
 */
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';

import { onTopicComplete } from '../../../apps/server/src/router-hono/workflows/task/handlers/onTopicComplete';
import { getServerDB } from '../../../packages/database/src/server';

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

const taskId = arg('--task');
const reasonOverride = arg('--reason');
const runTrigger = arg('--trigger') ?? 'orchestrator';
if (!taskId) {
  console.error('usage: oncomplete --task <taskId> [--reason done|error|interrupted]');
  process.exit(2);
}

const db = await getServerDB();
const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => {
  const result = (await db.execute(query)) as { rows?: T[] } | T[];
  return Array.isArray(result) ? result : (result.rows ?? []);
};

const [run] = await rows<{
  dispatch_fence: number;
  dispatch_id: string;
  execution_generation: number;
  operation_id: string;
  operation_status: string;
  task_identifier: string;
  topic_id: string;
  user_id: string;
}>(sql`
  SELECT d.id AS dispatch_id,
         d.fence AS dispatch_fence,
         d.generation AS execution_generation,
         d.operation_id,
         o.status AS operation_status,
         t.identifier AS task_identifier,
         t.current_topic_id AS topic_id,
         coalesce(t.created_by_user_id, t.created_by_subject_id) AS user_id
  FROM task_dispatches d
  JOIN tasks t ON t.id = d.task_id
  JOIN agent_operations o ON o.id = d.operation_id
  WHERE d.task_id = ${taskId}
    AND d.operation_id IS NOT NULL
  ORDER BY d.created_at DESC
  LIMIT 1
`);
if (!run) {
  console.error(`no dispatch/op rows found for task=${taskId}`);
  process.exit(3);
}

// The device executor marks the operation terminal before the webhook fires;
// the handler requires op.status to equal the webhook reason.
const reason = reasonOverride ?? run.operation_status;

const response = await onTopicComplete({
  json: (body: unknown, status = 200, headers?: HeadersInit) =>
    Response.json(body, { headers, status }),
  req: {
    json: async () => ({
      dispatchFence: run.dispatch_fence,
      dispatchId: run.dispatch_id,
      executionGeneration: run.execution_generation,
      lastAssistantContent: 'Run finished.',
      operationId: run.operation_id,
      reason,
      runTrigger,
      taskId,
      taskIdentifier: run.task_identifier,
      topicId: run.topic_id,
      userId: run.user_id,
    }),
  },
} as unknown as Context);

const body = await response.json();
console.log('===ONCOMPLETE_STATUS===' + response.status);
console.log('===ONCOMPLETE_JSON===' + JSON.stringify(body));
process.exit(0);
