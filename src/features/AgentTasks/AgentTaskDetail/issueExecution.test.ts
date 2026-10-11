import { describe, expect, it } from 'vitest';

import {
  canRerunIssue,
  findLatestOwnRun,
  type IssueExecutionInput,
  resolveIssueExecution,
  showsHeaderRunControl,
} from './issueExecution';

const hint = (name: string) => ({ key: `taskDetail.execution.hint.${name}` });

const withAgent = (input: IssueExecutionInput): IssueExecutionInput => ({
  agentId: 'agent-1',
  status: 'backlog',
  workflowCategory: 'todo',
  ...input,
});

describe('resolveIssueExecution', () => {
  describe('before any run', () => {
    it('shows nothing for an Issue with no agent that is not being worked on', () => {
      expect(resolveIssueExecution({ status: 'backlog', workflowCategory: 'todo' })).toBeNull();
    });

    it('says an In Progress Issue with no agent needs one, and offers no start', () => {
      expect(resolveIssueExecution({ status: 'backlog', workflowCategory: 'in_progress' })).toEqual(
        {
          actionBlocked: false,
          hints: [hint('needsAgent')],
          kind: 'needsAgent',
          showFailureReason: false,
        },
      );
    });

    it('stays quiet when a person, not an agent, owns the In Progress Issue', () => {
      expect(
        resolveIssueExecution({
          assigneeUserId: 'user-1',
          status: 'backlog',
          workflowCategory: 'in_progress',
        }),
      ).toBeNull();
    });

    it.each(['triage', 'backlog', 'todo', 'in_review'] as const)(
      'shows "not started" on a %s Issue with an agent and says the status move starts it',
      (workflowCategory) => {
        const view = resolveIssueExecution(withAgent({ workflowCategory }));
        expect(view).toMatchObject({ hints: [hint('moveToStart')], kind: 'notStarted' });
        expect(view?.action).toBeUndefined();
      },
    );

    it('does not promise a start on the status move for an automated Issue', () => {
      expect(resolveIssueExecution(withAgent({ automationMode: 'schedule' }))?.hints).toEqual([]);
    });

    it('offers Start when the Issue is In Progress with an agent and has never run', () => {
      expect(resolveIssueExecution(withAgent({ workflowCategory: 'in_progress' }))).toEqual({
        action: 'start',
        actionBlocked: false,
        hints: [hint('inProgressNoRun')],
        kind: 'notStarted',
        showFailureReason: false,
      });
    });

    it('keeps Start visible but held while prerequisites are unfinished', () => {
      const view = resolveIssueExecution(
        withAgent({ blocked: true, workflowCategory: 'in_progress' }),
      );
      expect(view).toMatchObject({ action: 'start', actionBlocked: true });
      expect(view?.hints).toContainEqual({ key: 'taskDetail.prerequisites.blocked' });
    });
  });

  describe('while a dispatch is active', () => {
    it.each([
      ['requested', 'queued'],
      ['claimed', 'queued'],
      ['provisioning', 'provisioning'],
      ['dispatched', 'running'],
      ['running', 'running'],
      ['waiting', 'waiting'],
      ['cancel_requested', 'stopping'],
    ] as const)('offers nothing to start while the dispatch is %s', (dispatchPhase, kind) => {
      const view = resolveIssueExecution(
        withAgent({ dispatchPhase, status: 'running', workflowCategory: 'in_progress' }),
      );
      expect(view?.kind).toBe(kind);
      expect(view?.action).toBeUndefined();
    });

    // Admission gates new automatic dispatches only. It never hides an action:
    // a manual start cannot race the Orchestrator, the server refuses it while
    // a dispatch is active.
    it.each(['enabled', 'disabled'] as const)(
      'still offers Retry on a failed Issue while workspace admission is %s',
      (orchestrationAdmission) => {
        expect(
          resolveIssueExecution(
            withAgent({
              dispatchPhase: 'failed',
              orchestrationAdmission,
              status: 'failed',
              workflowCategory: 'in_progress',
            }),
          )?.action,
        ).toBe('retry');
      },
    );

    it('explains a waiting dispatch with its own reason in the same place', () => {
      expect(
        resolveIssueExecution(
          withAgent({
            dispatchPhase: 'waiting',
            dispatchWaitingReason: 'no_eligible_agent',
            orchestrationAdmission: 'disabled',
            status: 'backlog',
          }),
        )?.hints,
      ).toEqual([{ key: 'taskDetail.dispatchNotice.reason.noAgent' }]);
    });

    it('explains a queued dispatch held by workspace admission', () => {
      expect(
        resolveIssueExecution(
          withAgent({ dispatchPhase: 'requested', orchestrationAdmission: 'disabled' }),
        )?.hints,
      ).toEqual([{ key: 'taskDetail.dispatchNotice.admissionDisabled' }]);
    });
  });

  describe('after a run ended badly', () => {
    it('offers Retry after a failure and asks for the recorded reason', () => {
      expect(
        resolveIssueExecution(
          withAgent({ dispatchPhase: 'failed', status: 'failed', workflowCategory: 'in_progress' }),
        ),
      ).toEqual({
        action: 'retry',
        actionBlocked: false,
        badge: 'failed',
        hints: [],
        kind: 'failed',
        showFailureReason: true,
      });
    });

    it('names a timeout as one', () => {
      expect(
        resolveIssueExecution(
          withAgent({
            dispatchPhase: 'failed',
            latestRunStatus: 'timeout',
            status: 'paused',
            workflowCategory: 'in_progress',
          }),
        ),
      ).toMatchObject({ action: 'retry', hints: [hint('timedOut')], kind: 'timedOut' });
    });

    it('offers Resume after the run was stopped', () => {
      expect(
        resolveIssueExecution(
          withAgent({
            dispatchPhase: 'canceled',
            status: 'paused',
            workflowCategory: 'in_progress',
          }),
        ),
      ).toMatchObject({ action: 'resume', badge: 'canceled', kind: 'stopped' });
    });

    it('reads a parked Issue with no dispatch row as stopped, not as a lost outcome', () => {
      expect(
        resolveIssueExecution(withAgent({ status: 'paused', workflowCategory: 'in_progress' })),
      ).toMatchObject({ action: 'resume', kind: 'stopped' });
    });

    it.each(['outcome_unknown', 'abandoned'] as const)(
      'offers Retry when the dispatch ended as %s',
      (dispatchPhase) => {
        expect(
          resolveIssueExecution(
            withAgent({ dispatchPhase, status: 'paused', workflowCategory: 'in_progress' }),
          ),
        ).toMatchObject({ action: 'retry', kind: 'outcomeUnknown' });
      },
    );

    it('offers Retry on a failed Issue that is not In Progress', () => {
      expect(
        resolveIssueExecution(
          withAgent({ dispatchPhase: 'failed', status: 'failed', workflowCategory: 'todo' }),
        )?.action,
      ).toBe('retry');
    });

    it('asks for an agent instead of offering Retry when none is assigned', () => {
      const view = resolveIssueExecution({
        dispatchPhase: 'failed',
        status: 'failed',
        workflowCategory: 'in_progress',
      });
      expect(view?.kind).toBe('failed');
      expect(view?.action).toBeUndefined();
      expect(view?.hints).toEqual([hint('assignAgentToRun')]);
    });

    it('offers no retry on a canceled Issue', () => {
      const view = resolveIssueExecution(
        withAgent({ dispatchPhase: 'failed', status: 'canceled', workflowCategory: 'canceled' }),
      );
      expect(view?.kind).toBe('failed');
      expect(view?.action).toBeUndefined();
      expect(view?.hints).toEqual([hint('reopenToRun')]);
    });

    // A canceled Issue projects as canceled execution even if nothing ever ran.
    it('says nothing about execution on a canceled Issue that was never dispatched', () => {
      expect(
        resolveIssueExecution(withAgent({ status: 'canceled', workflowCategory: 'canceled' })),
      ).toBeNull();
      expect(
        resolveIssueExecution({ status: 'canceled', workflowCategory: 'canceled' }),
      ).toBeNull();
    });

    it('does not promise Resume on a canceled Issue whose run was stopped', () => {
      const view = resolveIssueExecution(
        withAgent({ dispatchPhase: 'canceled', status: 'canceled', workflowCategory: 'canceled' }),
      );
      expect(view?.kind).toBe('stopped');
      expect(view?.action).toBeUndefined();
      expect(view?.hints).toEqual([hint('reopenToRun')]);
    });

    it('tells the reader to reopen a Done Issue whose last run failed', () => {
      const view = resolveIssueExecution(
        withAgent({ dispatchPhase: 'failed', status: 'completed', workflowCategory: 'done' }),
      );
      expect(view?.action).toBeUndefined();
      expect(view?.hints).toEqual([hint('reopenToRun')]);
    });
  });

  describe('after a run succeeded', () => {
    it.each(['in_review', 'in_progress'] as const)(
      'reads as awaiting acceptance while the Issue is %s, with no action here',
      (workflowCategory) => {
        expect(
          resolveIssueExecution(
            withAgent({ dispatchPhase: 'succeeded', status: 'paused', workflowCategory }),
          ),
        ).toEqual({
          actionBlocked: false,
          badge: 'succeeded',
          hints: [hint('awaitingAcceptance')],
          kind: 'awaitingAcceptance',
          showFailureReason: false,
        });
      },
    );

    it('reads as finished once the Issue is Done', () => {
      expect(
        resolveIssueExecution(
          withAgent({ dispatchPhase: 'succeeded', status: 'completed', workflowCategory: 'done' }),
        ),
      ).toMatchObject({ hints: [], kind: 'succeeded' });
    });
  });

  describe('scheduled', () => {
    it('says the schedule owns the next run', () => {
      expect(
        resolveIssueExecution(withAgent({ automationMode: 'schedule', status: 'scheduled' })),
      ).toEqual({
        actionBlocked: false,
        badge: undefined,
        hints: [hint('scheduled')],
        kind: 'scheduled',
        showFailureReason: false,
      });
    });

    it('reads a failed last occurrence as failed, with no retry: the schedule runs it again', () => {
      expect(
        resolveIssueExecution(
          withAgent({ automationMode: 'schedule', dispatchPhase: 'failed', status: 'scheduled' }),
        ),
      ).toEqual({
        actionBlocked: false,
        badge: 'failed',
        hints: [hint('scheduled')],
        kind: 'failed',
        showFailureReason: true,
      });
    });
  });
});

describe('canRerunIssue', () => {
  it('allows re-running a completed Issue and one awaiting acceptance', () => {
    expect(
      canRerunIssue(
        withAgent({ dispatchPhase: 'succeeded', status: 'completed', workflowCategory: 'done' }),
      ),
    ).toBe(true);
    expect(
      canRerunIssue(
        withAgent({ dispatchPhase: 'succeeded', status: 'paused', workflowCategory: 'in_review' }),
      ),
    ).toBe(true);
    // Pre-dispatch rows carry only the legacy status.
    expect(canRerunIssue(withAgent({ status: 'completed', workflowCategory: 'done' }))).toBe(true);
  });

  it('refuses when nothing succeeded, no agent is assigned, or the Issue is canceled', () => {
    expect(canRerunIssue(withAgent({ dispatchPhase: 'failed', status: 'failed' }))).toBe(false);
    expect(
      canRerunIssue({ dispatchPhase: 'succeeded', status: 'completed', workflowCategory: 'done' }),
    ).toBe(false);
    expect(
      canRerunIssue(
        withAgent({ dispatchPhase: 'succeeded', status: 'canceled', workflowCategory: 'canceled' }),
      ),
    ).toBe(false);
    expect(canRerunIssue(withAgent({ dispatchPhase: 'running', status: 'running' }))).toBe(false);
  });
});

describe('showsHeaderRunControl', () => {
  it('never offers a start: idle, failed, stopped and completed Issues get no header control', () => {
    for (const status of ['backlog', 'failed', 'paused', 'completed', 'canceled', undefined]) {
      expect(showsHeaderRunControl({ canPause: false, status })).toBe(false);
    }
  });

  it('keeps Stop while a run is in progress', () => {
    expect(showsHeaderRunControl({ canPause: true, status: 'running' })).toBe(true);
  });

  it('keeps the schedule control while the schedule owns the Issue', () => {
    expect(showsHeaderRunControl({ canPause: false, status: 'scheduled' })).toBe(true);
  });
});

describe('findLatestOwnRun', () => {
  it("picks the Issue's newest run and ignores sub-issue runs and other activity", () => {
    expect(
      findLatestOwnRun(
        [
          { id: 'r1', seq: 1, status: 'failed', type: 'topic' },
          { id: 'c1', type: 'comment' },
          { id: 'r2', seq: 2, sourceTaskId: 'task-1', status: 'failed', type: 'topic' },
          { id: 'child', seq: 9, sourceTaskId: 'task-child', status: 'completed', type: 'topic' },
        ],
        'task-1',
      )?.id,
    ).toBe('r2');
  });

  it('returns nothing when the Issue has no run', () => {
    expect(findLatestOwnRun(undefined, 'task-1')).toBeUndefined();
    expect(findLatestOwnRun([{ type: 'created' }], 'task-1')).toBeUndefined();
  });
});
