import { type AgentState } from '@orvilo/agent-execution';
import { parse } from '@orvilo/conversation-flow';
import { asyncToolResumeCounter } from '@orvilo/observability-otel/modules/agent-execution';
import { type ChatToolPayload } from '@orvilo/types';
import debug from 'debug';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { EventOutboxModel } from '@/database/models/eventOutbox';
import { FileService } from '@/server/services/file';

import {
  CHILD_RESULT_EVENT_TYPE,
  CHILD_RESULT_RECEIPT_TTL_MS,
  childResultEventId,
} from './childResultDelivery';
import {
  extractTextFromMessage,
  findLastAssistantMessage,
  normalizeCompletionMessages,
} from './CompletionLifecycle';
import type {
  AgentExecutionServiceDeps,
  GroupActionMemberBridgeParams,
  GroupActionOnComplete,
  SubAgentBridgeParams,
} from './types';

const log = debug('orvilo-server:child-run-service');

/**
 * Format error for storage in message pluginError metadata.
 * Handles Error objects which don't serialize properly with JSON.stringify.
 */
const formatErrorForMetadata = (error: unknown): Record<string, any> | undefined => {
  if (!error) return undefined;
  if (error instanceof Error) return { message: error.message, name: error.name };
  if (typeof error === 'object' && 'message' in error) return error as Record<string, any>;
  return { message: String(error) };
};

/**
 * Extract a short, human-readable reason string from a failed operation's
 * `state.error`, for inlining into the tool-result `content` a parent agent
 * sees. The full structured error still rides on `pluginError`.
 */
const formatSubAgentErrorReason = (error: unknown): string | undefined => {
  const message = formatErrorForMetadata(error)?.message;
  if (typeof message !== 'string') return undefined;
  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Child-run completion bridges: sub-agent result backfill, group-action
 * member K=N barrier, and the async-tool parent resume CAS.
 *
 * Split out of the legacy AgentRuntime facade. Under ACP the parked parent
 * runs on a host that tracks its own deferred tool calls — the engine-era
 * step-queue wake no longer exists — so the resume path keeps its accounting
 * (barrier check + durable CAS) for surviving pre-migration parked ops while
 * the actual wake is owned by the host's `heteroAwaitBuiltinToolChildren`
 * long-poll.
 *
 * Every bridge persists the child's result into the `event_outbox` delivery
 * ledger (`agent_operation.child_result`, pending until consumed) keyed by
 * parent/child/toolCall/generation — a redelivered webhook is idempotent, and
 * a result arriving after its placeholder was already settled (e.g. by the
 * await deadline sweep) is recorded as superseded rather than overwriting the
 * newer terminal state.
 */
export class ChildRunService {
  private readonly agentOperationModel: AgentExecutionServiceDeps['agentOperationModel'];
  private readonly messageModel: AgentExecutionServiceDeps['messageModel'];
  private readonly serverDB: AgentExecutionServiceDeps['serverDB'];
  private readonly stateManager: AgentExecutionServiceDeps['stateManager'];
  private readonly userId: string;

  constructor(deps: AgentExecutionServiceDeps) {
    this.agentOperationModel = deps.agentOperationModel;
    this.messageModel = deps.messageModel;
    this.serverDB = deps.serverDB;
    this.stateManager = deps.stateManager;
    this.userId = deps.userId;
  }

  /**
   * Sub-agent completion bridge for the server `callSubAgent` deferred-tool
   * path. Runs when a child sub-agent op reaches a terminal state — invoked
   * in-process by the child's serialized `onComplete` hook (hetero children
   * finish through `CompletionLifecycle.dispatchHooks`).
   *
   *   1. Backfill the parent's placeholder tool message with the sub-agent's
   *      final answer (success) or an error note (failure), plus pluginState
   *      so the UI render can resolve the isolation thread.
   *   2. Resume the parked parent: barrier-check + CAS via
   *      `tryResumeParentFromAsyncTool`.
   *
   * THROWS on infrastructure failure so the caller can retry — the backfill
   * rewrites the same content and the resume is CAS-guarded, so redelivery is
   * safe.
   */
  async completeSubAgentBridge(params: SubAgentBridgeParams): Promise<boolean> {
    const { operationId, parentOperationId, reason, threadId, toolMessageId } = params;
    const failed = reason === 'error' || reason === 'interrupted';

    const finalState =
      params.finalState ?? (await this.stateManager.loadAgentState(operationId)) ?? undefined;

    log(
      '[%s] sub-agent bridge → parent %s (reason: %s, state: %s)',
      operationId,
      parentOperationId,
      reason,
      finalState ? 'loaded' : 'missing',
    );

    let lastAssistant: unknown;
    if (!failed && finalState && !Array.isArray(finalState.messages)) {
      try {
        lastAssistant = await this.resolveLastAssistantMessageFromDB(finalState);
      } catch (error) {
        console.error(
          '[%s] sub-agent bridge: failed to resolve final assistant from DB: %O',
          operationId,
          error,
        );
      }
    }
    const messages = Array.isArray(finalState?.messages) ? finalState.messages : [];
    lastAssistant ??= findLastAssistantMessage(normalizeCompletionMessages(messages));
    let lastAssistantContent = extractTextFromMessage(lastAssistant);

    if (!failed && !finalState && threadId) {
      try {
        lastAssistantContent = await this.resolveLastAssistantContentFromThread(threadId);
      } catch (error) {
        console.error(
          '[%s] sub-agent bridge: failed to resolve content from thread %s: %O',
          operationId,
          threadId,
          error,
        );
      }
    }
    const errorReason = failed ? formatSubAgentErrorReason(finalState?.error) : undefined;
    const content = failed
      ? errorReason
        ? `Sub-agent did not complete (${reason}): ${errorReason}`
        : `Sub-agent did not complete (${reason}).`
      : lastAssistantContent || 'Sub-agent completed without a textual answer.';

    const delivery = await this.persistChildResultDelivery({
      anchorMessageId: toolMessageId,
      childOperationId: operationId,
      parentOperationId,
      status: failed ? 'error' : 'done',
    });
    if (delivery.superseded) {
      log(
        '[%s] child result superseded — placeholder already settled under another key, skipping backfill',
        operationId,
      );
      return this.tryResumeParentFromAsyncTool({ parentOperationId }, {});
    }

    const backfill = await this.messageModel.updateToolMessage(toolMessageId, {
      content,
      pluginError: failed ? formatErrorForMetadata(finalState?.error) : undefined,
      pluginState: {
        model: finalState?.modelRuntimeConfig?.model,
        status: failed ? 'error' : 'completed',
        threadId,
        // The child's spend rides on this anchor row so the parent's usage tray can
        // account for it. The tray sums per-MESSAGE usage, and the child's own
        // assistant messages live in an isolation thread the parent never loads —
        // this row is the only place the child's cost surfaces in the parent's own
        // message list.
        totalCost: finalState?.cost?.total,
        totalInputTokens: finalState?.usage?.llm?.tokens?.input,
        totalOutputTokens: finalState?.usage?.llm?.tokens?.output,
        totalToolCalls: finalState?.usage?.tools?.totalCalls,
        totalTokens: finalState?.usage?.llm?.tokens?.total,
        // Records which delivery produced this terminal write — a later
        // duplicate with the same key stays idempotent, a foreign key is
        // superseded (checked in `persistChildResultDelivery`).
        childResultDelivery: { childOperationId: operationId, eventId: delivery.eventId },
      },
    });
    if (!backfill.success) {
      throw new Error(
        `Sub-agent bridge: failed to backfill tool message ${toolMessageId} for parent ${parentOperationId}`,
      );
    }

    return this.tryResumeParentFromAsyncTool(
      { parentOperationId },
      { deliveryEventId: delivery.eventId, knownFulfilledMessageId: toolMessageId },
    );
  }

  /**
   * Completion bridge for the group orchestration "call agent member" path
   * (`orvilo-group-management`: speak / broadcast / delegate /
   * executeAgentTask(s)). Mirrors {@link completeSubAgentBridge} but enforces
   * a K=N member barrier.
   */
  async completeGroupActionMember(params: GroupActionMemberBridgeParams): Promise<boolean> {
    const {
      anchorMessageId,
      expectedMembers,
      groupToolMessageId,
      mode,
      operationId,
      parentOperationId,
      reason,
      threadId,
    } = params;
    const failed = reason === 'error' || reason === 'interrupted' || reason === 'timeout';

    const finalState =
      params.finalState ?? (await this.stateManager.loadAgentState(operationId)) ?? undefined;

    log(
      '[%s] group-member bridge → parent %s (mode: %s, reason: %s, %d members)',
      operationId,
      parentOperationId,
      mode,
      reason,
      expectedMembers,
    );

    let lastAssistant: unknown;
    if (!failed && mode !== 'in_group' && finalState && !Array.isArray(finalState.messages)) {
      try {
        lastAssistant = await this.resolveLastAssistantMessageFromDB(finalState);
      } catch (error) {
        console.error(
          '[%s] group-member bridge: failed to resolve final assistant from DB: %O',
          operationId,
          error,
        );
      }
    }
    const messages = Array.isArray(finalState?.messages) ? finalState.messages : [];
    lastAssistant ??= findLastAssistantMessage(normalizeCompletionMessages(messages));
    let lastAssistantContent = extractTextFromMessage(lastAssistant);

    if (!failed && mode !== 'in_group' && !finalState && threadId) {
      try {
        lastAssistantContent = await this.resolveLastAssistantContentFromThread(threadId);
      } catch (error) {
        console.error(
          '[%s] group-member bridge: failed to resolve content from thread %s: %O',
          operationId,
          threadId,
          error,
        );
      }
    }
    const agentLabel = (finalState?.origin?.agentId as string | undefined) ?? 'member';
    const memberErrorReason = failed ? formatSubAgentErrorReason(finalState?.error) : undefined;
    const anchorContent = failed
      ? memberErrorReason
        ? `Agent member did not complete (${reason}): ${memberErrorReason}`
        : `Agent member did not complete (${reason}).`
      : mode === 'in_group'
        ? `Agent ${agentLabel} responded in the group.`
        : lastAssistantContent || 'Agent member completed without a textual answer.';

    const delivery = await this.persistChildResultDelivery({
      anchorMessageId,
      childOperationId: operationId,
      parentOperationId,
      status: failed ? 'error' : 'done',
    });
    if (delivery.superseded) {
      log(
        '[%s] member result superseded — anchor already settled under another key, skipping backfill',
        operationId,
      );
      return this.tryResumeParentFromAsyncTool(
        { parentOperationId },
        { deliveryEventId: delivery.eventId, onComplete: params.onComplete },
      );
    }

    const anchorBackfill = await this.messageModel.updateToolMessage(anchorMessageId, {
      content: anchorContent,
      pluginError: failed ? formatErrorForMetadata(finalState?.error) : undefined,
      pluginState: {
        childResultDelivery: { childOperationId: operationId, eventId: delivery.eventId },
        model: finalState?.modelRuntimeConfig?.model,
        status: failed ? 'error' : 'completed',
        threadId,
        totalCost: finalState?.cost?.total,
        totalInputTokens: finalState?.usage?.llm?.tokens?.input,
        totalOutputTokens: finalState?.usage?.llm?.tokens?.output,
        totalToolCalls: finalState?.usage?.tools?.totalCalls,
        totalTokens: finalState?.usage?.llm?.tokens?.total,
      },
    });
    if (!anchorBackfill.success) {
      throw new Error(
        `Group-member bridge: failed to backfill anchor ${anchorMessageId} for parent ${parentOperationId}`,
      );
    }

    // K=N member barrier (multi-member actions only — single-member actions
    // use the group tool call itself as the anchor, already backfilled above).
    if (expectedMembers > 1 && anchorMessageId !== groupToolMessageId) {
      const fulfilled = await this.countFulfilledMemberAnchors(groupToolMessageId);
      if (fulfilled < expectedMembers) {
        log(
          '[%s] group-member barrier %d/%d, holding parent %s',
          operationId,
          fulfilled,
          expectedMembers,
          parentOperationId,
        );
        return false;
      }

      const groupBackfill = await this.messageModel.updateToolMessage(groupToolMessageId, {
        content: `All ${expectedMembers} agent members completed.`,
        pluginState: { expectedMembers, status: 'completed' },
      });
      if (!groupBackfill.success) {
        throw new Error(
          `Group-member bridge: failed to backfill group tool ${groupToolMessageId} for parent ${parentOperationId}`,
        );
      }
    }

    return this.tryResumeParentFromAsyncTool(
      { parentOperationId },
      { deliveryEventId: delivery.eventId },
    );
  }

  /**
   * Completion-bridge resume for async-tool parents.
   *
   * Under ACP the parked parent runs on a host that tracks its own deferred
   * tool calls — the server-side step-queue wake the engine used no longer
   * exists, and hetero runs never write `waiting_for_async_tool` snapshots,
   * so a missing blob short-circuits straight to `false`. The state check +
   * pendingToolsCalling barrier + durable CAS are kept verbatim so any
   * surviving pre-migration parked op still completes its accounting; its
   * resume itself was never recoverable once the engine retired.
   */
  async tryResumeParentFromAsyncTool(
    params: { parentOperationId: string },
    options?: {
      /**
       * `event_outbox` eventId of the child-result receipt this resume claim
       * consumes — flipped to `delivered` only when the CAS wins, so an
       * unconsumed result stays pending for a real consumer.
       */
      deliveryEventId?: string;
      /**
       * Message id of a tool placeholder the caller just backfilled to a
       * terminal state. Trusted by the barrier as fulfilled without re-reading
       * `message_plugins` — closes the read-your-writes gap where the barrier
       * query hits a read replica that hasn't seen the just-committed write.
       */
      knownFulfilledMessageId?: string;
      /** Group orchestration disposition (skipCallSupervisor / delegate → finish). */
      onComplete?: GroupActionOnComplete;
    },
  ): Promise<boolean> {
    const { parentOperationId } = params;

    const state = await this.stateManager.loadAgentState(parentOperationId);
    if (!state) {
      log('[%s] async-tool resume: parent state missing, no-op', parentOperationId);
      asyncToolResumeCounter.add(1, { outcome: 'no_state' });
      return false;
    }

    if (state.status !== 'waiting_for_async_tool') {
      return false;
    }

    const pending = (state.pendingToolsCalling ?? []) as ChatToolPayload[];
    if (pending.length === 0) {
      log('[%s] async-tool resume: parked op has no pending tools', parentOperationId);
      asyncToolResumeCounter.add(1, { outcome: 'no_pending' });
      return false;
    }

    const allFulfilled = await this.allPendingToolsFulfilled(
      pending,
      options?.knownFulfilledMessageId,
    );
    if (!allFulfilled) {
      log('[%s] async-tool barrier not yet satisfied, holding', parentOperationId);
      asyncToolResumeCounter.add(1, { outcome: 'barrier_held' });
      return false;
    }

    const won = await new AgentOperationModel(this.serverDB, this.userId).tryResumeFromAsyncTool(
      parentOperationId,
    );
    if (!won) {
      log('[%s] lost async-tool resume CAS, no-op', parentOperationId);
      asyncToolResumeCounter.add(1, { outcome: 'lost_cas' });
      return false;
    }

    if (options?.deliveryEventId) {
      // The CAS-winning resume IS the parent-side durable consume for
      // pre-ACP parked ops — mark the receipt `acked` (consumed). A lost ack
      // leaves the row `offered`, which a later consumer may re-drive; the
      // barrier above already ran, so a re-offer can never double-resume.
      await new EventOutboxModel(this.serverDB)
        .ackDeliveryReceiptByEventId({
          aggregateId: parentOperationId,
          eventId: options.deliveryEventId,
        })
        .catch((error) =>
          log(
            '[%s] delivery ledger ack failed for %s: %O',
            parentOperationId,
            options.deliveryEventId,
            error,
          ),
        );
    }

    asyncToolResumeCounter.add(1, { outcome: 'cas_won' });
    log('[%s] won async-tool resume CAS (ACP: host owns the wake)', parentOperationId);
    return true;
  }

  /**
   * Persist the child-result receipt into `event_outbox` (status `pending`
   * until a consumer marks it delivered) and decide whether the anchor
   * placeholder may still be written: an anchor already terminal under a
   * DIFFERENT delivery key means this completion arrived late (superseded,
   * e.g. by the await deadline sweep) and must not overwrite it.
   */
  private async persistChildResultDelivery(params: {
    anchorMessageId: string;
    childOperationId: string;
    parentOperationId: string;
    status: string;
  }): Promise<{ eventId: string; superseded: boolean }> {
    const [plugin, parentOp] = await Promise.all([
      this.serverDB.query.messagePlugins.findFirst({
        where: (mp, { eq }) => eq(mp.id, params.anchorMessageId),
      }),
      this.serverDB.query.agentOperations.findFirst({
        where: (op, { eq }) => eq(op.id, params.parentOperationId),
      }),
    ]);
    const generation =
      ((parentOp?.appContext as Record<string, unknown> | null)?.executionGeneration as
        number | undefined) ?? 0;
    const eventId = childResultEventId({
      childOperationId: params.childOperationId,
      generation,
      parentOperationId: params.parentOperationId,
      toolCallId: plugin?.toolCallId ?? undefined,
    });

    const state = plugin?.state as {
      childResultDelivery?: { eventId?: string };
      status?: string;
    } | null;
    const terminal = state?.status === 'completed' || state?.status === 'error';
    const superseded = terminal && state?.childResultDelivery?.eventId !== eventId;
    const now = Date.now();
    // Results that never reach a live await must not pend forever: the
    // receipt's persisted deadline doubles as its sweep-shield
    // (`nextAttemptAt`), so the room projector skips it until expiry.
    const deadlineAt = now + CHILD_RESULT_RECEIPT_TTL_MS;

    // A failed ledger write must surface — a completion reported as durably
    // persisted when the outbox lost it is exactly the F06 false-success
    // contract this ledger exists to prevent.
    await new EventOutboxModel(this.serverDB).upsertDeliveryReceipt({
      // A superseded result is durably recorded but can never be consumed —
      // the placeholder it would fill is already settled — so it lands
      // delivered for audit rather than queueing forever.
      delivered: superseded,
      event: {
        aggregateId: params.parentOperationId,
        aggregateType: 'agent_operation',
        eventId,
        eventType: CHILD_RESULT_EVENT_TYPE,
        nextAttemptAt: new Date(deadlineAt),
        payload: {
          anchorMessageId: params.anchorMessageId,
          childOperationId: params.childOperationId,
          deadlineAt,
          deliveryState: superseded ? 'superseded' : 'received',
          status: params.status,
          superseded,
        },
        workspaceId: parentOp?.workspaceId ?? undefined,
      },
    });

    return { eventId, superseded };
  }

  /**
   * Whether every pending tool call has a fulfilled tool_result message — i.e.
   * a tool message exists for its `tool_call_id` with non-empty content or a
   * terminal pluginState.
   */
  private async allPendingToolsFulfilled(
    pending: ChatToolPayload[],
    knownFulfilledMessageId?: string,
  ): Promise<boolean> {
    for (const tc of pending) {
      const plugin = await this.serverDB.query.messagePlugins.findFirst({
        where: (mp, { eq }) => eq(mp.toolCallId, tc.id),
      });
      if (!plugin) return false;

      // Trust the caller's own just-committed backfill (read-your-writes).
      if (knownFulfilledMessageId && plugin.id === knownFulfilledMessageId) continue;

      const message = await this.messageModel.findById(plugin.id);
      const pluginState = plugin.state as { status?: string } | null;
      const fulfilled =
        pluginState?.status === 'completed' ||
        pluginState?.status === 'error' ||
        (typeof message?.content === 'string' && message.content.length > 0);
      if (!fulfilled) return false;
    }
    return true;
  }

  /**
   * Resolve the group-orchestration disposition persisted on a parked tool
   * message's pluginState (`onComplete: 'finish'` for skipCallSupervisor /
   * delegate, else 'resume').
   */
  private async resolveAsyncToolOnComplete(
    pending: ChatToolPayload[],
  ): Promise<GroupActionOnComplete> {
    for (const tool of pending) {
      const plugin = await this.serverDB.query.messagePlugins.findFirst({
        where: (mp, { eq }) => eq(mp.toolCallId, tool.id),
      });
      const pluginState = plugin?.state as { onComplete?: string } | null;
      if (pluginState?.onComplete === 'finish') return 'finish';
    }
    return 'resume';
  }

  /**
   * Count fulfilled member anchors under a group-management tool call — child
   * `role: 'tool'` messages whose content is non-empty or whose pluginState is
   * terminal.
   */
  private async countFulfilledMemberAnchors(groupToolMessageId: string): Promise<number> {
    const children = await this.serverDB.query.messages.findMany({
      where: (m, { and, eq }) => and(eq(m.parentId, groupToolMessageId), eq(m.role, 'tool')),
    });
    let fulfilled = 0;
    for (const child of children) {
      if (child.content && child.content.length > 0) {
        fulfilled += 1;
        continue;
      }
      const plugin = await this.serverDB.query.messagePlugins.findFirst({
        where: (mp, { eq }) => eq(mp.id, child.id),
      });
      const pluginState = plugin?.state as { status?: string } | null;
      if (pluginState?.status === 'completed' || pluginState?.status === 'error') fulfilled += 1;
    }
    return fulfilled;
  }

  private async queryMessagesFromDB(state: AgentState) {
    let postProcessUrl: ((path: string | null) => Promise<string>) | undefined;
    try {
      const fileService = new FileService(this.serverDB, this.userId);
      postProcessUrl = (path: string | null) => fileService.getFullFileUrl(path);
    } catch {
      postProcessUrl = undefined;
    }

    return this.messageModel.query(
      {
        agentId: state.origin?.agentId,
        // Group runs must pass groupId, else the query filters `groupId IS NULL`.
        groupId: state.origin?.groupId,
        threadId: state.origin?.threadId,
        topicId: state.origin?.topicId,
      },
      { allowShareVisitor: true, postProcessUrl },
    );
  }

  /**
   * Use conversation-flow to select the active final assistant leaf, then
   * recover that leaf from the original query result.
   */
  private async resolveLastAssistantMessageFromDB(state: AgentState): Promise<unknown> {
    const dbMessages = await this.queryMessagesFromDB(state);
    const { flatList } = parse(dbMessages);
    const lastAssistant = findLastAssistantMessage(normalizeCompletionMessages(flatList));
    const lastAssistantId = typeof lastAssistant?.id === 'string' ? lastAssistant.id : undefined;

    return (
      (lastAssistantId
        ? dbMessages.find((message) => message.id === lastAssistantId)
        : undefined) ?? lastAssistant
    );
  }

  /**
   * Fallback content resolution for a heterogeneous (CLI-driven) sub-agent
   * child: its own conversation is queryable directly by the isolation
   * `threadId` (the same source `heteroFinish` reads before completion).
   */
  private async resolveLastAssistantContentFromThread(
    threadId: string,
  ): Promise<string | undefined> {
    const messages = await this.messageModel.query({ threadId }, { allowShareVisitor: true });
    const lastAssistant = findLastAssistantMessage(normalizeCompletionMessages(messages));
    return extractTextFromMessage(lastAssistant) || undefined;
  }
}
