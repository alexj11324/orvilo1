import { describe, expect, it } from 'vitest';

import { projectPathSection } from './navigation';

describe('projectPathSection', () => {
  it('reads the section segment after the project reference', () => {
    expect(projectPathSection('/project/abc/overview')).toBe('overview');
    expect(projectPathSection('/project/abc/tasks')).toBe('tasks');
    expect(projectPathSection('/project/abc/goals')).toBe('goals');
    expect(projectPathSection('/project/abc/resources')).toBe('resources');
  });

  it('matches under a workspace prefix', () => {
    expect(projectPathSection('/acme/project/abc/tasks')).toBe('tasks');
    expect(projectPathSection('/acme/project/abc/overview')).toBe('overview');
  });

  it('keeps the tab active on deep links below the section', () => {
    expect(projectPathSection('/project/abc/resources/library/kb-1')).toBe('resources');
    expect(projectPathSection('/acme/project/prj_9/resources')).toBe('resources');
  });

  it('ignores id-vs-slug differences in the project reference', () => {
    expect(projectPathSection('/project/prj_123/tasks')).toBe('tasks');
    expect(projectPathSection('/project/launch/tasks')).toBe('tasks');
  });

  it('returns undefined outside project sections', () => {
    expect(projectPathSection('/tasks')).toBeUndefined();
    expect(projectPathSection('/project/abc')).toBeUndefined();
  });
});
