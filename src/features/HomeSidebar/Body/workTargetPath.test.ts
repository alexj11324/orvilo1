import { describe, expect, it } from 'vitest';

import { workTargetPath } from './workTargetPath';

describe('workTargetPath', () => {
  it('maps each work type to its live surface', () => {
    expect(workTargetPath('task', 'T-1', 'Ship it')).toBe('/task/T-1/ship-it');
    expect(workTargetPath('project', 'p1')).toBe('/project/p1');
    expect(workTargetPath('savedView', 'v1')).toBe('/views/v1');
    expect(workTargetPath('team', 'team1')).toBe('/teams/team1');
  });

  it('does not invent a destination for unknown types', () => {
    expect(workTargetPath('agent', 'a1')).toBe('/');
  });
});
