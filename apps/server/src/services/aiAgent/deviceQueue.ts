import { DeviceTransportErrorCode } from '@orvilo/device-gateway-client';
import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import type { AcpBuiltinToolSpec } from '@orvilo/types';
import { AEGIS_PACK_ENV, ChatErrorType, resolveHarnessAdapter } from '@orvilo/types';
import { toRecord } from '@orvilo/utils/object';
import { and, inArray, sql } from 'drizzle-orm';

import { AgentModel } from '@/database/models/agent';
import { AgentOperationModel } from '@/database/models/agentOperation';
import { MessageModel } from '@/database/models/message';
import { TaskModel } from '@/database/models/task';
import { TopicModel } from '@/database/models/topic';
import { agentOperations } from '@/database/schemas';
import type { AgentOperationItem } from '@/database/schemas/agentOperations';
import type { OrviloDatabase } from '@/database/type';
import { signHeteroOperationJWT } from '@/libs/trpc/utils/internalJwt';
import { createStreamEventManager } from '@/server/modules/AgentExecution/factory';
import { assertCanUseWorkspaceAgent } from '@/server/routers/lambda/_helpers/workspaceAgentGuard';
import { CompletionLifecycle } from '@/server/services/agentExecution/CompletionLifecycle';
import type { SerializedHook } from '@/server/services/agentExecution/hooks/types';
import type { CanonicalRunBinding } from '@/server/services/controlPlane/canonicalRun';
import { composeDevicePrimeRun } from '@/server/services/controlPlane/devicePrimeDispatch';
import type { EmbeddedDispatchContext } from '@/server/services/controlPlane/embeddedDispatch';
import { deviceGateway } from '@/server/services/deviceGateway';
import { resolveDeviceDispatchAuthorizationFailure } from '@/server/services/deviceGateway/dispatchAuthorization';
import { resolveAttachmentsByFileIds } from '@/server/services/file/resolveAttachments';

/** Reuse the existing five-minute reconnect/recovery window. */
export const DEVICE_QUEUE_GRACE_MS = 5 * 60_000;

/** Prepared run data only. Credentials and signed file URLs are minted at launch. */
export interface DeviceQueuePayload {
  aegisEnabled?: boolean;
  agentId: string;
  agentType: HeterogeneousAgentType;
  args?: string[];
  assistantMessageId: string;
  builtinTools?: AcpBuiltinToolSpec[];
  channel: 'agent_run_request' | 'tool_call';
  cwd?: string;
  deviceId: string;
  deviceWorkspaceId?: string;
  imageFileIds?: string[];
  model?: string;
  platformAgentId?: string;
  primeRegistration?: CanonicalRunBinding;
  primeTask?: EmbeddedDispatchContext;
  prompt: string;
  resumeFallbackSystemContext?: string;
  resumeSessionId?: string;
  systemContext?: string;
  topicId: string;
  topicStartOwnerOperationId?: string;
  userMessageId: string;
}

export interface DeviceQueue {
  /** Confirmed observed silence; the gateway does not expose last-heartbeat time. */
  offlineSince: string;
  payload: DeviceQueuePayload;
  queuedAt: string;
  state: 'launching' | 'waiting';
}

export const readDeviceQueue = (metadata: unknown): DeviceQueue | undefined => {
  const queue = toRecord(toRecord(metadata)?.deviceQueue);
  if (!queue || !['waiting', 'launching'].includes(String(queue.state))) return;
  const payload = toRecord(queue.payload);
  if (
    !payload ||
    typeof payload.deviceId !== 'string' ||
    typeof payload.prompt !== 'string' ||
    typeof payload.topicId !== 'string' ||
    typeof payload.assistantMessageId !== 'string' ||
    typeof payload.agentId !== 'string' ||
    typeof payload.agentType !== 'string' ||
    !['agent_run_request', 'tool_call'].includes(String(payload.channel)) ||
    !Number.isFinite(Date.parse(String(queue.queuedAt))) ||
    !Number.isFinite(Date.parse(String(queue.offlineSince)))
  )
    return;
  return queue as unknown as DeviceQueue;
};

export const isQueuedDeviceOperation = (
  operation: { metadata?: unknown; status: string } | null | undefined,
): boolean =>
  operation?.status === 'idle' && readDeviceQueue(operation.metadata)?.state === 'waiting';

export const deviceQueueExpired = (
  queue: DeviceQueue,
  now: number,
  graceMs = DEVICE_QUEUE_GRACE_MS,
): boolean =>
  now - Date.parse(queue.queuedAt) > graceMs && now - Date.parse(queue.offlineSince) > graceMs;

export const isDefinitiveDeviceOffline = (result: {
  error?: string;
  errorCode?: string;
  success: boolean;
}): boolean => {
  const code = result.errorCode ?? result.error;
  return (
    !result.success &&
    (code === DeviceTransportErrorCode.DeviceNotFound ||
      code === DeviceTransportErrorCode.DeviceChannelUnavailable)
  );
};

/** Called only for a definitive offline-before-launch result. Never parks an unknown ACK. */
export async function queueOfflineDeviceRun(
  db: OrviloDatabase,
  userId: string,
  operationId: string,
  payload: DeviceQueuePayload,
  workspaceId?: string,
  previous?: DeviceQueue,
): Promise<boolean> {
  if (
    await resolveDeviceDispatchAuthorizationFailure(
      db,
      userId,
      payload.deviceId,
      payload.deviceWorkspaceId,
    )
  )
    return false;
  const model = new AgentOperationModel(db, userId, workspaceId);
  const now = new Date().toISOString();
  const queue: DeviceQueue = {
    offlineSince: previous?.offlineSince ?? now,
    payload,
    queuedAt: previous?.queuedAt ?? now,
    state: 'waiting',
  };
  return model.parkForDevice(operationId, { ...queue });
}

/** Transaction-aware: cancellation uses the same row CAS as the launch claim. */
export async function cancelQueuedDeviceOperation(
  db: OrviloDatabase,
  userId: string,
  operationId: string,
  workspaceId?: string,
): Promise<boolean> {
  return new AgentOperationModel(db, userId, workspaceId).cancelDeviceQueue(operationId);
}

/** Complete the original operation and its original hooks after cancellation/expiry commits. */
export async function finishQueuedDeviceOperation(
  db: OrviloDatabase,
  operation: AgentOperationItem,
): Promise<void> {
  const workspaceId = operation.workspaceId ?? undefined;
  const queue = readDeviceQueue(operation.metadata);
  if (!queue || !['error', 'interrupted'].includes(operation.status)) return;
  const model = new AgentOperationModel(db, operation.userId, workspaceId);
  const reason = operation.status === 'error' ? 'error' : 'interrupted';
  await new CompletionLifecycle(db, operation.userId, workspaceId).completeOperation(
    {
      agentId: operation.agentId ?? undefined,
      assistantMessageId: queue.payload.assistantMessageId,
      error: reason === 'error' ? (operation.error ?? undefined) : undefined,
      operationId: operation.id,
      serializedHooks: operation.metadata?._hooks as SerializedHook[] | undefined,
      topicId: operation.topicId ?? undefined,
      userId: operation.userId,
    },
    reason,
  );
  try {
    await new TopicModel(db, operation.userId, workspaceId).settleRunningOperation(
      queue.payload.topicId,
      operation.id,
      'active',
    );
  } catch (error) {
    console.error('[device-queue] Topic settle failed', { operationId: operation.id, error });
  }
  try {
    await createStreamEventManager().publishAgentRuntimeEnd({
      finalState: { error: operation.error },
      operationId: operation.id,
      reason,
      reasonDetail: operation.error?.message,
      stepIndex: 0,
    });
  } catch (error) {
    console.error('[device-queue] Stream close failed', { operationId: operation.id, error });
  }
  await model.clearDeviceQueue(operation.id);
}

/** The same device wire used by an ordinary run; no new turn or operation is created. */
export async function dispatchQueuedDeviceRun(
  db: OrviloDatabase,
  operation: AgentOperationItem,
  payload: DeviceQueuePayload,
) {
  const workspaceId = operation.workspaceId ?? undefined;
  let request: Parameters<typeof deviceGateway.dispatchAgentRun>[0];
  try {
    if (!(await queuedLaunchStillAllowed(db, operation)))
      return { error: 'DEVICE_QUEUE_CANCELED', success: false };
    const authorization = await resolveDeviceDispatchAuthorizationFailure(
      db,
      operation.userId,
      payload.deviceId,
      payload.deviceWorkspaceId,
    );
    if (authorization)
      return {
        error: authorization.code,
        errorCode: DeviceTransportErrorCode.DeviceNotFound,
        success: false,
      };
    if (workspaceId)
      await assertCanUseWorkspaceAgent({
        agentId: payload.agentId,
        groupId: operation.chatGroupId ?? undefined,
        db,
        userId: operation.userId,
        workspaceId,
      });
    if (payload.channel === 'tool_call') {
      if (!(await queuedLaunchStillAllowed(db, operation)))
        return { error: 'DEVICE_QUEUE_CANCELED', success: false };
      return deviceGateway.executeToolCall(
        {
          deviceId: payload.deviceId,
          userId: operation.userId,
          workspaceId: payload.deviceWorkspaceId,
        },
        {
          apiName: 'runHeteroTask',
          identifier: 'runHeteroTask',
          arguments: JSON.stringify({
            agentId: payload.agentId,
            agentType: payload.agentType,
            cwd: payload.cwd,
            idempotencyKey: operation.id,
            operationId: operation.id,
            parentOperationId: payload.topicStartOwnerOperationId,
            platformAgentId: payload.platformAgentId,
            prompt: payload.prompt,
            runGeneration: 1,
            taskId: operation.id,
            topicId: payload.topicId,
            workspaceId,
          }),
        },
        120_000,
      );
    }
    const jwt = await signHeteroOperationJWT({
      capabilities: [
        'hetero:ingest',
        'hetero:finish',
        'hetero:intervention:read',
        ...(payload.builtinTools?.length ? ['hetero:tool:exec' as const] : []),
      ],
      operationId: operation.id,
      userId: operation.userId,
      workspaceId,
    });
    const attachments = payload.imageFileIds?.length
      ? await resolveAttachmentsByFileIds({
          db,
          fileIds: payload.imageFileIds,
          userId: operation.userId,
          workspaceId,
        })
      : undefined;
    let prime;
    if (resolveHarnessAdapter(payload.agentType) === 'prime') {
      const composed = await composeDevicePrimeRun(
        { database: db, userId: operation.userId, workspaceId },
        {
          deviceId: payload.deviceId,
          model: payload.model,
          operationId: operation.id,
          queuedRegistration: payload.primeRegistration,
          task: payload.primeTask,
          topicId: payload.topicId,
        },
      );
      if (!composed.ok)
        return { error: composed.error?.message ?? 'Prime run is unavailable', success: false };
      prime = composed.value.descriptor;
      payload.primeRegistration = composed.value.binding;
    }
    const agent = await new AgentModel(
      db,
      operation.userId,
      workspaceId,
    ).getAgentConfigForExecution(payload.agentId);
    const provider = agent?.agencyConfig?.heterogeneousProvider;
    // Cancellation after the claim still fences this last pre-send boundary.
    if (!(await queuedLaunchStillAllowed(db, operation)))
      return { error: 'DEVICE_QUEUE_CANCELED', success: false };
    request = {
      agentType: payload.agentType,
      args: payload.args,
      assistantMessageId: payload.assistantMessageId,
      builtinTools: payload.builtinTools,
      cwd: payload.cwd,
      deviceId: payload.deviceId,
      env: {
        ...(provider?.type === payload.agentType ? provider.env : undefined),
        ...(payload.aegisEnabled ? { [AEGIS_PACK_ENV]: '1' } : {}),
        ORVILO_AGENT_ID: payload.agentId,
      },
      idempotencyKey: operation.id,
      imageList: attachments?.imageList.map((image) => ({ id: image.id, url: image.url })),
      ingestWorkspaceId: workspaceId,
      jwt,
      operationId: operation.id,
      prime,
      prompt: payload.prompt,
      resumeFallbackSystemContext: payload.resumeFallbackSystemContext,
      resumeSessionId: payload.resumeSessionId,
      runGeneration: 1,
      systemContext: payload.systemContext,
      topicId: payload.topicId,
      userId: operation.userId,
      workspaceId: payload.deviceWorkspaceId,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      errorCode: DeviceTransportErrorCode.GatewayRejected,
      success: false,
    };
  }
  return deviceGateway.dispatchAgentRun(request);
}

async function queuedLaunchStillAllowed(
  db: OrviloDatabase,
  operation: AgentOperationItem,
): Promise<boolean> {
  const current = await new AgentOperationModel(
    db,
    operation.userId,
    operation.workspaceId ?? undefined,
  ).findById(operation.id);
  if (current?.status !== 'running') return false;
  const cycleId = current.appContext?.issueReviewCycleId;
  if (typeof cycleId === 'string') {
    if (!current.taskId) return false;
    const task = await new TaskModel(db, current.userId, current.workspaceId ?? undefined).findById(
      current.taskId,
    );
    const { readIssueReview } = await import('../task/review');
    const review = task && readIssueReview(task);
    if (
      !task ||
      task.workflowCategory !== 'in_review' ||
      task.reviewerAgentId !== current.agentId ||
      review?.cycleId !== cycleId ||
      review.reviewerOperationId !== current.id
    )
      return false;
  }
  const repairCycleId = current.appContext?.issueReviewRepairCycleId;
  if (
    typeof repairCycleId === 'string' &&
    (!current.taskId ||
      !(await new TaskModel(
        db,
        current.userId,
        current.workspaceId ?? undefined,
      ).isIssueReviewRepairCurrent(current.taskId, { cycleId: repairCycleId })))
  )
    return false;
  return true;
}

/** Existing watchdog/local recovery ticks drive this shared ordinary operation queue. */
export async function sweepQueuedDeviceOperations(input: {
  db: OrviloDatabase;
  graceMs?: number;
  now?: number;
}) {
  const { db } = input;
  const now = input.now ?? Date.now();
  const candidates = await db
    .select()
    .from(agentOperations)
    .where(
      and(
        inArray(agentOperations.status, ['idle', 'error', 'interrupted']),
        sql`${agentOperations.metadata} ? 'deviceQueue'`,
      ),
    )
    .limit(100);
  const outcomes: Array<{
    operationId: string;
    outcome: 'waiting' | 'resumed' | 'expired' | 'canceled' | 'unknown' | 'failed';
  }> = [];
  for (const operation of candidates) {
    const queue = readDeviceQueue(operation.metadata);
    if (!queue) continue;
    const workspaceId = operation.workspaceId ?? undefined;
    const model = new AgentOperationModel(db, operation.userId, workspaceId);
    try {
      if (operation.status !== 'idle') {
        await finishQueuedDeviceOperation(db, operation);
        outcomes.push({ operationId: operation.id, outcome: 'canceled' });
        continue;
      }
      let online: boolean;
      try {
        online = await deviceGateway.queryDevicePresence(
          operation.userId,
          queue.payload.deviceId,
          queue.payload.deviceWorkspaceId,
        );
      } catch (error) {
        // An observation gap cannot prove continuous silence. Restart that clock,
        // preserving queuedAt so every already-offline assignment still gets its grace.
        await model.parkForDevice(
          operation.id,
          { ...queue, offlineSince: new Date(now).toISOString() },
          { ...queue },
        );
        console.error('[device-queue] Device presence unavailable', {
          operationId: operation.id,
          error,
        });
        continue;
      }
      if (!online) {
        if (deviceQueueExpired(queue, now, input.graceMs)) {
          const error = {
            message: 'The run device stayed offline past the reconnect grace period.',
            type: ChatErrorType.ServerAgentRuntimeError,
          };
          if (await model.settleDeviceQueue(operation.id, 'error', error, { ...queue })) {
            const settled = await model.findById(operation.id);
            if (settled) await finishQueuedDeviceOperation(db, settled);
          }
          outcomes.push({ operationId: operation.id, outcome: 'expired' });
        } else outcomes.push({ operationId: operation.id, outcome: 'waiting' });
        continue;
      }
      const claimed = await model.claimDeviceQueue(operation.id);
      if (!claimed) continue;
      const result = await dispatchQueuedDeviceRun(db, claimed, queue.payload);
      if (result.error === 'DEVICE_QUEUE_CANCELED') {
        await model.recordCompletion(operation.id, { status: 'interrupted' });
        const stopped = await model.findById(operation.id);
        if (stopped) await finishQueuedDeviceOperation(db, stopped);
        outcomes.push({ operationId: operation.id, outcome: 'canceled' });
        continue;
      }
      if (
        isDefinitiveDeviceOffline(result) &&
        (await queueOfflineDeviceRun(
          db,
          operation.userId,
          operation.id,
          queue.payload,
          workspaceId,
          {
            ...queue,
            offlineSince: new Date(now).toISOString(),
          },
        ))
      ) {
        outcomes.push({ operationId: operation.id, outcome: 'waiting' });
        continue;
      }
      const { finalizeHeteroDispatchError, settleRemoteDispatchOutcome } =
        await import('./pipeline/heteroDispatch');
      const deps = {
        db,
        messageModel: new MessageModel(db, operation.userId, workspaceId),
        topicModel: new TopicModel(db, operation.userId, workspaceId),
        userId: operation.userId,
        workspaceId,
      };
      const outcome = await settleRemoteDispatchOutcome(deps, {
        ...result,
        operationId: operation.id,
        topicId: queue.payload.topicId,
      });
      if (outcome.outcome === 'terminal') {
        await finalizeHeteroDispatchError(deps, {
          agentId: queue.payload.agentId,
          assistantMessageId: queue.payload.assistantMessageId,
          detail: result.error ?? 'Device run dispatch failed',
          message: result.error ?? 'Device run dispatch failed',
          operationId: operation.id,
          topicId: queue.payload.topicId,
        });
      }
      await model.clearDeviceQueue(operation.id);
      outcomes.push({
        operationId: operation.id,
        outcome:
          outcome.outcome === 'unknown'
            ? 'unknown'
            : outcome.outcome === 'terminal'
              ? 'failed'
              : 'resumed',
      });
    } catch (error) {
      console.error('[device-queue] Sweep failed', { operationId: operation.id, error });
    }
  }
  return outcomes;
}
