import { describe, expect, it } from 'vitest';

import { milestoneById, taskMilestoneIdInProject } from './taskProjectRef';

describe('taskMilestoneIdInProject', () => {
  const tasks = [
    { id: 'task-1', projectMilestoneId: 'ms-1' },
    { id: 'task-2', projectMilestoneId: null },
    { id: 'task-3' },
  ];

  it('returns the milestone id the project task row carries', () => {
    expect(taskMilestoneIdInProject(tasks, 'task-1')).toBe('ms-1');
  });

  it('distinguishes a resolved "No milestone" (null) from an unknown row (undefined)', () => {
    expect(taskMilestoneIdInProject(tasks, 'task-2')).toBeNull();
    expect(taskMilestoneIdInProject(tasks, 'task-missing')).toBeUndefined();
    expect(taskMilestoneIdInProject(tasks, 'task-3')).toBeNull();
  });

  it('returns undefined without tasks or a database id', () => {
    expect(taskMilestoneIdInProject(undefined, 'task-1')).toBeUndefined();
    expect(taskMilestoneIdInProject(tasks, undefined)).toBeUndefined();
  });
});

describe('milestoneById', () => {
  const milestones = [
    { id: 'ms-1', name: 'Alpha', sortOrder: 0 },
    { date: '2026-10-01', id: 'ms-2', name: 'Beta', sortOrder: 1 },
  ];

  it('finds the milestone in the project catalog', () => {
    expect(milestoneById(milestones, 'ms-2')?.name).toBe('Beta');
  });

  it('returns undefined for unknown or empty ids', () => {
    expect(milestoneById(milestones, 'ms-9')).toBeUndefined();
    expect(milestoneById(milestones, null)).toBeUndefined();
    expect(milestoneById(undefined, 'ms-1')).toBeUndefined();
  });
});
