import { describe, expect, it } from 'vitest';

import { acceptanceRouter } from '../acceptance';
import { acceptanceCommentRouter } from '../acceptanceComment';
import { verifyRouter } from '../verify';

/**
 * Regression guard for the standalone Acceptance / Verify platform retirement.
 *
 * The retired procedures were the ones that could produce an acceptance (or a
 * round/report) with no task or run behind it: the aggregate's lazy creation and
 * run attachment, the flow authoring tree, the workspace collection reads and
 * the multi-selection writes, the public-share flip, and the skill pull endpoint
 * the CLI install used.
 */
const procedureNames = (router: unknown): string[] =>
  Object.keys((router as { _def: { procedures: Record<string, unknown> } })._def.procedures).sort();

describe('retired acceptance procedures', () => {
  it('does not expose the parentless-creation entry points', () => {
    const procedures = procedureNames(acceptanceRouter);

    for (const retired of ['ensure', 'attachRun']) {
      expect(procedures, `acceptance.${retired} must not resolve`).not.toContain(retired);
    }
  });

  it('does not expose the flow authoring procedures', () => {
    const procedures = procedureNames(acceptanceRouter);

    for (const retired of [
      'publishFlow',
      'deleteFlow',
      'startFlow',
      'recordFlowStep',
      'completeFlow',
    ]) {
      expect(procedures, `acceptance.${retired} must not resolve`).not.toContain(retired);
    }

    // Reviewing an already-recorded step stays: the flow tab of the task
    // panel is a retained surface and has to read historical flows.
    expect(procedures).toContain('reviewFlowStep');
  });

  it('does not expose the standalone collection reads and batch writes', () => {
    const procedures = procedureNames(acceptanceRouter);

    for (const retired of [
      'list',
      'listPage',
      'listStatusesBySubjects',
      'merge',
      'rename',
      'regroupChecks',
      'markRepairing',
      'setProject',
      'setProjectBatch',
      'setVisibility',
      'updateStatusBatch',
      'removeBatch',
    ]) {
      expect(procedures, `acceptance.${retired} must not resolve`).not.toContain(retired);
    }
  });

  it('keeps every procedure the task panel actually calls', () => {
    const procedures = procedureNames(acceptanceRouter);

    expect(procedures).toEqual([
      'accept',
      'addGroupFeedback',
      'adjudicateProposal',
      'getBundle',
      'getBySubject',
      'predictReviews',
      'purgePreview',
      'reject',
      'remove',
      'reviewChecks',
      'reviewFlowStep',
      'saveChecklist',
      'saveGoal',
      'updateStatus',
    ]);
  });

  // The discussion thread lives on the acceptance the panel is showing, so it
  // never produced a parentless object; all five procedures stay.
  it('keeps the acceptance discussion procedures', () => {
    expect(procedureNames(acceptanceCommentRouter)).toEqual([
      'create',
      'delete',
      'list',
      'react',
      'setResolved',
    ]);
  });

  // The CLI install pulled the portable skill from this endpoint; both the
  // skill package and the CLI command were retired with it.
  it('no longer serves a pullable skill bundle', () => {
    expect(procedureNames(verifyRouter)).not.toContain('getSkillBundle');
  });
});
