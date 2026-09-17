import { describe, expect, it, vi } from 'vitest';

import {
  LinearGraphqlIssueProvider,
  LinearScopeValidationError,
  normalizeLinearIssue,
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

  it('rejects a provider response without stable identity fields', () => {
    expect(() => normalizeLinearIssue({ id: 'issue-1', title: 'Missing identifier' })).toThrow(
      'missing identity fields',
    );
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

  it('exposes only the installed organization catalog with public teams, states, and members', async () => {
    const request = vi.fn().mockImplementation(async (_token, body: { query: string }) => {
      if (body.query.includes('ListOrganizations')) {
        return {
          data: {
            data: {
              organizations: {
                nodes: [
                  { id: 'org-1', name: 'Installed', urlKey: 'installed' },
                  { id: 'org-2', name: 'Other', urlKey: 'other' },
                ],
              },
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
    ]);
    await expect(provider.listTeams()).resolves.toEqual([
      {
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
    ]);
    await expect(provider.listMembers()).resolves.toEqual([{ id: 'member-1', name: 'Ada' }]);
  });
});
