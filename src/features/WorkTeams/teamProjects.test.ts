import { describe, expect, it } from 'vitest';

import type { ProjectListItem } from '@/store/project/store';

import { enrichTeamProjects, summarizeProjectList, teamProjectsWorkQuery } from './teamProjects';

describe('teamProjectsWorkQuery', () => {
  it('scopes the project scan to the given team', () => {
    expect(teamProjectsWorkQuery('team_1')).toEqual({
      entityType: 'project',
      filter: { all: [{ field: 'teamId', op: 'eq', value: 'team_1' }] },
      schemaVersion: 1,
    });
  });
});

describe('enrichTeamProjects', () => {
  const teamRows = [
    { id: 'p1', name: 'One' },
    { id: 'p2', name: 'Two' },
  ];

  it('substitutes the workspace projection carrying computed columns', () => {
    const workspaceList = [
      { id: 'p1', name: 'One', progressPercent: 40, taskCount: 9 },
    ] as ProjectListItem[];

    const [first, second] = enrichTeamProjects(teamRows, workspaceList);
    expect(first).toBe(workspaceList[0]);
    // Unmatched rows keep rendering — membership is the team query's call.
    expect(second.id).toBe('p2');
  });

  it('preserves team-query order and drops nothing', () => {
    const workspaceList = [
      { id: 'p2', name: 'Two', progressPercent: 10, taskCount: 2 },
    ] as ProjectListItem[];

    expect(enrichTeamProjects(teamRows, workspaceList).map((row) => row.id)).toEqual(['p1', 'p2']);
  });

  it('passes every row through untouched when the workspace list is empty', () => {
    const merged = enrichTeamProjects(teamRows, []);
    expect(merged.map((row) => row.id)).toEqual(['p1', 'p2']);
  });
});

describe('summarizeProjectList', () => {
  it('counts health buckets in workflow order and tallies update-missing rows', () => {
    const summary = summarizeProjectList([
      { health: 'atRisk' },
      { health: 'onTrack' },
      { health: 'onTrack' },
      { health: null },
      {},
    ]);

    expect(summary.health).toEqual([
      { count: 2, state: 'onTrack' },
      { count: 1, state: 'atRisk' },
    ]);
    expect(summary.updateMissing).toBe(2);
    expect(summary.noUpdateExpected).toBe(0);
  });

  it('counts terminal-status rows under no-update-expected instead', () => {
    const summary = summarizeProjectList([
      { health: null, status: 'completed' },
      { health: 'onTrack', status: 'archived' },
      { health: null, status: 'active' },
    ]);

    expect(summary.noUpdateExpected).toBe(2);
    expect(summary.updateMissing).toBe(1);
    expect(summary.health).toEqual([]);
  });

  it('groups leads by count with the lead-less bucket last', () => {
    const summary = summarizeProjectList(
      [{ leadUserId: 'u1' }, { leadUserId: 'u2' }, { leadUserId: 'u2' }, { leadUserId: null }, {}],
      (userId) => ({ u1: 'Ada', u2: 'Ben' })[userId],
    );

    expect(summary.leads).toEqual([
      { count: 2, userId: 'u2' },
      { count: 1, userId: 'u1' },
      { count: 2, userId: null },
    ]);
  });

  it('breaks lead count ties by resolved display name', () => {
    const summary = summarizeProjectList(
      [{ leadUserId: 'u2' }, { leadUserId: 'u1' }],
      (userId) => ({ u1: 'Zed', u2: 'Ada' })[userId],
    );

    expect(summary.leads.map((lead) => lead.userId)).toEqual(['u2', 'u1']);
  });

  it('returns empty aggregates for an empty team', () => {
    expect(summarizeProjectList([])).toEqual({
      health: [],
      leads: [],
      noUpdateExpected: 0,
      updateMissing: 0,
    });
  });
});
