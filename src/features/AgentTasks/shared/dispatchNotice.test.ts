import { describe, expect, it } from 'vitest';

import {
  GOAL_DISPATCH_HELD_KEY,
  ISSUE_DISPATCH_HELD_EARLIER_KEY,
  ISSUE_DISPATCH_HELD_KEY,
  resolveGoalDispatchNotice,
  resolveIssueDispatchNotices,
} from './dispatchNotice';

describe('resolveGoalDispatchNotice', () => {
  it('explains that new dispatches are held while admission is disabled', () => {
    expect(
      resolveGoalDispatchNotice({
        goalStatus: 'running',
        orchestrationAdmission: 'disabled',
      }),
    ).toEqual({ key: GOAL_DISPATCH_HELD_KEY });
  });

  it('stays silent when admission is enabled or the payload predates the field', () => {
    expect(
      resolveGoalDispatchNotice({
        goalStatus: 'running',
        orchestrationAdmission: 'enabled',
      }),
    ).toBeUndefined();
    expect(resolveGoalDispatchNotice({ goalStatus: 'running' })).toBeUndefined();
  });

  it.each(['achieved', 'canceled', 'failed'])(
    'stays silent on a %s goal, which has nothing left to dispatch',
    (goalStatus) => {
      expect(
        resolveGoalDispatchNotice({
          goalStatus,
          orchestrationAdmission: 'disabled',
        }),
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

  // The gate is computed for the viewer; intake is admitted under another
  // identity, so the dispatch can really be waiting on admission while the
  // payload reads `enabled`. It is explained, but not as the current gate.
  it('explains a dispatch still waiting on admission without claiming the gate is closed', () => {
    expect(
      resolveIssueDispatchNotices({
        dispatchPhase: 'waiting',
        dispatchWaitingReason: 'caid_dispatch_disabled',
        orchestrationAdmission: 'enabled',
      }),
    ).toEqual([{ key: ISSUE_DISPATCH_HELD_EARLIER_KEY }]);
    expect(
      resolveIssueDispatchNotices({
        dispatchPhase: 'waiting',
        dispatchWaitingReason: 'caid_dispatch_disabled',
      }),
    ).toEqual([{ key: ISSUE_DISPATCH_HELD_EARLIER_KEY }]);
  });

  it('says nothing about admission for a queued dispatch once the gate is open', () => {
    expect(
      resolveIssueDispatchNotices({
        dispatchPhase: 'requested',
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

  it("shows only the dispatch's own reason when it has one, even while admission is disabled", () => {
    expect(
      resolveIssueDispatchNotices({
        dispatchPhase: 'waiting',
        dispatchWaitingReason: 'no_eligible_agent',
        orchestrationAdmission: 'disabled',
      }),
    ).toEqual([{ key: 'taskDetail.dispatchNotice.reason.noAgent' }]);
  });

  it('shows the admission hold for a waiting dispatch that carries no reason', () => {
    expect(
      resolveIssueDispatchNotices({ dispatchPhase: 'waiting', orchestrationAdmission: 'disabled' }),
    ).toEqual([{ key: ISSUE_DISPATCH_HELD_KEY }]);
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
