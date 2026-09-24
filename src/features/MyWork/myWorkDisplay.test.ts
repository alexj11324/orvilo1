import { describe, expect, it } from 'vitest';

import {
  activityDayKey,
  activityDayTitle,
  compareTasksByImportance,
  defaultMyWorkDisplay,
  filterMyWorkTaskRows,
  isCompletedWindowHidden,
  isInteractiveRowClick,
  isMyWorkClientGrouping,
  MY_WORK_DEFAULT_ROW_PROPERTIES,
  MY_WORK_PRIORITY_LABEL_KEYS,
  MY_WORK_ROW_PROPERTIES,
  myWorkDisplayFiltersRows,
  myWorkListGroupingOptions,
  myWorkOrderingOptions,
  myWorkPriorityGroupRank,
  myWorkServerGroupBy,
  myWorkStatusGroupRank,
  myWorkSubGroupingOptions,
  normalizeMyWorkDisplay,
  sortTasksByImportance,
  workQueryActivitySections,
  workQueryFieldSections,
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

  it('offers the row-field groupings (priority/project/assignee) on every tab', () => {
    for (const mode of ['assigned', 'created', 'subscribed', 'activity'] as const) {
      const options = myWorkListGroupingOptions(mode);
      expect(options).toContain('priority');
      expect(options).toContain('project');
      expect(options).toContain('assignee');
    }
  });

  it('keeps the tab default first', () => {
    expect(myWorkListGroupingOptions('assigned')[0]).toBe('attention');
    expect(myWorkListGroupingOptions('created')[0]).toBe('none');
    expect(myWorkListGroupingOptions('subscribed')[0]).toBe('none');
    expect(myWorkListGroupingOptions('activity')[0]).toBe('activityDate');
  });
});

describe('isMyWorkClientGrouping', () => {
  it('marks the client-bucketed groupings', () => {
    for (const grouping of ['activityDate', 'assignee', 'priority', 'project'] as const) {
      expect(isMyWorkClientGrouping(grouping)).toBe(true);
    }
    for (const grouping of ['attention', 'none', 'status', 'workflowCategory'] as const) {
      expect(isMyWorkClientGrouping(grouping)).toBe(false);
    }
  });
});

describe('myWorkServerGroupBy', () => {
  it('fetches a flat list when the display grouping is activityDate', () => {
    expect(myWorkServerGroupBy({ boardGrouping: 'status', grouping: 'activityDate' }, 'list')).toBe(
      'none',
    );
  });

  it('fetches a flat list for the client-bucketed field groupings', () => {
    for (const grouping of ['assignee', 'priority', 'project'] as const) {
      expect(myWorkServerGroupBy({ boardGrouping: 'status', grouping }, 'list')).toBe('none');
    }
  });

  it('passes the board grouping through in board layout', () => {
    expect(myWorkServerGroupBy({ boardGrouping: 'status', grouping: 'attention' }, 'board')).toBe(
      'status',
    );
    // A client grouping must not leak into the board's column dimension.
    expect(myWorkServerGroupBy({ boardGrouping: 'status', grouping: 'project' }, 'board')).toBe(
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

  it('buckets by the activity clock the feed is ordered by, not updatedAt', () => {
    const today = new Date();
    const lastWeek = new Date(startOfDay(today).getTime() - 6 * 86_400_000);
    // Feed order is activity-desc; updatedAt disagrees with it on purpose.
    const a = task({ activityAt: today, id: 'a', updatedAt: lastWeek });
    const b = task({ activityAt: today, id: 'b', updatedAt: today });
    const c = task({ activityAt: lastWeek, id: 'c', updatedAt: today });
    const sections = workQueryActivitySections([a, b, c]);
    expect(sections.map((section) => section.tasks.map((row) => row.id))).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
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

describe('workQueryFieldSections', () => {
  const titleOf = (key: string | null) => (key === null ? 'None' : `label:${key}`);

  it('buckets rows by the field key, preserving arrival order', () => {
    const a = task({ id: 'a', projectId: 'p1' });
    const b = task({ id: 'b', projectId: 'p2' });
    const c = task({ id: 'c', projectId: 'p1' });
    const sections = workQueryFieldSections([a, b, c], {
      keyOf: (row) => row.projectId,
      titleOf,
    });
    expect(sections.map((section) => section.key)).toEqual(['p1', 'p2']);
    expect(sections[0].tasks.map((row) => row.id)).toEqual(['a', 'c']);
    expect(sections[0].title).toBe('label:p1');
  });

  it('sorts sections by rankOf, then title', () => {
    const rows = [
      task({ id: 'a', priority: 3 }),
      task({ id: 'b', priority: 1 }),
      task({ id: 'c', priority: 2 }),
    ];
    const sections = workQueryFieldSections(rows, {
      keyOf: (row) => row.priority,
      rankOf: myWorkPriorityGroupRank,
      titleOf,
    });
    // Urgent (1) → High (2) → Normal (3), regardless of arrival order.
    expect(sections.map((section) => section.key)).toEqual(['1', '2', '3']);
  });

  it('sends the null bucket last and titles it through titleOf(null)', () => {
    const rows = [task({ id: 'a', projectId: null }), task({ id: 'b', projectId: 'p1' })];
    const sections = workQueryFieldSections(rows, {
      keyOf: (row) => row.projectId,
      titleOf,
    });
    expect(sections.map((section) => section.key)).toEqual(['p1', 'none']);
    expect(sections[1].title).toBe('None');
  });

  it('keeps a missing field out of the named buckets for assignee rows', () => {
    const rows = [
      task({ id: 'a', assigneeUserId: 'u1' }),
      task({ id: 'b', assigneeUserId: null }),
      task({ id: 'c', assigneeUserId: undefined }),
    ];
    const sections = workQueryFieldSections(rows, {
      keyOf: (row) => row.assigneeUserId,
      titleOf,
    });
    expect(sections.map((section) => section.key)).toEqual(['u1', 'none']);
    expect(sections[1].tasks.map((row) => row.id)).toEqual(['b', 'c']);
  });
});

describe('normalizeMyWorkDisplay', () => {
  it('returns the tab defaults when nothing was persisted', () => {
    expect(normalizeMyWorkDisplay('assigned', undefined)).toEqual(defaultMyWorkDisplay('assigned'));
    expect(normalizeMyWorkDisplay('created', null)).toEqual(defaultMyWorkDisplay('created'));
  });

  it('rejects a grouping the tab does not offer', () => {
    // `activityDate` is Activity-only — a stale persisted value on Created
    // falls back to that tab's default rather than rendering a dead section.
    const display = normalizeMyWorkDisplay('created', { grouping: 'activityDate' });
    expect(display.grouping).toBe('none');
    const kept = normalizeMyWorkDisplay('created', { grouping: 'priority' });
    expect(kept.grouping).toBe('priority');
  });

  it('drops unknown property keys and keeps boolean overrides', () => {
    const display = normalizeMyWorkDisplay('assigned', {
      properties: { assignee: false, bogus: true },
    });
    expect(display.properties.assignee).toBe(false);
    expect(display.properties.status).toBe(true);
    expect('bogus' in display.properties).toBe(false);
  });

  it('normalizes sub-grouping and booleans independently', () => {
    const display = normalizeMyWorkDisplay('subscribed', {
      nestedSubIssues: false,
      subGrouping: 'status',
    });
    expect(display.subGrouping).toBe('status');
    expect(display.nestedSubIssues).toBe(false);
    const bad = normalizeMyWorkDisplay('subscribed', {
      subGrouping: 'bogus' as never,
    });
    expect(bad.subGrouping).toBe('none');
  });

  it('covers every row property in the persisted shape', () => {
    for (const property of MY_WORK_ROW_PROPERTIES) {
      expect(MY_WORK_DEFAULT_ROW_PROPERTIES[property]).toBe(true);
    }
    // Linear's panel order: status, assignee, priority, project, milestone,
    // labels, dates.
    expect(MY_WORK_ROW_PROPERTIES).toEqual([
      'status',
      'assignee',
      'priority',
      'project',
      'milestone',
      'labels',
      'updated',
    ]);
  });
});

describe('myWorkSubGroupingOptions', () => {
  it('always offers none and drops the active primary dimension', () => {
    expect(myWorkSubGroupingOptions('status')).toEqual(['none', 'priority', 'assignee', 'project']);
    expect(myWorkSubGroupingOptions('priority')).toEqual(['none', 'status', 'assignee', 'project']);
    expect(myWorkSubGroupingOptions('none')).toEqual([
      'none',
      'status',
      'priority',
      'assignee',
      'project',
    ]);
  });
});

describe('myWorkStatusGroupRank', () => {
  it('follows the kanban column order, null last', () => {
    const keys = ['canceled', 'backlog', 'running', null];
    expect([...keys].sort((a, b) => myWorkStatusGroupRank(a) - myWorkStatusGroupRank(b))).toEqual([
      'backlog',
      'running',
      'canceled',
      null,
    ]);
  });
});

describe('myWorkPriorityGroupRank', () => {
  it('orders urgent → high → normal → low → none, null last', () => {
    const keys = ['0', '4', '2', '1', '3', null];
    expect(
      [...keys].sort((a, b) => myWorkPriorityGroupRank(a) - myWorkPriorityGroupRank(b)),
    ).toEqual(['1', '2', '3', '4', '0', null]);
  });

  it('covers every Orvilo priority value with a label key', () => {
    for (const value of [0, 1, 2, 3, 4]) {
      expect(MY_WORK_PRIORITY_LABEL_KEYS[value]).toMatch(/^taskDetail\.priority\./);
    }
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

  it('honours the data-row-interactive marker on clickable chrome', () => {
    // Bare clickable chips (subtask progress, sync status) carry the marker so
    // peek-mode click capture lets them through.
    const chip = document.createElement('div');
    chip.setAttribute('data-row-interactive', 'true');
    const inner = document.createElement('span');
    chip.append(inner);
    expect(isInteractiveRowClick(chip)).toBe(true);
    expect(isInteractiveRowClick(inner)).toBe(true);
  });

  it('ignores plain row chrome', () => {
    const div = document.createElement('div');
    expect(isInteractiveRowClick(div)).toBe(false);
    expect(isInteractiveRowClick(null)).toBe(false);
  });
});
