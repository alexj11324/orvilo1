import { describe, expect, it } from 'vitest';

import {
  PROJECT_ISSUE_PAGE_SIZE,
  projectIssueBoardGroupBy,
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
