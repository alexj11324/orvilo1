import { deriveLegacyTaskStatus } from '@orvilo/types';
import { and, eq } from 'drizzle-orm';

import { TaskDispatchModel } from '@/database/models/taskDispatch';
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

import type { CanonicalRunBinding } from './canonicalRun';

export type CanonicalCompletionOutcome =
  | { state: 'denied'; reason: string }
  | { state: 'observed'; taskStatus: string; completed: boolean };

/** Observes the current Issue status without turning runtime outcomes into a verdict. */
export class CanonicalIssueCompletion {
  constructor(private readonly db: OrviloDatabase) {}

  async reconcile(input: CanonicalRunBinding): Promise<CanonicalCompletionOutcome> {
    const binding = structuredClone(input);
    const deny = (reason: string): CanonicalCompletionOutcome => ({ state: 'denied', reason });
    if (binding.subject.kind !== 'task') return deny('run_subject_not_task');
    const taskId = binding.subject.taskId;
    return this.db.transaction(async (transaction) => {
      const db = transaction as OrviloDatabase;
      await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, binding.workspaceId)))
        .for('update');
      await db
        .select({ id: taskDispatches.id })
        .from(taskDispatches)
        .where(
          and(
            eq(taskDispatches.id, binding.dispatchId),
            eq(taskDispatches.workspaceId, binding.workspaceId),
          ),
        )
        .for('update');
      const [grant] = await db
        .select()
        .from(executionGrants)
        .where(
          and(
            eq(executionGrants.id, binding.grantId),
            eq(executionGrants.workspaceId, binding.workspaceId),
          ),
        )
        .for('update');
      if (
        !grant ||
        grant.taskId !== taskId ||
        grant.delegationSubjectType !== 'user' ||
        grant.delegationSubjectId !== binding.userId ||
        grant.status !== 'active' ||
        grant.revokedAt ||
        !grant.expiresAt ||
        grant.expiresAt.getTime() <= Date.now()
      )
        return deny('delegation_unavailable');
      await db
        .select({ id: taskTopics.id })
        .from(taskTopics)
        .where(and(eq(taskTopics.taskId, taskId), eq(taskTopics.topicId, binding.topicId)))
        .for('update');
      const [member] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, binding.workspaceId),
            eq(workspaceMembers.userId, binding.userId),
          ),
        )
        .for('update');
      if (
        !member ||
        member.deletedAt ||
        member.suspendedAt ||
        member.authzVersion !== grant.authzVersions?.workspaceAuthzVersion
      )
        return deny('delegation_unavailable');
      const invalid = await new CanonicalIssueCompletion(db).validate(binding);
      if (invalid) return deny(invalid);
      try {
        await new AgentDelegationService(db, binding.userId, binding.workspaceId).assertMayCommit({
          taskId,
          topicId: binding.topicId,
          grantId: binding.grantId,
          epoch: binding.executionEpoch,
          runtime: {
            registrationId: binding.runtimeRegistrationId,
            ownerId: binding.runtimeOwnerId,
            leaseId: binding.runtimeLeaseId,
          },
        });
      } catch {
        return deny('delegation_unavailable');
      }
      if (grant.expiresAt.getTime() <= Date.now()) return deny('delegation_unavailable');
      const [task] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, binding.workspaceId)))
        .limit(1);
      return {
        completed: task.workflowCategory === 'done',
        state: 'observed',
        taskStatus: deriveLegacyTaskStatus(task),
      };
    });
  }

  private async validate(binding: CanonicalRunBinding): Promise<string | undefined> {
    if (binding.subject.kind !== 'task') return 'run_subject_not_task';
    const taskId = binding.subject.taskId;
    const [liveTask] = await this.db
      .select({ id: tasks.id, isDeleted: tasks.isDeleted, deletedAt: tasks.deletedAt })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, binding.workspaceId)))
      .limit(1);
    const [liveTopic] = await this.db
      .select({ id: topics.id, isDeleted: topics.isDeleted, deletedAt: topics.deletedAt })
      .from(topics)
      .where(and(eq(topics.id, binding.topicId), eq(topics.workspaceId, binding.workspaceId)))
      .for('update')
      .limit(1);
    if (
      !liveTask ||
      liveTask.isDeleted ||
      liveTask.deletedAt ||
      !liveTopic ||
      liveTopic.isDeleted ||
      liveTopic.deletedAt
    )
      return 'canonical_resource_deleted';
    const [topic] = await this.db
      .select()
      .from(taskTopics)
      .where(
        and(
          eq(taskTopics.taskId, taskId),
          eq(taskTopics.topicId, binding.topicId),
          eq(taskTopics.workspaceId, binding.workspaceId),
        ),
      )
      .limit(1);
    if (
      !topic ||
      topic.operationId !== binding.operationId ||
      topic.dispatchId !== binding.dispatchId ||
      topic.dispatchFence !== binding.dispatchFence ||
      topic.executionGeneration !== binding.generation ||
      topic.executionEpoch !== binding.executionEpoch ||
      topic.executionGrantId !== binding.grantId ||
      topic.policyRevision !== binding.policyRevision ||
      topic.requirementRevision === null
    )
      return 'run_binding_changed';
    if (
      !(await new TaskDispatchModel(this.db, binding.workspaceId).isCurrentContract({
        dispatchId: binding.dispatchId,
        fence: binding.dispatchFence,
        generation: binding.generation,
        operationId: binding.operationId,
        policyRevision: binding.policyRevision,
        requirementRevision: topic.requirementRevision,
        taskId,
      }))
    )
      return 'dispatch_contract_changed';
    return undefined;
  }
}
