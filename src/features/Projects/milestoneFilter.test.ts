import { describe, expect, it } from 'vitest';

import {
  filterTasksByMilestone,
  getProjectMilestoneIssuesPath,
  PROJECT_MILESTONE_FILTER_PARAM,
  readProjectMilestoneFilter,
} from './milestoneFilter';

describe('getProjectMilestoneIssuesPath', () => {
  it('points at the project issues list narrowed to one milestone', () => {
    expect(getProjectMilestoneIssuesPath('launch', 'ms-1')).toBe(
      '/project/launch/tasks?projectMilestoneId=ms-1',
    );
  });

  it('uses the same parameter name as the reference', () => {
    expect(PROJECT_MILESTONE_FILTER_PARAM).toBe('projectMilestoneId');
  });
});

describe('readProjectMilestoneFilter', () => {
  it('reads the milestone from the query string', () => {
    expect(readProjectMilestoneFilter(new URLSearchParams('projectMilestoneId=ms-1'))).toBe('ms-1');
  });

  it('treats a missing or blank parameter as no filter', () => {
    expect(readProjectMilestoneFilter(new URLSearchParams(''))).toBeUndefined();
    expect(readProjectMilestoneFilter(new URLSearchParams('projectMilestoneId='))).toBeUndefined();
  });
});

describe('filterTasksByMilestone', () => {
  const tasks = [
    { id: 'a', projectMilestoneId: 'ms-1' },
    { id: 'b', projectMilestoneId: 'ms-2' },
    { id: 'c', projectMilestoneId: null },
    { id: 'd', projectMilestoneId: 'ms-1' },
  ];

  it('keeps only the tasks linked to the milestone', () => {
    expect(filterTasksByMilestone(tasks, 'ms-1').map((task) => task.id)).toEqual(['a', 'd']);
  });

  it('returns an empty list for a milestone nothing is linked to', () => {
    expect(filterTasksByMilestone(tasks, 'ms-9')).toEqual([]);
  });
});
