import { randomUUID } from 'node:crypto';

import type {
  IssueChecklistDefinition,
  IssueChecklistItem,
  IssueChecklistReviewItem,
  IssueCurrentDelivery,
  IssueDeliveryProof,
  TaskConfig,
  TaskItem,
} from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { AcceptanceModel } from '@/database/models/acceptance';
import { AgentOperationModel } from '@/database/models/agentOperation';
import { FileModel } from '@/database/models/file';
import {
  currentIssueDeliveryProof,
  IssueDeliveryModel,
  sameIssueDeliveryProof,
} from '@/database/models/issueDelivery';
import { ProjectModel } from '@/database/models/project';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TeamModel } from '@/database/models/team';
import { VerifyCheckResultModel } from '@/database/models/verifyCheckResult';
import { VerifyEvidenceModel } from '@/database/models/verifyEvidence';
import { VerifyRunModel } from '@/database/models/verifyRun';
import { getActiveWorkspaceMembershipRole } from '@/database/models/workspace';
import {
  acceptances,
  verifyCheckResults,
  verifyEvidence,
  verifyRuns,
} from '@/database/schemas/verify';
import type { OrviloDatabase } from '@/database/type';

import { resolveWorkflowTransition } from '../taskSettlement/workflowTransition';
import { createEvidenceFileResolver } from '../verify/evidenceFiles';
import { completeAcceptedArtifacts, readDeliveryGroup } from './deliveryGroup';

export {
  currentIssueDeliveryProof,
  issueDeliveryReadiness,
  sameIssueDeliveryProof,
} from '@/database/models/issueDelivery';

const denied = (message: string) => new TRPCError({ code: 'PRECONDITION_FAILED', message });

/** Issue-owned ledger operations. It does not launch the retired Verify engine or complete Issues. */
export class IssueChecklistService {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private async readableTasks(taskIds: string[]) {
    const tasks = await new TaskModel(this.db, this.userId, this.workspaceId).findByIds(taskIds);
    const projects = await new ProjectModel(this.db, this.userId, this.workspaceId).findByIds([
      ...new Set(tasks.flatMap((task) => (task.projectId ? [task.projectId] : []))),
    ]);
    const visible = new Set(projects.map((project) => project.id));
    return tasks.filter((task) => !task.projectId || visible.has(task.projectId));
  }

  private async requireTask(taskId: string) {
    const task = (await this.readableTasks([taskId]))[0];
    if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
    return task;
  }

  private async requireAcceptor(task: TaskItem) {
    if (task.createdByUserId === this.userId) return;
    if (
      task.workspaceId &&
      (await getActiveWorkspaceMembershipRole(this.db, {
        workspaceId: task.workspaceId,
        userId: this.userId,
      })) === 'owner'
    )
      return;
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the Issue requester or workspace Owner may accept delivery',
    });
  }

  private async write<T>(
    taskId: string,
    action: (service: IssueChecklistService, task: TaskItem) => Promise<T>,
  ) {
    await this.requireTask(taskId);
    const result = await new TaskModel(this.db, this.userId, this.workspaceId).withIssueDelivery(
      taskId,
      async (db, task) => {
        const service = new IssueChecklistService(db, this.userId, this.workspaceId);
        await service.requireTask(task.id);
        return action(service, task);
      },
    );
    if (result === null) throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
    return result;
  }

  private async findAggregate(task: TaskItem) {
    if (!task.createdByUserId) throw denied('Issue requester is missing');
    const [existing] = await this.db
      .select()
      .from(acceptances)
      .where(
        and(
          eq(acceptances.subjectType, 'task'),
          eq(acceptances.subjectId, task.id),
          task.workspaceId
            ? eq(acceptances.workspaceId, task.workspaceId)
            : and(eq(acceptances.userId, task.createdByUserId), isNull(acceptances.workspaceId)),
        ),
      );
    return existing;
  }

  private async aggregate(task: TaskItem) {
    const existing = await this.findAggregate(task);
    if (existing) return existing;
    if (!task.createdByUserId) throw denied('Issue requester is missing');
    return new AcceptanceModel(this.db, task.createdByUserId, this.workspaceId).ensureForSubject(
      'task',
      task.id,
      { projectId: task.projectId },
    );
  }

  async confirmChecklist(input: {
    taskId: string;
    expectedRevision: number;
    items: IssueChecklistItem[];
    deliveryKind: 'code' | 'artifact';
    repo?: string;
    targetBranch?: string;
  }) {
    return this.write(input.taskId, async (service, task) => {
      await service.requireAcceptor(task);
      if (
        !input.items.length ||
        !input.items.some((item) => item.required) ||
        input.items.some((item) => !item.id.trim() || !item.title.trim()) ||
        new Set(input.items.map((item) => item.id)).size !== input.items.length
      )
        throw denied('Checklist requires unique, titled items and at least one required item');
      if (input.deliveryKind === 'code' && (!input.repo?.trim() || !input.targetBranch?.trim()))
        throw denied('Confirm the repository and final target branch for code delivery');
      const acceptance = await service.aggregate(task);
      const previous = acceptance.metadata?.issueChecklist;
      if ((previous?.revision ?? 0) !== input.expectedRevision)
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Checklist changed; reload before confirming',
        });
      const latest = (
        await new TaskTopicModel(service.db, service.userId, service.workspaceId).findByTaskId(
          task.id,
        )
      ).sort((a, b) => b.seq - a.seq)[0];
      const [frozen] = latest?.operationId
        ? await service.db
            .select()
            .from(verifyRuns)
            .where(eq(verifyRuns.operationId, latest.operationId))
        : [];
      if (
        frozen?.metadata?.issueDelivery &&
        latest?.executionGeneration === task.executionGeneration
      ) {
        const delivered =
          frozen.userDecision === 'accept' &&
          (frozen.metadata.issueDelivery.deliveryKind === 'artifact' ||
            (latest?.integration?.state === 'integrated' &&
              (latest.integration.mergedTargetBranch ?? latest.integration.baseBranch) ===
                frozen.metadata.issueDelivery.targetBranch &&
              latest.integration.expectedHeadSha === frozen.metadata.issueDelivery.sourceSha &&
              !!latest.integration.integratedSha));
        if (!delivered)
          throw denied(
            'This delivery Checklist is frozen; finish delivery before confirming new scope',
          );
      }
      await new TaskModel(
        service.db,
        service.userId,
        service.workspaceId,
      ).assertStoppedIssueWriters([task.id]);
      const definition: IssueChecklistDefinition = {
        revision: input.expectedRevision + 1,
        items: input.items.map((item) => ({ ...item, title: item.title.trim() })),
        deliveryKind: input.deliveryKind,
        repo: input.repo,
        targetBranch: input.targetBranch,
        confirmedAt: new Date().toISOString(),
        confirmedBy: service.userId,
      };
      await service.db
        .update(acceptances)
        .set({ metadata: { ...acceptance.metadata, issueChecklist: definition } })
        .where(eq(acceptances.id, acceptance.id));
      return definition;
    });
  }

  /** Freeze a new result round for the current delivery; old human decisions are never copied. */
  async prepareReview(taskId: string, deliveryOperationId?: string) {
    return this.write(taskId, async (service, task) => {
      const acceptance = await service.aggregate(task);
      const definition = acceptance.metadata?.issueChecklist;
      if (!definition) throw denied('Confirm the Issue Checklist before review');
      const topics = await new TaskTopicModel(
        service.db,
        service.userId,
        service.workspaceId,
      ).findByTaskId(taskId);
      const latest = [...topics].sort((a, b) => b.seq - a.seq)[0];
      if (deliveryOperationId && latest?.operationId !== deliveryOperationId)
        throw denied('Delivery operation is no longer current');
      const proof = currentIssueDeliveryProof(task, latest, definition);
      if (!proof)
        throw denied('Current completed delivery and code revision are required for review');
      const operation = await new AgentOperationModel(
        service.db,
        service.userId,
        service.workspaceId,
      ).findById(proof.deliveryOperationId);
      if (!operation || operation.taskId !== taskId)
        throw denied('Delivery operation does not belong to the Issue');
      const model = new VerifyRunModel(service.db, operation.userId, service.workspaceId);
      const existing = await model.findByOperation(proof.deliveryOperationId);
      if (existing?.metadata?.issueDelivery) {
        if (!sameIssueDeliveryProof(proof, existing.metadata.issueDelivery))
          throw denied('Delivery changed after its Checklist round was frozen');
        return { run: existing, proof };
      }
      if (existing) throw denied('This delivery already has a legacy verification round');
      const run = await model.create({
        operationId: proof.deliveryOperationId,
        visibility: 'private',
        title: task.name,
        status: 'verifying',
        planConfirmedAt: new Date(definition.confirmedAt),
        metadata: { issueDelivery: proof },
        plan: definition.items.map((item, index) => ({
          ...item,
          id: randomUUID(),
          index,
          onFail: 'manual',
          verifierType: 'agent',
          verifierConfig: { checklistItemId: item.id },
        })),
      });
      const attached = await model.attachToAcceptance(run.id, acceptance.id, 'private');
      return { run: attached, proof };
    });
  }

  readCurrentDeliveryProof(taskIds: string[]) {
    return new IssueDeliveryModel(this.db, this.userId, this.workspaceId).readCurrentDeliveryProof(
      taskIds,
    );
  }

  async getChecklist(taskId: string) {
    const task = await this.requireTask(taskId);
    const aggregate = await this.findAggregate(task);
    const history = aggregate
      ? await this.db.select().from(verifyRuns).where(eq(verifyRuns.acceptanceId, aggregate.id))
      : [];
    const runIds = history.map((row) => row.id);
    const results = runIds.length
      ? await this.db
          .select()
          .from(verifyCheckResults)
          .where(inArray(verifyCheckResults.verifyRunId, runIds))
      : [];
    const resultIds = results.map((row) => row.id);
    const evidence = resultIds.length
      ? await this.db
          .select()
          .from(verifyEvidence)
          .where(inArray(verifyEvidence.checkResultId, resultIds))
      : [];
    const resolveFile = createEvidenceFileResolver(
      this.db,
      task.createdByUserId!,
      this.workspaceId,
    );
    let canAccept = false;
    if (task.createdByUserId === this.userId) canAccept = true;
    else if (task.workspaceId)
      canAccept =
        (await getActiveWorkspaceMembershipRole(this.db, {
          workspaceId: task.workspaceId,
          userId: this.userId,
        })) === 'owner';
    return {
      definition: aggregate?.metadata?.issueChecklist,
      current: (await this.readCurrentDeliveryProof([taskId]))[taskId],
      history,
      results,
      evidence: await Promise.all(
        evidence.map(async (row) => ({ ...row, ...(await resolveFile(row.fileId)) })),
      ),
      canAccept,
    };
  }

  private async requireCurrentRun(taskId: string, runId: string, proof: IssueDeliveryProof) {
    const current = (await this.readCurrentDeliveryProof([taskId]))[taskId];
    if (!current?.proof || current.runId !== runId || !sameIssueDeliveryProof(proof, current.proof))
      throw denied('Checklist delivery revision changed; reload before deciding');
    const [run] = await this.db.select().from(verifyRuns).where(eq(verifyRuns.id, runId));
    if (!run) throw denied('Checklist round not found');
    return { current, run };
  }

  async submitReviewItems(input: {
    taskId: string;
    runId: string;
    proof: IssueDeliveryProof;
    cycleId: string;
    reviewerOperationId: string;
    actorAgentId: string;
    verdict: 'pass' | 'fail';
    comment?: string;
    items: IssueChecklistReviewItem[];
  }) {
    return this.write(input.taskId, async (service, task) => {
      const { run } = await service.requireCurrentRun(task.id, input.runId, input.proof);
      const review = (task.config as TaskConfig | undefined)?.issueReview;
      if (
        review?.state !== 'running' ||
        review.cycleId !== input.cycleId ||
        review.reviewerOperationId !== input.reviewerOperationId ||
        task.reviewerAgentId !== input.actorAgentId
      )
        throw denied('Issue reviewer cycle or operation changed');
      const expected = run.plan ?? [];
      if (
        input.items.length !== expected.length ||
        new Set(input.items.map((item) => item.checkItemId)).size !== expected.length ||
        expected.some((item) => !input.items.some((result) => result.checkItemId === item.id))
      )
        throw denied('Submit exactly one verdict and evidence for every Checklist item');
      if (
        input.items.some(
          (item) =>
            !item.comment.trim() ||
            !item.evidence.length ||
            item.evidence.some((evidence) => !evidence.content?.trim() && !evidence.fileId),
        )
      )
        throw denied('Every Checklist verdict requires an explanation and real evidence');
      const passed = expected
        .filter((item) => item.required)
        .every(
          (item) =>
            input.items.find((result) => result.checkItemId === item.id)?.verdict === 'pass',
        );
      if ((input.verdict === 'pass') !== passed)
        throw denied('Overall verdict must match the required Checklist results');
      if (run.metadata?.issueReviewer)
        throw denied('This Checklist round already has a Reviewer verdict');
      const files = new FileModel(service.db, service.userId, service.workspaceId);
      const ids = [
        ...new Set(
          input.items.flatMap((item) =>
            item.evidence.flatMap((evidence) => (evidence.fileId ? [evidence.fileId] : [])),
          ),
        ),
      ];
      if ((await files.findByIds(ids)).length !== ids.length)
        throw denied('Evidence file is not accessible');
      const model = new VerifyCheckResultModel(service.db, run.userId, service.workspaceId);
      for (const item of input.items) {
        const plan = expected.find((check) => check.id === item.checkItemId)!;
        const result = await model.create({
          verifyRunId: run.id,
          operationId: run.operationId,
          checkItemId: item.checkItemId,
          checkItemTitle: plan.title,
          checkItemIndex: plan.index,
          required: plan.required,
          verifierType: 'agent',
          verifierOperationId: input.reviewerOperationId,
          verdict:
            item.verdict === 'pass' ? 'passed' : item.verdict === 'fail' ? 'failed' : 'uncertain',
          status: item.verdict === 'pass' ? 'passed' : 'failed',
          metadata: { issueDelivery: input.proof, comment: item.comment },
          completedAt: new Date(),
        });
        await new VerifyEvidenceModel(service.db, run.userId, service.workspaceId).createMany(
          item.evidence.map((evidence) => ({
            ...evidence,
            checkResultId: result.id,
            capturedBy: 'agent',
            metadata: {
              issueDelivery: input.proof,
              reviewerOperationId: input.reviewerOperationId,
            },
          })),
        );
      }
      const runs = new VerifyRunModel(service.db, run.userId, service.workspaceId);
      await runs.update(run.id, {
        metadata: {
          ...run.metadata,
          issueReviewer: {
            cycleId: input.cycleId,
            operationId: input.reviewerOperationId,
            verdict: input.verdict,
          },
        },
      });
      await runs.updateStatus(run.id, passed ? 'passed' : 'failed');
      const states =
        task.teamId && service.workspaceId
          ? await new TeamModel(service.db, service.userId, service.workspaceId).listWorkflowStates(
              task.teamId,
            )
          : [];
      const { patch } = resolveWorkflowTransition({
        category: passed ? 'in_review' : 'in_progress',
        states,
      });
      const result = await new TaskModel(
        service.db,
        service.userId,
        service.workspaceId,
      ).recordIssueReviewVerdict(task.id, {
        cycleId: input.cycleId,
        operationId: input.reviewerOperationId,
        actorAgentId: input.actorAgentId,
        verdict: input.verdict,
        comment: input.comment,
        transition: patch,
      });
      if (!result) throw denied('Issue review cycle or operation changed');
      return result;
    });
  }

  async reviewChecklistItems(input: {
    taskId: string;
    runId: string;
    proof: IssueDeliveryProof;
    resultIds: string[];
    action: 'accept' | 'reject';
    comment?: string;
  }) {
    return this.write(input.taskId, async (service, task) => {
      await service.requireAcceptor(task);
      const { run } = await service.requireCurrentRun(task.id, input.runId, input.proof);
      if (run.userDecision === 'accept') throw denied('Accepted delivery decisions are historical');
      const model = new VerifyCheckResultModel(service.db, run.userId, service.workspaceId);
      const results = await model.listByRun(run.id);
      const ids = new Set(input.resultIds);
      const selected = results.filter((result) => ids.has(result.id));
      if (!ids.size || selected.length !== ids.size || selected.some((result) => !result.verdict))
        throw denied('Choose existing reviewed Checklist results');
      if (selected.some((result) => result.userDecision === 'accepted'))
        throw denied('Accepted Checklist results are historical; submit new work as a new item');
      if (input.action === 'reject' && !input.comment?.trim())
        throw denied('Rejecting a Checklist item requires feedback');
      await Promise.all(
        selected.map((result) =>
          model.update(result.id, {
            userDecision: input.action === 'accept' ? 'accepted' : 'rejected',
            userDecisionDetail: {
              decidedAt: new Date().toISOString(),
              decidedBy: service.userId,
              roundIndex: run.roundIndex ?? 0,
              comment: input.comment,
            },
          }),
        ),
      );
      return { resultIds: [...ids] };
    });
  }

  async acceptDelivery(input: { taskId: string; runId: string; proof: IssueDeliveryProof }) {
    const task = await this.requireTask(input.taskId);
    await this.requireAcceptor(task);
    const group = await readDeliveryGroup(this.db, this.userId, this.workspaceId, task);
    if (!group.valid || group.parent?.id !== task.id)
      throw denied('Accept the confirmed plan delivery from its parent Issue');
    // Lock every member in stable order: a new run cannot replace a child proof mid-acceptance.
    const lock = async (db: OrviloDatabase, index: number): Promise<IssueCurrentDelivery> => {
      if (index < group.ids.length) {
        const locked = await new TaskModel(db, this.userId, this.workspaceId).withIssueDelivery(
          group.ids[index],
          async (tx) => lock(tx, index + 1),
        );
        if (!locked) throw denied('Confirmed delivery group member disappeared');
        return locked;
      }
      const service = new IssueChecklistService(db, this.userId, this.workspaceId);
      const parent = await service.requireTask(task.id);
      await service.requireAcceptor(parent);
      const currentGroup = await readDeliveryGroup(db, this.userId, this.workspaceId, parent);
      if (!currentGroup.valid || JSON.stringify(currentGroup.ids) !== JSON.stringify(group.ids))
        throw denied('Confirmed delivery group changed; reload before accepting');
      await service.requireCurrentRun(task.id, input.runId, input.proof);
      for (const id of currentGroup.ids) {
        const current = currentGroup.proofs[id];
        if (
          !currentGroup.inConfirmedScope(id) ||
          !current?.proof ||
          !current.runId ||
          !current.reviewerPassed ||
          !current.necessaryChecksPassed ||
          !current.itemsAccepted
        )
          throw denied(
            'Every current plan delivery requires Reviewer checks, evidence and item acceptance',
          );
      }
      for (const id of currentGroup.ids) {
        const current = currentGroup.proofs[id];
        const { run } = await service.requireCurrentRun(id, current.runId!, current.proof!);
        if (run.userDecision !== 'accept')
          await new VerifyRunModel(db, run.userId, service.workspaceId).setDecision(
            run.id,
            'accept',
            {
              decidedAt: new Date().toISOString(),
              decidedBy: service.userId,
            },
          );
      }
      return { ...currentGroup.proofs[task.id], deliveryAccepted: true };
    };
    const accepted = await lock(this.db, 0);
    await completeAcceptedArtifacts(this.db, task.createdByUserId!, this.workspaceId, task.id);
    return accepted;
  }
}
