import { VerifyToolIdentifier } from '@orvilo/builtin-tool-verify';
import { buildVerifierPrompt } from '@orvilo/prompts';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { DocumentModel } from '@/database/models/document';
import { VerifyCheckResultModel } from '@/database/models/verifyCheckResult';
import { VerifyRunModel } from '@/database/models/verifyRun';
import type { OrviloDatabase } from '@/database/type';
import type { AgentHook, AgentHookEvent } from '@/server/services/agentExecution/hooks/types';
import { AiAgentService } from '@/server/services/aiAgent';
import { readDeviceQueue } from '@/server/services/aiAgent/deviceQueue';

import type { VerifierAgentRunner } from './executor';
import { resolveIssueReviewer } from './reviewerAgent';
import { settleVerifierCheckFromTerminal } from './verifierTerminal';

/** Run each check in a fresh session using the Issue reviewer's saved runtime. */
export const createVerifierAgentRunner = (params: {
  db: OrviloDatabase;
  deliverable: string;
  /** Parent task scope so the verifier can inspect the task and its pinned documents. */
  taskId?: string | null;
  topicId?: string | null;
  userId: string;
  workspaceId?: string;
}): VerifierAgentRunner | undefined => {
  const { db, deliverable, taskId, userId, workspaceId } = params;
  if (!taskId) return undefined;

  return async ({ checkItem, evidence, goal, operationId }) => {
    // The detailed instruction is the criterion's rule body, stored in a document.
    const instruction =
      checkItem.definition || checkItem.resourceSnapshot
        ? JSON.stringify({
            definition: checkItem.definition,
            resources: checkItem.resourceSnapshot,
          })
        : checkItem.documentId
          ? ((await new DocumentModel(db, userId, workspaceId).findById(checkItem.documentId))
              ?.content ?? undefined)
          : undefined;

    const reviewerAgentId = await resolveIssueReviewer(db, userId, taskId, workspaceId);

    // Attach the builder-captured file artifacts (screenshots / videos / large
    // text) so a multimodal verifier can SEE them — the prompt only references
    // them by presence + caption, which is blind for visual checks.
    const evidenceFileIds = (evidence ?? [])
      .map((e) => e.fileId)
      .filter((id): id is string => Boolean(id));

    const terminalHookBody = {
      checkItemId: checkItem.id,
      parentOperationId: operationId,
      userId,
      ...(workspaceId ? { workspaceId } : {}),
    };
    const hooks: AgentHook[] = [
      {
        handler: async (event: AgentHookEvent) => {
          await settleVerifierCheckFromTerminal(
            db,
            userId,
            {
              checkItemId: checkItem.id,
              errorMessage: event.errorMessage,
              parentOperationId: operationId,
              reason: event.reason,
              verifierOperationId: event.operationId,
            },
            workspaceId,
          );
        },
        id: 'reviewer-terminal',
        type: 'onComplete' as const,
        webhook: {
          body: terminalHookBody,
          delivery: 'hatchet' as const,
          url: '/api/workflows/verify/on-verifier-complete',
        },
      },
    ];
    const verifierPrompt = buildVerifierPrompt({
      checkItem,
      deliverable,
      evidence,
      goal,
      instruction,
      taskId,
    });

    // The aiAgent → agentRuntime completion → verify lifecycle → this runner →
    // aiAgent import cycle is safe statically: every use here is call-time (inside
    // this runner), so the module is fully initialized before it runs.
    const result = await new AiAgentService(db, userId, { workspaceId }).execAgent({
      // Inject the verify writeback tool for pinned agents (no-op list otherwise).
      additionalPluginIds: [VerifyToolIdentifier],
      agentId: reviewerAgentId,
      // A fresh topic keeps the verifier isolated without inheriting the
      // parent topic's thread message processors. Those processors can filter
      // the verifier user turn during queued resume and leave only system
      // messages for the first LLM call.
      appContext: { taskId },
      autoStart: true,
      beforeOperationStart: async ({ operationId: reviewerOperationId }) => {
        const run = await new VerifyRunModel(db, userId, workspaceId).findByOperation(operationId);
        if (!run) throw new Error('Verification run is unavailable.');
        if (run.userDecision) throw new Error('The delivery already has a decision.');
        const resultModel = new VerifyCheckResultModel(db, userId, workspaceId);
        const row = (await resultModel.listByRun(run.id)).find(
          (row) => row.checkItemId === checkItem.id,
        );
        if (!row || row.userDecision || row.verdict)
          throw new Error('The check already has a decision.');
        // The operation row is inserted after this callback, so bind its minted
        // identity in metadata until the executor can set the foreign key.
        await resultModel.updateByCheckItem(run.id, checkItem.id, {
          metadata: { ...row.metadata, reviewerOperationId, initiatingMessage: verifierPrompt },
          verifierOperationId: null,
        });
      },
      ...(evidenceFileIds.length ? { fileIds: evidenceFileIds } : {}),
      hooks,
      parentOperationId: operationId,
      prompt: verifierPrompt,
      userInterventionConfig: { approvalMode: 'headless' },
    });

    const operation = await new AgentOperationModel(db, userId, workspaceId).findById(
      result.operationId,
    );
    const queue = readDeviceQueue(operation?.metadata);
    return {
      verifierOperationId: result.operationId,
      initiatingMessage: verifierPrompt,
      ...(queue ? { waitingReason: 'Waiting for the reviewer Agent device to come online.' } : {}),
    };
  };
};
