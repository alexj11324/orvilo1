import type { OrchestrationWorkflowStatus } from '@orvilo/const/orchestrationWorkflow';
import { describe, expect, it } from 'vitest';

import type { OrchestrationWorkflowListItem } from '@/store/goal/initialState';

import { buildHomeGoalEntries, homeGoalHref, resolveHomeGoalView } from './homeGoals';

interface GoalOverrides {
  agentId?: string | null;
  id: string;
  orchestrationWorkflow?: Partial<OrchestrationWorkflowListItem['orchestrationWorkflow']>;
  pendingDecisions?: number;
  taskDone?: number;
  taskTotal?: number;
  title?: string;
}

const orchestrationWorkflow = ({
  agentId = 'agt_1',
  id,
  orchestrationWorkflow: overrides,
  ...rest
}: GoalOverrides): OrchestrationWorkflowListItem =>
  ({
    findingCount: 0,
    orchestrationWorkflow: {
      agentId,
      id: `g-${id}`,
      status: 'running',
      title: `goal ${id}`,
      ...overrides,
    },
    pendingDecisions: 0,
    totalRunCost: 0,
    totalRunDuration: 0,
    taskDone: 1,
    taskTotal: 3,
    ...rest,
  }) as OrchestrationWorkflowListItem;

const titlesOf = (entries: { title: string }[]) => entries.map(({ title }) => title);

describe('buildHomeGoalEntries', () => {
  it('puts the goals waiting on the user ahead of the ones still working', () => {
    const goals = [
      orchestrationWorkflow({ id: 'r1', orchestrationWorkflow: { status: 'running' } }),
      orchestrationWorkflow({ id: 'd1', orchestrationWorkflow: { status: 'review' } }),
      orchestrationWorkflow({ id: 'r2', orchestrationWorkflow: { status: 'verifying' } }),
    ];

    const entries = buildHomeGoalEntries(goals);

    expect(titlesOf(entries)).toEqual(['goal d1', 'goal r1', 'goal r2']);
    expect(entries.map(({ bucket }) => bucket)).toEqual(['review', 'running', 'running']);
  });

  it('drops goals that are finished or parked', () => {
    const goals = [
      orchestrationWorkflow({ id: 'a', orchestrationWorkflow: { status: 'canceled' } }),
      orchestrationWorkflow({ id: 'b', orchestrationWorkflow: { status: 'failed' } }),
      orchestrationWorkflow({ id: 'c', orchestrationWorkflow: { status: 'paused' } }),
      orchestrationWorkflow({ id: 'd', orchestrationWorkflow: { status: 'achieved' } }),
      orchestrationWorkflow({ id: 'e', orchestrationWorkflow: { status: 'running' } }),
    ];

    expect(titlesOf(buildHomeGoalEntries(goals))).toEqual(['goal e']);
  });

  it('reads a review goal as pending the user even without an acceptance read', () => {
    const goals = [
      orchestrationWorkflow({ id: 'live', orchestrationWorkflow: { status: 'review' } }),
    ];

    const [entry] = buildHomeGoalEntries(goals);

    expect(entry.bucket).toBe('review');
    expect(entry.statusKey).toBe('goalList.status.review');
  });

  it('keeps a verifying goal in the running bucket', () => {
    const goals = [
      orchestrationWorkflow({ id: 'v', orchestrationWorkflow: { status: 'verifying' } }),
    ];

    const [entry] = buildHomeGoalEntries(goals);

    expect(entry.bucket).toBe('running');
    expect(entry.statusKey).toBe('goalList.status.verifying');
  });

  it('carries the graph roll-up the row renders', () => {
    const goals = [
      orchestrationWorkflow({ id: 'x', pendingDecisions: 2, taskDone: 2, taskTotal: 5 }),
    ];

    expect(buildHomeGoalEntries(goals)[0]).toMatchObject({
      agentId: 'agt_1',
      id: 'g-x',
      pendingDecisions: 2,
      title: 'goal x',
      taskDone: 2,
      taskTotal: 5,
    });
  });
});

describe('resolveHomeGoalView', () => {
  const entries = (count: number, status: OrchestrationWorkflowStatus = 'running') =>
    buildHomeGoalEntries(
      Array.from({ length: count }, (_, index) =>
        orchestrationWorkflow({
          orchestrationWorkflow: { id: `g${index}`, status },
          id: `g${index}`,
        }),
      ),
    );

  it('names each pile and leaves an empty one out', () => {
    const { buckets, collapsed } = resolveHomeGoalView(entries(2));

    expect(collapsed).toBe(false);
    expect(buckets.map(({ bucket }) => bucket)).toEqual(['running']);
    expect(buckets[0].entries).toHaveLength(2);
  });

  it('folds the tail once the card would stop being a card', () => {
    const { buckets, collapsed } = resolveHomeGoalView(entries(7));

    expect(collapsed).toBe(true);
    expect(buckets[0].entries).toHaveLength(5);
  });

  it('keeps the pile count honest while the tail is folded', () => {
    const { buckets } = resolveHomeGoalView(entries(7));

    expect(buckets[0].total).toBe(7);
  });

  it('shows everything once expanded', () => {
    const { buckets, collapsed } = resolveHomeGoalView(entries(7), true);

    expect(collapsed).toBe(false);
    expect(buckets[0].entries).toHaveLength(7);
  });

  it('cuts the least urgent rows, never the ones waiting on the user', () => {
    const goals = [
      ...Array.from({ length: 6 }, (_, index) =>
        orchestrationWorkflow({
          orchestrationWorkflow: { id: `g-r${index}`, status: 'running' },
          id: `r${index}`,
        }),
      ),
      orchestrationWorkflow({ orchestrationWorkflow: { id: 'g-d1', status: 'review' }, id: 'd1' }),
    ];

    const { buckets } = resolveHomeGoalView(buildHomeGoalEntries(goals));

    expect(buckets.map(({ bucket }) => bucket)).toEqual(['review', 'running']);
    expect(buckets[0].entries).toHaveLength(1);
    expect(buckets[1].entries).toHaveLength(4);
    expect(buckets[1].total).toBe(6);
  });
});

describe('homeGoalHref', () => {
  it('routes to the goal detail page under its owning agent', () => {
    const [entry] = buildHomeGoalEntries([orchestrationWorkflow({ id: 'g1' })]);

    expect(homeGoalHref(entry)).toBe('/agent/agt_1/goal/g-g1');
  });

  it('has nowhere to go for an unassigned goal', () => {
    const [entry] = buildHomeGoalEntries([orchestrationWorkflow({ agentId: null, id: 'g1' })]);

    expect(homeGoalHref(entry)).toBeUndefined();
  });
});
