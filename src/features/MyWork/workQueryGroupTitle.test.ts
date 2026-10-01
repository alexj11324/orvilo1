import { describe, expect, it } from 'vitest';

import { workQueryGroupTitle } from './workQueryGroupTitle';

const labels = {
  noCycle: 'No cycle',
  noProject: 'No project',
  priority: (key: string) => (key === '1' ? 'Urgent' : undefined),
  today: 'Today',
  unassigned: 'Unassigned',
  unknownDate: 'Unknown date',
  yesterday: 'Yesterday',
};

describe('workQueryGroupTitle', () => {
  it('names activity date, project, assignee, and cycle buckets', () => {
    const catalog = {
      assigneeName: (id: string) => (id === 'user-1' ? 'Ada' : undefined),
      cycleName: (id: string) => (id === 'cycle-1' ? 'Cycle 12' : undefined),
      labels,
      locale: 'en-US',
      projectName: (id: string) => (id === 'project-1' ? 'Launch' : undefined),
    };

    expect(workQueryGroupTitle('activityDate', 'day:0', catalog)).toBe('Today');
    expect(workQueryGroupTitle('priority', '1', catalog)).toBe('Urgent');
    expect(workQueryGroupTitle('project', 'none', catalog)).toBe('No project');
    expect(workQueryGroupTitle('project', 'project-1', catalog)).toBe('Launch');
    expect(workQueryGroupTitle('project', 'missing', catalog)).toBeUndefined();
    expect(workQueryGroupTitle('assignee', 'none', catalog)).toBe('Unassigned');
    expect(workQueryGroupTitle('assignee', 'user-1', catalog)).toBe('Ada');
    expect(workQueryGroupTitle('cycle', 'none', catalog)).toBe('No cycle');
    expect(workQueryGroupTitle('cycle', 'cycle-1', catalog)).toBe('Cycle 12');
    expect(workQueryGroupTitle('status', 'running', catalog)).toBeUndefined();
  });
});
