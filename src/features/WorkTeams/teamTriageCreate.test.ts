import { describe, expect, it, vi } from 'vitest';

import { teamTriageCreateOptions } from './teamTriageCreate';
import { teamTriageQuery } from './teamWorkQuery';

describe('teamTriageCreateOptions', () => {
  it('binds creation to the current team, refreshes it, and selects its untriaged queue', () => {
    const onCreated = vi.fn();
    const options = teamTriageCreateOptions('team-1', onCreated);

    expect(options).toMatchObject({ teamId: 'team-1' });
    options.onCreated();
    expect(onCreated).toHaveBeenCalledOnce();
    expect(teamTriageQuery(options.teamId).filter?.all).toContainEqual({
      field: 'triageStatus',
      op: 'eq',
      value: 'untriaged',
    });
  });
});
