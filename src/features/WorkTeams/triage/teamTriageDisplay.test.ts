import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TEAM_TRIAGE_DISPLAY,
  patchTeamTriageParams,
  readTeamTriageUrlState,
  resetTeamTriageDisplayParams,
  teamTriageSort,
} from './teamTriageDisplay';

describe('teamTriageSort', () => {
  it('leaves the default queue order to the server', () => {
    expect(teamTriageSort({ direction: 'asc', ordering: 'addedToTriage' })).toBeUndefined();
  });

  it('maps each ordering to its sort field with an id tie-breaker', () => {
    expect(teamTriageSort({ direction: 'desc', ordering: 'addedToTriage' })).toEqual([
      { direction: 'desc', field: 'createdAt' },
      { direction: 'asc', field: 'id' },
    ]);
    expect(teamTriageSort({ direction: 'desc', ordering: 'priority' })).toEqual([
      { direction: 'desc', field: 'priority' },
      { direction: 'asc', field: 'id' },
    ]);
    expect(teamTriageSort({ direction: 'asc', ordering: 'updated' })).toEqual([
      { direction: 'asc', field: 'updatedAt' },
      { direction: 'asc', field: 'id' },
    ]);
  });
});

describe('teamTriageUrlState', () => {
  it('parses defaults from a clean params object', () => {
    expect(readTeamTriageUrlState(new URLSearchParams('tab=triage'))).toEqual(
      DEFAULT_TEAM_TRIAGE_DISPLAY,
    );
  });

  it('round-trips non-default values and drops them again at defaults', () => {
    const dirty = patchTeamTriageParams(new URLSearchParams('tab=triage'), {
      direction: 'desc',
      ordering: 'priority',
      showId: false,
    });
    expect(dirty.get('tab')).toBe('triage');
    expect(dirty.get('triageOrdering')).toBe('priority');
    expect(dirty.get('triageDir')).toBe('desc');
    expect(dirty.get('triageId')).toBe('0');
    expect(readTeamTriageUrlState(dirty)).toEqual({
      direction: 'desc',
      ordering: 'priority',
      showId: false,
    });

    const clean = patchTeamTriageParams(dirty, {
      direction: 'asc',
      ordering: 'addedToTriage',
      showId: true,
    });
    expect(clean.get('triageOrdering')).toBeNull();
    expect(clean.get('triageDir')).toBeNull();
    expect(clean.get('triageId')).toBeNull();
    expect(clean.get('tab')).toBe('triage');
  });

  it('ignores malformed params and leaves foreign params untouched', () => {
    const params = new URLSearchParams(
      'tab=triage&scope=active&triageOrdering=bogus&triageDir=sideways&triageId=1',
    );
    expect(readTeamTriageUrlState(params)).toEqual({
      direction: 'asc',
      ordering: 'addedToTriage',
      showId: true,
    });
    const reset = resetTeamTriageDisplayParams(params);
    expect(reset.get('tab')).toBe('triage');
    expect(reset.get('scope')).toBe('active');
    expect(reset.get('triageOrdering')).toBeNull();
    expect(reset.get('triageDir')).toBeNull();
    expect(reset.get('triageId')).toBeNull();
  });
});
