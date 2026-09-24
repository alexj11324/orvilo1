import { TRIAGE_EXCLUSION_FILTER } from '@orvilo/types';
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

  it('keeps untriaged issues out of team scopes only while triage is enabled', () => {
    // Triage-capable teams park new issues in `untriaged`; they must not leak
    // into All/Active/Backlog lists or the `wf:backlog` board column. The
    // exclusion is NULL-inclusive so legacy rows (NULL triage_status) stay
    // visible — a bare `neq` would drop them too.
    for (const scope of ['all', 'active', 'backlog'] as const) {
      for (const layout of ['list', 'board'] as const) {
        expect(
          teamTaskQuery('team-1', ALL_TEAM_CYCLES, false, layout, scope, true).filter?.all,
        ).toContainEqual(TRIAGE_EXCLUSION_FILTER);
      }
    }
    // Non-triage teams never produce untriaged rows — no predicate is added.
    expect(
      teamTaskQuery('team-1', ALL_TEAM_CYCLES, false, 'list', 'all', false).filter?.all,
    ).toEqual([{ field: 'teamId', op: 'eq', value: 'team-1' }]);
  });

  it('nests the Add-filter builder output under filter.all without flattening', () => {
    const userFilter = {
      any: [
        { field: 'priority' as const, op: 'eq' as const, value: 1 },
        { field: 'priority' as const, op: 'eq' as const, value: 2 },
      ],
    };
    const query = teamTaskQuery('team-1', ALL_TEAM_CYCLES, false, 'list', 'all', false, {
      filter: userFilter,
    });
    // The implicit team predicate stays first; the user's `any` subtree is
    // preserved verbatim as a nested filter node.
    expect(query.filter?.all).toEqual([{ field: 'teamId', op: 'eq', value: 'team-1' }, userFilter]);
  });

  it('lets display options override grouping, sort and board sort mode', () => {
    // Client-bucketed list groupings fetch the flat feed.
    expect(
      teamTaskQuery('team-1', ALL_TEAM_CYCLES, false, 'list', 'all', false, { groupBy: 'none' })
        .groupBy,
    ).toBe('none');
    // Board grouping follows the display choice instead of the layout default.
    expect(
      teamTaskQuery('team-1', ALL_TEAM_CYCLES, false, 'board', 'all', false, {
        groupBy: 'status',
      }).groupBy,
    ).toBe('status');
    const sort = [
      { direction: 'desc' as const, field: 'updatedAt' as const },
      { direction: 'asc' as const, field: 'id' as const },
    ];
    const board = teamTaskQuery('team-1', ALL_TEAM_CYCLES, false, 'board', 'all', false, {
      sort,
      sortMode: 'field',
    });
    expect(board.sort).toEqual(sort);
    expect(board.sortMode).toBe('field');
    const list = teamTaskQuery('team-1', ALL_TEAM_CYCLES, false, 'list', 'all', false, { sort });
    expect(list.sort).toEqual(sort);
    // `sortMode` only applies to boards — a sorted list stays manual-free.
    expect(list.sortMode).toBeUndefined();
  });
});
