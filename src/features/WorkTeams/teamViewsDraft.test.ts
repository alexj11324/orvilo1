import { describe, expect, it } from 'vitest';

import { newTeamViewDraft, teamViewDraftQuery } from './teamViewsDraft';

describe('team view draft query', () => {
  it('previews issues by status and projects as a flat project list', () => {
    const issues = teamViewDraftQuery(newTeamViewDraft('task', 'team-1'), 'team-1');
    const projects = teamViewDraftQuery(newTeamViewDraft('project', 'team-1'), 'team-1');

    expect(issues).toMatchObject({ entityType: 'task', groupBy: 'status', layout: 'list' });
    expect(projects).toMatchObject({ entityType: 'project', layout: 'list' });
    expect(projects.groupBy).toBeUndefined();
    expect(issues.filter).toEqual({ all: [{ field: 'teamId', op: 'eq', value: 'team-1' }] });
    expect(projects.filter).toEqual({ all: [{ field: 'teamId', op: 'eq', value: 'team-1' }] });
  });

  it('keeps a second axis on a task list and on a board', () => {
    const list = teamViewDraftQuery(
      { ...newTeamViewDraft('task', 'team-1'), subGroupBy: 'priority' },
      'team-1',
    );
    const board = teamViewDraftQuery(
      {
        ...newTeamViewDraft('task', 'team-1'),
        groupBy: 'status',
        layout: 'board',
        subGroupBy: 'assignee',
      },
      'team-1',
    );
    const flat = teamViewDraftQuery(
      { ...newTeamViewDraft('task', 'team-1'), groupBy: 'none', subGroupBy: 'priority' },
      'team-1',
    );

    expect(list.subGroupBy).toBe('priority');
    expect(board.subGroupBy).toBe('assignee');
    expect(flat.groupBy).toBeUndefined();
    expect(flat.subGroupBy).toBeUndefined();
  });

  it('intersects an added filter with the fixed team scope', () => {
    const draft = newTeamViewDraft('task', 'team-1');
    draft.builder = {
      any: [],
      rows: [],
      slots: [{ type: 'node', node: { field: 'priority', op: 'eq', value: 2 } }],
    };

    expect(teamViewDraftQuery(draft, 'team-1').filter).toEqual({
      all: [
        { field: 'teamId', op: 'eq', value: 'team-1' },
        { all: [{ field: 'priority', op: 'eq', value: 2 }] },
      ],
    });
  });
});
