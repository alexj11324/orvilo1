import { createHash, randomUUID } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import { hatchetDispatches } from '@/database/schemas';
import { getServerDB } from '@/database/server';
import { cancelHatchetTask, enqueueHatchetTask } from '@/libs/hatchet';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';

export const HATCHET_WORKFLOW_PATHS = [
  '/api/workflows/agent-eval-run/execute-test-case',
  '/api/workflows/agent-eval-run/finalize-run',
  '/api/workflows/agent-eval-run/paginate-test-cases',
  '/api/workflows/agent-eval-run/resume-agent-trajectory',
  '/api/workflows/agent-eval-run/resume-thread-trajectory',
  '/api/workflows/agent-eval-run/run-agent-trajectory',
  '/api/workflows/agent-eval-run/run-benchmark',
  '/api/workflows/agent-eval-run/run-thread-trajectory',
  '/api/workflows/agent-signal/execute-nightly-review-user',
  '/api/workflows/agent-signal/paginate-nightly-review-users',
  '/api/workflows/agent-signal/run',
  '/api/workflows/expertise-history/run',
  '/api/workflows/expertise-history/topic',
  '/api/workflows/memory-user-memory/call-cron-hourly-analysis',
  '/api/workflows/memory-user-memory/pipelines/chat-topic/process-topic',
  '/api/workflows/memory-user-memory/pipelines/chat-topic/process-topics',
  '/api/workflows/memory-user-memory/pipelines/chat-topic/process-user-topics',
  '/api/workflows/memory-user-memory/pipelines/chat-topic/process-users',
  '/api/workflows/memory-user-memory/pipelines/persona/update-writing',
  '/api/workflows/onboarding/task-recommendations/process',
  '/api/workflows/onboarding/understanding/process-collected',
  '/api/workflows/onboarding/understanding/process-detailed-persona',
  '/api/workflows/onboarding/understanding/process-providers',
  '/api/workflows/topic-auto-summary/dispatch',
  '/api/workflows/topic-auto-summary/execute',
] as const;

export type HatchetWorkflowPath = (typeof HATCHET_WORKFLOW_PATHS)[number];

interface TriggerHatchetWorkflowOptions {
  concurrencyKey?: string;
  headers?: Record<string, string>;
  workflowRunId?: string;
}

const stableKey = (value: string) => createHash('sha256').update(value).digest('hex');
const DISPATCH_ID_PREFIX = 'hatchet-dispatch:';

export const triggerHatchetWorkflow = async (
  path: HatchetWorkflowPath,
  payload: object,
  options: TriggerHatchetWorkflowOptions = {},
): Promise<{ workflowRunId: string }> => {
  const requestId = options.workflowRunId ?? stableKey(JSON.stringify(payload));
  const proposedDispatchId = randomUUID();
  const deduplicationKey = stableKey(`${path}\0${requestId}`);
  const laneKey = stableKey(options.concurrencyKey ?? requestId);
  const db = await getServerDB();
  const [created] = await db
    .insert(hatchetDispatches)
    .values({
      deduplicationKey,
      id: proposedDispatchId,
      laneKey,
      payload: { body: payload, headers: options.headers, path, workflowRunId: requestId },
    })
    .onConflictDoNothing()
    .returning({ id: hatchetDispatches.id, status: hatchetDispatches.status });
  const [dispatch] = created
    ? [created]
    : await db
        .select({ id: hatchetDispatches.id, status: hatchetDispatches.status })
        .from(hatchetDispatches)
        .where(
          and(
            eq(hatchetDispatches.deduplicationKey, deduplicationKey),
            inArray(hatchetDispatches.status, ['pending', 'queued', 'running']),
          ),
        )
        .limit(1);
  if (!dispatch) throw new Error('Failed to create or find active Hatchet dispatch');
  const dispatchId = dispatch.id;
  if (dispatch.status !== 'pending') {
    return { workflowRunId: `${DISPATCH_ID_PREFIX}${dispatchId}` };
  }

  try {
    const providerRunId = await enqueueHatchetTask(HATCHET_TASK_NAMES.workflowDispatch, {
      deduplicationKey,
      dispatchId,
      laneKey,
    });
    await db
      .update(hatchetDispatches)
      .set({ error: null, providerRunId, status: 'queued', updatedAt: new Date() })
      .where(eq(hatchetDispatches.id, dispatchId));
  } catch (error) {
    await db
      .update(hatchetDispatches)
      .set({
        error: error instanceof Error ? error.message : String(error),
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(hatchetDispatches.id, dispatchId));
    throw error;
  }

  return { workflowRunId: `${DISPATCH_ID_PREFIX}${dispatchId}` };
};

export const cancelHatchetWorkflow = async (workflowRunId: string): Promise<boolean> => {
  if (!workflowRunId.startsWith(DISPATCH_ID_PREFIX)) return false;
  const dispatchId = workflowRunId.slice(DISPATCH_ID_PREFIX.length);
  const db = await getServerDB();
  const [dispatch] = await db
    .select({ providerRunId: hatchetDispatches.providerRunId })
    .from(hatchetDispatches)
    .where(eq(hatchetDispatches.id, dispatchId))
    .limit(1);
  if (!dispatch) return false;
  if (dispatch?.providerRunId) await cancelHatchetTask(dispatch.providerRunId);
  await db
    .update(hatchetDispatches)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(hatchetDispatches.id, dispatchId));
  return true;
};
