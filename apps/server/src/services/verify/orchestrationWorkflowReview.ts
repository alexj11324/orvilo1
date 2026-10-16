import type { VerifyRunMetadata } from '@orvilo/types';

import { OrchestrationWorkflowModel } from '@/database/models/orchestrationWorkflow';
import { VerifyEvidenceModel } from '@/database/models/verifyEvidence';
import { VerifyRunModel } from '@/database/models/verifyRun';
import type { OrviloDatabase } from '@/database/type';

import { AcceptanceService, buildAcceptanceCheckUnion } from './acceptanceService';
import { mapWithConcurrency } from './concurrency';
import { resolveOrchestrationWorkflowReviewModelConfig } from './orchestrationWorkflowReviewModelConfig';
import { REVIEW_PREDICT_CONCURRENCY, VerifyReviewPredictorService } from './reviewPredictor';

/** Called under the verify run's task-drive claim, before completing a Orchestration workflow task. */
export const reviewOrchestrationWorkflowDelivery = async (
  db: OrviloDatabase,
  userId: string,
  taskId: string,
  operationId: string,
  workspaceId?: string,
): Promise<VerifyRunMetadata['orchestrationWorkflowReview']> => {
  const orchestrationWorkflow = await new OrchestrationWorkflowModel(
    db,
    userId,
    workspaceId,
  ).findByGraphTask(taskId);
  if (!orchestrationWorkflow) return;

  const runModel = new VerifyRunModel(db, userId, workspaceId);
  const run = await runModel.findByOperation(operationId);
  const review: NonNullable<VerifyRunMetadata['orchestrationWorkflowReview']> = {
    feedback: '',
    predictionIds: [],
    status: 'passed',
  };
  try {
    if (!run?.acceptanceId) throw new Error('Orchestration workflow delivery has no Acceptance');
    const service = new AcceptanceService(db, userId, workspaceId);
    const acceptance = await service.acceptanceModel.findById(run.acceptanceId);
    if (!acceptance) throw new Error('Orchestration workflow Acceptance was not found');
    const { results, runs } = await service.loadRounds(acceptance.id);
    const checks = buildAcceptanceCheckUnion(
      runs.map((round) => ({
        results: results.filter((result) => result.verifyRunId === round.id),
        run: round,
      })),
    ).filter((check) => check.required);
    if (!checks.length) throw new Error('Orchestration workflow Acceptance has no required checks');

    const evidenceModel = new VerifyEvidenceModel(db, userId, workspaceId);
    const evidence = await Promise.all(
      checks.map((check) =>
        check.result ? evidenceModel.listByCheckResult(check.result.id) : Promise.resolve([]),
      ),
    );
    let modelConfigPromise:
      ReturnType<typeof resolveOrchestrationWorkflowReviewModelConfig> | undefined;
    const getModelConfig = () => {
      modelConfigPromise ??= resolveOrchestrationWorkflowReviewModelConfig(
        db,
        userId,
        {
          requiresVision: evidence.flat().some((item) => ['screenshot', 'gif'].includes(item.type)),
          taskId,
          verifierAgentId: acceptance.config?.verifierAgentId,
        },
        workspaceId,
      );
      return modelConfigPromise;
    };

    const predictor = new VerifyReviewPredictorService(db, userId, workspaceId);
    const feedback: string[] = [];
    // Checks are judged concurrently, so the aggregate has to be order
    // independent: take the most blocking outcome seen rather than letting the
    // last writer win. `rejected` outranks `unjudgeable` because one genuinely
    // short check makes another attempt worth paying for, while an undecidable
    // check on its own makes every further attempt a repeat.
    const escalate = (
      next: NonNullable<VerifyRunMetadata['orchestrationWorkflowReview']>['status'],
    ) => {
      const rank = { errored: 3, passed: 0, rejected: 2, unjudgeable: 1 } as const;
      if (rank[next] > rank[review.status]) review.status = next;
    };
    await mapWithConcurrency(checks, REVIEW_PREDICT_CONCURRENCY, async (check) => {
      if (!check.result || check.carriedFromRound !== undefined) {
        escalate('rejected');
        feedback.push(`${check.title}: Submit current evidence for this required check.`);
        return;
      }
      if (check.result.userDecision === 'accepted' || check.result.userDecision === 'overridden')
        return;
      if (check.result.userDecision === 'rejected') {
        escalate('rejected');
        feedback.push(
          `${check.title}: ${check.result.userDecisionDetail?.comment ?? 'Rejected by the user.'}`,
        );
        return;
      }
      const modelConfig = await getModelConfig();
      if (!modelConfig) {
        escalate('errored');
        feedback.push(
          'Configure an available model on the Acceptance verifier agent and retry the review.',
        );
        return;
      }
      const checkResultId = check.result.id;
      const judge = () =>
        predictor
          .predict({
            checkResultId,
            includeTextEvidence: true,
            instructionDocumentId: check.planItem?.documentId,
            // The Acceptance's pinned verifier is the review's authorized
            // judgment binding (builtin verify agent + env are the fallbacks).
            judgmentAgentId: acceptance.config?.verifierAgentId,
            modelConfig,
            requirement: acceptance.requirement,
            surface: check.surface,
          })
          .catch((error) => {
            console.error('[orchestration-workflow-review] Check review failed:', error);
            return null;
          });
      let prediction = await judge();
      // A check whose review could not run is retried once, on its own, which
      // absorbs a dropped connection. Retrying the whole review instead re-asks
      // every other check, and a nondeterministic second opinion can overwrite a
      // first-pass rejection and let the delivery through.
      if (!prediction || prediction.status === 'errored') prediction = await judge();
      if (prediction) review.predictionIds.push(prediction.id);
      if (prediction?.status === 'judged' && prediction.action === 'accept') return;
      if (prediction?.status === 'errored' || !prediction) {
        escalate('errored');
      } else if (prediction.status === 'judged' && prediction.action === 'unjudgeable') {
        // The criterion asks for something no reader can confirm. Re-delivering
        // cannot change that, so this must not read as a rejected delivery.
        escalate('unjudgeable');
      } else escalate('rejected');
      feedback.push(
        `${check.title}: ${prediction?.comment ?? prediction?.statusReason ?? 'Review could not reach a decision.'}`,
      );
      if (prediction?.annotations?.length) feedback.push(JSON.stringify(prediction.annotations));
    });
    review.feedback = feedback.join('\n');
  } catch (error) {
    console.error('[orchestration-workflow-review] Acceptance review failed:', error);
    review.status = 'errored';
    review.feedback =
      'Automatic Acceptance review could not complete. Configure an available model on the Acceptance verifier agent and retry the review before advancing.';
  }
  if (run) {
    // Preserve the task-drive claim and the run's existing policy/provenance.
    await runModel.setMetadata(run.id, { ...run.metadata, orchestrationWorkflowReview: review });
  }
  return review;
};
