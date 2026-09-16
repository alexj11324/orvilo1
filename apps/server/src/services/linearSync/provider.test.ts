import { describe, expect, it } from 'vitest';

import { normalizeLinearIssue } from './provider';

describe('normalizeLinearIssue', () => {
  it('keeps the stable Linear identity and nested relations', () => {
    expect(
      normalizeLinearIssue({
        archivedAt: null,
        assignee: { id: 'user-1' },
        description: 'Description',
        id: 'issue-1',
        identifier: 'ENG-1',
        parent: { id: 'parent-1' },
        priority: 2,
        project: { id: 'project-1' },
        state: { id: 'state-1', type: 'started' },
        team: { id: 'team-1' },
        title: 'Issue',
        url: 'https://linear.app/acme/issue/ENG-1/issue',
      }),
    ).toMatchObject({
      assigneeId: 'user-1',
      id: 'issue-1',
      parentId: 'parent-1',
      projectId: 'project-1',
      stateId: 'state-1',
      stateType: 'started',
      teamId: 'team-1',
    });
  });

  it('rejects a provider response without stable identity fields', () => {
    expect(() => normalizeLinearIssue({ id: 'issue-1', title: 'Missing identifier' })).toThrow(
      'missing identity fields',
    );
  });
});
