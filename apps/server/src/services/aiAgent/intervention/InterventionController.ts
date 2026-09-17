import type { AgentState } from '@orvilo/agent-runtime';
import type { OrviloDatabase } from '@orvilo/database';
import {
  isBuiltinHeterogeneousType,
  isLocalHeterogeneousType,
  isRemoteHeterogeneousType,
} from '@orvilo/heterogeneous-agents';
import { ThreadStatus } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';
import debug from 'debug';

import {
  deriveAgentInterventionQueueDeduplicationId,
  matchesAgentInterventionContinuationProvenance,
} from '@/business/server/agent-run/agentInterventionIdentity';
import type { AgentOperationModel } from '@/database/models/agentOperation';
import type { MessageModel } from '@/database/models/message';
import { HumanApprovalAlreadyResolvedError } from '@/database/models/message';
import type { ThreadModel } from '@/database/models/thread';
import type { TopicModel } from '@/database/models/topic';
import type { AgentRuntimeService } from '@/server/services/agentRuntime';
import { deviceGateway } from '@/server/services/deviceGateway';
import {
  markRemoteCancelRequested,
  readRemoteRunAdmission,
  resolveRemoteCancel,
} from '@/server/services/heterogeneousAgent/runAdmission';

import { STOPPED_TOOL_CONTENT } from '../helpers/agentFactory';

const log = debug('orvilo-server:ai-agent-service');

interface InterventionControllerDeps {
  agentOperationModel: AgentOperationModel;
  agentRuntimeService: AgentRuntimeService;
  db: OrviloDatabase;
  messageModel: MessageModel;
  resolveDeviceWorkspaceId: (deviceId: string | undefined) => Promise<string | undefined>;
  threadModel: ThreadModel;
  topicModel: TopicModel;
  userId: string;
}

/**
 * Owner-scoped collaborator for run interruption and human-approval lifecycle:
 * interrupt a live run (coordinating device-hosted process shutdown), settle
 * parked approval batches, retire superseded operations, and repair
 * intervention continuation anchors.
 */
export class InterventionController {
  private readonly deps: InterventionControllerDeps;

  constructor(deps: InterventionControllerDeps) {
    this.deps = deps;
  }

  /**
   * Interrupts a running task and coordinates any device-hosted process shutdown.
   *
   * Call stack:
   *
   * execAgent (replacement path)
   *   -> {@link AiAgentService.interruptTask}
   *     -> deviceGateway.executeToolCall(cancelHeteroTask)
   *       -> HeterogeneousAgentCtr.cancelLhHeteroExec
   *
   * Use when:
   * - A user stops an agent runtime by thread or operation id.
   * - A replacement run must wait for a device-hosted native writer to exit.
   *
   * Expects:
   * - At least one of `threadId` or `operationId` resolves to an owned operation.
   *
   * Returns:
   * - Runtime cancellation status and, for local device agents, whether process exit was confirmed.
   */
  async interruptTask(params: {
    operationId?: string;
    threadId?: string;
    topicId?: string;
  }): Promise<{
    cancelState: 'confirmed' | 'none' | 'requested' | 'unknown';
    deviceCancellationConfirmed?: boolean;
    operationId?: string;
    success: boolean;
    threadId?: string;
  }> {
    const { threadId, operationId, topicId } = params;

    log('interruptTask: threadId=%s, operationId=%s', threadId, operationId);

    // 1. Get operationId and thread
    let resolvedOperationId = operationId;
    let thread;
    let deviceCancellationConfirmed: boolean | undefined;

    if (threadId) {
      thread = await this.deps.threadModel.findById(threadId);
      if (!thread) {
        throw new Error('Thread not found');
      }
      resolvedOperationId = resolvedOperationId || thread.metadata?.operationId;
    }

    if (!resolvedOperationId) {
      throw new Error('Operation ID not found');
    }

    // One owner-scoped read covers every downstream need: the topic fallback
    // for callers that don't know it, the durable admission ledger (the pinned
    // execution host + cancel tri-state), and the terminal-state check.
    const durableOperation = await this.deps.agentOperationModel.findById(resolvedOperationId);
    const resolvedTopicId = topicId ?? durableOperation?.topicId ?? undefined;
    const admission = readRemoteRunAdmission(durableOperation?.metadata);

    // 2. Resolve the device-hosted process target. Prefer the topic's
    // runningOperation marker (heteroType tells us a device process exists);
    // fall back to the durable admission record, which pins the exact device
    // the run was admitted on — the marker may already be gone when an
    // ambiguous run keeps executing after a reconnect.
    let deviceTarget:
      | {
          deviceId: string;
          deviceUserId?: string;
          deviceWorkspaceId?: string;
          taskId: string;
        }
      | undefined;

    if (resolvedTopicId) {
      const topic = await this.deps.topicModel.findById(resolvedTopicId);
      const runningOp = (topic?.metadata as any)?.runningOperation as
        | {
            deviceId?: string;
            deviceUserId?: string;
            deviceWorkspaceId?: string;
            heteroType?: string;
            operationId?: string;
            childOperations?: Array<{
              deviceId?: string;
              deviceUserId?: string;
              deviceWorkspaceId?: string;
              heteroType?: string;
              operationId?: string;
            }>;
          }
        | undefined;
      const targetOperation =
        runningOp?.operationId === resolvedOperationId
          ? runningOp
          : runningOp?.childOperations?.find((child) => child.operationId === resolvedOperationId);

      if (
        targetOperation?.deviceId &&
        targetOperation.heteroType &&
        (isRemoteHeterogeneousType(targetOperation.heteroType) ||
          isLocalHeterogeneousType(targetOperation.heteroType) ||
          // The builtin Orvilo harness runs on the device through the engine's
          // CLI family — runningOperation keeps the declared 'orvilo' type.
          isBuiltinHeterogeneousType(targetOperation.heteroType))
      ) {
        deviceTarget = {
          deviceId: targetOperation.deviceId,
          deviceUserId: targetOperation.deviceUserId,
          deviceWorkspaceId: targetOperation.deviceWorkspaceId,
          taskId: targetOperation.operationId ?? resolvedOperationId,
        };
      }
    }

    if (
      !deviceTarget &&
      admission?.deviceId &&
      admission.state !== 'offline' &&
      admission.state !== 'rejected'
    ) {
      // The admission's idempotency key IS the device-side task id
      // (idempotencyKey === operationId === taskId by construction).
      deviceTarget = {
        deviceId: admission.deviceId,
        deviceUserId: admission.deviceUserId,
        deviceWorkspaceId: admission.deviceWorkspaceId,
        taskId: resolvedOperationId,
      };
    }

    if (deviceTarget) {
      log(
        'interruptTask: cancelling device hetero process deviceId=%s taskId=%s',
        deviceTarget.deviceId,
        deviceTarget.taskId,
      );

      // Persist the cancel intent BEFORE the signal leaves the server — an
      // ambiguous transport outcome must never look like "no cancel sent".
      await markRemoteCancelRequested(this.deps.db, resolvedOperationId, 'interruptTask').catch(
        (err) =>
          log('interruptTask: cancel ledger write failed op=%s: %O', resolvedOperationId, err),
      );

      const cancelWorkspaceId =
        deviceTarget.deviceWorkspaceId ??
        (await this.deps.resolveDeviceWorkspaceId(deviceTarget.deviceId));
      const cancelResult = await deviceGateway.executeToolCall(
        {
          deviceId: deviceTarget.deviceId,
          userId: deviceTarget.deviceUserId ?? this.deps.userId,
          workspaceId: cancelWorkspaceId,
        },
        {
          apiName: 'cancelHeteroTask',
          arguments: JSON.stringify({ signal: 'SIGINT', taskId: deviceTarget.taskId }),
          identifier: 'cancelHeteroTask',
        },
        // The device first gives the wrapper/native CLI 2s to stop
        // cooperatively, then escalates and drains its terminal callback.
        10_000,
      );

      deviceCancellationConfirmed =
        cancelResult.success && isRecord(cancelResult.state) && cancelResult.state.exited === true;

      if (deviceCancellationConfirmed === true) {
        await resolveRemoteCancel(
          this.deps.db,
          resolvedOperationId,
          'confirmed',
          'device confirmed process exit',
        ).catch((err) =>
          log('interruptTask: cancel confirm write failed op=%s: %O', resolvedOperationId, err),
        );
      }

      if (!cancelResult.success || deviceCancellationConfirmed === false) {
        log(
          'interruptTask: device cancellation unconfirmed taskId=%s success=%s state=%O error=%s',
          deviceTarget.taskId,
          cancelResult.success,
          cancelResult.state,
          cancelResult.error,
        );
        await resolveRemoteCancel(
          this.deps.db,
          resolvedOperationId,
          'unknown',
          'cancel signal unconfirmed',
        ).catch((err) =>
          log('interruptTask: cancel unknown write failed op=%s: %O', resolvedOperationId, err),
        );
        // Preserve the runtime and topic's device identity until the writer
        // actually exits, so a retry can still address the same process.
        return {
          cancelState: 'unknown',
          deviceCancellationConfirmed,
          operationId: resolvedOperationId,
          success: false,
          threadId: thread?.id,
        };
      }
    }

    // 3. Interrupt the runtime operation first. Only mark the thread cancelled
    // after the runtime acknowledges the interrupt to avoid unlocking a live
    // task. For remote-admitted runs without a device target (cloud sandbox),
    // this IS the cancel signal — persist the intent before dispatching it.
    if (!deviceTarget) {
      await markRemoteCancelRequested(this.deps.db, resolvedOperationId, 'interruptTask').catch(
        (err) =>
          log('interruptTask: cancel ledger write failed op=%s: %O', resolvedOperationId, err),
      );
    }
    const interrupted = await this.deps.agentRuntimeService.interruptOperation(resolvedOperationId);
    log(
      'interruptTask: interruptOperation=%s for operationId=%s',
      interrupted,
      resolvedOperationId,
    );

    // Device CLI runs have no native AgentRuntime state to interrupt. Their
    // acknowledged process exit is authoritative; settle only the owned old
    // operation and its matching marker, preserving any newer run/outcome.
    if (deviceCancellationConfirmed === true) {
      await this.deps.agentOperationModel.settleRunning(resolvedOperationId, 'interrupted');
      if (resolvedTopicId) {
        await this.deps.topicModel.settleRunningOperation(
          resolvedTopicId,
          resolvedOperationId,
          'active',
        );
      }
    }

    if (!interrupted && deviceCancellationConfirmed !== true) {
      const alreadyCancelled = thread?.status === ThreadStatus.Cancel;
      const durableAlreadyTerminal =
        durableOperation?.status === 'abandoned' ||
        durableOperation?.status === 'done' ||
        durableOperation?.status === 'error' ||
        durableOperation?.status === 'interrupted';
      const success = alreadyCancelled || durableAlreadyTerminal;

      // A terminal durable row means the host already reported terminal —
      // confirmed. Otherwise the signal never landed: unknown, not a silent
      // success. A remote-admitted run keeps its live `requested`/`unknown`
      // ledger state for the terminal callback or watchdog to resolve.
      const cancelState = success ? 'confirmed' : 'unknown';

      return {
        cancelState,
        deviceCancellationConfirmed,
        operationId: resolvedOperationId,
        success,
        threadId: thread?.id,
      };
    }

    // 4. Update Thread status to cancel
    if (thread) {
      await this.deps.threadModel.update(thread.id, {
        metadata: {
          ...thread.metadata,
          completedAt: new Date().toISOString(),
        },
        status: ThreadStatus.Cancel,
      });
    }

    // Cancel lifecycle: the host's own ack (device exited) or an in-process
    // runtime interrupt is `confirmed`. A remote-admitted run whose signal was
    // dispatched but whose host has not yet reported terminal is `requested` —
    // its terminal callback resolves the ledger to `confirmed`.
    const cancelState =
      deviceCancellationConfirmed === true || !admission ? 'confirmed' : 'requested';

    return {
      cancelState,
      deviceCancellationConfirmed,
      operationId: resolvedOperationId,
      success: true,
      threadId: thread?.id,
    };
  }

  /**


   * tool rows and terminate the operation, WITHOUT executing anything and
   * without continuing the model.
   *
   * This is the "from this step on, don't go any further" action. It is not the
   * same as rejecting a tool — a rejection resumes the model so it can respond
   * to the refusal, whereas stopping ends the turn outright.
   *
   * Why it can't reuse the ordinary cancel path: when the runtime parks it
   * emits a stream-terminal `waiting_for_human`, so the client marks its own
   * operation `completed` and prunes it ~30s later. The pending tool rows retain
   * the authoritative operation and sealed-batch identity; callers must send
   * that exact correlation and this service verifies it against both the
   * operation record and every batch member before claiming anything.
   *
   * The tool rows are settled IN PLACE (the approval pause already created one
   * row per pending call). Inserting fresh aborted rows would duplicate every
   * tool in the turn and leave the originals `pending`, which is exactly what
   * keeps the approval cards on screen after a stop.
   */
  async stopPendingApproval(params: {
    approvalResolutionRequestId?: string;
    batchId: string;
    operationId: string;
    toolMessageIds: string[];
    topicId: string;
  }): Promise<{
    operationId: string;
    settledToolMessageIds: string[];
    success: boolean;
  }> {
    const { approvalResolutionRequestId, batchId, operationId, toolMessageIds, topicId } = params;

    const operation = await this.deps.agentOperationModel.findById(operationId);
    if (
      !operation ||
      operation.topicId !== topicId ||
      (operation.status !== 'waiting_for_human' && operation.status !== 'interrupted')
    ) {
      throw new Error('stopPendingApproval: operation is not the parked owner of this topic');
    }

    // Validate identity and complete sealed-batch membership before the atomic
    // claim. The caller cannot stop a hand-picked subset or a stale batch from
    // another parked operation.
    const targets: { alreadyClaimed: boolean; id: string }[] = [];
    for (const toolMessageId of toolMessageIds) {
      const message = await this.deps.messageModel.findById(toolMessageId);
      if (!message)
        throw new Error(`stopPendingApproval: tool message not found: ${toolMessageId}`);
      if (message.role !== 'tool') {
        throw new Error(
          `stopPendingApproval.toolMessageIds must point at role='tool' messages, got role='${message.role}'`,
        );
      }
      if (message.topicId !== topicId) {
        throw new Error('stopPendingApproval: topicId does not match the target tool message');
      }
      const plugin = await this.deps.messageModel.findMessagePlugin(toolMessageId);
      const intervention = plugin?.intervention;
      if (
        !intervention ||
        intervention.operationId !== operationId ||
        intervention.batchId !== batchId
      ) {
        throw new Error('stopPendingApproval: target is not in the requested batch');
      }
      const alreadyClaimed =
        intervention.status === 'aborted' &&
        Boolean(approvalResolutionRequestId) &&
        intervention.resolutionRequestId === approvalResolutionRequestId;
      if (intervention.status !== 'pending' && !alreadyClaimed) {
        throw new HumanApprovalAlreadyResolvedError(toolMessageId);
      }
      targets.push({ alreadyClaimed, id: toolMessageId });
    }

    const fullBatchIds = (await this.deps.messageModel.listMessagePluginsByTopic(topicId))
      .filter(
        (plugin) =>
          plugin.intervention?.operationId === operationId &&
          plugin.intervention?.batchId === batchId,
      )
      .map(({ id }) => id)
      .sort();
    const requestedIds = targets.map(({ id }) => id).sort();
    if (
      fullBatchIds.length !== requestedIds.length ||
      fullBatchIds.some((id, index) => id !== requestedIds[index])
    ) {
      throw new Error('stopPendingApproval: targets must cover the complete sealed batch');
    }

    const alreadyClaimedCount = targets.filter(({ alreadyClaimed }) => alreadyClaimed).length;
    if (alreadyClaimedCount !== 0 && alreadyClaimedCount !== targets.length) {
      throw new Error('stopPendingApproval: batch has a partial resolution claim');
    }
    if (operation.status === 'interrupted' && alreadyClaimedCount !== targets.length) {
      throw new Error('stopPendingApproval: interrupted operation has unsettled batch members');
    }

    if (alreadyClaimedCount === 0) {
      await this.deps.messageModel.resolveHumanApproval(
        targets.map((target) => ({
          content: STOPPED_TOOL_CONTENT,
          id: target.id,
          intervention: {
            ...(approvalResolutionRequestId && {
              resolutionRequestId: approvalResolutionRequestId,
            }),
            status: 'aborted',
          },
        })),
      );
    }

    if (operation.status !== 'interrupted') {
      await this.deps.agentRuntimeService.interruptOperation(operationId);
      await this.deps.agentOperationModel.recordCompletion(operationId, {
        completedAt: new Date(),
        completionReason: 'interrupted',
        status: 'interrupted',
      });
    }

    log(
      'stopPendingApproval: settled %d tool message(s), retired operation %s',
      targets.length,
      operationId,
    );

    return {
      operationId,
      settledToolMessageIds: targets.map((t) => t.id),
      success: true,
    };
  }

  /**
   * Retire the operation segment that parked on an approval after its
   * replacement continuation has been scheduled. The Redis state is stopped
   * first; the durable row then converges waiting_for_human -> done. Repeating
   * this call is safe, including after Cloud supersession won the race.


    );

    return {
      operationId,
      settledToolMessageIds: targets.map((t) => t.id),
      success: true,
    };
  }

  /**
   * Retire the operation segment that parked on an approval after its
   * replacement continuation has been scheduled. The Redis state is stopped
   * first; the durable row then converges waiting_for_human -> done. Repeating
   * this call is safe, including after Cloud supersession won the race.
   */
  async retirePendingApprovalOperation(operationId: string): Promise<void> {
    await this.deps.agentRuntimeService.interruptOperation(operationId);

    const operation = await this.deps.agentOperationModel.findById(operationId);
    if (!operation) {
      throw new Error(`retirePendingApprovalOperation: operation not found: ${operationId}`);
    }
    if (operation.status === 'done' || operation.status === 'interrupted') return;
    if (operation.status !== 'waiting_for_human') {
      throw new Error(
        `retirePendingApprovalOperation: expected waiting_for_human, got ${operation.status}`,
      );
    }

    const completed = await this.deps.agentOperationModel.recordCompletion(operationId, {
      completedAt: new Date(),
      completionReason: 'done',
      status: 'done',
    });
    if (!completed) {
      const latest = await this.deps.agentOperationModel.findById(operationId);
      if (latest?.status !== 'done' && latest?.status !== 'interrupted') {
        throw new Error(`retirePendingApprovalOperation: failed to settle ${operationId}`);
      }
    }
  }

  /** Owner-scoped runtime state used by the v2 router's crash-safe retry probe. */
  async loadInterventionContinuationState(operationId: string): Promise<AgentState | null> {
    return this.deps.agentRuntimeService.loadInterventionContinuationState(operationId);
  }

  /** Requeue an idle deterministic continuation without rebuilding its assistant turn. */
  async ensureInterventionContinuationStarted(
    operationId: string,
  ): Promise<'already_started' | 'missing' | 'scheduled'> {
    return this.deps.agentRuntimeService.ensureInterventionContinuationStarted(operationId);
  }

  /**
   * Repair the topic reconnect marker and release the exact start reservation
   * after a durable queue ACK. A foreign newer running operation fails closed.
   */
  async repairInterventionContinuationTopicAnchor(params: {
    assistantMessageId: string;
    continuationOperationId: string;
    resolutionRequestId: string;
    scope?: string | null;
    sourceOperationId: string;
    sourceToolMessageIds: string[];
    threadId?: string | null;
    topicId: string;
  }): Promise<void> {
    const operation = await this.deps.agentOperationModel.findById(params.continuationOperationId);
    const expectedProvenance = {
      resolutionRequestId: params.resolutionRequestId,
      sourceOperationId: params.sourceOperationId,
      sourceToolMessageIds: [...params.sourceToolMessageIds].sort(),
    };
    const assistant = await this.deps.messageModel.findById(params.assistantMessageId);
    const dispatchMarker = operation?.metadata?.agentInterventionDispatch as
      | {
          deduplicationId?: unknown;
          resolutionRequestId?: unknown;
          state?: unknown;
        }
      | undefined;
    const expectedDeduplicationId = deriveAgentInterventionQueueDeduplicationId(
      params.continuationOperationId,
      0,
    );
    if (
      !operation ||
      operation.topicId !== params.topicId ||
      !matchesAgentInterventionContinuationProvenance(
        operation.metadata?.agentInterventionContinuation,
        expectedProvenance,
      ) ||
      dispatchMarker?.state !== 'scheduled' ||
      dispatchMarker.resolutionRequestId !== params.resolutionRequestId ||
      dispatchMarker.deduplicationId !== expectedDeduplicationId ||
      assistant?.role !== 'assistant' ||
      assistant.topicId !== params.topicId
    ) {
      throw new Error('Intervention continuation topic repair provenance conflict');
    }

    // Thread continuations use the deterministic topic reservation only as a
    // short single-initializer fence. They never own the topic's main
    // runningOperation anchor, so ACK recovery must release exactly their
    // reservation without promoting the thread into the main conversation
    // spine. A foreign reservation is intentionally left untouched.
    if (params.threadId) {
      const released = await this.deps.topicModel.releaseTaskCallbackReservation(
        params.topicId,
        params.continuationOperationId,
      );
      if (released === 'foreign') {
        throw new Error('Intervention continuation topic repair found a foreign reservation');
      }
      return;
    }

    const state = await this.deps.agentRuntimeService.loadInterventionContinuationState(
      params.continuationOperationId,
    );
    const runtimeTerminal =
      state?.status === 'done' || state?.status === 'error' || state?.status === 'interrupted';
    const durableTerminal =
      operation.status === 'done' ||
      operation.status === 'error' ||
      operation.status === 'interrupted' ||
      operation.status === 'abandoned';
    const result = await this.deps.topicModel.repairAgentInterventionContinuation({
      active: !runtimeTerminal && !durableTerminal,
      assistantMessageId: params.assistantMessageId,
      continuationOperationId: params.continuationOperationId,
      reservationId: params.continuationOperationId,
      scope: params.scope,
      sourceOperationId: params.sourceOperationId,
      startedAt: operation.startedAt?.toISOString() ?? new Date().toISOString(),
      threadId: params.threadId,
      topicId: params.topicId,
    });
    if (result === 'conflict') {
      throw new Error('Intervention continuation topic repair found a foreign running operation');
    }
  }
}
