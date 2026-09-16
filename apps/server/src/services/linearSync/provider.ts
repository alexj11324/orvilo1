import type { LinearIssueSnapshot } from '@orvilo/types';
import { isRecord } from '@orvilo/utils';

import { MarketService } from '@/server/services/market';

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  priority
  createdAt
  updatedAt
  archivedAt
  url
  parent { id }
  project { id }
  team { id }
  state { id type }
  assignee { id }
`;

const PAGE_INFO_FIELDS = `pageInfo { endCursor hasNextPage }`;
const ORGANIZATION_FIELDS = `id name url`;
const PROJECT_FIELDS = `id name state teams { nodes { id } }`;
const TEAM_FIELDS = `id key name`;

export interface LinearIssueCreateInput {
  description?: string | null;
  projectId?: string | null;
  teamId: string;
  title: string;
}

export interface LinearIssueUpdateInput {
  assigneeId?: string | null;
  description?: string | null;
  priority?: number | null;
  projectId?: string | null;
  stateId?: string | null;
  title?: string;
}

export interface LinearOrganizationSnapshot {
  id: string;
  name: string;
  url?: string | null;
}

export interface LinearProjectSnapshot {
  id: string;
  name: string;
  state?: string | null;
  teamIds: string[];
}

export interface LinearTeamSnapshot {
  id: string;
  key: string;
  name: string;
}

export interface LinearIssuePage {
  endCursor: string | null;
  hasNextPage: boolean;
  issues: LinearIssueSnapshot[];
}

export interface LinearIssueProvider {
  createIssue: (input: LinearIssueCreateInput) => Promise<LinearIssueSnapshot>;
  getIssue: (id: string) => Promise<LinearIssueSnapshot>;
  listIssues: (projectId: string, first?: number, after?: string | null) => Promise<LinearIssuePage>;
  listOrganizations: () => Promise<LinearOrganizationSnapshot[]>;
  listProjects: () => Promise<LinearProjectSnapshot[]>;
  listTeams: () => Promise<LinearTeamSnapshot[]>;
  updateIssue: (id: string, input: LinearIssueUpdateInput) => Promise<LinearIssueSnapshot>;
}

const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const nestedId = (value: unknown): string | null =>
  isRecord(value) ? stringValue(value.id) : null;

/** Convert a GraphQL Issue node into the provider-neutral sync snapshot. */
export const normalizeLinearIssue = (value: unknown): LinearIssueSnapshot => {
  if (!isRecord(value)) throw new Error('Linear API returned an invalid issue');

  const id = stringValue(value.id);
  const identifier = stringValue(value.identifier);
  const title = stringValue(value.title);
  if (!id || !identifier || !title) throw new Error('Linear API issue is missing identity fields');

  const state = isRecord(value.state) ? value.state : undefined;
  return {
    archivedAt: typeof value.archivedAt === 'string' ? value.archivedAt : null,
    assigneeId: nestedId(value.assignee),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
    description: typeof value.description === 'string' ? value.description : null,
    id,
    identifier,
    parentId: nestedId(value.parent),
    priority: typeof value.priority === 'number' ? value.priority : null,
    projectId: nestedId(value.project),
    stateId: nestedId(state),
    stateType: state ? stringValue(state.type) : null,
    teamId: nestedId(value.team),
    title,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    url: typeof value.url === 'string' ? value.url : null,
  };
};

const extractGraphQLData = <T>(response: { data: unknown; status: number }): T => {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Linear API returned HTTP ${response.status}`);
  }

  const body = isRecord(response.data) ? response.data : undefined;
  const errors = body?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const message = isRecord(errors[0]) ? stringValue(errors[0].message) : null;
    throw new Error(message ?? 'Linear API returned a GraphQL error');
  }

  if (!body || !isRecord(body.data)) throw new Error('Linear API response is missing data');
  return body.data as T;
};

export class LinearGraphqlIssueProvider implements LinearIssueProvider {
  private readonly marketService: MarketService;

  constructor(marketService: MarketService) {
    this.marketService = marketService;
  }

  async getIssue(id: string): Promise<LinearIssueSnapshot> {
    const response = await this.marketService.proxyOAuthRequest({
      body: {
        query: `query GetIssue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
        variables: { id },
      },
      endpoint: '/graphql',
      method: 'POST',
      provider: 'linear',
    });
    const data = extractGraphQLData<{ issue: unknown }>(response);
    return normalizeLinearIssue(data.issue);
  }

  async listIssues(projectId: string, first = 50, after?: string | null): Promise<LinearIssuePage> {
    const response = await this.marketService.proxyOAuthRequest({
      body: {
        query: `query ListIssues($projectId: String!, $first: Int!, $after: String) {
          issues(filter: { project: { id: { eq: $projectId } } }, first: $first, after: $after) {
            nodes { ${ISSUE_FIELDS} }
            ${PAGE_INFO_FIELDS}
          }
        }`,
        variables: { after: after ?? null, first, projectId },
      },
      endpoint: '/graphql',
      method: 'POST',
      provider: 'linear',
    });
    const data = extractGraphQLData<{
      issues: { nodes: unknown[]; pageInfo: { endCursor?: string | null; hasNextPage?: boolean } };
    }>(response);
    return {
      endCursor: data.issues.pageInfo.endCursor ?? null,
      hasNextPage: data.issues.pageInfo.hasNextPage === true,
      issues: data.issues.nodes.map(normalizeLinearIssue),
    };
  }

  async listOrganizations(): Promise<LinearOrganizationSnapshot[]> {
    const response = await this.marketService.proxyOAuthRequest({
      body: {
        query: `query ListOrganizations { organizations { nodes { ${ORGANIZATION_FIELDS} } } }`,
      },
      endpoint: '/graphql',
      method: 'POST',
      provider: 'linear',
    });
    const data = extractGraphQLData<{ organizations: { nodes: unknown[] } }>(response);
    return data.organizations.nodes.flatMap((value) => {
      if (!isRecord(value)) return [];
      const id = stringValue(value.id);
      const name = stringValue(value.name);
      if (!id || !name) return [];
      return [{ id, name, url: typeof value.url === 'string' ? value.url : null }];
    });
  }

  async listProjects(): Promise<LinearProjectSnapshot[]> {
    const response = await this.marketService.proxyOAuthRequest({
      body: {
        query: `query ListProjects { projects { nodes { ${PROJECT_FIELDS} } } }`,
      },
      endpoint: '/graphql',
      method: 'POST',
      provider: 'linear',
    });
    const data = extractGraphQLData<{ projects: { nodes: unknown[] } }>(response);
    return data.projects.nodes.flatMap((value) => {
      if (!isRecord(value)) return [];
      const id = stringValue(value.id);
      const name = stringValue(value.name);
      if (!id || !name) return [];
      const teams = isRecord(value.teams) && Array.isArray(value.teams.nodes) ? value.teams.nodes : [];
      return [
        {
          id,
          name,
          state: typeof value.state === 'string' ? value.state : null,
          teamIds: teams.flatMap((team) => {
            const teamId = isRecord(team) ? stringValue(team.id) : null;
            return teamId ? [teamId] : [];
          }),
        },
      ];
    });
  }

  async listTeams(): Promise<LinearTeamSnapshot[]> {
    const response = await this.marketService.proxyOAuthRequest({
      body: {
        query: `query ListTeams { teams { nodes { ${TEAM_FIELDS} } } }`,
      },
      endpoint: '/graphql',
      method: 'POST',
      provider: 'linear',
    });
    const data = extractGraphQLData<{ teams: { nodes: unknown[] } }>(response);
    return data.teams.nodes.flatMap((value) => {
      if (!isRecord(value)) return [];
      const id = stringValue(value.id);
      const key = stringValue(value.key);
      const name = stringValue(value.name);
      return id && key && name ? [{ id, key, name }] : [];
    });
  }

  async createIssue(input: LinearIssueCreateInput): Promise<LinearIssueSnapshot> {
    const response = await this.marketService.proxyOAuthRequest({
      body: {
        query: `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } } }`,
        variables: { input },
      },
      endpoint: '/graphql',
      method: 'POST',
      provider: 'linear',
    });
    const data = extractGraphQLData<{ issueCreate: { issue?: unknown; success?: boolean } }>(
      response,
    );
    if (!data.issueCreate?.success || !data.issueCreate.issue) {
      throw new Error('Linear issueCreate did not return an issue');
    }
    return normalizeLinearIssue(data.issueCreate.issue);
  }

  async updateIssue(id: string, input: LinearIssueUpdateInput): Promise<LinearIssueSnapshot> {
    const response = await this.marketService.proxyOAuthRequest({
      body: {
        query: `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { ${ISSUE_FIELDS} } } }`,
        variables: { id, input },
      },
      endpoint: '/graphql',
      method: 'POST',
      provider: 'linear',
    });
    const data = extractGraphQLData<{ issueUpdate: { issue?: unknown; success?: boolean } }>(
      response,
    );
    if (!data.issueUpdate?.success || !data.issueUpdate.issue) {
      throw new Error('Linear issueUpdate did not return an issue');
    }
    return normalizeLinearIssue(data.issueUpdate.issue);
  }
}

export const createLinearGraphqlIssueProvider = (input: { userId: string; workspaceId: string }) =>
  new LinearGraphqlIssueProvider(
    new MarketService({ userInfo: { userId: input.userId, workspaceId: input.workspaceId } }),
  );
