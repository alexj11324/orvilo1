import { describe, expect, it } from 'vitest';

import {
  savedViewGroupByForLayout,
  savedViewGroupByOptions,
  savedViewProjectsPageByGroup,
  workQueryWithViewerTimeZone,
} from './savedViewDisplay';

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
    expect(savedViewGroupByOptions('project', 'board')).toEqual(['status']);
  });

  it('maps a list-only axis to workflow when the layout becomes a board', () => {
    expect(savedViewGroupByForLayout('task', 'board', 'activityDate')).toBe('workflowCategory');
    expect(savedViewGroupByForLayout('task', 'board', 'cycle')).toBe('workflowCategory');
    expect(savedViewGroupByForLayout('task', 'board', 'project')).toBe('workflowCategory');
    expect(savedViewGroupByForLayout('task', 'list', 'activityDate')).toBe('activityDate');
    expect(savedViewGroupByForLayout('task', 'board', 'priority')).toBe('priority');
    expect(savedViewGroupByForLayout('project', 'board', 'none')).toBe('status');
    expect(savedViewGroupByForLayout('project', 'list', 'none')).toBe('none');
  });

  it('pages project status groups and keeps the viewer zone off the saved query', () => {
    expect(savedViewProjectsPageByGroup('list', 'status')).toBe(true);
    expect(savedViewProjectsPageByGroup('board', 'none')).toBe(true);
    expect(savedViewProjectsPageByGroup('list', 'none')).toBe(false);
    const query = { entityType: 'task' as const, groupBy: 'activityDate' as const, schemaVersion: 1 as const };
    expect(workQueryWithViewerTimeZone(query, 'Asia/Shanghai').timeZone).toBe('Asia/Shanghai');
    expect(workQueryWithViewerTimeZone({ ...query, groupBy: 'status' }, 'Asia/Shanghai')).toEqual({
      ...query,
      groupBy: 'status',
    });
    expect(workQueryWithViewerTimeZone(query, undefined)).toBe(query);
  });
});
