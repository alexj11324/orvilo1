import { createHash, randomUUID } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import { hatchetDispatches } from '@/database/schemas';
import { getServerDB } from '@/database/server';
import { cancelHatchetTask, enqueueHatchetTask } from '@/libs/hatchet';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';

export const HATCHET_WORKFLOW_PATHS = [
  '/api/agent/webhooks/group-member-callback',
  '/api/agent/webhooks/subagent-callback',
  '/api/agent/webhooks/thread-run-callback',
  '/api/workflows/agent-eval-run/on-thread-complete',
  '/api/workflows/agent-eval-run/on-trajectory-complete',
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
  '/api/workflows/linear-sync/process',
  '/api/workflows/linear-sync/execute',
  '/api/workflows/task/on-creator-complete',
  '/api/workflows/task/on-topic-complete',
  '/api/workflows/topic-auto-summary/dispatch',
  '/api/workflows/topic-auto-summary/execute',
  '/api/workflows/verify/on-evidence-complete',
  '/api/workflows/verify/on-verifier-complete',
] as const;

export type HatchetWorkflowPath = (typeof HATCHET_WORKFLOW_PATHS)[number];

export const isHatchetWorkflowPath = (path: string): path is HatchetWorkflowPath =>
  HATCHET_WORKFLOW_PATHS.includes(path as HatchetWorkflowPath);

interface TriggerHatchetWorkflowOptions {
  concurrencyKey?: string;
  delayMs?: number;
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
  const values = {
    deduplicationKey,
    id: proposedDispatchId,
    laneKey,
    payload: { body: payload, headers: options.headers, path, workflowRunId: requestId },
  };
  const insertDispatch = async () =>
    db
      .insert(hatchetDispatches)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: hatchetDispatches.id, status: hatchetDispatches.status });
  const [created] = await insertDispatch();
  let dispatch = created;
  if (!dispatch) {
    [dispatch] = await db
      .select({ id: hatchetDispatches.id, status: hatchetDispatches.status })
      .from(hatchetDispatches)
      .where(
        and(
          eq(hatchetDispatches.deduplicationKey, deduplicationKey),
          inArray(hatchetDispatches.status, ['pending', 'queued', 'running']),
        ),
      )
      .limit(1);

    // A conflicting active row may have reached a terminal state between the
    // insert and the lookup. Retry the insert so terminal history does not
    // block a new logical run with the same deduplication key.
    if (!dispatch) {
      [dispatch] = await insertDispatch();
      if (!dispatch) {
        [dispatch] = await db
          .select({ id: hatchetDispatches.id, status: hatchetDispatches.status })
          .from(hatchetDispatches)
          .where(
            and(
              eq(hatchetDispatches.deduplicationKey, deduplicationKey),
              inArray(hatchetDispatches.status, ['pending', 'queued', 'running']),
            ),
          )
          .limit(1);
      }
    }
  }
  if (!dispatch) throw new Error('Failed to create or find active Hatchet dispatch');
  const dispatchId = dispatch.id;
  if (dispatch.status !== 'pending') {
    return { workflowRunId: `${DISPATCH_ID_PREFIX}${dispatchId}` };
  }

  try {
    const providerRunId =
      options.delayMs === undefined
        ? await enqueueHatchetTask(HATCHET_TASK_NAMES.workflowDispatch, {
            deduplicationKey,
            dispatchId,
            laneKey,
          })
        : await enqueueHatchetTask(
            HATCHET_TASK_NAMES.workflowDispatch,
            {
              deduplicationKey,
              dispatchId,
              laneKey,
            },
            { delayMs: options.delayMs },
          );
    // Persist the provider receipt independently of the state transition. The
    // worker can claim and finish the row before the publisher gets scheduled
    // again; losing this id would make a later cancellation unable to reach
    // Hatchet.
    await db
      .update(hatchetDispatches)
      .set({ providerRunId, updatedAt: new Date() })
      .where(eq(hatchetDispatches.id, dispatchId));
    const [transitioned] = await db
      .update(hatchetDispatches)
      .set({ error: null, status: 'queued', updatedAt: new Date() })
      .where(and(eq(hatchetDispatches.id, dispatchId), eq(hatchetDispatches.status, 'pending')))
      .returning({ status: hatchetDispatches.status });

    // The worker is allowed to claim a dispatch as soon as Hatchet accepts it.
    // Never let this publisher acknowledgement move a running or terminal row
    // backwards. If cancellation won the race, cancel the provider run that was
    // just created so the stale delivery becomes a no-op.
    if (!transitioned) {
      const [current] = await db
        .select({ status: hatchetDispatches.status })
        .from(hatchetDispatches)
        .where(eq(hatchetDispatches.id, dispatchId))
        .limit(1);
      if (current?.status === 'cancelled') {
        await cancelHatchetTask(providerRunId).catch((cancelError) => {
          console.error('[hatchet] failed to cancel raced dispatch', {
            cancelError,
            dispatchId,
            providerRunId,
          });
        });
      }
    }
  } catch (error) {
    await db
      .update(hatchetDispatches)
      .set({
        error: error instanceof Error ? error.message : String(error),
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(and(eq(hatchetDispatches.id, dispatchId), eq(hatchetDispatches.status, 'pending')));
    throw error;
  }

  return { workflowRunId: `${DISPATCH_ID_PREFIX}${dispatchId}` };
};

export const cancelHatchetWorkflow = async (workflowRunId: string): Promise<boolean> => {
  if (!workflowRunId.startsWith(DISPATCH_ID_PREFIX)) return false;
  const dispatchId = workflowRunId.slice(DISPATCH_ID_PREFIX.length);
  const db = await getServerDB();
  const [dispatch] = await db
    .select({ providerRunId: hatchetDispatches.providerRunId, status: hatchetDispatches.status })
    .from(hatchetDispatches)
    .where(eq(hatchetDispatches.id, dispatchId))
    .limit(1);
  if (!dispatch) return false;

  const [cancelled] = await db
    .update(hatchetDispatches)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(hatchetDispatches.id, dispatchId),
        inArray(hatchetDispatches.status, ['pending', 'queued', 'running']),
      ),
    )
    .returning({ providerRunId: hatchetDispatches.providerRunId });

  if (cancelled?.providerRunId) {
    await cancelHatchetTask(cancelled.providerRunId).catch((error) => {
      console.error('[hatchet] provider cancellation failed', { dispatchId, error });
    });
  } else if (dispatch.status === 'cancelled' && dispatch.providerRunId) {
    // A concurrent caller may have won the database transition. Keep provider
    // cancellation idempotent for that case as well.
    await cancelHatchetTask(dispatch.providerRunId).catch((error) => {
      console.error('[hatchet] provider cancellation retry failed', { dispatchId, error });
    });
  }

  return Boolean(cancelled || dispatch.status === 'cancelled');
};
