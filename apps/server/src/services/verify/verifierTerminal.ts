import debug from 'debug';

import { VerifyCheckResultModel } from '@/database/models/verifyCheckResult';
import { VerifyRunModel } from '@/database/models/verifyRun';
import type { OrviloDatabase } from '@/database/type';

import { finalizeVerifyRun } from './settle';
import { VerifyStatusService } from './statusService';

const log = debug('orvilo-server:verify-verifier-terminal');

const TERMINAL_RESULT_STATUSES = new Set(['passed', 'failed', 'errored', 'skipped']);

export interface SettleVerifierCheckFromTerminalParams {
  checkItemId: string;
  errorMessage?: string;
  parentOperationId: string;
  reason?: string;
  verifierOperationId: string;
}

/**
 * Fallback for agent verifiers that terminate before calling
 * `submitVerifyResult`. The normal tool-write path wins; this only closes rows
 * still stuck in pending/running once the verifier child op is terminal.
 */
export const settleVerifierCheckFromTerminal = async (
  db: OrviloDatabase,
  userId: string,
  params: SettleVerifierCheckFromTerminalParams,
  workspaceId?: string,
): Promise<void> => {
  const { checkItemId, errorMessage, parentOperationId, reason, verifierOperationId } = params;

  try {
    const run = await new VerifyRunModel(db, userId, workspaceId).findByOperation(
      parentOperationId,
    );
    if (!run) return;

    const resultModel = new VerifyCheckResultModel(db, userId, workspaceId);
    const result = (await resultModel.listByRun(run.id)).find(
      (item) => item.checkItemId === checkItemId,
    );

    if (!result || result.userDecision || result.verdict) return;
    if (
      TERMINAL_RESULT_STATUSES.has(result.status) &&
      result.verifierOperationId === verifierOperationId
    )
      return;

    const limitation =
      reason === 'done'
        ? 'Verifier completed without submitting a verdict.'
        : `Verifier failed before submitting a verdict${errorMessage ? `: ${errorMessage}` : '.'}`;

    const recorded = await resultModel.recordReviewerVerdict(
      run.id,
      checkItemId,
      verifierOperationId,
      {
        completedAt: new Date(),
        // The verifier terminated without producing a verdict — an infra/verifier
        // malfunction, not a delivery judgment. `errored` (no verdict) keeps it out
        // of the delivery gate and the auto-repair set.
        status: 'errored',
        verdict: null,
        suggestion: 'Review the verifier configuration and rerun verification.',
        toulmin: { limitation },
      },
    );
    if (!recorded) return;

    await new VerifyStatusService(db, userId, workspaceId).recompute(parentOperationId);
    await finalizeVerifyRun(db, userId, parentOperationId, {}, workspaceId);
  } catch (error) {
    log(
      'settleVerifierCheckFromTerminal failed for parent=%s verifier=%s check=%s: %O',
      parentOperationId,
      verifierOperationId,
      checkItemId,
      error,
    );
  }
};
