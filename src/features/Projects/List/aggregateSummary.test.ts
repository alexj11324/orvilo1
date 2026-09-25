import { describe, expect, it } from 'vitest';

import { projectListSummaryRows, summarizeProjectList } from './aggregateSummary';
import { CLOSED_PROJECT_STATUSES, filterClosedProjects } from './displayOptions';
import { filterProjectList } from './listFilters';

const rows = [
  { health: 'onTrack', id: 'p1', leadUserId: 'u1', name: 'p1', status: 'active' },
  { health: 'atRisk', id: 'p2', leadUserId: 'u2', name: 'p2', status: 'active' },
  { health: null, id: 'p3', leadUserId: null, name: 'p3', status: 'planned' },
  { health: null, id: 'p4', leadUserId: 'u1', name: 'p4', status: 'completed' },
  { health: 'bogus', id: 'p5', leadUserId: 'u2', name: 'p5', status: 'canceled' },
  { health: 'onTrack', id: 'p6', leadUserId: 'u1', name: 'p6', status: 'archived' },
  { health: null, id: 'p7', leadUserId: null, name: 'p7', status: 'paused' },
];

describe('summarizeProjectList', () => {
  it('buckets health in workflow order and drops zero buckets', () => {
    const summary = summarizeProjectList(rows);
    expect(summary.health).toEqual([
      { count: 1, state: 'onTrack' },
      { count: 1, state: 'atRisk' },
    ]);
  });

  it('counts open rows without a valid health as update missing', () => {
    const summary = summarizeProjectList(rows);
    // planned + paused rows have no health; closed rows never land here.
    expect(summary.updateMissing).toBe(2);
  });

  it('counts terminal-status rows as no update expected, once each', () => {
    const summary = summarizeProjectList(rows);
    // completed + canceled + archived — including the archived row that still
    // carries a health value (a closed project stops reporting).
    expect(summary.noUpdateExpected).toBe(3);
  });

  it('buckets every row by lead with the no-lead bucket last', () => {
    const summary = summarizeProjectList(rows, (userId) => `name-${userId}`);
    expect(summary.leads).toEqual([
      { count: 3, userId: 'u1' },
      { count: 2, userId: 'u2' },
      { count: 2, userId: null },
    ]);
  });

  it('treats missing leadUserId as the no-lead bucket', () => {
    const summary = summarizeProjectList([{ leadUserId: undefined, status: 'active' }]);
    expect(summary.leads).toEqual([{ count: 1, userId: null }]);
  });
});

describe('projectListSummaryRows', () => {
  it('drops closed rows the display option hides so bucket counts match the click', () => {
    // Regression: under showClosed='none' the table can never render closed
    // rows, so counting them in the sidebar promised rows the bucket click
    // could not show.
    expect(summarizeProjectList(projectListSummaryRows(rows, 'none')).noUpdateExpected).toBe(0);
    // 'all' keeps the closed rows countable.
    expect(summarizeProjectList(projectListSummaryRows(rows, 'all')).noUpdateExpected).toBe(3);
  });

  it('keeps the closed-window bucket count equal to what the status click shows', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    const dated = [
      ...rows,
      {
        completedAt: '2026-09-20T12:00:00Z',
        health: null,
        id: 'p8',
        name: 'p8',
        status: 'completed',
      },
      {
        completedAt: '2025-01-01T00:00:00Z',
        health: null,
        id: 'p9',
        name: 'p9',
        status: 'completed',
      },
    ];
    // pastWeek keeps the Sep-20 close, drops the Jan-1 one.
    const base = projectListSummaryRows(dated, 'pastWeek', now);
    const summary = summarizeProjectList(base);
    expect(summary.noUpdateExpected).toBe(1);
    // The bucket click applies the closed-status filter on top of the same
    // closed-window base the table uses — survivors must equal the count.
    const clicked = filterClosedProjects(
      filterProjectList(base, [{ type: 'status', values: [...CLOSED_PROJECT_STATUSES] }], now),
      'pastWeek',
      now,
    );
    expect(clicked).toHaveLength(summary.noUpdateExpected);
  });
});
