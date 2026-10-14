import type {
  IssueChecklistDefinition,
  IssueCurrentDelivery,
  IssueDeliveryProof,
  IssueReviewState,
  TaskConfig,
  TaskItem,
} from '@orvilo/types';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';

import type { TaskTopicItem } from '../schemas/task';
import { taskTopics } from '../schemas/task';
import type { VerifyCheckResultItem, VerifyRunItem } from '../schemas/verify';
import { acceptances, verifyCheckResults, verifyEvidence, verifyRuns } from '../schemas/verify';
import type { OrviloDatabase } from '../type';
import { ProjectModel } from './project';
import { TaskModel } from './task';

export const sameIssueDeliveryProof = (a: IssueDeliveryProof, b: IssueDeliveryProof) =>
  a.taskId === b.taskId &&
  a.deliveryOperationId === b.deliveryOperationId &&
  a.topicId === b.topicId &&
  a.executionGeneration === b.executionGeneration &&
  a.dispatchId === b.dispatchId &&
  a.sourceSha === b.sourceSha &&
  a.repo === b.repo &&
  a.branch === b.branch &&
  a.baseBranch === b.baseBranch &&
  a.targetBranch === b.targetBranch &&
  a.checklistRevision === b.checklistRevision &&
  a.deliveryKind === b.deliveryKind;

export const currentIssueDeliveryProof = (
  task: Pick<
    TaskItem,
    'id' | 'executionGeneration' | 'isDeleted' | 'deletedAt' | 'workflowCategory' | 'status'
  >,
  topic: TaskTopicItem | undefined,
  checklist: IssueChecklistDefinition | undefined,
): IssueDeliveryProof | undefined => {
  if (
    !checklist ||
    !topic?.topicId ||
    !topic.operationId ||
    topic.status !== 'completed' ||
    task.isDeleted ||
    Boolean(task.deletedAt) ||
    Boolean((topic.handoff as { inputStale?: unknown[] } | null)?.inputStale?.length) ||
    task.workflowCategory === 'canceled' ||
    task.status === 'failed' ||
    topic.executionGeneration !== task.executionGeneration
  )
    return;
  const integration = topic.integration;
  if (
    checklist.deliveryKind === 'code' &&
    (!integration?.expectedHeadSha ||
      !/^[a-f\d]{40,64}$/i.test(integration.expectedHeadSha) ||
      integration.repo !== checklist.repo ||
      !integration.branch ||
      ['skipped'].includes(integration.state) ||
      !checklist.targetBranch)
  )
    return;
  return {
    taskId: task.id,
    deliveryOperationId: topic.operationId,
    topicId: topic.topicId,
    executionGeneration: task.executionGeneration,
    dispatchId: topic.dispatchId ?? undefined,
    sourceSha: integration?.expectedHeadSha,
    repo: integration?.repo,
    branch: integration?.branch,
    baseBranch: integration?.baseBranch,
    targetBranch: checklist.targetBranch,
    checklistRevision: checklist.revision,
    deliveryKind: checklist.deliveryKind,
  };
};

export const issueDeliveryReadiness = (
  proof: IssueDeliveryProof | undefined,
  run: VerifyRunItem | undefined,
  results: VerifyCheckResultItem[],
  evidenceResultIds: ReadonlySet<string>,
  topic?: TaskTopicItem,
  review?: IssueReviewState,
): IssueCurrentDelivery => {
  const bound = Boolean(
    proof &&
    run?.metadata?.issueDelivery &&
    sameIssueDeliveryProof(proof, run.metadata.issueDelivery),
  );
  const required = (run?.plan ?? []).filter((item) => item.required);
  const byItem = new Map(results.map((result) => [result.checkItemId, result]));
  const necessaryChecksPassed =
    bound &&
    run?.status === 'passed' &&
    required.length > 0 &&
    required.every((item) => {
      const result = byItem.get(item.id);
      return (
        result?.verdict === 'passed' &&
        result.status === 'passed' &&
        result.verifierOperationId === run?.metadata?.issueReviewer?.operationId &&
        evidenceResultIds.has(result.id)
      );
    });
  const reviewerPassed =
    bound &&
    !!run?.metadata?.issueReviewer?.operationId &&
    run.metadata.issueReviewer.verdict === 'pass' &&
    review?.state === 'submitted' &&
    review.verdict === 'pass' &&
    review.deliveryOperationId === proof?.deliveryOperationId &&
    review.cycleId === run.metadata.issueReviewer.cycleId &&
    review.reviewerOperationId === run.metadata.issueReviewer.operationId;
  const itemsAccepted =
    necessaryChecksPassed &&
    required.every((item) => byItem.get(item.id)?.userDecision === 'accepted');
  const deliveryAccepted = bound && run?.userDecision === 'accept';
  const merged =
    bound &&
    proof?.deliveryKind === 'code' &&
    topic?.integration?.state === 'integrated' &&
    !!topic.integration.integratedSha &&
    (topic.integration.mergedTargetBranch ?? topic.integration.baseBranch) === proof.targetBranch;
  return {
    runId: bound ? run?.id : undefined,
    proof,
    reviewerPassed,
    necessaryChecksPassed,
    itemsAccepted,
    deliveryAccepted,
    availableForDependents:
      reviewerPassed &&
      necessaryChecksPassed &&
      !['conflict', 'publish_failed', 'blocked'].includes(topic?.integration?.state ?? ''),
    merged,
  };
};

export class IssueDeliveryModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  async readableTasks(taskIds: string[]) {
    if (!taskIds.length) return [];
    const tasksInScope = await new TaskModel(this.db, this.userId, this.workspaceId).findByIds(
      taskIds,
    );
    const projects = await new ProjectModel(this.db, this.userId, this.workspaceId).findByIds([
      ...new Set(tasksInScope.flatMap((task) => (task.projectId ? [task.projectId] : []))),
    ]);
    const visibleProjects = new Set(projects.map((project) => project.id));
    return tasksInScope.filter((task) => !task.projectId || visibleProjects.has(task.projectId));
  }

  /** Batch reads keep Issue/Project authorization ahead of all historical ledger reads. */
  async readCurrentDeliveryProof(taskIds: string[]): Promise<Record<string, IssueCurrentDelivery>> {
    const tasks = await this.readableTasks(taskIds);
    if (!tasks.length) return {};
    const ids = tasks.map((task) => task.id);
    const [aggregates, topics] = await Promise.all([
      this.db
        .select()
        .from(acceptances)
        .where(and(eq(acceptances.subjectType, 'task'), inArray(acceptances.subjectId, ids))),
      this.db.select().from(taskTopics).where(inArray(taskTopics.taskId, ids)),
    ]);
    const aggregateIds = aggregates.map((row) => row.id);
    const runs = aggregateIds.length
      ? await this.db
          .select()
          .from(verifyRuns)
          .where(inArray(verifyRuns.acceptanceId, aggregateIds))
      : [];
    const runIds = runs.map((row) => row.id);
    const results = runIds.length
      ? await this.db
          .select()
          .from(verifyCheckResults)
          .where(inArray(verifyCheckResults.verifyRunId, runIds))
      : [];
    const resultIds = results.map((row) => row.id);
    const evidence = resultIds.length
      ? await this.db
          .select({ checkResultId: verifyEvidence.checkResultId })
          .from(verifyEvidence)
          .where(
            and(
              inArray(verifyEvidence.checkResultId, resultIds),
              or(
                isNotNull(verifyEvidence.fileId),
                sql`nullif(btrim(${verifyEvidence.content}), '') IS NOT NULL`,
              ),
            ),
          )
      : [];
    const evidenceIds = new Set(evidence.map((row) => row.checkResultId));
    return Object.fromEntries(
      tasks.map((task) => {
        const aggregate = aggregates.find(
          (row) =>
            row.subjectId === task.id &&
            row.workspaceId === task.workspaceId &&
            (Boolean(task.workspaceId) || row.userId === task.createdByUserId),
        );
        const topic = topics
          .filter((row) => row.taskId === task.id)
          .sort((a, b) => b.seq - a.seq)[0];
        const proof = currentIssueDeliveryProof(task, topic, aggregate?.metadata?.issueChecklist);
        const run = runs.find(
          (row) =>
            row.acceptanceId === aggregate?.id &&
            row.operationId === topic?.operationId &&
            row.metadata?.issueDelivery?.taskId === task.id,
        );
        return [
          task.id,
          issueDeliveryReadiness(
            proof,
            run,
            results.filter((row) => row.verifyRunId === run?.id),
            evidenceIds,
            topic,
            (task.config as TaskConfig | undefined)?.issueReview,
          ),
        ];
      }),
    );
  }
}
