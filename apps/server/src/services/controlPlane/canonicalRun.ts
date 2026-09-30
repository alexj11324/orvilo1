import type { ControlResult, ExecutionFence } from '@orvilo/agent-execution';
import { and, eq } from 'drizzle-orm';

import {
  executionGrants,
  taskDispatches,
  tasks,
  taskTopics,
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
  leaseOwner: string;
  operationId: string;
  policyRevision: number;
  stateRevision: number;
  taskId: string;
  topicId: string;
  userId: string;
  workspaceId: string;
}

export interface CanonicalRunSnapshot {
  allowedActions: string[];
  fence: ExecutionFence;
  grantExpiresAt: number;
  leaseExpiresAt: number;
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
    run: (snapshot: CanonicalRunSnapshot) => Promise<T>,
  ): Promise<ControlResult<T>> {
    const binding = structuredClone(input);
    return this.db.transaction(async (tx) => {
      const [dispatch] = await tx
        .select()
        .from(taskDispatches)
        .where(
          and(
            eq(taskDispatches.id, binding.dispatchId),
            eq(taskDispatches.workspaceId, binding.workspaceId),
          ),
        )
        .for('update')
        .limit(1);
      if (
        !dispatch ||
        dispatch.taskId !== binding.taskId ||
        dispatch.operationId !== binding.operationId ||
        dispatch.phase !== 'running' ||
        dispatch.fence !== binding.dispatchFence ||
        dispatch.generation !== binding.generation ||
        dispatch.leaseOwner !== binding.leaseOwner ||
        !dispatch.leaseExpiresAt ||
        dispatch.leaseExpiresAt.getTime() <= Date.now()
      )
        return denied('Dispatch lease is no longer current');
      const [task] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, binding.taskId), eq(tasks.workspaceId, binding.workspaceId)))
        .for('update')
        .limit(1);
      if (
        !task ||
        task.status !== 'running' ||
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
        .for('update')
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
        .where(and(eq(taskTopics.taskId, binding.taskId), eq(taskTopics.topicId, binding.topicId)))
        .for('update')
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
      const [member] = await tx
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, binding.workspaceId),
            eq(workspaceMembers.userId, binding.userId),
          ),
        )
        .for('update')
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
        });
      } catch {
        return denied('Canonical delegation admission denied');
      }
      // Lock acquisition and grant checks may have waited beyond the original lease.
      if (Math.min(grant.expiresAt.getTime(), dispatch.leaseExpiresAt.getTime()) <= Date.now())
        return denied('Admission expired while acquiring authority');
      const value = await run({
        fence: {
          tenantId: binding.workspaceId,
          principalId: binding.userId,
          taskId: binding.taskId,
          grantId: binding.grantId,
          ownerId: binding.leaseOwner,
          leaseId: `${binding.dispatchId}:${binding.dispatchFence}`,
          epoch: binding.executionEpoch,
          policyRevision: binding.policyRevision,
          stateRevision: binding.stateRevision,
        },
        leaseExpiresAt: dispatch.leaseExpiresAt.getTime(),
        grantExpiresAt: grant.expiresAt.getTime(),
        allowedActions: [...grant.allowedActions],
      });
      return { ok: true, value };
    });
  }
}
