import { describe, expect, it, vi } from 'vitest';

import type { LinearRemoteResourceError } from './provider';
import {
  LinearGraphqlIssueProvider,
  LinearIssueNotFoundError,
  LinearScopeValidationError,
  normalizeLinearIssue,
  normalizeLinearRelation,
  validateLinearProjectScope,
} from './provider';

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

  it('preserves exact remote label UUIDs while distinguishing missing labels from empty labels', () => {
    const withLabels = normalizeLinearIssue({
      id: 'issue-1',
      identifier: 'ENG-1',
      labels: { nodes: [{ id: 'label-2' }, { id: 'label-1' }] },
      title: 'Issue',
    });
    const withoutLabels = normalizeLinearIssue({
      id: 'issue-2',
      identifier: 'ENG-2',
      title: 'Issue',
    });
    const emptyLabels = normalizeLinearIssue({
      id: 'issue-3',
      identifier: 'ENG-3',
      labels: { nodes: [] },
      title: 'Issue',
    });

    expect(withLabels.labelIds).toEqual(['label-2', 'label-1']);
    expect(withoutLabels).not.toHaveProperty('labelIds');
    expect(emptyLabels.labelIds).toEqual([]);
  });

  it('rejects a provider response without stable identity fields', () => {
    expect(() => normalizeLinearIssue({ id: 'issue-1', title: 'Missing identifier' })).toThrow(
      'missing identity fields',
    );
  });

  it('distinguishes a missing remote issue from another GraphQL failure', async () => {
    const request = vi.fn().mockResolvedValue({
      data: { data: { issue: null } },
      status: 200,
    });
    const provider = new LinearGraphqlIssueProvider(
      {
        getAccessToken: vi.fn().mockResolvedValue('access-token'),
      },
      request,
    );

    await expect(provider.getIssue('missing-issue')).rejects.toBeInstanceOf(
      LinearIssueNotFoundError,
    );
  });

  it('reports Linear schema errors even when GraphQL responds with HTTP 400', async () => {
    const provider = new LinearGraphqlIssueProvider(
      { getAccessToken: vi.fn().mockResolvedValue('access-token') },
      vi.fn().mockResolvedValue({
        data: { errors: [{ message: 'Cannot query field "unknownField" on type "Team".' }] },
        status: 400,
      }),
    );

    await expect(provider.listTeams()).rejects.toThrow(
      'Cannot query field "unknownField" on type "Team".',
    );
  });

  it('passes a preallocated UUID and preserves the issue description', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        data: {
          issueCreate: {
            issue: {
              description: 'Body',
              id: 'issue-1',
              identifier: 'ENG-1',
              project: { id: 'project-1' },
              title: 'Issue',
            },
            success: true,
          },
        },
      },
      status: 200,
    });
    const provider = new LinearGraphqlIssueProvider(
      { getAccessToken: vi.fn().mockResolvedValue('access-token') },
      request,
    );

    await expect(
      provider.createIssue({
        description: 'Body',
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId: 'project-1',
        teamId: 'team-1',
        title: 'Issue',
      }),
    ).resolves.toMatchObject({ description: 'Body' });

    const variables = request.mock.calls[0][1].variables;
    expect(variables.input).toEqual({
      description: 'Body',
      id: '550e8400-e29b-41d4-a716-446655440000',
      projectId: 'project-1',
      teamId: 'team-1',
      title: 'Issue',
    });
  });

  it('passes the cursor through the paginated issue query', async () => {
    const request = vi.fn().mockResolvedValue({
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
    const auth = { getAccessToken: vi.fn().mockResolvedValue('access-token') };
    const provider = new LinearGraphqlIssueProvider(auth, request);

    await expect(provider.listIssues('project-1', 25, 'cursor-1')).resolves.toEqual({
      endCursor: 'cursor-2',
      hasNextPage: true,
      issues: [expect.objectContaining({ id: 'issue-1', projectId: 'project-1' })],
    });
    expect(request).toHaveBeenCalledWith(
      'access-token',
      expect.objectContaining({
        variables: { after: 'cursor-1', first: 25, projectId: 'project-1' },
      }),
    );
  });

  it('rejects a project or team scope that is not returned by the installation token', () => {
    expect(() =>
      validateLinearProjectScope({
        organizationId: 'org-1',
        projectId: 'project-1',
        projects: [
          { id: 'project-1', name: 'Project', organizationId: 'org-1', teamIds: ['team-private'] },
        ],
        teams: [
          {
            id: 'team-private',
            key: 'SEC',
            name: 'Security',
            organizationId: 'org-1',
            visibility: 'private',
          },
        ],
      }),
    ).toThrow(LinearScopeValidationError);
  });

  it('accepts only public teams belonging to the selected organization', () => {
    expect(
      validateLinearProjectScope({
        defaultTeamId: 'team-public',
        organizationId: 'org-1',
        projectId: 'project-1',
        projects: [
          { id: 'project-1', name: 'Project', organizationId: 'org-1', teamIds: ['team-public'] },
        ],
        teams: [
          {
            id: 'team-public',
            key: 'ENG',
            name: 'Engineering',
            organizationId: 'org-1',
            visibility: 'public',
          },
        ],
      }),
    ).toEqual({ teamIds: ['team-public'] });
  });

  it('exposes the installed organization catalog including private teams for the worker policy', async () => {
    const request = vi.fn().mockImplementation(async (_token, body: { query: string }) => {
      if (body.query.includes('ListOrganization ')) {
        return {
          data: {
            data: {
              organization: { id: 'org-1', name: 'Installed', urlKey: 'installed' },
            },
          },
          status: 200,
        };
      }
      if (body.query.includes('ListProjects')) {
        return {
          data: {
            data: {
              projects: {
                nodes: [
                  {
                    id: 'project-1',
                    name: 'Visible project',
                    organization: { id: 'org-1' },
                    teams: {
                      nodes: [
                        { id: 'team-public', organization: { id: 'org-1' }, visibility: 'public' },
                        {
                          id: 'team-private',
                          organization: { id: 'org-1' },
                          visibility: 'private',
                        },
                      ],
                    },
                  },
                  {
                    id: 'project-2',
                    name: 'Other project',
                    organization: { id: 'org-2' },
                    teams: { nodes: [] },
                  },
                ],
              },
            },
          },
          status: 200,
        };
      }
      if (body.query.includes('ListTeams')) {
        return {
          data: {
            data: {
              teams: {
                nodes: [
                  {
                    id: 'team-public',
                    key: 'ENG',
                    name: 'Engineering',
                    organization: { id: 'org-1' },
                    states: {
                      nodes: [{ id: 'state-1', name: 'Todo', position: 1, type: 'unstarted' }],
                    },
                    visibility: 'public',
                  },
                  {
                    id: 'team-private',
                    key: 'SEC',
                    name: 'Security',
                    organization: { id: 'org-1' },
                    states: { nodes: [{ id: 'state-private', name: 'Todo', position: 1 }] },
                    visibility: 'private',
                  },
                  {
                    id: 'team-other',
                    key: 'OPS',
                    name: 'Other',
                    organization: { id: 'org-2' },
                    states: { nodes: [] },
                    visibility: 'public',
                  },
                ],
              },
            },
          },
          status: 200,
        };
      }
      return {
        data: {
          data: {
            organization: {
              id: 'org-1',
              users: { nodes: [{ id: 'member-1', name: 'Ada' }, { id: 'member-2' }] },
            },
          },
        },
        status: 200,
      };
    });
    const provider = new LinearGraphqlIssueProvider(
      { getAccessToken: vi.fn().mockResolvedValue('access-token') },
      request,
      'org-1',
    );

    await expect(provider.listOrganizations()).resolves.toEqual([
      { id: 'org-1', name: 'Installed', url: 'installed' },
    ]);
    await expect(provider.listProjects()).resolves.toEqual([
      {
        id: 'project-1',
        name: 'Visible project',
        organizationId: 'org-1',
        state: null,
        teamIds: ['team-public'],
      },
      {
        id: 'project-2',
        name: 'Other project',
        organizationId: 'org-1',
        state: null,
        teamIds: [],
      },
    ]);
    await expect(provider.listTeams()).resolves.toEqual([
      {
        cycles: [],
        id: 'team-public',
        key: 'ENG',
        name: 'Engineering',
        organizationId: 'org-1',
        visibility: 'public',
        workflowStates: [
          {
            id: 'state-1',
            name: 'Todo',
            position: 1,
            teamId: 'team-public',
            type: 'unstarted',
          },
        ],
      },
      // Private teams remain visible to the provider; the sync scope's
      // privateTeamPolicy (import_restricted | skip) is applied by the worker.
      {
        cycles: [],
        id: 'team-private',
        key: 'SEC',
        name: 'Security',
        organizationId: 'org-1',
        visibility: 'private',
        workflowStates: [
          {
            id: 'state-private',
            name: 'Todo',
            position: 1,
            teamId: 'team-private',
            type: null,
          },
        ],
      },
    ]);
    await expect(provider.listMembers()).resolves.toEqual([{ id: 'member-1', name: 'Ada' }]);
  });

  it('walks every catalog cursor, including nested workflow states and members', async () => {
    const request = vi.fn().mockImplementation(
      async (
        _token,
        body: {
          query: string;
          variables?: Record<string, unknown>;
        },
      ) => {
        const after = body.variables?.after ?? null;
        if (body.query.includes('ListProjectTeams')) {
          return {
            data: {
              data: {
                project: {
                  teams: {
                    nodes: [{ id: 'team-2', organization: { id: 'org-1' }, visibility: 'public' }],
                    pageInfo: { endCursor: null, hasNextPage: false },
                  },
                },
              },
            },
            status: 200,
          };
        }
        if (body.query.includes('ListTeamStates')) {
          return {
            data: {
              data: {
                team: {
                  states: {
                    nodes: [{ id: 'state-2', name: 'Done', position: 2, type: 'completed' }],
                    pageInfo: { endCursor: null, hasNextPage: false },
                  },
                },
              },
            },
            status: 200,
          };
        }
        if (body.query.includes('ListProjects')) {
          const secondPage = after === 'projects-cursor';
          return {
            data: {
              data: {
                projects: {
                  nodes: [
                    {
                      id: secondPage ? 'project-2' : 'project-1',
                      name: secondPage ? 'Second project' : 'First project',
                      organization: { id: 'org-1' },
                      state: null,
                      teams: {
                        nodes: secondPage
                          ? [{ id: 'team-3', organization: { id: 'org-1' }, visibility: 'public' }]
                          : [{ id: 'team-1', organization: { id: 'org-1' }, visibility: 'public' }],
                        pageInfo: secondPage
                          ? { endCursor: null, hasNextPage: false }
                          : { endCursor: 'project-teams-cursor', hasNextPage: true },
                      },
                    },
                  ],
                  pageInfo: secondPage
                    ? { endCursor: null, hasNextPage: false }
                    : { endCursor: 'projects-cursor', hasNextPage: true },
                },
              },
            },
            status: 200,
          };
        }
        if (body.query.includes('ListTeams')) {
          const secondPage = after === 'teams-cursor';
          return {
            data: {
              data: {
                teams: {
                  nodes: [
                    {
                      id: secondPage ? 'team-2' : 'team-1',
                      key: secondPage ? 'OPS' : 'ENG',
                      name: secondPage ? 'Operations' : 'Engineering',
                      organization: { id: 'org-1' },
                      states: {
                        nodes: secondPage
                          ? [{ id: 'state-3', name: 'Todo', position: 1, type: 'unstarted' }]
                          : [{ id: 'state-1', name: 'In Progress', position: 1, type: 'started' }],
                        pageInfo: secondPage
                          ? { endCursor: null, hasNextPage: false }
                          : { endCursor: 'states-cursor', hasNextPage: true },
                      },
                      visibility: 'public',
                    },
                  ],
                  pageInfo: secondPage
                    ? { endCursor: null, hasNextPage: false }
                    : { endCursor: 'teams-cursor', hasNextPage: true },
                },
              },
            },
            status: 200,
          };
        }
        const secondPage = after === 'members-cursor';
        return {
          data: {
            data: {
              organization: {
                id: 'org-1',
                users: {
                  nodes: [
                    secondPage
                      ? { id: 'member-2', name: 'Grace' }
                      : { id: 'member-1', name: 'Ada' },
                  ],
                  pageInfo: secondPage
                    ? { endCursor: null, hasNextPage: false }
                    : { endCursor: 'members-cursor', hasNextPage: true },
                },
              },
            },
          },
          status: 200,
        };
      },
    );
    const provider = new LinearGraphqlIssueProvider(
      { getAccessToken: vi.fn().mockResolvedValue('access-token') },
      request,
      'org-1',
    );

    await expect(provider.listProjects()).resolves.toEqual([
      expect.objectContaining({ id: 'project-1', teamIds: ['team-1', 'team-2'] }),
      expect.objectContaining({ id: 'project-2', teamIds: ['team-3'] }),
    ]);
    await expect(provider.listTeams()).resolves.toEqual([
      expect.objectContaining({
        id: 'team-1',
        workflowStates: expect.arrayContaining([
          expect.objectContaining({ id: 'state-1' }),
          expect.objectContaining({ id: 'state-2' }),
        ]),
      }),
      expect.objectContaining({ id: 'team-2' }),
    ]);
    await expect(provider.listMembers()).resolves.toEqual([
      { id: 'member-1', name: 'Ada' },
      { id: 'member-2', name: 'Grace' },
    ]);

    expect(request).toHaveBeenCalledWith(
      'access-token',
      expect.objectContaining({
        variables: { after: 'project-teams-cursor', projectId: 'project-1' },
      }),
    );
    expect(request).toHaveBeenCalledWith(
      'access-token',
      expect.objectContaining({ variables: { after: 'states-cursor', teamId: 'team-1' } }),
    );
    expect(request).toHaveBeenCalledWith(
      'access-token',
      expect.objectContaining({ variables: { after: 'members-cursor' } }),
    );
  });

  it('round-trips explicitly supplied label IDs through the GraphQL update input', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        data: {
          issueUpdate: {
            issue: {
              id: 'issue-1',
              identifier: 'ENG-1',
              labels: { nodes: [{ id: 'label-2' }, { id: 'label-1' }] },
              title: 'Issue',
            },
            success: true,
          },
        },
      },
      status: 200,
    });
    const provider = new LinearGraphqlIssueProvider(
      {
        getAccessToken: vi.fn().mockResolvedValue('access-token'),
      },
      request,
    );

    await expect(
      provider.updateIssue('issue-1', { labelIds: ['label-1', 'label-2'] }),
    ).resolves.toMatchObject({
      labelIds: ['label-2', 'label-1'],
    });
    expect(request).toHaveBeenCalledWith(
      'access-token',
      expect.objectContaining({
        variables: { id: 'issue-1', input: { labelIds: ['label-1', 'label-2'] } },
      }),
    );
  });
});

describe('normalizeLinearRelation', () => {
  it('keeps blocks direction as blocker to blocked issue', () => {
    expect(
      normalizeLinearRelation({
        id: 'relation-1',
        issue: { id: 'blocker-a' },
        relatedIssue: { id: 'blocked-b' },
        type: 'blocks',
      }),
    ).toMatchObject({
      kind: 'blocks',
      sourceIssueId: 'blocker-a',
      targetIssueId: 'blocked-b',
    });
  });
});

it('classifies a provider 401 as a reauthorization boundary', async () => {
  const request = vi.fn().mockResolvedValue({ data: {}, status: 401 });
  const provider = new LinearGraphqlIssueProvider(
    { getAccessToken: vi.fn().mockResolvedValue('access-token') },
    request,
  );

  await expect(provider.getIssue('issue-401')).rejects.toMatchObject({
    name: 'LinearRemoteAuthError',
    resource: 'issue',
    resourceId: 'issue-401',
    status: 401,
  });
});

it('keeps a resource-level 403 out of installation failure state', async () => {
  const request = vi.fn().mockResolvedValue({ data: {}, status: 403 });
  const markProviderFailure = vi.fn();
  const provider = new LinearGraphqlIssueProvider(
    { getAccessToken: vi.fn().mockResolvedValue('access-token'), markProviderFailure },
    request,
  );

  await expect(provider.getIssue('private-issue')).rejects.toMatchObject({
    name: 'LinearRemoteResourceError',
    reason: 'forbidden',
    resource: 'issue',
    resourceId: 'private-issue',
  } satisfies Partial<LinearRemoteResourceError>);
  expect(markProviderFailure).not.toHaveBeenCalled();
});

it('passes preallocated UUIDv4 values to comment and relation creates', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      data: {
        data: {
          commentCreate: {
            comment: { body: 'Comment', id: 'comment-1', issue: { id: 'issue-1' } },
            success: true,
          },
        },
      },
      status: 200,
    })
    .mockResolvedValueOnce({
      data: {
        data: {
          issueRelationCreate: {
            issueRelation: {
              id: 'relation-1',
              issue: { id: 'issue-1' },
              relatedIssue: { id: 'issue-2' },
              type: 'blocks',
            },
            success: true,
          },
        },
      },
      status: 200,
    });
  const provider = new LinearGraphqlIssueProvider(
    { getAccessToken: vi.fn().mockResolvedValue('access-token') },
    request,
  );
  const commentId = '550e8400-e29b-41d4-a716-446655440003';
  const relationId = '550e8400-e29b-41d4-a716-446655440004';

  await provider.createComment({ body: 'Comment', id: commentId, issueId: 'issue-1' });
  await provider.createRelation({
    id: relationId,
    kind: 'blocks',
    sourceIssueId: 'issue-1',
    targetIssueId: 'issue-2',
  });

  expect(request.mock.calls[0][1].variables.input.id).toBe(commentId);
  expect(request.mock.calls[1][1].variables.input.id).toBe(relationId);
});
