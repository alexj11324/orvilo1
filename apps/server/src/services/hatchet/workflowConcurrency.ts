import { createHash } from 'node:crypto';

import { ConcurrencyLimitStrategy } from '@hatchet-dev/typescript-sdk/v1/index.js';

const MEMORY_TOPIC_PATH = '/api/workflows/memory-user-memory/pipelines/chat-topic/process-topic';

/** Business execution always uses canonical keys. Legacy deliveries are
 * re-enqueued with these keys before claiming a row or executing a workflow.
 */
export const WORKFLOW_DISPATCH_CONCURRENCY = [
  {
    expression: 'has(input.serialKey) ? input.serialKey : input.laneKey',
    limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
    maxRuns: 1,
  },
  {
    expression: 'input.laneKey',
    limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
    maxRuns: 5,
  },
];

export const workflowConcurrencyKeys = (
  path: string,
  dispatchId: string,
  body: unknown,
  fallbackLaneKey: string,
): { laneKey: string; serialKey?: string } => {
  if (path !== MEMORY_TOPIC_PATH) return { laneKey: fallbackLaneKey };
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  // Match the first non-empty user in normalizeMemoryExtractionPayload. Only
  // opaque hashes leave Postgres; old per-topic hashes are not authoritative.
  const userId =
    (Array.isArray(payload.userIds)
      ? payload.userIds.find((id): id is string => typeof id === 'string' && id.length > 0)
      : undefined) || (typeof payload.userId === 'string' ? payload.userId : undefined);
  const laneKey = createHash('sha256')
    .update(`memory-user-memory.process-topic.${userId || 'missing-user'}`)
    .digest('hex');
  return { laneKey, serialKey: dispatchId };
};
