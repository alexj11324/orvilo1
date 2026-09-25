import { describe, expect, it } from 'vitest';

import type { WorkQueryResultTask } from '@/features/MyWork/workQueryPaging';

import {
  DEFAULT_TEAM_ISSUES_DISPLAY,
  filterTeamIssueRows,
  isTeamIssuesClientGrouping,
  patchTeamIssuesParams,
  readTeamIssuesUrlState,
  resetTeamIssuesDisplayParams,
  teamIssuesServerGroupBy,
} from './teamIssuesDisplay';
import { ALL_TEAM_CYCLES } from './teamWorkQuery';

const task = (overrides: Partial<WorkQueryResultTask>): WorkQueryResultTask =>
  ({
    completedAt: null,
    id: 'task-1',
    identifier: 'T-1',
    parentTaskId: null,
    status: 'scheduled',
    updatedAt: new Date(),
    ...overrides,
  }) as WorkQueryResultTask;

describe('teamIssuesDisplay URL state', () => {
  it('defaults to the Linear board surface on a clean issues URL', () => {
    const state = readTeamIssuesUrlState(new URLSearchParams('tab=issues'));
    expect(state.layout).toBe('board');
    expect(state.cycleId).toBe(ALL_TEAM_CYCLES);
    expect(state.noProject).toBe(false);
    expect(state.display).toEqual(DEFAULT_TEAM_ISSUES_DISPLAY);
  });

  it('parses every display param and ignores malformed values', () => {
    const state = readTeamIssuesUrlState(
      new URLSearchParams(
        'layout=list&grouping=priority&ordering=updatedDesc&completed=pastDay' +
          '&subIssues=0&nestedSub=0&emptyColumns=1&projectChip=0&cycle=cycle-9&noProject=1',
      ),
    );
    expect(state.layout).toBe('list');
    expect(state.cycleId).toBe('cycle-9');
    expect(state.noProject).toBe(true);
    expect(state.display).toEqual({
      boardGrouping: 'workflowCategory',
      completed: 'pastDay',
      grouping: 'priority',
      nestedSubIssues: false,
      ordering: 'updatedDesc',
      projectChip: false,
      showEmptyColumns: true,
      showSubIssues: false,
    });

    const malformed = readTeamIssuesUrlState(
      new URLSearchParams('layout=grid&grouping=nonsense&ordering=shuffle&completed=era'),
    );
    expect(malformed.layout).toBe('board');
    expect(malformed.display).toEqual(DEFAULT_TEAM_ISSUES_DISPLAY);
  });

  it('resolves a shared grouping param against the active layout', () => {
    // 'status' is valid on both surfaces — one param serves both.
    const shared = readTeamIssuesUrlState(new URLSearchParams('grouping=status'));
    expect(shared.display.grouping).toBe('status');
    expect(shared.display.boardGrouping).toBe('status');

    // A list-only bucket is not a valid board grouping — board falls back
    // without the param being rewritten.
    const listOnly = readTeamIssuesUrlState(new URLSearchParams('grouping=assignee'));
    expect(listOnly.display.grouping).toBe('assignee');
    expect(listOnly.display.boardGrouping).toBe('workflowCategory');
  });

  it('writes non-defaults, deletes defaults, and keeps unrelated params', () => {
    const current = new URLSearchParams('tab=issues&scope=active&layout=list&grouping=status');
    const next = patchTeamIssuesParams(current, {
      layout: 'board',
      ordering: 'updatedDesc',
      showEmptyColumns: true,
      showSubIssues: false,
    });
    expect(next.get('tab')).toBe('issues');
    expect(next.get('scope')).toBe('active');
    expect(next.get('layout')).toBeNull();
    expect(next.get('grouping')).toBe('status');
    expect(next.get('ordering')).toBe('updatedDesc');
    expect(next.get('emptyColumns')).toBe('1');
    expect(next.get('subIssues')).toBe('0');
    // The input params object is never mutated.
    expect(current.get('ordering')).toBeNull();
  });

  it('writes cycle and no-project filters', () => {
    const next = patchTeamIssuesParams(new URLSearchParams('tab=issues'), {
      cycleId: 'cycle-9',
      noProject: true,
    });
    expect(next.get('cycle')).toBe('cycle-9');
    expect(next.get('noProject')).toBe('1');
    const cleared = patchTeamIssuesParams(next, { cycleId: ALL_TEAM_CYCLES, noProject: false });
    expect(cleared.get('cycle')).toBeNull();
    expect(cleared.get('noProject')).toBeNull();
  });

  it('reset clears only display params, never the filters or scope', () => {
    const current = new URLSearchParams(
      'tab=issues&scope=backlog&cycle=cycle-1&noProject=1&layout=list&grouping=priority' +
        '&ordering=createdAsc&completed=none&subIssues=0&nestedSub=0&emptyColumns=1&projectChip=0',
    );
    const next = resetTeamIssuesDisplayParams(current);
    expect(next.get('tab')).toBe('issues');
    expect(next.get('scope')).toBe('backlog');
    expect(next.get('cycle')).toBe('cycle-1');
    expect(next.get('noProject')).toBe('1');
    for (const key of [
      'layout',
      'grouping',
      'ordering',
      'completed',
      'subIssues',
      'nestedSub',
      'emptyColumns',
      'projectChip',
    ]) {
      expect(next.get(key)).toBeNull();
    }
  });
});

describe('teamIssuesServerGroupBy', () => {
  it('maps board to its column grouping and client list groupings to the flat feed', () => {
    expect(
      teamIssuesServerGroupBy({ boardGrouping: 'status', grouping: 'priority' }, 'board'),
    ).toBe('status');
    expect(
      teamIssuesServerGroupBy({ boardGrouping: 'workflowCategory', grouping: 'status' }, 'list'),
    ).toBe('status');
    for (const grouping of ['priority', 'project', 'assignee', 'cycle'] as const) {
      expect(isTeamIssuesClientGrouping(grouping)).toBe(true);
      expect(teamIssuesServerGroupBy({ boardGrouping: 'status', grouping }, 'list')).toBe('none');
    }
    expect(teamIssuesServerGroupBy({ boardGrouping: 'status', grouping: 'none' }, 'list')).toBe(
      'none',
    );
  });
});

describe('filterTeamIssueRows', () => {
  it('drops sub-issues when hidden and completed rows past the window', () => {
    const now = Date.now();
    const parent = task({ id: 'p', identifier: 'T-1' });
    const child = task({ id: 'c', identifier: 'T-2', parentTaskId: 'p' });
    const done = task({
      completedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      id: 'd',
      identifier: 'T-3',
      status: 'completed',
    });
    const freshDone = task({
      completedAt: new Date(now - 1000),
      id: 'fd',
      identifier: 'T-4',
      status: 'completed',
    });
    const rows = [parent, child, done, freshDone];

    expect(filterTeamIssueRows(rows, { completed: 'all', showSubIssues: true }, now)).toHaveLength(
      4,
    );
    expect(
      filterTeamIssueRows(rows, { completed: 'all', showSubIssues: false }, now).map((t) => t.id),
    ).toEqual(['p', 'd', 'fd']);
    expect(
      filterTeamIssueRows(rows, { completed: 'pastDay', showSubIssues: true }, now).map(
        (t) => t.id,
      ),
    ).toEqual(['p', 'c', 'fd']);
    expect(
      filterTeamIssueRows(rows, { completed: 'none', showSubIssues: false }, now).map((t) => t.id),
    ).toEqual(['p']);
  });
});
