import type { ControlResult, ExecutionFence } from '@orvilo/agent-execution';
import { and, eq } from 'drizzle-orm';

import {
  executionGrants,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  workspaceMembers,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { AgentDelegationService } from '@/server/services/agentDelegation/executionGrants';

/** Trusted server registration. Never construct this from a runtime action payload. */
export interface CanonicalRunBinding {
  dispatchFence: number;
  dispatchId: string;
  executionEpoch: number;
  generation: number;
  grantId: string;
  operationId: string;
  policyRevision: number;
  runtimeLeaseId: string;
  runtimeOwnerId: string;
  runtimeRegistrationId: string;
  stateRevision: number;
  taskId: string;
  topicId: string;
  userId: string;
  workspaceId: string;
}

export interface CanonicalRunSnapshot {
  activeHandoffId: string | null;
  allowedActions: string[];
  fence: ExecutionFence;
  grantExpiresAt: number;
  leaseExpiresAt: number;
  registrationState: 'registering' | 'running' | 'held' | 'stopped';
  sessionId: string | null;
  supervisorId: string | null;
  treeId: string | null;
}

const denied = (message: string): ControlResult<never> => ({
  ok: false,
  error: { code: 'stale_fence', message, retryable: false },
});

/** Reuses the canonical run rows. Locks are held through the action callback so
 * dispatch cancellation, task edits, grant revocation and membership changes cannot
 * commit between admission and its effect. This does not authorize external targets.
 * Only bounded user-delegated runs are supported; missing leases/grants fail closed. */
export class CanonicalRunAuthority {
  constructor(private readonly db: OrviloDatabase) {}

  async withRun<T>(
    input: CanonicalRunBinding,
    run: (snapshot: CanonicalRunSnapshot, transaction: OrviloDatabase) => Promise<T>,
  ): Promise<ControlResult<T>> {
    return this.withState(input, run, false);
  }

  /** Serializable canonical observation; concurrent graph edits cause retry rather than mixed state. */
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
    const binding = structuredClone(input);
    return this.db
      .transaction(
        async (tx) => {
          // Task before dispatch matches ownership transitions. NOWAIT prevents a
          // mixed legacy lock order from hanging admission before any side effect.
          const [task] = await tx
            .select()
            .from(tasks)
            .where(and(eq(tasks.id, binding.taskId), eq(tasks.workspaceId, binding.workspaceId)))
            .for('update', { noWait: true })
            .limit(1);
          const [dispatch] = await tx
            .select()
            .from(taskDispatches)
            .where(
              and(
                eq(taskDispatches.id, binding.dispatchId),
                eq(taskDispatches.workspaceId, binding.workspaceId),
              ),
            )
            .for('update', { noWait: true })
            .limit(1);
          if (
            !dispatch ||
            dispatch.taskId !== binding.taskId ||
            dispatch.operationId !== binding.operationId ||
            dispatch.phase !== 'running' ||
            dispatch.fence !== binding.dispatchFence ||
            dispatch.generation !== binding.generation
          )
            return denied('Dispatch contract is no longer current');
          if (
            !task ||
            task.isDeleted ||
            task.deletedAt ||
            // Live execution is the dispatch contract checked above — the
            // retired `tasks.status` column is never consulted.
            task.currentTopicId !== binding.topicId ||
            task.executionGeneration !== binding.generation ||
            task.domainRevision !== binding.stateRevision ||
            task.policyRevision !== binding.policyRevision ||
            dispatch.policyRevision !== task.policyRevision ||
            dispatch.requirementRevision !== task.requirementRevision ||
            !dispatch.agentId ||
            task.assigneeAgentId !== dispatch.agentId
          )
            return denied('Task contract is no longer current');
          // Match the existing delegated registration lock order: grant before task topic.
          const [grant] = await tx
            .select()
            .from(executionGrants)
            .where(
              and(
                eq(executionGrants.id, binding.grantId),
                eq(executionGrants.workspaceId, binding.workspaceId),
              ),
            )
            .for('update', { noWait: true })
            .limit(1);
          if (
            !grant ||
            grant.taskId !== binding.taskId ||
            grant.agentId !== dispatch.agentId ||
            grant.delegationSubjectType !== 'user' ||
            grant.delegationSubjectId !== binding.userId ||
            grant.status !== 'active' ||
            grant.revokedAt ||
            !grant.expiresAt ||
            grant.expiresAt.getTime() <= Date.now()
          )
            return denied('Bounded user delegation is unavailable');
          const [topic] = await tx
            .select()
            .from(taskTopics)
            .where(
              and(eq(taskTopics.taskId, binding.taskId), eq(taskTopics.topicId, binding.topicId)),
            )
            .for('update', { noWait: true })
            .limit(1);
          if (
            !topic ||
            topic.workspaceId !== binding.workspaceId ||
            topic.dispatchId !== binding.dispatchId ||
            topic.dispatchFence !== binding.dispatchFence ||
            topic.executionGeneration !== binding.generation ||
            topic.policyRevision !== binding.policyRevision ||
            topic.requirementRevision !== task.requirementRevision ||
            topic.operationId !== binding.operationId ||
            topic.status !== 'running' ||
            topic.executionGrantId !== binding.grantId ||
            topic.executionEpoch !== binding.executionEpoch ||
            (grant.taskTopicId !== null && grant.taskTopicId !== topic.id)
          )
            return denied('Delegated run epoch is no longer current');
          const control = topic.executionControl;
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

          const [member] = await tx
            .select()
            .from(workspaceMembers)
            .where(
              and(
                eq(workspaceMembers.workspaceId, binding.workspaceId),
                eq(workspaceMembers.userId, binding.userId),
              ),
            )
            .for('update', { noWait: true })
            .limit(1);
          if (
            !member ||
            member.deletedAt ||
            member.suspendedAt ||
            grant.authzVersions?.workspaceAuthzVersion !== member.authzVersion
          )
            return denied('Delegation membership changed');
          // Use the existing semantic grant checks on the same transaction connection.
          try {
            await new AgentDelegationService(
              tx as OrviloDatabase,
              binding.userId,
              binding.workspaceId,
            ).assertMayCommit({
              taskId: binding.taskId,
              topicId: binding.topicId,
              grantId: binding.grantId,
              epoch: binding.executionEpoch,
              runtime: {
                registrationId: binding.runtimeRegistrationId,
                ownerId: binding.runtimeOwnerId,
                leaseId: binding.runtimeLeaseId,
                allowRegistering: startup,
              },
            });
          } catch {
            return denied('Canonical delegation admission denied');
          }
          // Lock acquisition and grant checks may have waited beyond the original lease.
          if (Math.min(grant.expiresAt.getTime(), control.leaseExpiresAt) <= Date.now())
            return denied('Admission expired while acquiring authority');
          const [contentTopic] = await tx
            .select({ id: topics.id, isDeleted: topics.isDeleted, deletedAt: topics.deletedAt })
            .from(topics)
            .where(and(eq(topics.id, binding.topicId), eq(topics.workspaceId, binding.workspaceId)))
            .for('update', { noWait: true })
            .limit(1);
          if (!contentTopic || contentTopic.isDeleted || contentTopic.deletedAt)
            return denied('Runtime topic deleted');
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
              grantExpiresAt: grant.expiresAt.getTime(),
              allowedActions: [...grant.allowedActions],
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
