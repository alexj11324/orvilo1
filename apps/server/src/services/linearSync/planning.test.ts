import { describe, expect, it } from 'vitest';

import type { TaskPlanningSnapshot } from './planning';
import { proposeLinearPlanningReview } from './planning';

const snapshot = (events: TaskPlanningSnapshot['events']): TaskPlanningSnapshot => ({
  consistency: { bindingVersion: null, orchestrationPolicyRevision: null },
  dependencies: [],
  events,
  impact: { changedTaskIds: [], scopeWide: false },
  scope: { id: 'scope-1', scopeId: 'project-1', scopeType: 'project', revision: 2 },
  tasks: [],
  truncation: {
    escalationRequired: false,
    omittedDependencyCount: 0,
    omittedEventCount: 0,
    omittedTaskCount: 0,
    truncated: false,
  },
});

describe('proposeLinearPlanningReview', () => {
  it('returns a bounded coordinator review for a Linear issue change', async () => {
    const proposal = await proposeLinearPlanningReview(
      snapshot([
        {
          createdAt: new Date(),
          id: 'event-1',
          idempotencyKey: 'linear:delivery-1',
          payload: { issueId: 'issue-1' },
          projectId: 'project-1',
          revision: 2,
          source: 'linear',
          taskId: 'task-1',
          type: 'linear.issue.changed',
          workspaceId: 'workspace-1',
        },
      ]),
    );

    expect(proposal).toMatchObject({
      actions: [{ action: 'escalate' }],
      requiresApproval: true,
    });
    expect(proposal.actions[0]).toMatchObject({ reason: expect.stringContaining('issue-1') });
  });

  it('does not ask for approval when the scope has no semantic events', async () => {
    await expect(proposeLinearPlanningReview(snapshot([]))).resolves.toEqual({
      actions: [{ action: 'noop', reason: 'No planning-relevant domain changes were found.' }],
      explanation: 'The scope was evaluated and no semantic task change requires replanning.',
      requiresApproval: false,
    });
  });

  it('escalates when the bounded context was truncated', async () => {
    await expect(
      proposeLinearPlanningReview({
        ...snapshot([]),
        truncation: {
          escalationRequired: true,
          omittedDependencyCount: 2,
          omittedEventCount: 1,
          omittedTaskCount: 3,
          truncated: true,
        },
      }),
    ).resolves.toMatchObject({
      actions: [{ action: 'escalate' }],
      requiresApproval: true,
    });
  });
});
