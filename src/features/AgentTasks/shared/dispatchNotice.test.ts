import { describe, expect, it } from 'vitest';

import {
  GOAL_DISPATCH_HELD_KEY,
  ISSUE_DISPATCH_HELD_KEY,
  resolveGoalDispatchNotice,
  resolveIssueDispatchNotices,
  shouldOfferManualRun,
} from './dispatchNotice';

describe('resolveGoalDispatchNotice', () => {
  it('explains that new dispatches are held while admission is disabled', () => {
    expect(
      resolveGoalDispatchNotice({ goalStatus: 'running', orchestrationAdmission: 'disabled' }),
    ).toEqual({ key: GOAL_DISPATCH_HELD_KEY });
  });

  it('stays silent when admission is enabled or the payload predates the field', () => {
    expect(
      resolveGoalDispatchNotice({ goalStatus: 'running', orchestrationAdmission: 'enabled' }),
    ).toBeUndefined();
    expect(resolveGoalDispatchNotice({ goalStatus: 'running' })).toBeUndefined();
  });

  it.each(['achieved', 'canceled', 'failed'])(
    'stays silent on a %s goal, which has nothing left to dispatch',
    (goalStatus) => {
      expect(
        resolveGoalDispatchNotice({ goalStatus, orchestrationAdmission: 'disabled' }),
      ).toBeUndefined();
    },
  );
});

describe('resolveIssueDispatchNotices', () => {
  it('shows the admission hold once for a dispatch held by it', () => {
    expect(
      resolveIssueDispatchNotices({
        dispatchPhase: 'waiting',
        dispatchWaitingReason: 'caid_dispatch_disabled',
        orchestrationAdmission: 'disabled',
      }),
    ).toEqual([{ key: ISSUE_DISPATCH_HELD_KEY }]);
  });

  it('shows the admission hold for a requested dispatch that was never claimed', () => {
    expect(
      resolveIssueDispatchNotices({
        dispatchPhase: 'requested',
        orchestrationAdmission: 'disabled',
      }),
    ).toEqual([{ key: ISSUE_DISPATCH_HELD_KEY }]);
  });

  it('does not present a leftover admission reason as current once admission is enabled', () => {
    expect(
      resolveIssueDispatchNotices({
        dispatchPhase: 'waiting',
        dispatchWaitingReason: 'caid_dispatch_disabled',
        orchestrationAdmission: 'enabled',
      }),
    ).toEqual([]);
  });

  it.each(['running', 'dispatched', 'provisioning', 'succeeded', 'failed'] as const)(
    'does not claim a %s dispatch is held while admission is disabled',
    (dispatchPhase) => {
      expect(
        resolveIssueDispatchNotices({
          dispatchPhase,
          dispatchWaitingReason: 'caid_dispatch_disabled',
          orchestrationAdmission: 'disabled',
        }),
      ).toEqual([]);
    },
  );

  it('says nothing on an Issue with no dispatch, whatever the workspace admission is', () => {
    expect(resolveIssueDispatchNotices({ orchestrationAdmission: 'disabled' })).toEqual([]);
    expect(resolveIssueDispatchNotices({})).toEqual([]);
  });

  it('localizes the waiting reasons the dispatch layer persists as stable codes', () => {
    expect(
      resolveIssueDispatchNotices({
        dispatchPhase: 'waiting',
        dispatchWaitingReason: 'no_eligible_agent',
        orchestrationAdmission: 'enabled',
      }),
    ).toEqual([{ key: 'taskDetail.dispatchNotice.reason.noAgent' }]);
    expect(
      resolveIssueDispatchNotices({
        dispatchPhase: 'waiting',
        dispatchWaitingReason: 'goal_paused',
      }),
    ).toEqual([{ key: 'taskDetail.dispatchNotice.reason.goalPaused' }]);
  });

  it('keeps an unrecognized waiting reason verbatim', () => {
    expect(
      resolveIssueDispatchNotices({
        dispatchPhase: 'waiting',
        dispatchWaitingReason: ' goal dispatch claim lease expired without a run ',
        orchestrationAdmission: 'enabled',
      }),
    ).toEqual([
      {
        key: 'taskDetail.dispatchNotice.reason.other',
        params: { reason: 'goal dispatch claim lease expired without a run' },
      },
    ]);
  });

  it('shows both the admission hold and a different persisted reason', () => {
    expect(
      resolveIssueDispatchNotices({
        dispatchPhase: 'waiting',
        dispatchWaitingReason: 'no_eligible_agent',
        orchestrationAdmission: 'disabled',
      }),
    ).toEqual([
      { key: ISSUE_DISPATCH_HELD_KEY },
      { key: 'taskDetail.dispatchNotice.reason.noAgent' },
    ]);
  });

  it('ignores a reason left on a dispatch that is no longer waiting', () => {
    expect(
      resolveIssueDispatchNotices({
        dispatchPhase: 'outcome_unknown',
        dispatchWaitingReason: 'Dispatch acknowledgement lost; run may still be executing',
      }),
    ).toEqual([]);
  });
});

describe('shouldOfferManualRun', () => {
  it('keeps the manual start while orchestrated dispatch is not admitted', () => {
    expect(shouldOfferManualRun({ canPause: false, orchestrationAdmission: 'disabled' })).toBe(
      true,
    );
    // Older payloads carry no admission field.
    expect(shouldOfferManualRun({ canPause: false })).toBe(true);
  });

  it('leaves starting to the Orchestrator once dispatch is admitted', () => {
    expect(shouldOfferManualRun({ canPause: false, orchestrationAdmission: 'enabled' })).toBe(
      false,
    );
  });

  it('always keeps the control that stops a run in progress', () => {
    expect(shouldOfferManualRun({ canPause: true, orchestrationAdmission: 'enabled' })).toBe(true);
  });
});
