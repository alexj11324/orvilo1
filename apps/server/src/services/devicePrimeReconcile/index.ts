import type { OrviloDatabase } from '@orvilo/database';
import { ChatErrorType } from '@orvilo/types';
import debug from 'debug';
import { and, eq, sql } from 'drizzle-orm';

import { MessageModel } from '@/database/models/message';
import { TopicModel } from '@/database/models/topic';
import { type AgentOperationItem, agentOperations } from '@/database/schemas/agentOperations';
import { createStreamEventManager } from '@/server/modules/AgentExecution/factory';
import { CompletionLifecycle } from '@/server/services/agentExecution/CompletionLifecycle';
import { hookDispatcher } from '@/server/services/agentExecution/hooks';
import {
  readRemoteRunAdmission,
  writeRemoteRunAdmission,
} from '@/server/services/heterogeneousAgent/runAdmission';

const log = debug('orvilo-server:device-prime-reconcile');

/**
 * Bound on "the device accepted the dispatch but never activated the run".
 * `openPrimeDeviceRun` activates within seconds of the request landing; an
 * admission still `pending`/`acknowledged` past this window means the device
 * rejected post-ack (enqueue-ack semantics hide the verdict from the server),
 * the gateway call's transport died, or the daemon died before launch.
 */
const DEFAULT_ACTIVATE_DEADLINE_MS = 2 * 60 * 1000;
/**
 * Staleness bound for an activated-but-quiet run — mirrors the operation
 * lease convention (`taskDispatchRecovery`'s DEFAULT_STALE_OPERATION_MS):
 * every ingested event bumps `updatedAt` via `touchRunning`, so a running op
 * whose lease went cold has no live producer left.
 */
const DEFAULT_STALE_OPERATION_MS = 5 * 60 * 1000;

const SWEEP_LIMIT = 200;

export type DevicePrimeReconcileOutcome =
  | { operationId: string; outcome: 'settled_dead_execution' }
  | { operationId: string; outcome: 'settled_no_activation' }
  | { operationId: string; outcome: 'skipped'; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Mirror of primeBroker's readDevicePrimeSession — the durable activation record. */
const devicePrimeActivated = (metadata: unknown): boolean =>
  isRecord(metadata) &&
  isRecord(metadata.devicePrime) &&
  typeof metadata.devicePrime.sessionId === 'string' &&
  metadata.devicePrime.sessionId.length > 0;

const assistantMessageIdOf = (operation: AgentOperationItem): string | undefined => {
  const id = (operation.metadata as Record<string, unknown> | null)?.assistantMessageId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
};

/**
 * Retire ops that a post-ack device verdict stranded: the op row is the only
 * `running` truth left once the device's enqueue swallowed the rejection (or
 * the daemon died mid-run), so the server-side reconcile is the honest close.
 * Same terminal funnel every other dispatch failure uses — error bubble,
 * `CompletionLifecycle.completeOperation`, stream end, topic settle — so task
 * lifecycle hooks and the renderer see an ordinary failed/interrupted run.
 */
const settleNoActivation = async (
  db: OrviloDatabase,
  operation: AgentOperationItem,
): Promise<void> => {
  const detail =
    'The device accepted this run but never activated it — the daemon may be offline or it rejected the dispatch after acknowledging it.';
  const message = 'The device never started this run';
  const assistantMessageId = assistantMessageIdOf(operation);
  if (assistantMessageId) {
    await new MessageModel(db, operation.userId, operation.workspaceId ?? undefined).update(
      assistantMessageId,
      {
        content: '',
        error: {
          body: { detail },
          message,
          type: ChatErrorType.ServerAgentRuntimeError,
        },
      },
    );
  }
  await new CompletionLifecycle(
    db,
    operation.userId,
    operation.workspaceId ?? undefined,
  ).completeOperation(
    {
      agentId: operation.agentId ?? undefined,
      assistantMessageId,
      error: { message, type: ChatErrorType.ServerAgentRuntimeError },
      operationId: operation.id,
      serializedHooks: hookDispatcher.getSerializedHooks(operation.id),
      topicId: operation.topicId ?? '',
      userId: operation.userId,
    },
    'error',
    { skipErrorMessageWrite: true },
  );
  try {
    await createStreamEventManager().publishAgentRuntimeEnd({
      finalState: { error: detail },
      operationId: operation.id,
      reason: 'error',
      reasonDetail: detail,
      stepIndex: 0,
    });
  } catch (err) {
    log(
      'device-prime-reconcile: publishAgentRuntimeEnd failed op=%s (non-fatal): %O',
      operation.id,
      err,
    );
  }
  if (operation.topicId) {
    try {
      await new TopicModel(
        db,
        operation.userId,
        operation.workspaceId ?? undefined,
      ).settleRunningOperation(operation.topicId, operation.id, 'active');
    } catch (err) {
      log(
        'device-prime-reconcile: settleRunningOperation failed op=%s (non-fatal): %O',
        operation.id,
        err,
      );
    }
  }
};

/** A run that activated, produced, then lost its producer — interrupted, not failed. */
const settleDeadExecution = async (
  db: OrviloDatabase,
  operation: AgentOperationItem,
): Promise<void> => {
  const assistantMessageId = assistantMessageIdOf(operation);
  await new CompletionLifecycle(
    db,
    operation.userId,
    operation.workspaceId ?? undefined,
  ).completeOperation(
    {
      agentId: operation.agentId ?? undefined,
      assistantMessageId,
      operationId: operation.id,
      serializedHooks: hookDispatcher.getSerializedHooks(operation.id),
      topicId: operation.topicId ?? '',
      userId: operation.userId,
    },
    'interrupted',
  );
  try {
    await createStreamEventManager().publishAgentRuntimeEnd({
      finalState: {},
      operationId: operation.id,
      reason: 'interrupted',
      reasonDetail:
        'The device run stopped producing events — the daemon exited or lost its lease.',
      stepIndex: 0,
    });
  } catch (err) {
    log(
      'device-prime-reconcile: publishAgentRuntimeEnd failed op=%s (non-fatal): %O',
      operation.id,
      err,
    );
  }
  if (operation.topicId) {
    try {
      await new TopicModel(
        db,
        operation.userId,
        operation.workspaceId ?? undefined,
      ).settleRunningOperation(operation.topicId, operation.id, 'active');
    } catch (err) {
      log(
        'device-prime-reconcile: settleRunningOperation failed op=%s (non-fatal): %O',
        operation.id,
        err,
      );
    }
  }
};

/**
 * Server-side reconcile for prime device runs stranded by post-ack device
 * rejections or dead producers. Runs inside the global watchdog alongside the
 * task-dispatch sweeps; conversation subjects have no dispatch row, so this
 * sweep is their only convergence path (task subjects' dispatch leases carry
 * their own recovery — activated task runs are left to that sweep).
 *
 * Two clauses:
 * - never-activated: admission `pending`/`acknowledged` and stale, no
 *   `devicePrime` activation record → settle `error` + ledger `unknown`.
 * - dead producer: activation recorded (or ledger reached `running`) on a
 *   conversation op whose liveness tick went cold → settle `interrupted`.
 * The device-side teardown (lease lapse → op settle) covers a live daemon
 * losing the lease; this sweep closes the cases where no device verdict ever
 * arrives at the server.
 */
export const sweepDevicePrimeRunReconcile = async (input: {
  activateDeadlineMs?: number;
  db: OrviloDatabase;
  now?: number;
  staleOperationMs?: number;
}): Promise<DevicePrimeReconcileOutcome[]> => {
  const { db } = input;
  const now = input.now ?? Date.now();
  const activateBefore = now - (input.activateDeadlineMs ?? DEFAULT_ACTIVATE_DEADLINE_MS);
  const staleBefore = new Date(now - (input.staleOperationMs ?? DEFAULT_STALE_OPERATION_MS));

  const candidates = await db
    .select()
    .from(agentOperations)
    .where(
      and(
        eq(agentOperations.status, 'running'),
        sql`${agentOperations.metadata} -> 'remoteAdmission' ->> 'channel' = 'agent_run_request'`,
        sql`${agentOperations.metadata} -> 'remoteAdmission' ->> 'harness' = 'prime'`,
      ),
    )
    .limit(SWEEP_LIMIT);

  const outcomes: DevicePrimeReconcileOutcome[] = [];
  for (const operation of candidates) {
    const admission = readRemoteRunAdmission(operation.metadata);
    if (!admission) {
      outcomes.push({ operationId: operation.id, outcome: 'skipped', reason: 'no_admission' });
      continue;
    }
    const activated = devicePrimeActivated(operation.metadata) || admission.state === 'running';
    try {
      if (
        !activated &&
        (admission.state === 'pending' || admission.state === 'acknowledged') &&
        Date.parse(admission.updatedAt) < activateBefore
      ) {
        // Close the ledger from pending/acknowledged — 'unknown' is the honest
        // verdict (enqueue-ack semantics never deliver the device's rejection).
        await writeRemoteRunAdmission(db, operation.id, {
          errorCode: 'DEVICE_PRIME_NO_ACTIVATION',
          reason: 'prime reconcile: admitted run never activated on the device',
          state: 'unknown',
        });
        await settleNoActivation(db, operation);
        outcomes.push({ operationId: operation.id, outcome: 'settled_no_activation' });
        continue;
      }
      if (activated && operation.taskId === null && operation.updatedAt < staleBefore) {
        // Task-subject runs keep their own convergence: the dispatch lease +
        // `sweepTaskDispatchRecovery` settle both the dispatch and the op.
        await settleDeadExecution(db, operation);
        outcomes.push({ operationId: operation.id, outcome: 'settled_dead_execution' });
        continue;
      }
      outcomes.push({ operationId: operation.id, outcome: 'skipped', reason: 'live' });
    } catch (err) {
      log('device-prime-reconcile: settle failed op=%s: %O', operation.id, err);
      outcomes.push({ operationId: operation.id, outcome: 'skipped', reason: 'settle_failed' });
    }
  }
  return outcomes;
};
