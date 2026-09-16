import { createHash, randomUUID } from 'node:crypto';

import debug from 'debug';

import { cancelHatchetTask, enqueueHatchetTask } from '@/libs/hatchet';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';

import type { HealthCheckResult, QueueMessage, QueueStats } from '../types';
import type { QueueServiceImpl } from './type';

const log = debug('lobe-server:service:queue:hatchet');
const HATCHET_MESSAGE_BUDGET_BYTES = 9 * 1024 * 1024;
const OVERSIZED_STRING_KEEP_LADDER = [25_000, 4000, 512, 0];

export interface HatchetAgentStepInput {
  context?: QueueMessage['context'];
  deduplicationKey: string;
  endpoint: string;
  operationId: string;
  payload?: QueueMessage['payload'];
  priority: NonNullable<QueueMessage['priority']>;
  retries: number;
  retryDelay?: string;
  stepIndex: number;
  timestamp: number;
}

const byteLength = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');

const clampOversizedStrings = (value: unknown, keep: number): unknown => {
  if (typeof value === 'string') {
    if (value.length <= keep) return value;
    const omitted = value.length - keep;
    return `${value.slice(0, keep)}\n\n[Truncated: ${omitted.toLocaleString()} characters omitted so the step could be scheduled. Original length: ${value.length.toLocaleString()} characters]`;
  }

  if (Array.isArray(value)) return value.map((entry) => clampOversizedStrings(entry, keep));

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        clampOversizedStrings(entry, keep),
      ]),
    );
  }

  return value;
};

const toProviderId = (logicalId: string): string =>
  createHash('sha256').update(logicalId).digest('hex');

export class HatchetQueueServiceImpl implements QueueServiceImpl {
  async scheduleMessage(message: QueueMessage): Promise<string> {
    const {
      operationId,
      stepIndex,
      context,
      deduplicationId,
      endpoint,
      payload,
      delay = 50,
      priority = 'normal',
      retryDelay,
      retries = 3,
    } = message;
    const input = this.fitInputToQuota(
      {
        context,
        deduplicationKey: toProviderId(deduplicationId ?? randomUUID()),
        endpoint,
        operationId,
        payload,
        priority,
        retries,
        retryDelay,
        stepIndex,
        timestamp: Date.now(),
      },
      operationId,
    );

    const pathname = new URL(endpoint).pathname;
    const taskName = pathname.endsWith('/api/agent/run')
      ? HATCHET_TASK_NAMES.agentStep
      : pathname.endsWith('/api/agent/webhooks/bot-replay')
        ? HATCHET_TASK_NAMES.botReplay
        : undefined;
    if (!taskName) throw new Error(`Unsupported Hatchet queue endpoint: ${pathname}`);

    const taskId = await enqueueHatchetTask(taskName, input, {
      delayMs: delay,
      priority,
    });
    log('[%s] scheduled step %d with Hatchet task %s', operationId, stepIndex, taskId);
    return taskId;
  }

  private fitInputToQuota(input: HatchetAgentStepInput, operationId: string) {
    const size = byteLength(input);
    if (size <= HATCHET_MESSAGE_BUDGET_BYTES) return input;

    for (const keep of OVERSIZED_STRING_KEEP_LADDER) {
      const clamped = clampOversizedStrings(input, keep) as HatchetAgentStepInput;
      const clampedBytes = byteLength(clamped);
      if (clampedBytes > HATCHET_MESSAGE_BUDGET_BYTES) continue;

      console.warn(
        JSON.stringify({
          bytes: size,
          clampedBytes,
          event: 'agent.queue.oversized_message_clamped',
          limitBytes: HATCHET_MESSAGE_BUDGET_BYTES,
          operationId,
          stringKeep: keep,
        }),
      );
      return clamped;
    }

    throw new Error(
      `Hatchet message for operation ${operationId} is ${size} bytes and cannot be reduced under the ${HATCHET_MESSAGE_BUDGET_BYTES} byte budget`,
    );
  }

  async scheduleBatchMessages(messages: QueueMessage[]): Promise<string[]> {
    return Promise.all(messages.map((message) => this.scheduleMessage(message)));
  }

  async cancelScheduledTask(taskId: string): Promise<void> {
    await cancelHatchetTask(taskId);
  }

  async getQueueStats(): Promise<QueueStats> {
    return { completedCount: 0, failedCount: 0, pendingCount: 0, processingCount: 0 };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return { healthy: true, message: 'Hatchet queue service is configured' };
  }
}
