import type { DurableReceipt } from '@orvilo/agent-execution';
import { and, eq } from 'drizzle-orm';

import { TaskDispatchModel } from '@/database/models/taskDispatch';
import {
  executionGrants,
  taskDispatches,
  tasks,
  taskTopics,
  verifyCheckResults,
  verifyRuns,
  workspaceMembers,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { AgentDelegationService } from '@/server/services/agentDelegation/executionGrants';

import type { CanonicalRunBinding } from './canonicalRun';

/** Supplied by trusted server registration, not by an agent or completion request.
 * Receipt loading must read the durable store; mappings bind its exact request digest
 * to a check in the frozen Verify plan. No default mapping is inferred from text. */
export interface CanonicalReceiptMapping {
  checkItemId: string;
  receiptId: string;
  requestDigest: string;
  sourceCriterionId: string;
}
export interface CanonicalCompletionEvidence {
  loadReceipt: (id: string) => Promise<DurableReceipt | undefined>;
  mappings: CanonicalReceiptMapping[];
}
export type CanonicalCompletionOutcome =
  | { state: 'denied'; reason: string }
  | { state: 'observed'; taskStatus: string; completed: boolean };

/** Invokes existing Verify convergence, never writes a verdict or task status.
 * This is not the generic atomic CompletionPersistence contract: Verify performs
 * its own reservations and contract rechecks, and may leave completion pending. */
export class CanonicalVerifyCompletion {
  constructor(private readonly db: OrviloDatabase) {}

  async reconcile(
    input: CanonicalRunBinding,
    evidence?: CanonicalCompletionEvidence,
  ): Promise<CanonicalCompletionOutcome> {
    const binding = structuredClone(input);
    const deny = (reason: string): CanonicalCompletionOutcome => ({ state: 'denied', reason });
    if (!evidence?.mappings.length) return deny('receipt_mapping_unavailable');
    const captured = { ...evidence, mappings: structuredClone(evidence.mappings) };
    const preflight = await this.validate(binding, captured);
    if (preflight) return deny(preflight);
    const { driveTaskFromVerify } = await import('@/server/services/verify/settle');
    await driveTaskFromVerify(this.db, binding.userId, binding.operationId, binding.workspaceId, {
      beforeCompletion: (tx) => this.authorizeAtCommit(tx, binding, captured),
    });
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, binding.taskId), eq(tasks.workspaceId, binding.workspaceId)))
      .limit(1);
    if (!task) return deny('task_missing_after_reconciliation');
    // Recurring tasks may rearm as scheduled; a void settlement return is not done.
    return { state: 'observed', taskStatus: task.status, completed: task.status === 'completed' };
  }
  /** Runs only inside the actual TaskModel status CAS transaction, never around settlement. */
  async authorizeAtCommit(
    db: OrviloDatabase,
    binding: CanonicalRunBinding,
    evidence: CanonicalCompletionEvidence,
  ): Promise<boolean> {
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
    await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, binding.taskId), eq(tasks.workspaceId, binding.workspaceId)))
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
      grant.taskId !== binding.taskId ||
      grant.delegationSubjectType !== 'user' ||
      grant.delegationSubjectId !== binding.userId ||
      grant.status !== 'active' ||
      grant.revokedAt ||
      !grant.expiresAt ||
      grant.expiresAt.getTime() <= Date.now()
    )
      return false;
    await db
      .select({ id: taskTopics.id })
      .from(taskTopics)
      .where(and(eq(taskTopics.taskId, binding.taskId), eq(taskTopics.topicId, binding.topicId)))
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
      return false;
    const [verify] = await db
      .select({ id: verifyRuns.id })
      .from(verifyRuns)
      .where(
        and(
          eq(verifyRuns.operationId, binding.operationId),
          eq(verifyRuns.workspaceId, binding.workspaceId),
        ),
      )
      .for('update');
    if (!verify) return false;
    await db
      .select({ id: verifyCheckResults.id })
      .from(verifyCheckResults)
      .where(eq(verifyCheckResults.verifyRunId, verify.id))
      .for('update');
    if (await new CanonicalVerifyCompletion(db).validate(binding, evidence)) return false;
    try {
      await new AgentDelegationService(db, binding.userId, binding.workspaceId).assertMayCommit({
        taskId: binding.taskId,
        topicId: binding.topicId,
        grantId: binding.grantId,
        epoch: binding.executionEpoch,
      });
    } catch {
      return false;
    }
    return grant.expiresAt.getTime() > Date.now();
  }

  private async validate(
    binding: CanonicalRunBinding,
    evidence: CanonicalCompletionEvidence,
  ): Promise<string | undefined> {
    const mappings = structuredClone(evidence.mappings);
    const [topic] = await this.db
      .select()
      .from(taskTopics)
      .where(
        and(
          eq(taskTopics.taskId, binding.taskId),
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
        taskId: binding.taskId,
      }))
    )
      return 'dispatch_contract_changed';
    const [verify] = await this.db
      .select()
      .from(verifyRuns)
      .where(
        and(
          eq(verifyRuns.operationId, binding.operationId),
          eq(verifyRuns.workspaceId, binding.workspaceId),
        ),
      )
      .limit(1);
    if (!verify?.planConfirmedAt || verify.status !== 'passed' || !verify.plan?.length)
      return 'verification_not_passed';
    const required = verify.plan.filter((item) => item.required);
    if (
      !required.length ||
      new Set(mappings.map((item) => item.checkItemId)).size !== mappings.length
    )
      return 'invalid_receipt_mapping';
    const checks = await this.db
      .select()
      .from(verifyCheckResults)
      .where(
        and(
          eq(verifyCheckResults.verifyRunId, verify.id),
          eq(verifyCheckResults.workspaceId, binding.workspaceId),
        ),
      );
    for (const criterion of required) {
      const mapping = mappings.find((item) => item.checkItemId === criterion.id);
      if (
        !criterion.sourceCriterionId ||
        !mapping ||
        mapping.sourceCriterionId !== criterion.sourceCriterionId ||
        !checks.some(
          (check) =>
            check.checkItemId === criterion.id &&
            check.sourceCriterionId === criterion.sourceCriterionId &&
            check.verdict === 'passed',
        )
      )
        return 'criterion_evidence_unavailable';
      const receipt = await evidence.loadReceipt(mapping.receiptId);
      if (
        !receipt ||
        receipt.id !== mapping.receiptId ||
        receipt.schemaVersion !== 1 ||
        receipt.status !== 'verified' ||
        !receipt.evidence.length ||
        !mapping.requestDigest ||
        receipt.requestDigest !== mapping.requestDigest ||
        receipt.fence.tenantId !== binding.workspaceId ||
        receipt.fence.principalId !== binding.userId ||
        receipt.fence.taskId !== binding.taskId ||
        receipt.fence.grantId !== binding.grantId ||
        receipt.fence.epoch !== binding.executionEpoch ||
        receipt.fence.ownerId !== binding.leaseOwner ||
        receipt.fence.leaseId !== `${binding.dispatchId}:${binding.dispatchFence}` ||
        receipt.fence.policyRevision !== binding.policyRevision ||
        receipt.fence.stateRevision !== binding.stateRevision
      )
        return 'receipt_identity_changed';
    }
    return undefined;
  }
}
