import type { ControlResult } from '@orvilo/agent-execution';
import { and, eq } from 'drizzle-orm';

import { agentOperations, topics, workspaceMembers } from '@/database/schemas';
import type { TaskExecutionControl } from '@/database/schemas/taskExecutionControl';
import type { OrviloDatabase } from '@/database/type';

import type { CanonicalRunBinding, CanonicalRunSnapshot } from './canonicalRun';

/**
 * Chat-scoped canonical run binding: a `type:'orvilo'` chat execution context
 * (topicId + agentId + userId + the operation's generation) admitted through
 * the same Prime embedded host as task dispatches. The `agent_operations`
 * row is the chat-parallel execution record — `operationId` stands in for
 * `dispatchId`/`grantId`, `generation`/`executionEpoch` are 1, `dispatchFence`
 * is 0, `taskId` maps to the topic id, and `workspaceId` is the run tenant
 * (`chatWorkspaceId ?? 'personal:<userId>'`). Chat runs carry no grant row;
 * `runExpiresAt` is the bounded window the server mints at admission.
 */
export interface CanonicalChatRunBinding extends CanonicalRunBinding {
  chatAgentId: string;
  /** The topic's real workspace, or null for a personal-scope chat. */
  chatWorkspaceId: string | null;
  /** Bounded run window — the chat parallel of a delegated grant's expiry. */
  runExpiresAt: number;
}

interface ChatOperationMetadata extends Record<string, unknown> {
  executionControl?: TaskExecutionControl;
}

const denied = (message: string): ControlResult<never> => ({
  ok: false,
  error: { code: 'stale_fence', message, retryable: false },
});

const isCanonicalChatRunBinding = (input: CanonicalRunBinding): input is CanonicalChatRunBinding =>
  typeof (input as CanonicalChatRunBinding).chatAgentId === 'string' &&
  ((input as CanonicalChatRunBinding).chatWorkspaceId === null ||
    typeof (input as CanonicalChatRunBinding).chatWorkspaceId === 'string') &&
  Number.isFinite((input as CanonicalChatRunBinding).runExpiresAt);

/**
 * The chat-parallel of `CanonicalRunAuthority`: the same row-lock admission
 * discipline over the chat execution record. Locks are held through the
 * action callback so operation completion/interruption, topic deletion and
 * membership changes cannot commit between admission and its effect. The
 * operation row's `status` is the kill fence (interrupt/settle transitions it
 * out of 'running'), and `metadata.executionControl` carries the same
 * version-1 process-ownership blob `task_topics.execution_control` does.
 */
export class CanonicalChatRunAuthority {
  constructor(private readonly db: OrviloDatabase) {}

  async withRun<T>(
    input: CanonicalRunBinding,
    run: (snapshot: CanonicalRunSnapshot, transaction: OrviloDatabase) => Promise<T>,
  ): Promise<ControlResult<T>> {
    return this.withState(input, run, false);
  }

  /** Serializable canonical observation; concurrent edits cause retry rather than mixed state. */
  async withSnapshot<T>(
    input: CanonicalRunBinding,
    run: (snapshot: CanonicalRunSnapshot, transaction: OrviloDatabase) => Promise<T>,
  ): Promise<ControlResult<T>> {
    return this.withState(input, run, false, true);
  }

  /** Startup may inspect a registering owner; it never admits mutations. */
  async withRegistration<T>(
    input: CanonicalRunBinding,
    run: (snapshot: CanonicalRunSnapshot, transaction: OrviloDatabase) => Promise<T>,
  ): Promise<ControlResult<T>> {
    return this.withState(input, run, true);
  }

  private async withState<T>(
    input: CanonicalRunBinding,
    run: (snapshot: CanonicalRunSnapshot, transaction: OrviloDatabase) => Promise<T>,
    startup: boolean,
    serializable = false,
  ): Promise<ControlResult<T>> {
    if (!isCanonicalChatRunBinding(input))
      return denied('Chat run binding is missing its chat execution context');
    const binding = structuredClone(input);
    return this.db
      .transaction(
        async (tx) => {
          // Operation before topic matches the task path's task→dispatch→…→topic
          // lock order. NOWAIT prevents a mixed legacy lock order from hanging
          // admission before any side effect.
          const [operation] = await tx
            .select()
            .from(agentOperations)
            .where(eq(agentOperations.id, binding.operationId))
            .for('update', { noWait: true })
            .limit(1);
          if (
            !operation ||
            operation.status !== 'running' ||
            operation.agentId !== binding.chatAgentId ||
            operation.topicId !== binding.topicId ||
            operation.userId !== binding.userId ||
            operation.taskId !== null ||
            (operation.workspaceId ?? null) !== binding.chatWorkspaceId
          )
            return denied('Chat run contract is no longer current');
          const control = ((operation.metadata ?? {}) as ChatOperationMetadata).executionControl;
          if (
            !control ||
            control.version !== 1 ||
            control.registrationId !== binding.runtimeRegistrationId ||
            control.ownerId !== binding.runtimeOwnerId ||
            control.leaseId !== binding.runtimeLeaseId ||
            !Number.isFinite(control.leaseExpiresAt) ||
            control.leaseExpiresAt <= Date.now() ||
            (startup
              ? !['registering', 'running'].includes(control.state)
              : control.state !== 'running' ||
                control.activeHandoffId !== null ||
                !control.treeId ||
                !control.supervisorId ||
                !control.sessionId)
          ) {
            return denied('Registered process ownership is not admitted');
          }
          if (binding.runExpiresAt <= Date.now()) return denied('Bounded run grant is expired');
          const [topic] = await tx
            .select({
              deletedAt: topics.deletedAt,
              id: topics.id,
              isDeleted: topics.isDeleted,
              workspaceId: topics.workspaceId,
            })
            .from(topics)
            .where(and(eq(topics.id, binding.topicId), eq(topics.userId, binding.userId)))
            .for('update', { noWait: true })
            .limit(1);
          if (
            !topic ||
            topic.isDeleted ||
            topic.deletedAt ||
            (topic.workspaceId ?? null) !== binding.chatWorkspaceId
          )
            return denied('Runtime topic deleted');
          if (binding.chatWorkspaceId) {
            const [member] = await tx
              .select()
              .from(workspaceMembers)
              .where(
                and(
                  eq(workspaceMembers.workspaceId, binding.chatWorkspaceId),
                  eq(workspaceMembers.userId, binding.userId),
                ),
              )
              .for('update', { noWait: true })
              .limit(1);
            if (!member || member.deletedAt || member.suspendedAt)
              return denied('Delegation membership changed');
          }
          // Lock acquisition may have waited beyond the original lease.
          if (Math.min(binding.runExpiresAt, control.leaseExpiresAt) <= Date.now())
            return denied('Admission expired while acquiring authority');
          const value = await run(
            {
              fence: {
                tenantId: binding.workspaceId,
                principalId: binding.userId,
                taskId: binding.taskId,
                grantId: binding.grantId,
                ownerId: binding.runtimeOwnerId,
                leaseId: binding.runtimeLeaseId,
                epoch: binding.executionEpoch,
                policyRevision: binding.policyRevision,
                stateRevision: binding.stateRevision,
              },
              leaseExpiresAt: control.leaseExpiresAt,
              grantExpiresAt: binding.runExpiresAt,
              allowedActions: [],
              treeId: control.treeId,
              supervisorId: control.supervisorId,
              sessionId: control.sessionId,
              registrationState: control.state,
              activeHandoffId: control.activeHandoffId,
            },
            tx as OrviloDatabase,
          );
          return { ok: true as const, value };
        },
        serializable ? { isolationLevel: 'serializable' } : undefined,
      )
      .catch(() => denied('Canonical admission is busy or unavailable'));
  }
}
