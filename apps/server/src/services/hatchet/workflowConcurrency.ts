import { ConcurrencyLimitStrategy } from '@hatchet-dev/typescript-sdk/v1';

const MEMORY_TOPIC_PATH = '/api/workflows/memory-user-memory/pipelines/chat-topic/process-topic';

/** Memory topics share five slots per user; other workflow lanes stay serial.
 * The second gate is shared by old and new payloads. Legacy payloads without
 * a serial key use their lane key and remain safely serial until re-enqueued.
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

export const workflowSerialKey = (path: string, dispatchId: string) =>
  path === MEMORY_TOPIC_PATH ? { serialKey: dispatchId } : {};
