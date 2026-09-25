import { describe, expect, it } from 'vitest';

import {
  projectIssueAssigneeBreakdown,
  projectIssueBurnupSeries,
  projectIssueLabelBreakdown,
} from './projectIssueBurnup';

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const NOW = day('2026-09-25');

describe('project issue burnup', () => {
  it('counts each issue into scope from its creation day, honoring started/completed fallbacks', () => {
    const series = projectIssueBurnupSeries(
      [
        // Started without a recorded startedAt falls back to createdAt.
        { createdAt: '2026-09-22T00:00:00', id: 'a', workflowCategory: 'in_progress' },
        // Completed without completedAt falls back to updatedAt.
        {
          completedAt: null,
          createdAt: '2026-09-23T00:00:00',
          id: 'b',
          updatedAt: '2026-09-24T10:00:00',
          workflowCategory: 'done',
        },
        // Still scoped — never starts or completes.
        { createdAt: '2026-09-24T00:00:00', id: 'c', workflowCategory: 'todo' },
      ],
      NOW,
    );

    expect(series).not.toBeNull();
    expect(series?.map((point) => [point.scope, point.started, point.completed])).toEqual([
      [1, 1, 0], // Sep 22
      [2, 2, 0], // Sep 23 — the done issue counts as started from creation
      [3, 2, 1], // Sep 24 — c scopes, b completes on its updatedAt day; todo never starts
      [3, 2, 1], // Sep 25 (today, inclusive)
    ]);
  });

  it('drops canceled issues from scope and returns null on an unclassifiable category', () => {
    const canceledOnly = projectIssueBurnupSeries(
      [{ createdAt: '2026-09-20T00:00:00', id: 'x', workflowCategory: 'canceled' }],
      NOW,
    );
    expect(canceledOnly?.every((point) => point.scope === 0)).toBe(true);

    expect(
      projectIssueBurnupSeries(
        [
          { createdAt: '2026-09-20T00:00:00', id: 'y', workflowCategory: 'todo' },
          // A category outside the known set must not quietly render a chart.
          { createdAt: '2026-09-20T00:00:00', id: 'z', workflowCategory: 'queued' as never },
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it('keeps a done issue inside started too — completed is a subset of started', () => {
    const series = projectIssueBurnupSeries(
      [
        {
          completedAt: '2026-09-21T12:00:00',
          createdAt: '2026-09-20T00:00:00',
          id: 'a',
          startedAt: '2026-09-21T08:00:00',
          workflowCategory: 'done',
        },
      ],
      NOW,
    );
    const last = series?.at(-1);
    expect(last).toMatchObject({ completed: 1, scope: 1, started: 1 });
  });
});

describe('project issue breakdowns', () => {
  const issues = [
    { assigneeUserId: 'u1', id: 'a', workflowCategory: 'todo' as const },
    { assigneeUserId: 'u1', id: 'b', workflowCategory: 'done' as const },
    { assigneeAgentId: 'g1', id: 'c', workflowCategory: 'in_progress' as const },
    { id: 'd', workflowCategory: 'backlog' as const },
    { assigneeUserId: 'u2', id: 'e', workflowCategory: 'canceled' as const },
  ];

  it('groups by assignee with the unassigned bucket first, then scope-desc', () => {
    const groups = projectIssueAssigneeBreakdown(issues);
    expect(groups).not.toBeNull();
    expect(groups?.map((g) => [g.key, g.scope, g.percent, g.filterType])).toEqual([
      ['none', 1, 0, 'assignee'],
      ['user:u1', 2, 50, 'assignee'],
      ['agent:g1', 1, 0, 'agent'],
    ]);
    // The canceled issue leaves scope entirely — u2 never gets a row.
    expect(groups?.some((g) => g.key === 'user:u2')).toBe(false);
  });

  it('counts a multi-labeled issue into each label group', () => {
    const taskLabels = {
      a: [{ id: 'l1' }],
      b: [{ id: 'l1' }, { id: 'l2' }],
      c: [{ id: 'l2' }],
    };
    const groups = projectIssueLabelBreakdown(issues, taskLabels);
    expect(groups?.map((g) => [g.key, g.scope, g.percent])).toEqual([
      ['none', 1, 0], // issue d, unlabeled
      ['label:l1', 2, 50], // a (scoped) + b (done)
      ['label:l2', 2, 50], // b (done) + c (started)
    ]);
    // l1's 50% = 1 completed of its 2 in-scope issues — per-group percent.
    expect(groups?.find((g) => g.key === 'label:l1')).toMatchObject({
      completed: 1,
      filterType: 'labels',
      filterValue: 'l1',
    });
  });

  it('returns null rather than a partial readout when any issue is unclassifiable', () => {
    const dirty = [...issues, { id: 'z', workflowCategory: 'queued' as never }];
    expect(projectIssueAssigneeBreakdown(dirty)).toBeNull();
    expect(projectIssueLabelBreakdown(dirty, {})).toBeNull();
  });
});
