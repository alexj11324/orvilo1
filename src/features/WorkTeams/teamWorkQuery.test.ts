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

  it('groups Team work on the server when the board layout is requested', () => {
    expect(teamTaskQuery('team-1', ALL_TEAM_CYCLES, false, 'board')).toMatchObject({
      groupBy: 'workflowCategory',
      layout: 'board',
    });
    expect(teamTaskQuery('team-1').layout).toBe('list');
    expect(teamTaskQuery('team-1').groupBy).toBe('status');
  });

  it('adds a cycleId eq predicate for an existing cycle', () => {
    expect(teamTriageQuery('team-1', 'cycle-9').filter?.all).toContainEqual({
      field: 'cycleId',
      op: 'eq',
      value: 'cycle-9',
    });
  });

  it('maps the All / Active / Backlog issue scopes onto workflow categories', () => {
    // all: no extra category predicate — completed/canceled stay included.
    expect(teamTaskQuery('team-1', ALL_TEAM_CYCLES, false, 'list', 'all').filter?.all).toEqual([
      { field: 'teamId', op: 'eq', value: 'team-1' },
    ]);
    // active: unstarted + started categories only.
    expect(
      teamTaskQuery('team-1', ALL_TEAM_CYCLES, false, 'list', 'active').filter?.all,
    ).toContainEqual({
      field: 'workflowCategory',
      op: 'in',
      value: ['todo', 'in_progress', 'in_review'],
    });
    // backlog: backlog category only.
    expect(
      teamTaskQuery('team-1', ALL_TEAM_CYCLES, false, 'list', 'backlog').filter?.all,
    ).toContainEqual({ field: 'workflowCategory', op: 'eq', value: 'backlog' });
  });
});
