/**
 * Phase 5b — chat admission for the Prime embedded harness.
 *
 * `dispatchHeteroAgent`'s sandbox branch routes `type:'orvilo'` runs through
 * `resolveEmbeddedDispatchRoute` when they carry a task dispatch context, and
 * here when they are a CHAT run (topic-bound, no task row). The chat-parallel
 * canonical contract:
 *
 *  - `agent_operations` is the chat execution record — `operationId` stands in
 *    for `dispatchId`/`grantId`, `generation`/`executionEpoch` are 1,
 *    `dispatchFence` is 0, `taskId` maps to the topic id;
 *  - `topics` supplies the tenant (`chatWorkspaceId`, nullable — personal
 *    chats run under the synthetic `personal:<userId>` tenant) and the
 *    deletion tombstone;
 *  - the operation row's `status` is the kill fence (interrupt/settle leave
 *    it 'running' → admission denies further effects) and
 *    `metadata.executionControl` carries the same version-1 process-ownership
 *    blob `task_topics.execution_control` does;
 *  - `runExpiresAt` is the bounded window minted at admission — the chat
 *    parallel of a delegated grant's expiry (no grant row exists).
 *
 * Everything past the admission shape is identical to the task path: the same
 * artifact verification, provider-binding issuance, `CanonicalCoreRuntimeHost`
 * lifecycle, and `driveEmbeddedCanonicalRun` producer surface.
 */
import { randomUUID } from 'node:crypto';

import type { ControlError, ControlResult } from '@orvilo/agent-execution/controlPlane';
import { and, eq } from 'drizzle-orm';

import { ChatExecutionControlModel } from '@/database/models/chatExecutionControl';
import { agentOperations, topics, workspaceMembers } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import type { CanonicalChatRunBinding } from './canonicalChatRun';
import { CanonicalChatRunAuthority } from './canonicalChatRun';
import type { EmbeddedDispatchEnvironment, EmbeddedDispatchHost } from './embeddedDispatch';
import { composeEmbeddedRunHost } from './embeddedDispatch';

/** Bounded window minted at admission — the chat parallel of a run grant's
 * expiry; identical to the embedded task path's self-minted grant TTL. */
const EMBEDDED_CHAT_RUN_TTL_MS = 6 * 60 * 60 * 1000;
const RUNTIME_OWNER_ID = 'orvilo-embedded-host';

const failure = (code: ControlError['code'], message: string): ControlResult<never> => ({
  error: { code, message, retryable: false },
  ok: false,
});

// ---------------------------------------------------------------------------
// Routing predicate
// ---------------------------------------------------------------------------

/**
 * Chat-scoped canonical context — present only when the run is our own agent
 * (`heteroType === 'orvilo'`), serves NO task (`operationTaskId` absent), and
 * carries the full chat execution context (operation + topic + agent). A
 * malformed or context-less orvilo run returns null and the caller fails it
 * as `EMBEDDED_CHAT_NOT_ADMITTED`.
 */
export interface EmbeddedChatDispatchContext {
  agentId: string;
  operationId: string;
  topicId: string;
}

export interface EmbeddedChatDispatchRouteInput {
  /** The resolved agent row id for this run. */
  agentId?: string;
  /** `turn.heteroType` — `'orvilo'` exactly for our own agent. */
  heteroType: string;
  /** The run's operation row id. */
  operationId?: string;
  /** Set only on task-run dispatches — chat runs have none. */
  operationTaskId?: string;
  /** The run's chat topic. */
  topicId?: string;
}

export const resolveEmbeddedChatDispatchRoute = (
  input: EmbeddedChatDispatchRouteInput,
): EmbeddedChatDispatchContext | null => {
  if (
    input.heteroType !== 'orvilo' ||
    input.operationTaskId ||
    typeof input.operationId !== 'string' ||
    typeof input.topicId !== 'string' ||
    typeof input.agentId !== 'string'
  )
    return null;
  return { agentId: input.agentId, operationId: input.operationId, topicId: input.topicId };
};

// ---------------------------------------------------------------------------
// Host composition (pre-launch)
// ---------------------------------------------------------------------------

export interface OpenEmbeddedChatHostInput extends EmbeddedChatDispatchContext {
  environment?: EmbeddedDispatchEnvironment;
  /** The run's requested model route — narrows which binding may issue. */
  model?: string;
}

/**
 * Everything before launch for a chat run: prove the chat execution record
 * (operation row + topic + tenant membership) is still current, mint the
 * chat-scoped canonical binding, then compose the host through the identical
 * shared path the task dispatch uses.
 */
export const openEmbeddedChatDispatchHost = async (
  deps: { database: OrviloDatabase; userId: string },
  input: OpenEmbeddedChatHostInput,
): Promise<ControlResult<EmbeddedDispatchHost>> => {
  const { database: db, userId } = deps;

  // The operation row IS the chat execution record: a running operation
  // serving this agent/topic/user with no task binding is the durable intent
  // this admission re-proves before composing the host.
  const [operation] = await db
    .select()
    .from(agentOperations)
    .where(eq(agentOperations.id, input.operationId))
    .limit(1);
  if (
    !operation ||
    operation.status !== 'running' ||
    operation.agentId !== input.agentId ||
    operation.topicId !== input.topicId ||
    operation.userId !== userId ||
    operation.taskId !== null
  )
    return failure('stale_fence', 'Chat operation contract is not current');

  const chatWorkspaceId = operation.workspaceId ?? null;
  const [topic] = await db
    .select({
      deletedAt: topics.deletedAt,
      id: topics.id,
      isDeleted: topics.isDeleted,
      workspaceId: topics.workspaceId,
    })
    .from(topics)
    .where(and(eq(topics.id, input.topicId), eq(topics.userId, userId)))
    .limit(1);
  if (
    !topic ||
    topic.isDeleted ||
    topic.deletedAt ||
    (topic.workspaceId ?? null) !== chatWorkspaceId
  )
    return failure('stale_fence', 'Runtime topic deleted');

  if (chatWorkspaceId) {
    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, chatWorkspaceId), eq(workspaceMembers.userId, userId)),
      )
      .limit(1);
    if (!member || member.deletedAt || member.suspendedAt)
      return failure('policy_denied', 'Chat run membership changed');
  }

  const binding: CanonicalChatRunBinding = {
    chatAgentId: input.agentId,
    chatWorkspaceId,
    dispatchFence: 0,
    dispatchId: input.operationId,
    executionEpoch: 1,
    generation: 1,
    grantId: input.operationId,
    operationId: input.operationId,
    policyRevision: 0,
    runExpiresAt: Date.now() + EMBEDDED_CHAT_RUN_TTL_MS,
    runtimeLeaseId: randomUUID(),
    runtimeOwnerId: RUNTIME_OWNER_ID,
    runtimeRegistrationId: randomUUID(),
    stateRevision: 0,
    taskId: input.topicId,
    topicId: input.topicId,
    userId,
    workspaceId: chatWorkspaceId ?? `personal:${userId}`,
  };

  const authority = new CanonicalChatRunAuthority(db);
  return composeEmbeddedRunHost(deps, {
    binding,
    environment: input.environment,
    model: input.model,
    overrides: {
      authority,
      registration: new ChatExecutionControlModel(db, userId, binding.workspaceId),
      // The bridge re-admits every inference resolve under the canonical row
      // locks — for chat those locks are the operation/topic/member rows.
      runAuthority: authority,
    },
  });
};
