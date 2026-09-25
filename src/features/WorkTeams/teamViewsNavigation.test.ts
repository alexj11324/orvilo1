import { describe, expect, it } from 'vitest';

import { nextTeamViewsSearch, readTeamViewsSearch } from './teamViewsNavigation';

describe('team Views navigation', () => {
  it('keeps Issues and Projects as distinct directory states', () => {
    expect(readTeamViewsSearch('?tab=views')).toEqual({ entityType: 'task', creating: false });
    expect(readTeamViewsSearch('?tab=views&entity=project')).toEqual({
      entityType: 'project',
      creating: false,
    });
  });

  it('opens a full-page draft and cancels back to its source directory', () => {
    const opened = nextTeamViewsSearch('?tab=views&entity=project', { creating: true });
    expect(readTeamViewsSearch(`?${opened}`)).toEqual({ entityType: 'project', creating: true });

    const cancelled = nextTeamViewsSearch(`?${opened}`, { creating: false });
    expect(readTeamViewsSearch(`?${cancelled}`)).toEqual({
      entityType: 'project',
      creating: false,
    });
    expect(cancelled.get('tab')).toBe('views');
  });

  it('switches preview entity while staying in the draft', () => {
    const switched = nextTeamViewsSearch('?tab=views&new=1', { entityType: 'project' });
    expect(readTeamViewsSearch(`?${switched}`)).toEqual({ entityType: 'project', creating: true });
  });
});
