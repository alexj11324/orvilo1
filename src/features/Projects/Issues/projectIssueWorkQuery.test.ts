import { describe, expect, it } from 'vitest';

import {
  PROJECT_ISSUE_PAGE_SIZE,
  projectIssueBoardGroupBy,
  projectIssueListAxes,
  projectIssueListSort,
  projectIssueWorkQuery,
} from './projectIssueWorkQuery';

describe('projectIssueWorkQuery', () => {
  it('pages a list and keeps the milestone predicate on the query', () => {
    expect(PROJECT_ISSUE_PAGE_SIZE).toBe(50);
    const query = projectIssueWorkQuery({
      filters: [{ type: 'priority', values: [1] }],
      layout: 'list',
      milestoneId: 'ms-1',
      projectId: 'p1',
    });
    expect(query.layout).toBe('list');
    expect(query.groupBy).toBe('none');
    expect(query.filter?.all).toEqual(
      expect.arrayContaining([
        { field: 'projectId', op: 'eq', value: 'p1' },
        { field: 'projectMilestoneId', op: 'eq', value: 'ms-1' },
      ]),
    );
  });

  it('pages a filtered list on status, priority, and member', () => {
    expect(projectIssueListAxes('status', 'none')).toEqual({ groupBy: 'status' });
    expect(projectIssueListAxes('member', 'priority')).toEqual({
      groupBy: 'assignee',
      subGroupBy: 'priority',
    });
    expect(projectIssueListAxes('priority', 'member')).toEqual({
      groupBy: 'priority',
      subGroupBy: 'assignee',
    });
    expect(projectIssueListAxes('status', 'status')).toEqual({ groupBy: 'status' });
    expect(projectIssueListAxes('none', 'priority')).toEqual({ groupBy: 'none' });
    expect(projectIssueListAxes('milestone', 'none')).toBeUndefined();
    expect(projectIssueListAxes('assignee', 'none')).toBeUndefined();
    expect(projectIssueListAxes('status', 'milestone')).toBeUndefined();

    const query = projectIssueWorkQuery({
      filters: [],
      groupBy: 'status',
      hideCompleted: true,
      layout: 'list',
      projectId: 'p1',
      sort: projectIssueListSort('updatedAt', 'asc'),
      subGroupBy: 'priority',
    });
    expect(query.groupBy).toBe('status');
    expect(query.subGroupBy).toBe('priority');
    expect(query.sort).toEqual([
      { direction: 'desc', field: 'updatedAt' },
      { direction: 'asc', field: 'id' },
    ]);
    expect(query.filter?.all).toEqual(
      expect.arrayContaining([
        { field: 'projectId', op: 'eq', value: 'p1' },
        { field: 'status', op: 'notIn', value: ['completed', 'canceled'] },
      ]),
    );
    expect(projectIssueListSort('title', 'desc')).toEqual([
      { direction: 'desc', field: 'name' },
      { direction: 'asc', field: 'id' },
    ]);
    expect(projectIssueListSort('manual', 'asc')).toBeUndefined();
  });

  it('maps a filtered board onto a work-query axis and falls back to status', () => {
    expect(projectIssueBoardGroupBy('priority')).toBe('priority');
    expect(projectIssueBoardGroupBy('member')).toBe('assignee');
    expect(projectIssueBoardGroupBy('milestone')).toBe('status');
    const board = projectIssueWorkQuery({
      filters: [],
      groupBy: 'status',
      layout: 'board',
      milestoneId: 'ms-1',
      projectId: 'p1',
    });
    expect(board.layout).toBe('board');
    expect(board.groupBy).toBe('status');
  });
});
