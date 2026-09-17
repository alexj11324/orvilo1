import type { LinearIssueSnapshot } from '@orvilo/types';
import { isRecord } from '@orvilo/utils';

import type { LobeChatDatabase } from '@/database/type';

import { createLinearInstallationAuth, type LinearInstallationAuthOptions } from './auth';
import { LINEAR_GRAPHQL_URL } from './oauth';

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
const ORGANIZATION_FIELDS = `id name urlKey`;
const PROJECT_FIELDS = `id name state organization { id } teams { nodes { id visibility organization { id } } }`;
const TEAM_FIELDS = `id key name visibility organization { id } states(first: 100) { nodes { id name type position } }`;

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
  organizationId: string | null;
  state?: string | null;
  teamIds: string[];
}

export interface LinearTeamSnapshot {
  id: string;
  key: string;
  name: string;
  organizationId: string | null;
  visibility: string | null;
  workflowStates?: LinearWorkflowStateSnapshot[];
}

export interface LinearWorkflowStateSnapshot {
  id: string;
  name: string;
  position: number | null;
  teamId: string;
  type: string | null;
}

export interface LinearMemberSnapshot {
  id: string;
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
  listIssues: (
    projectId: string,
    first?: number,
    after?: string | null,
  ) => Promise<LinearIssuePage>;
  listMembers: () => Promise<LinearMemberSnapshot[]>;
  listOrganizations: () => Promise<LinearOrganizationSnapshot[]>;
  listProjects: () => Promise<LinearProjectSnapshot[]>;
  listTeams: () => Promise<LinearTeamSnapshot[]>;
  updateIssue: (id: string, input: LinearIssueUpdateInput) => Promise<LinearIssueSnapshot>;
  validateProjectScope?: (input: {
    defaultTeamId?: string;
    organizationId: string;
    projectId: string;
    teamIds?: string[];
  }) => Promise<{ teamIds: string[] }>;
}

export class LinearScopeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinearScopeValidationError';
  }
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

export class LinearGraphqlError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'LinearGraphqlError';
    this.status = status;
  }
}

const extractGraphQLData = <T>(response: { data: unknown; status: number }): T => {
  if (response.status < 200 || response.status >= 300) {
    throw new LinearGraphqlError(`Linear API returned HTTP ${response.status}`, response.status);
  }

  const body = isRecord(response.data) ? response.data : undefined;
  const errors = body?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const message = isRecord(errors[0]) ? stringValue(errors[0].message) : null;
    throw new LinearGraphqlError(message ?? 'Linear API returned a GraphQL error', response.status);
  }

  if (!body || !isRecord(body.data))
    throw new LinearGraphqlError('Linear API response is missing data', response.status);
  return body.data as T;
};

export type LinearGraphqlRequest = (
  accessToken: string,
  body: { query: string; variables?: Record<string, unknown> },
) => Promise<{ data: unknown; status: number }>;

const requestLinearGraphql: LinearGraphqlRequest = async (accessToken, body) => {
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    body: JSON.stringify(body),
    headers: {
      'authorization': `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  return { data: await response.json(), status: response.status };
};

export const validateLinearProjectScope = (input: {
  defaultTeamId?: string;
  organizationId: string;
  projectId: string;
  projects: LinearProjectSnapshot[];
  teamIds?: string[];
  teams: LinearTeamSnapshot[];
}): { teamIds: string[] } => {
  const project = input.projects.find((candidate) => candidate.id === input.projectId);
  if (!project || project.organizationId !== input.organizationId) {
    throw new LinearScopeValidationError(
      'Linear project is not visible in the installed organization',
    );
  }
  if (project.teamIds.length === 0) {
    throw new LinearScopeValidationError(
      'Linear project has no compatible public team scope; private projects are not supported',
    );
  }

  const requestedTeamIds = input.teamIds ?? project.teamIds;
  if (
    requestedTeamIds.length === 0 ||
    requestedTeamIds.some((id) => !project.teamIds.includes(id))
  ) {
    throw new LinearScopeValidationError(
      'Linear team scope must be a subset of the selected project teams',
    );
  }
  if (input.defaultTeamId && !requestedTeamIds.includes(input.defaultTeamId)) {
    throw new LinearScopeValidationError(
      'Linear default team must be included in the selected team scope',
    );
  }

  const teamsById = new Map(input.teams.map((team) => [team.id, team]));
  for (const teamId of requestedTeamIds) {
    const team = teamsById.get(teamId);
    if (!team || team.organizationId !== input.organizationId || team.visibility !== 'public') {
      throw new LinearScopeValidationError(
        'Private or restricted Linear teams are not supported by this installation',
      );
    }
  }

  return { teamIds: [...new Set(requestedTeamIds)] };
};

export class LinearGraphqlIssueProvider implements LinearIssueProvider {
  constructor(
    private readonly auth: {
      getAccessToken: () => Promise<string>;
      markProviderFailure?: (input: { message: string; status?: number }) => Promise<void>;
    },
    private readonly request: LinearGraphqlRequest = requestLinearGraphql,
    private readonly organizationId?: string,
  ) {}

  private isInstalledOrganization = (organizationId: string | null) =>
    !this.organizationId || organizationId === this.organizationId;

  private requestData = async <T>(body: {
    query: string;
    variables?: Record<string, unknown>;
  }): Promise<T> => {
    const accessToken = await this.auth.getAccessToken();
    try {
      return extractGraphQLData<T>(await this.request(accessToken, body));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof LinearGraphqlError ? error.status : undefined;
      if (
        status === 401 ||
        status === 403 ||
        /permission|unauthori[sz]ed|revoked|forbidden/i.test(message)
      ) {
        await this.auth.markProviderFailure?.({ message, status });
      }
      throw error;
    }
  };

  async getIssue(id: string): Promise<LinearIssueSnapshot> {
    const data = await this.requestData<{ issue: unknown }>({
      query: `query GetIssue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
      variables: { id },
    });
    return normalizeLinearIssue(data.issue);
  }

  async listIssues(projectId: string, first = 50, after?: string | null): Promise<LinearIssuePage> {
    const data = await this.requestData<{
      issues: { nodes: unknown[]; pageInfo: { endCursor?: string | null; hasNextPage?: boolean } };
    }>({
      query: `query ListIssues($projectId: String!, $first: Int!, $after: String) {
        issues(filter: { project: { id: { eq: $projectId } } }, first: $first, after: $after) {
          nodes { ${ISSUE_FIELDS} }
          ${PAGE_INFO_FIELDS}
        }
      }`,
      variables: { after: after ?? null, first, projectId },
    });
    return {
      endCursor: data.issues.pageInfo.endCursor ?? null,
      hasNextPage: data.issues.pageInfo.hasNextPage === true,
      issues: data.issues.nodes.map(normalizeLinearIssue),
    };
  }

  async listOrganizations(): Promise<LinearOrganizationSnapshot[]> {
    const data = await this.requestData<{ organizations: { nodes: unknown[] } }>({
      query: `query ListOrganizations { organizations { nodes { ${ORGANIZATION_FIELDS} } } }`,
    });
    return data.organizations.nodes.flatMap((value) => {
      if (!isRecord(value)) return [];
      const id = stringValue(value.id);
      const name = stringValue(value.name);
      if (!id || !name || !this.isInstalledOrganization(id)) return [];
      return [{ id, name, url: typeof value.urlKey === 'string' ? value.urlKey : null }];
    });
  }

  async listProjects(): Promise<LinearProjectSnapshot[]> {
    const data = await this.requestData<{ projects: { nodes: unknown[] } }>({
      query: `query ListProjects { projects { nodes { ${PROJECT_FIELDS} } } }`,
    });
    return data.projects.nodes.flatMap((value) => {
      if (!isRecord(value)) return [];
      const id = stringValue(value.id);
      const name = stringValue(value.name);
      const organizationId = nestedId(value.organization);
      if (!id || !name || !this.isInstalledOrganization(organizationId)) return [];
      const teams =
        isRecord(value.teams) && Array.isArray(value.teams.nodes) ? value.teams.nodes : [];
      return [
        {
          id,
          name,
          organizationId,
          state: typeof value.state === 'string' ? value.state : null,
          teamIds: teams.flatMap((team) => {
            if (!isRecord(team) || team.visibility !== 'public') return [];
            const teamId = stringValue(team.id);
            const teamOrganizationId = nestedId(team.organization);
            return teamId && this.isInstalledOrganization(teamOrganizationId) ? [teamId] : [];
          }),
        },
      ];
    });
  }

  async listTeams(): Promise<LinearTeamSnapshot[]> {
    const data = await this.requestData<{ teams: { nodes: unknown[] } }>({
      query: `query ListTeams { teams { nodes { ${TEAM_FIELDS} } } }`,
    });
    return data.teams.nodes.flatMap((value) => {
      if (!isRecord(value)) return [];
      const id = stringValue(value.id);
      const key = stringValue(value.key);
      const name = stringValue(value.name);
      const organizationId = nestedId(value.organization);
      if (
        !id ||
        !key ||
        !name ||
        !this.isInstalledOrganization(organizationId) ||
        value.visibility !== 'public'
      )
        return [];
      const states =
        isRecord(value.states) && Array.isArray(value.states.nodes) ? value.states.nodes : [];
      return [
        {
          id,
          key,
          name,
          organizationId,
          visibility: typeof value.visibility === 'string' ? value.visibility : null,
          workflowStates: states.flatMap((state) => {
            if (!isRecord(state)) return [];
            const stateId = stringValue(state.id);
            const stateName = stringValue(state.name);
            if (!stateId || !stateName) return [];
            return [
              {
                id: stateId,
                name: stateName,
                position: typeof state.position === 'number' ? state.position : null,
                teamId: id,
                type: stringValue(state.type),
              },
            ];
          }),
        },
      ];
    });
  }

  async listMembers(): Promise<LinearMemberSnapshot[]> {
    const data = await this.requestData<{
      organization: { id?: unknown; users?: { nodes: unknown[] } } | null;
    }>({
      query: `query ListOrganizationMembers {
        organization {
          id
          users(first: 250) { nodes { id name } }
        }
      }`,
    });
    if (!this.isInstalledOrganization(stringValue(data.organization?.id))) return [];
    const nodes = data.organization?.users?.nodes ?? [];
    return nodes.flatMap((value) => {
      if (!isRecord(value)) return [];
      const id = stringValue(value.id);
      const name = stringValue(value.name);
      return id && name ? [{ id, name }] : [];
    });
  }

  async validateProjectScope(input: {
    defaultTeamId?: string;
    organizationId: string;
    projectId: string;
    teamIds?: string[];
  }): Promise<{ teamIds: string[] }> {
    const [projects, teams] = await Promise.all([this.listProjects(), this.listTeams()]);
    return validateLinearProjectScope({ ...input, projects, teams });
  }

  async createIssue(input: LinearIssueCreateInput): Promise<LinearIssueSnapshot> {
    const data = await this.requestData<{ issueCreate: { issue?: unknown; success?: boolean } }>({
      query: `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } } }`,
      variables: { input },
    });
    if (!data.issueCreate?.success || !data.issueCreate.issue) {
      throw new Error('Linear issueCreate did not return an issue');
    }
    return normalizeLinearIssue(data.issueCreate.issue);
  }

  async updateIssue(id: string, input: LinearIssueUpdateInput): Promise<LinearIssueSnapshot> {
    const data = await this.requestData<{ issueUpdate: { issue?: unknown; success?: boolean } }>({
      query: `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { ${ISSUE_FIELDS} } } }`,
      variables: { id, input },
    });
    if (!data.issueUpdate?.success || !data.issueUpdate.issue) {
      throw new Error('Linear issueUpdate did not return an issue');
    }
    return normalizeLinearIssue(data.issueUpdate.issue);
  }
}

export const createLinearGraphqlIssueProvider = (input: {
  db: LobeChatDatabase;
  installationId: string;
  organizationId: string;
  options?: LinearInstallationAuthOptions;
  workspaceId: string;
}) =>
  new LinearGraphqlIssueProvider(
    createLinearInstallationAuth({
      db: input.db,
      installationId: input.installationId,
      options: input.options,
      workspaceId: input.workspaceId,
    }),
    undefined,
    input.organizationId,
  );
