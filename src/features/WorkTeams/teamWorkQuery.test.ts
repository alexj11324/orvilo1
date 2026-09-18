import { describe, expect, it } from 'vitest';

import { ALL_TEAM_CYCLES, teamTaskQuery, teamTriageQuery } from './teamWorkQuery';

describe('teamWorkQuery', () => {
  it('omits cycleId until a real cycle is selected', () => {
    expect(teamTriageQuery('team-1').filter?.all).toEqual([
      { field: 'teamId', op: 'eq', value: 'team-1' },
      { field: 'triageStatus', op: 'eq', value: 'untriaged' },
    ]);
    expect(teamTaskQuery('team-1', ALL_TEAM_CYCLES).filter?.all).toEqual([
      { field: 'teamId', op: 'eq', value: 'team-1' },
    ]);
  });

  it('ANDs projectId isNull without assigning a default project', () => {
    expect(teamTaskQuery('team-1', ALL_TEAM_CYCLES, true).filter?.all).toEqual([
      { field: 'teamId', op: 'eq', value: 'team-1' },
      { field: 'projectId', op: 'isNull' },
    ]);
    expect(JSON.stringify(teamTaskQuery('team-1', ALL_TEAM_CYCLES, true))).not.toMatch(
      /"projectId":"[^"]+"/,
    );
  });

  it('adds a cycleId eq predicate for an existing cycle', () => {
    expect(teamTriageQuery('team-1', 'cycle-9').filter?.all).toContainEqual({
      field: 'cycleId',
      op: 'eq',
      value: 'cycle-9',
    });
  });
});
