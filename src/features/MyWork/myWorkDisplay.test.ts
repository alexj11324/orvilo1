import { describe, expect, it } from 'vitest';

import {
  activityDayKey,
  activityDayTitle,
  compareTasksByImportance,
  defaultMyWorkDisplay,
  filterMyWorkTaskRows,
  isCompletedWindowHidden,
  isInteractiveRowClick,
  myWorkDisplayFiltersRows,
  myWorkListGroupingOptions,
  myWorkOrderingOptions,
  myWorkServerGroupBy,
  sortTasksByImportance,
  workQueryActivitySections,
} from './myWorkDisplay';
import type { WorkQueryResultTask } from './workQueryPaging';

const task = (patch: Partial<WorkQueryResultTask>): WorkQueryResultTask =>
  ({ id: 't', identifier: 'T-1', status: 'backlog', ...patch }) as WorkQueryResultTask;

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

describe('defaultMyWorkDisplay', () => {
  it('groups Assigned by attention and hides stale completions', () => {
    const display = defaultMyWorkDisplay('assigned');
    expect(display.grouping).toBe('attention');
    expect(display.completed).toBe('pastDay');
    expect(display.nestedSubIssues).toBe(true);
  });

  it('keeps Created flat with flat sub-issues', () => {
    const display = defaultMyWorkDisplay('created');
    expect(display.grouping).toBe('none');
    expect(display.completed).toBe('all');
    expect(display.nestedSubIssues).toBe(false);
  });

  it('keeps Subscribed flat with nested matching sub-issues', () => {
    const display = defaultMyWorkDisplay('subscribed');
    expect(display.grouping).toBe('none');
    expect(display.nestedSubIssues).toBe(true);
  });

  it('groups Activity by activity date', () => {
    expect(defaultMyWorkDisplay('activity').grouping).toBe('activityDate');
  });
});

describe('myWorkListGroupingOptions', () => {
  it('offers activityDate only on the Activity tab', () => {
    expect(myWorkListGroupingOptions('activity')).toContain('activityDate');
    for (const mode of ['assigned', 'created', 'subscribed'] as const) {
      expect(myWorkListGroupingOptions(mode)).not.toContain('activityDate');
    }
  });
});

describe('myWorkServerGroupBy', () => {
  it('fetches a flat list when the display grouping is activityDate', () => {
    expect(myWorkServerGroupBy({ boardGrouping: 'status', grouping: 'activityDate' }, 'list')).toBe(
      'none',
    );
  });

  it('passes the board grouping through in board layout', () => {
    expect(myWorkServerGroupBy({ boardGrouping: 'status', grouping: 'attention' }, 'board')).toBe(
      'status',
    );
  });
});

describe('myWorkOrderingOptions', () => {
  it('exposes real orderings only on modes the generic query can express', () => {
    expect(myWorkOrderingOptions('assigned')).toContain('createdAsc');
    expect(myWorkOrderingOptions('subscribed')).toEqual(['default']);
    expect(myWorkOrderingOptions('activity')).toEqual(['default']);
  });
});

describe('importance ordering', () => {
  it('ranks urgent > high > normal > low > none', () => {
    const urgent = task({ priority: 1 });
    const high = task({ priority: 2 });
    const normal = task({ priority: 3 });
    const low = task({ priority: 4 });
    const none = task({ priority: 0 });
    const sorted = sortTasksByImportance([none, low, normal, high, urgent]);
    expect(sorted.map((row) => row.priority)).toEqual([1, 2, 3, 4, 0]);
  });

  it('treats null priority as no priority', () => {
    expect(
      compareTasksByImportance(task({ priority: null }), task({ priority: 4 })),
    ).toBeGreaterThan(0);
  });

  it('breaks priority ties by most recently updated', () => {
    const older = task({ priority: 1, updatedAt: new Date('2026-09-20T00:00:00Z') });
    const newer = task({ priority: 1, updatedAt: new Date('2026-09-22T00:00:00Z') });
    expect(sortTasksByImportance([older, newer])[0]).toBe(newer);
  });
});

describe('completed window', () => {
  const now = new Date('2026-09-23T12:00:00Z').getTime();

  it('never hides non-completed rows', () => {
    const open = task({ status: 'in_progress' });
    expect(isCompletedWindowHidden(open, 'none', now)).toBe(false);
  });

  it('counts canceled rows as completed', () => {
    const canceled = task({ status: 'canceled', updatedAt: new Date(now) });
    expect(isCompletedWindowHidden(canceled, 'none', now)).toBe(true);
    expect(isCompletedWindowHidden(canceled, 'pastDay', now)).toBe(false);
  });

  it('hides everything completed under the none window', () => {
    const done = task({ completedAt: new Date(now), status: 'completed' });
    expect(isCompletedWindowHidden(done, 'none', now)).toBe(true);
  });

  it('keeps completions from the past day under pastDay', () => {
    const recent = task({
      completedAt: new Date(now - 60_000),
      status: 'completed',
    });
    const stale = task({
      completedAt: new Date(now - 48 * 60 * 60 * 1000),
      status: 'completed',
    });
    expect(isCompletedWindowHidden(recent, 'pastDay', now)).toBe(false);
    expect(isCompletedWindowHidden(stale, 'pastDay', now)).toBe(true);
  });

  it('falls back to updatedAt when completedAt is missing', () => {
    const stale = task({
      completedAt: null,
      status: 'completed',
      updatedAt: new Date(now - 48 * 60 * 60 * 1000),
    });
    expect(isCompletedWindowHidden(stale, 'pastDay', now)).toBe(true);
  });
});

describe('filterMyWorkTaskRows', () => {
  it('drops sub-issues when showSubIssues is off', () => {
    const display = { ...defaultMyWorkDisplay('created'), showSubIssues: false };
    const parent = task({ id: 'p' });
    const child = task({ id: 'c', parentTaskId: 'p' });
    expect(filterMyWorkTaskRows([parent, child], display)).toEqual([parent]);
  });

  it('drops triage rows when showTriage is off', () => {
    const display = { ...defaultMyWorkDisplay('created'), showTriage: false };
    const triage = task({ workflowCategory: 'triage' });
    const normal = task({ workflowCategory: 'backlog' });
    expect(filterMyWorkTaskRows([triage, normal], display)).toEqual([normal]);
  });

  it('reports whether any display filter can drop rows', () => {
    expect(myWorkDisplayFiltersRows(defaultMyWorkDisplay('created'))).toBe(false);
    expect(
      myWorkDisplayFiltersRows({ ...defaultMyWorkDisplay('assigned'), completed: 'pastDay' }),
    ).toBe(true);
  });
});

describe('workQueryActivitySections', () => {
  it('buckets rows by local day in arrival order', () => {
    const today = new Date();
    const yesterday = new Date(startOfDay(today).getTime() - 3_600_000);
    const a = task({ id: 'a', updatedAt: today });
    const b = task({ id: 'b', updatedAt: yesterday });
    const c = task({ id: 'c', updatedAt: today });
    const sections = workQueryActivitySections([a, b, c]);
    expect(sections.map((section) => section.key)).toEqual([
      activityDayKey(today),
      activityDayKey(yesterday),
    ]);
    expect(sections[0].tasks.map((row) => row.id)).toEqual(['a', 'c']);
    expect(sections[0].total).toBe(2);
  });

  it('labels today, yesterday and unknown rows', () => {
    const labels = { today: 'Today', unknown: 'Unknown date', yesterday: 'Yesterday' };
    const now = new Date(2026, 8, 23, 15);
    expect(activityDayTitle(activityDayKey(now), { labels, now })).toBe('Today');
    expect(activityDayTitle(activityDayKey(new Date(2026, 8, 22, 9)), { labels, now })).toBe(
      'Yesterday',
    );
    expect(activityDayTitle('unknown', { labels, now })).toBe('Unknown date');
  });
});

describe('isInteractiveRowClick', () => {
  it('lets clicks on interactive descendants through', () => {
    const button = document.createElement('button');
    const span = document.createElement('span');
    button.append(span);
    expect(isInteractiveRowClick(button)).toBe(true);
    expect(isInteractiveRowClick(span)).toBe(true);
  });

  it('detects popup triggers even without a button element', () => {
    const trigger = document.createElement('div');
    trigger.setAttribute('aria-haspopup', 'menu');
    expect(isInteractiveRowClick(trigger)).toBe(true);
  });

  it('ignores plain row chrome', () => {
    const div = document.createElement('div');
    expect(isInteractiveRowClick(div)).toBe(false);
    expect(isInteractiveRowClick(null)).toBe(false);
  });
});
