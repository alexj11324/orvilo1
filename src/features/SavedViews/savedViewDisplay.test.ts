import { describe, expect, it } from 'vitest';

import { savedViewGroupByForLayout, savedViewGroupByOptions } from './savedViewDisplay';

describe('savedViewGroupByOptions', () => {
  it('offers activity date, project, and cycle on a task list', () => {
    expect(savedViewGroupByOptions('task', 'list')).toEqual([
      'none',
      'status',
      'workflowCategory',
      'priority',
      'assignee',
      'project',
      'cycle',
      'activityDate',
    ]);
  });

  it('keeps a board on axes the board draws', () => {
    expect(savedViewGroupByOptions('task', 'board')).toEqual([
      'none',
      'status',
      'workflowCategory',
      'priority',
      'assignee',
    ]);
    expect(savedViewGroupByOptions('project', 'list')).toEqual(['none', 'status']);
  });

  it('maps a list-only axis to workflow when the layout becomes a board', () => {
    expect(savedViewGroupByForLayout('task', 'board', 'activityDate')).toBe('workflowCategory');
    expect(savedViewGroupByForLayout('task', 'board', 'cycle')).toBe('workflowCategory');
    expect(savedViewGroupByForLayout('task', 'board', 'project')).toBe('workflowCategory');
    expect(savedViewGroupByForLayout('task', 'list', 'activityDate')).toBe('activityDate');
    expect(savedViewGroupByForLayout('task', 'board', 'priority')).toBe('priority');
  });
});
