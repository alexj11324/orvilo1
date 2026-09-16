import { describe, expect, it, vi } from 'vitest';

import { LinearGraphqlIssueProvider, normalizeLinearIssue } from './provider';

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

  it('passes the cursor through the paginated issue query', async () => {
    const proxyOAuthRequest = vi.fn().mockResolvedValue({
      data: {
        data: {
          issues: {
            nodes: [
              {
                id: 'issue-1',
                identifier: 'ENG-1',
                project: { id: 'project-1' },
                title: 'Issue',
              },
            ],
            pageInfo: { endCursor: 'cursor-2', hasNextPage: true },
          },
        },
      },
      status: 200,
    });
    const provider = new LinearGraphqlIssueProvider({ proxyOAuthRequest } as never);

    await expect(provider.listIssues('project-1', 25, 'cursor-1')).resolves.toEqual({
      endCursor: 'cursor-2',
      hasNextPage: true,
      issues: [
        expect.objectContaining({ id: 'issue-1', projectId: 'project-1' }),
      ],
    });
    expect(proxyOAuthRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          variables: { after: 'cursor-1', first: 25, projectId: 'project-1' },
        }),
      }),
    );
  });
});
