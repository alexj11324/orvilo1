import debug from 'debug';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { DocumentModel } from '@/database/models/document';
import { MessageModel } from '@/database/models/message';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { VerifyEvidenceModel } from '@/database/models/verifyEvidence';
import { VerifyRunModel } from '@/database/models/verifyRun';
import type { OrviloDatabase } from '@/database/type';

import { appendAegisDeliverableEvidence } from './aegisEvidence';
import { createVerifierAgentRunner } from './agentVerifier';
import { recordHeterogeneousDeliverableEvidence } from './evidenceSubmission';
import { VerifyExecutorService } from './executor';
import { resolveIssueReviewer } from './reviewerAgent';
import { finalizeVerifyRun } from './settle';
import { VERIFY_ABANDONED_MS } from './staleness';
import { VerifyStatusService } from './statusService';

const log = debug('orvilo-server:verify-lifecycle');
const MAX_TASK_DOCUMENT_CHARS = 80_000;

export const resolveVerificationDeliverable = async (
  db: OrviloDatabase,
  userId: string,
  deliverable: string,
  taskId?: string | null,
  workspaceId?: string,
): Promise<string> => {
  if (!taskId) return deliverable;

  const pinnedDocuments = await new TaskModel(db, userId, workspaceId).getPinnedDocuments(taskId);
  if (pinnedDocuments.length === 0) return deliverable;

  const documentModel = new DocumentModel(db, userId, workspaceId);
  const documents = await Promise.all(
    pinnedDocuments.map(({ documentId }) => documentModel.findById(documentId)),
  );
  const readableDocuments = documents.filter((document): document is NonNullable<typeof document> =>
    Boolean(document?.content),
  );
  if (readableDocuments.length === 0) return deliverable;

  const taskDocumentContent = readableDocuments
    .map(
      (document) =>
        `## Task document: ${document.title ?? document.id}\n\n${document.content ?? ''}`,
    )
    .join('\n\n');

  return [
    deliverable,
    '# Associated task deliverables',
    taskDocumentContent.slice(0, MAX_TASK_DOCUMENT_CHARS),
  ]
    .filter(Boolean)
    .join('\n\n');
};

export interface RunVerifyOnCompletionParams {
  /** The run's final output / artifacts, judged against the plan. */
  deliverable: string;
  /** The user's task the run had to satisfy. */
  goal: string;
  operationId: string;
}

/**
 * Completion-side entry point for the delivery checker. Called fire-and-forget
 * from the agent runtime when an operation terminates successfully. Runs the
 * confirmed check plan (LLM judge inline), then attempts auto-repair.
 *
 * Guarded so it only acts on runs that opted in (a confirmed plan exists) and
 * never throws — verification must not affect the run's own lifecycle.
 *
 * Note: agent-type verifiers and auto-repair spawning require full runtime
 * context (sub-operation forking); they are injected seams. Without a spawner
 * those items degrade gracefully (skipped / no repair).
 */
const executeVerifyLifecycle = async (
  db: OrviloDatabase,
  userId: string,
  params: RunVerifyOnCompletionParams,
  workspaceId?: string,
  evidenceSubmitted = false,
  throwOnError = false,
): Promise<void> => {
  try {
    const run = await new VerifyRunModel(db, userId, workspaceId).findByOperation(
      params.operationId,
    );

    // Opt-in gate: only runs with a confirmed plan.
    if (!run?.plan?.length || !run.planConfirmedAt || run.userDecision) return;

    const op = await new AgentOperationModel(db, userId, workspaceId).findById(params.operationId);
    if (!op) {
      log('op %s missing, cannot run verify', params.operationId);
      return;
    }

    // Aegis method-pack runs (metadata.aegis.enabled, opt-in only) carry their
    // agent-submitted closeout/reports in the operation metadata — appended to
    // the deliverable as advisory self-report so every downstream consumer
    // (recorded evidence rows, the LLM judge, the verify report) sees them.
    const aegisDeliverable = appendAegisDeliverableEvidence(params.deliverable, op.metadata);

    if (op.taskId) {
      const taskTopic = await new TaskTopicModel(db, userId, workspaceId).findByOperationId(
        params.operationId,
      );
      const integration = taskTopic?.integration;
      if (
        integration &&
        (integration.role === 'integrate' ||
          (integration.state !== 'integrated' && integration.state !== 'skipped'))
      ) {
        log(
          'op %s verification deferred until workspace integration settles (role=%s, state=%s)',
          params.operationId,
          integration.role,
          integration.state,
        );
        return;
      }
    }

    // The builder now captures Acceptance evidence inside the main run. When it
    // covered the whole plan, the post-run evidence turn has nothing left to
    // collect — it mounts the evidence tool exclusively, so all it could add is
    // a restatement of text already in the transcript, at the cost of a second
    // agent run.
    //
    // Coverage is per required criterion, not "any row exists": a builder that
    // evidenced one of three criteria has not finished collecting, and skipping
    // on its first submission would strand the other two at the structural gate
    // with no chance to supply what they ask for.
    if (op.taskId && !evidenceSubmitted) {
      const inRunEvidence = await new VerifyEvidenceModel(db, userId, workspaceId).listByRun(
        run.id,
      );
      const byCheckItem = new Map<string, Set<string>>();
      for (const row of inRunEvidence) {
        const types = byCheckItem.get(row.checkItemId) ?? new Set<string>();
        types.add(row.type);
        byCheckItem.set(row.checkItemId, types);
      }

      const uncovered = run.plan.filter((item) => {
        if (item.required === false) return false;
        const captured = byCheckItem.get(item.id);
        if (!captured?.size) return true;

        // A criterion that names the artifacts it needs is only covered once
        // each declared type is present.
        const declared = (item.verifierConfig as { requiredEvidence?: { type: string }[] })
          ?.requiredEvidence;
        return Array.isArray(declared)
          ? declared.some((required) => !captured.has(required.type))
          : false;
      });

      if (inRunEvidence.length > 0 && uncovered.length === 0) {
        log(
          'op %s covered every required criterion in-run (%d rows), skipping the evidence turn',
          params.operationId,
          inRunEvidence.length,
        );
        evidenceSubmitted = true;
      } else if (inRunEvidence.length > 0) {
        log(
          'op %s has partial in-run coverage (%d criteria still uncovered), running the evidence turn',
          params.operationId,
          uncovered.length,
        );
      }
    }

    if (op.taskId && !evidenceSubmitted) {
      const evidenceClaimed = await new VerifyRunModel(
        db,
        userId,
        workspaceId,
      ).claimEvidenceCollection(run.id);
      if (evidenceClaimed) {
        try {
          await recordHeterogeneousDeliverableEvidence({
            db,
            deliverable: aegisDeliverable,
            operation: op,
            plan: run.plan,
            userId,
            workspaceId,
          });
          evidenceSubmitted = true;
        } catch (error) {
          await new VerifyRunModel(db, userId, workspaceId).updateStatus(run.id, 'planned');
          throw error;
        }
      }
      if (!evidenceSubmitted) return;
    }

    let reviewerAgentId: string;
    try {
      reviewerAgentId = await resolveIssueReviewer(db, userId, op.taskId, workspaceId);
    } catch (error) {
      if (op.taskId) {
        const task = await new TaskModel(db, userId, workspaceId).findById(op.taskId);
        if (task?.reviewerAgentId) {
          const { markReviewerUnavailable } = await import('../task/reviewerAssignment');
          await markReviewerUnavailable(
            db,
            userId,
            {
              taskId: op.taskId,
              operationId: op.id,
              reason: error instanceof Error ? error.message : String(error),
            },
            workspaceId,
          );
        }
      }
      throw error;
    }

    // Claim only after a task-bound builder has submitted evidence. Standalone
    // runs have no builder phase and enter verification directly.
    const claimed = await new VerifyStatusService(db, userId, workspaceId).claimVerifying(
      params.operationId,
      new Date(Date.now() - VERIFY_ABANDONED_MS),
    );
    if (!claimed) {
      // A queued evidence callback that finds an unfinished judge must remain
      // retryable. A later delivery either reclaims the stale run or observes
      // its terminal status and exits normally.
      if (evidenceSubmitted && run.status === 'verifying') {
        throw new Error(`Verification for operation "${params.operationId}" is still in progress`);
      }
      return;
    }

    const resolvedDeliverable = await resolveVerificationDeliverable(
      db,
      userId,
      aegisDeliverable,
      op.taskId,
      workspaceId,
    );
    const verificationGoal = params.goal || run.goal || '';

    const executor = new VerifyExecutorService(db, userId, workspaceId);
    await executor.execute({
      deliverable: resolvedDeliverable,
      goal: verificationGoal,
      reviewerAgentId,
      operationId: params.operationId,
      // `agent`-type checks run as the task-pinned verify agent (or the builtin
      // one), which writes its verdict back via the submitVerifyResult tool.
      runVerifierAgent: createVerifierAgentRunner({
        db,
        deliverable: resolvedDeliverable,
        taskId: op.taskId,
        topicId: op.topicId,
        userId,
        workspaceId,
      }),
      // The LLM judge binds to the same verifier agent (builtin fallback inside
      // the executor) — it is an explicitly-authorized ACP judgment now.
    });

    // Settle the run: repair-aware tail, then (on terminal settle) report + drive
    // the bound task. For inline (LLM/program) checks everything is resolved now;
    // runs with async agent checks no-op here and re-enter the same finalizer from
    // the verifier's writeback path (verifyResult runtime) — so the task is driven
    // from exactly one place regardless of which path finished last.
    await finalizeVerifyRun(
      db,
      userId,
      params.operationId,
      {
        report: {
          deliverable: resolvedDeliverable,
          goal: verificationGoal,
          reviewerAgentId,
        },
      },
      workspaceId,
    );
  } catch (error) {
    log('runVerifyOnCompletion failed for op %s (non-fatal): %O', params.operationId, error);
    if (throwOnError) throw error;
  }
};

export const runVerifyOnCompletion = async (
  db: OrviloDatabase,
  userId: string,
  params: RunVerifyOnCompletionParams,
  workspaceId?: string,
): Promise<void> => executeVerifyLifecycle(db, userId, params, workspaceId, false);

/** The only entry point allowed to advance a task run out of evidence collection. */
export const runVerifyAfterEvidenceSubmission = async (
  db: OrviloDatabase,
  userId: string,
  params: RunVerifyOnCompletionParams,
  workspaceId?: string,
): Promise<void> => executeVerifyLifecycle(db, userId, params, workspaceId, true, true);

/** Continue the delivered operation after a reviewer is assigned to its Issue. */
export const resumeIssueVerification = async (
  db: OrviloDatabase,
  userId: string,
  params: { taskId: string; operationId?: string },
  workspaceId?: string,
): Promise<void> => {
  await resolveIssueReviewer(db, userId, params.taskId, workspaceId);
  const task = await new TaskModel(db, userId, workspaceId).findById(params.taskId);
  const topic = task?.currentTopicId
    ? await new TaskTopicModel(db, userId, workspaceId).findByTopicId(task.currentTopicId)
    : null;
  const operationId = params.operationId ?? topic?.operationId;
  if (!operationId) return;
  const run = await new VerifyRunModel(db, userId, workspaceId).findByOperation(operationId);
  if (!run?.planConfirmedAt) return;
  const operation = await new AgentOperationModel(db, userId, workspaceId).findById(operationId);
  if (!operation || operation.taskId !== params.taskId) return;
  const delivered = operation.topicId
    ? await new MessageModel(db, userId).findLatestAssistantByOperationId({
        operationId,
        topicId: operation.topicId,
      })
    : null;
  await runVerifyAfterEvidenceSubmission(
    db,
    userId,
    {
      deliverable: delivered?.content ?? '',
      goal: run.goal ?? task?.instruction ?? task?.name ?? '',
      operationId,
    },
    workspaceId,
  );
};
