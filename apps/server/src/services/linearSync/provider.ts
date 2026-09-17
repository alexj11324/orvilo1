import type {
  LinearCommentSnapshot,
  LinearIssuePage,
  LinearIssueSnapshot,
  LinearMemberSnapshot,
  LinearOrganizationSnapshot,
  LinearProjectSnapshot,
  LinearRelationKind,
  LinearRelationSnapshot,
  LinearTeamSnapshot,
} from '@orvilo/types';
import { isRecord } from '@orvilo/utils';

import type { LobeChatDatabase } from '@/database/type';

import { createLinearInstallationAuth, type LinearInstallationAuthOptions } from './auth';
import { LINEAR_GRAPHQL_URL } from './oauth';

// Canonical snapshot shapes live in @orvilo/types (frozen WM-01 contract);
// re-exported here so existing provider consumers keep working.
export type {
  LinearIssuePage,
  LinearMemberSnapshot,
  LinearOrganizationSnapshot,
  LinearProjectSnapshot,
  LinearTeamSnapshot,
  LinearWorkflowStateSnapshot,
} from '@orvilo/types';

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
  cycle { id }
  state { id type }
  assignee { id }
  labels { nodes { id } }
`;

const COMMENT_FIELDS = `
  id
  body
  createdAt
  updatedAt
  issue { id }
  user { id }
`;

const RELATION_FIELDS = `
  id
  type
  createdAt
  updatedAt
  issue { id }
  relatedIssue { id }
`;

const PAGE_INFO_FIELDS = `pageInfo { endCursor hasNextPage }`;
const ORGANIZATION_FIELDS = `id name urlKey`;
const CATALOG_PAGE_SIZE = 100;
const MEMBER_PAGE_SIZE = 250;
const PROJECT_FIELDS = `id name state organization { id } teams(first: ${CATALOG_PAGE_SIZE}) { nodes { id visibility organization { id } } ${PAGE_INFO_FIELDS} }`;
const TEAM_FIELDS = `id key name visibility organization { id } states(first: ${CATALOG_PAGE_SIZE}) { nodes { id name type position } ${PAGE_INFO_FIELDS} } cycles(first: ${CATALOG_PAGE_SIZE}) { nodes { id name number startsAt endsAt } ${PAGE_INFO_FIELDS} }`;

export interface LinearIssueCreateInput {
  description?: string | null;
  id?: string;
  projectId?: string | null;
  teamId: string;
  title: string;
}

export interface LinearIssueUpdateInput {
  assigneeId?: string | null;
  description?: string | null;
  labelIds?: string[];
  parentId?: string | null;
  priority?: number | null;
  projectId?: string | null;
  stateId?: string | null;
  title?: string;
}

export interface LinearCommentCreateInput {
  body: string;
  id?: string;
  issueId: string;
}

export interface LinearCommentUpdateInput {
  body: string;
}

export interface LinearRelationCreateInput {
  id?: string;
  kind: Exclude<LinearRelationKind, 'parent'>;
  sourceIssueId: string;
  targetIssueId: string;
}

export class LinearRemoteResourceError extends Error {
  constructor(
    readonly resource: 'comment' | 'issue' | 'relation',
    readonly reason: 'forbidden' | 'not_found',
    readonly resourceId: string,
  ) {
    super(`Linear ${resource} ${resourceId} is ${reason}`);
    this.name = 'LinearRemoteResourceError';
  }
}

export class LinearRemoteAuthError extends Error {
  readonly status = 401;

  constructor(
    readonly resource: 'comment' | 'issue' | 'relation',
    readonly resourceId: string,
  ) {
    super(`Linear ${resource} ${resourceId} requires reauthorization`);
    this.name = 'LinearRemoteAuthError';
  }
}

export interface LinearIssueProvider {
  createComment: (input: LinearCommentCreateInput) => Promise<LinearCommentSnapshot>;
  createIssue: (input: LinearIssueCreateInput) => Promise<LinearIssueSnapshot>;
  createRelation: (input: LinearRelationCreateInput) => Promise<LinearRelationSnapshot>;
  deleteComment: (id: string) => Promise<void>;
  deleteRelation: (id: string) => Promise<void>;
  findCommentById: (id: string) => Promise<LinearCommentSnapshot | null>;
  findIssueById: (id: string) => Promise<LinearIssueSnapshot | null>;
  findRelationById: (id: string) => Promise<LinearRelationSnapshot | null>;
  getComment: (id: string) => Promise<LinearCommentSnapshot>;
  getIssue: (id: string) => Promise<LinearIssueSnapshot>;
  getRelation: (id: string) => Promise<LinearRelationSnapshot>;
  listComments: (issueId: string) => Promise<LinearCommentSnapshot[]>;
  listIssues: (
    projectId: string,
    first?: number,
    after?: string | null,
  ) => Promise<LinearIssuePage>;
  listMembers: () => Promise<LinearMemberSnapshot[]>;
  listOrganizations: () => Promise<LinearOrganizationSnapshot[]>;
  listProjects: () => Promise<LinearProjectSnapshot[]>;
  listRelations: (issueId: string) => Promise<LinearRelationSnapshot[]>;
  /** Team-scoped listing including issues with `project = null`. */
  listTeamIssues: (
    teamId: string,
    first?: number,
    after?: string | null,
  ) => Promise<LinearIssuePage>;
  listTeams: () => Promise<LinearTeamSnapshot[]>;
  updateComment: (id: string, input: LinearCommentUpdateInput) => Promise<LinearCommentSnapshot>;
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

interface ConnectionPage {
  endCursor: string | null;
  hasNextPage: boolean;
  nodes: unknown[];
}

const readConnectionPage = (value: unknown): ConnectionPage => {
  if (!isRecord(value)) return { endCursor: null, hasNextPage: false, nodes: [] };
  const pageInfo = isRecord(value.pageInfo) ? value.pageInfo : {};
  return {
    endCursor: typeof pageInfo.endCursor === 'string' ? pageInfo.endCursor : null,
    hasNextPage: pageInfo.hasNextPage === true,
    nodes: Array.isArray(value.nodes) ? value.nodes : [],
  };
};

const collectConnectionNodes = async (
  load: (after: string | null) => Promise<unknown>,
  firstPage?: unknown,
): Promise<unknown[]> => {
  const nodes: unknown[] = [];
  let page = readConnectionPage(firstPage);
  let after: string | null = null;

  if (firstPage === undefined) page = readConnectionPage(await load(null));

  while (true) {
    nodes.push(...page.nodes);
    if (!page.hasNextPage) return nodes;
    if (!page.endCursor || page.endCursor === after) {
      throw new Error('Linear API returned an invalid pagination cursor');
    }
    after = page.endCursor;
    page = readConnectionPage(await load(after));
  }
};

const relationKind = (value: unknown): Exclude<LinearRelationKind, 'parent'> | null => {
  if (value === 'blocks') return 'blocks';
  if (value === 'relates' || value === 'relates_to') return 'relates';
  return null;
};

const normalizeLinearComment = (value: unknown): LinearCommentSnapshot => {
  if (!isRecord(value)) throw new Error('Linear API returned an invalid comment');
  const id = stringValue(value.id);
  const issueId = nestedId(value.issue);
  if (!id || !issueId) throw new Error('Linear API comment is missing identity fields');
  return {
    authorId: nestedId(value.user),
    body: typeof value.body === 'string' ? value.body : '',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
    id,
    issueId,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
  };
};

export const normalizeLinearRelation = (
  value: unknown,
  currentIssueId?: string,
): LinearRelationSnapshot => {
  if (!isRecord(value)) throw new Error('Linear API returned an invalid relation');
  const id = stringValue(value.id);
  const kind = relationKind(value.type);
  const sourceIssueId = nestedId(value.issue) ?? currentIssueId;
  const targetIssueId = nestedId(value.relatedIssue);
  if (!id || !kind || !sourceIssueId || !targetIssueId) {
    throw new Error('Linear API relation is missing identity fields');
  }
  return {
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
    id,
    kind,
    sourceIssueId,
    targetIssueId,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
  };
};

/** Convert a GraphQL Issue node into the provider-neutral sync snapshot. */
export const normalizeLinearIssue = (value: unknown): LinearIssueSnapshot => {
  if (!isRecord(value)) throw new Error('Linear API returned an invalid issue');

  const id = stringValue(value.id);
  const identifier = stringValue(value.identifier);
  const title = stringValue(value.title);
  if (!id || !identifier || !title) throw new Error('Linear API issue is missing identity fields');

  const state = isRecord(value.state) ? value.state : undefined;
  const snapshot: LinearIssueSnapshot = {
    archivedAt: typeof value.archivedAt === 'string' ? value.archivedAt : null,
    assigneeId: nestedId(value.assignee),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
    cycleId: nestedId(value.cycle),
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

  if (Object.hasOwn(value, 'labels') && isRecord(value.labels)) {
    snapshot.labelIds = readConnectionPage(value.labels).nodes.flatMap((label) => {
      const id = nestedId(label);
      return id ? [id] : [];
    });
  }

  return snapshot;
};

export class LinearGraphqlError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'LinearGraphqlError';
    this.status = status;
  }
}

export class LinearIssueNotFoundError extends LinearRemoteResourceError {
  constructor(issueId: string) {
    super('issue', 'not_found', issueId);
    this.name = 'LinearIssueNotFoundError';
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

  private requestData = async <T>(
    body: {
      query: string;
      variables?: Record<string, unknown>;
    },
    options: { suppressForbiddenFailure?: boolean } = {},
  ): Promise<T> => {
    const accessToken = await this.auth.getAccessToken();
    try {
      return extractGraphQLData<T>(await this.request(accessToken, body));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof LinearGraphqlError ? error.status : undefined;
      if (
        status === 401 ||
        (!options.suppressForbiddenFailure &&
          (status === 403 || /permission|unauthori[sz]ed|revoked|forbidden/i.test(message)))
      ) {
        await this.auth.markProviderFailure?.({ message, status });
      }
      throw error;
    }
  };

  private requestResourceData = async <T>(
    resource: 'comment' | 'issue' | 'relation',
    resourceId: string,
    body: { query: string; variables?: Record<string, unknown> },
  ): Promise<T> => {
    try {
      return await this.requestData<T>(body, { suppressForbiddenFailure: true });
    } catch (error) {
      if (error instanceof LinearGraphqlError) {
        if (error.status === 401) throw new LinearRemoteAuthError(resource, resourceId);
        if (error.status === 403) {
          throw new LinearRemoteResourceError(resource, 'forbidden', resourceId);
        }
        if (error.status === 404) {
          throw new LinearRemoteResourceError(resource, 'not_found', resourceId);
        }
      }
      throw error;
    }
  };

  async getIssue(id: string): Promise<LinearIssueSnapshot> {
    const data = await this.requestResourceData<{ issue: unknown }>('issue', id, {
      query: `query GetIssue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
      variables: { id },
    });
    if (data.issue === null || data.issue === undefined) {
      throw new LinearIssueNotFoundError(id);
    }
    return normalizeLinearIssue(data.issue);
  }

  async findIssueById(id: string) {
    try {
      return await this.getIssue(id);
    } catch (error) {
      if (
        error instanceof LinearRemoteResourceError &&
        error.reason === 'not_found' &&
        error.resource === 'issue'
      ) {
        return null;
      }
      throw error;
    }
  }

  async getComment(id: string): Promise<LinearCommentSnapshot> {
    const data = await this.requestResourceData<{ comment: unknown }>('comment', id, {
      query: `query GetComment($id: String!) { comment(id: $id) { ${COMMENT_FIELDS} } }`,
      variables: { id },
    });
    if (data.comment === null || data.comment === undefined) {
      throw new LinearRemoteResourceError('comment', 'not_found', id);
    }
    return normalizeLinearComment(data.comment);
  }

  async findCommentById(id: string) {
    try {
      return await this.getComment(id);
    } catch (error) {
      if (
        error instanceof LinearRemoteResourceError &&
        error.reason === 'not_found' &&
        error.resource === 'comment'
      ) {
        return null;
      }
      throw error;
    }
  }

  async listComments(issueId: string): Promise<LinearCommentSnapshot[]> {
    const nodes = await collectConnectionNodes(async (after) => {
      const data = await this.requestResourceData<{
        issue: { comments?: unknown } | null;
      }>('issue', issueId, {
        query: `query ListComments($issueId: String!, $after: String) {
            issue(id: $issueId) {
              comments(first: ${CATALOG_PAGE_SIZE}, after: $after) {
                nodes { ${COMMENT_FIELDS} }
                ${PAGE_INFO_FIELDS}
              }
            }
          }`,
        variables: { after, issueId },
      });
      if (!data.issue) throw new LinearIssueNotFoundError(issueId);
      return data.issue.comments;
    });
    return nodes.map(normalizeLinearComment);
  }

  async listRelations(issueId: string): Promise<LinearRelationSnapshot[]> {
    const loadConnection = async (inverse: boolean) =>
      collectConnectionNodes(async (after) => {
        const data = await this.requestResourceData<{
          issue: { inverseRelations?: unknown; relations?: unknown } | null;
        }>('issue', issueId, {
          query: inverse
            ? `query ListInverseRelations($issueId: String!, $after: String) {
                issue(id: $issueId) {
                  inverseRelations(first: ${CATALOG_PAGE_SIZE}, after: $after) {
                    nodes { ${RELATION_FIELDS} }
                    ${PAGE_INFO_FIELDS}
                  }
                }
              }`
            : `query ListRelations($issueId: String!, $after: String) {
                issue(id: $issueId) {
                  relations(first: ${CATALOG_PAGE_SIZE}, after: $after) {
                    nodes { ${RELATION_FIELDS} }
                    ${PAGE_INFO_FIELDS}
                  }
                }
              }`,
          variables: { after, issueId },
        });
        if (!data.issue) throw new LinearIssueNotFoundError(issueId);
        return inverse ? data.issue.inverseRelations : data.issue.relations;
      });
    const [relationNodes, inverseRelationNodes, parentData] = await Promise.all([
      loadConnection(false),
      loadConnection(true),
      this.requestResourceData<{ issue: { parent?: unknown } | null }>('issue', issueId, {
        query: `query GetIssueParent($issueId: String!) {
            issue(id: $issueId) { parent { id } }
          }`,
        variables: { issueId },
      }),
    ]);
    if (!parentData.issue) throw new LinearIssueNotFoundError(issueId);
    const relationMap = new Map<string, LinearRelationSnapshot>();
    for (const node of [...relationNodes, ...inverseRelationNodes]) {
      const relation = normalizeLinearRelation(node, issueId);
      relationMap.set(relation.id, relation);
    }
    const parentId = nestedId(parentData.issue.parent);
    if (parentId) {
      relationMap.set(`parent:${issueId}`, {
        id: `parent:${issueId}`,
        kind: 'parent',
        sourceIssueId: issueId,
        targetIssueId: parentId,
      });
    }
    return [...relationMap.values()];
  }

  async getRelation(id: string): Promise<LinearRelationSnapshot> {
    const data = await this.requestResourceData<{ issueRelation: unknown }>('relation', id, {
      query: `query GetRelation($id: String!) { issueRelation(id: $id) { ${RELATION_FIELDS} } }`,
      variables: { id },
    });
    if (data.issueRelation === null || data.issueRelation === undefined) {
      throw new LinearRemoteResourceError('relation', 'not_found', id);
    }
    return normalizeLinearRelation(data.issueRelation);
  }

  async findRelationById(id: string) {
    try {
      return await this.getRelation(id);
    } catch (error) {
      if (
        error instanceof LinearRemoteResourceError &&
        error.reason === 'not_found' &&
        error.resource === 'relation'
      ) {
        return null;
      }
      throw error;
    }
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

  async listTeamIssues(
    teamId: string,
    first = 50,
    after?: string | null,
  ): Promise<LinearIssuePage> {
    const data = await this.requestData<{
      issues: { nodes: unknown[]; pageInfo: { endCursor?: string | null; hasNextPage?: boolean } };
    }>({
      query: `query ListTeamIssues($teamId: String!, $first: Int!, $after: String) {
        issues(filter: { team: { id: { eq: $teamId } } }, first: $first, after: $after) {
          nodes { ${ISSUE_FIELDS} }
          ${PAGE_INFO_FIELDS}
        }
      }`,
      variables: { after: after ?? null, first, teamId },
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
    const projectNodes = await collectConnectionNodes(async (after) => {
      const data = await this.requestData<{ projects: unknown }>({
        query: `query ListProjects($after: String) {
          projects(first: ${CATALOG_PAGE_SIZE}, after: $after) {
            nodes { ${PROJECT_FIELDS} }
            ${PAGE_INFO_FIELDS}
          }
        }`,
        variables: { after },
      });
      return data.projects;
    });
    const projects: LinearProjectSnapshot[] = [];
    for (const value of projectNodes) {
      if (!isRecord(value)) continue;
      const id = stringValue(value.id);
      const name = stringValue(value.name);
      const organizationId = nestedId(value.organization);
      if (!id || !name || !this.isInstalledOrganization(organizationId)) continue;
      const teamNodes = isRecord(value.teams)
        ? await collectConnectionNodes(async (after) => {
            const data = await this.requestData<{ project: { teams?: unknown } | null }>({
              query: `query ListProjectTeams($projectId: String!, $after: String) {
                  project(id: $projectId) {
                    teams(first: ${CATALOG_PAGE_SIZE}, after: $after) {
                      nodes { id visibility organization { id } }
                      ${PAGE_INFO_FIELDS}
                    }
                  }
                }`,
              variables: { after, projectId: id },
            });
            return data.project?.teams;
          }, value.teams)
        : [];
      projects.push({
        id,
        name,
        organizationId,
        state: typeof value.state === 'string' ? value.state : null,
        teamIds: teamNodes.flatMap((team) => {
          if (!isRecord(team) || team.visibility !== 'public') return [];
          const teamId = stringValue(team.id);
          const teamOrganizationId = nestedId(team.organization);
          return teamId && this.isInstalledOrganization(teamOrganizationId) ? [teamId] : [];
        }),
      });
    }
    return projects;
  }

  async listTeams(): Promise<LinearTeamSnapshot[]> {
    const teamNodes = await collectConnectionNodes(async (after) => {
      const data = await this.requestData<{ teams: unknown }>({
        query: `query ListTeams($after: String) {
          teams(first: ${CATALOG_PAGE_SIZE}, after: $after) {
            nodes { ${TEAM_FIELDS} }
            ${PAGE_INFO_FIELDS}
          }
        }`,
        variables: { after },
      });
      return data.teams;
    });
    const teams: LinearTeamSnapshot[] = [];
    for (const value of teamNodes) {
      if (!isRecord(value)) continue;
      const id = stringValue(value.id);
      const key = stringValue(value.key);
      const name = stringValue(value.name);
      const organizationId = nestedId(value.organization);
      // Private teams stay in the snapshot — the sync scope's
      // `privateTeamPolicy` (import_restricted | skip) decides whether they
      // are mirrored; the provider reports what the organization contains.
      if (!id || !key || !name || !this.isInstalledOrganization(organizationId)) continue;
      const stateNodes = isRecord(value.states)
        ? await collectConnectionNodes(async (after) => {
            const data = await this.requestData<{ team: { states?: unknown } | null }>({
              query: `query ListTeamStates($teamId: String!, $after: String) {
                  team(id: $teamId) {
                    states(first: ${CATALOG_PAGE_SIZE}, after: $after) {
                      nodes { id name type position }
                      ${PAGE_INFO_FIELDS}
                    }
                  }
                }`,
              variables: { after, teamId: id },
            });
            return data.team?.states;
          }, value.states)
        : [];
      const cycleNodes = isRecord(value.cycles)
        ? await collectConnectionNodes(async (after) => {
            const data = await this.requestData<{ team: { cycles?: unknown } | null }>({
              query: `query ListTeamCycles($teamId: String!, $after: String) {
                  team(id: $teamId) {
                    cycles(first: ${CATALOG_PAGE_SIZE}, after: $after) {
                      nodes { id name number startsAt endsAt }
                      ${PAGE_INFO_FIELDS}
                    }
                  }
                }`,
              variables: { after, teamId: id },
            });
            return data.team?.cycles;
          }, value.cycles)
        : [];
      teams.push({
        cycles: cycleNodes.flatMap((cycle) => {
          if (!isRecord(cycle)) return [];
          const cycleId = stringValue(cycle.id);
          const cycleName = stringValue(cycle.name);
          if (!cycleId || !cycleName) return [];
          return [
            {
              endsAt: stringValue(cycle.endsAt),
              id: cycleId,
              name: cycleName,
              number: typeof cycle.number === 'number' ? cycle.number : null,
              startsAt: stringValue(cycle.startsAt),
              teamId: id,
            },
          ];
        }),
        id,
        key,
        name,
        organizationId,
        visibility: typeof value.visibility === 'string' ? value.visibility : null,
        workflowStates: stateNodes.flatMap((state) => {
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
      });
    }
    return teams;
  }

  async listMembers(): Promise<LinearMemberSnapshot[]> {
    let organizationId: string | null = null;
    const nodes = await collectConnectionNodes(async (after) => {
      const data = await this.requestData<{
        organization: { id?: unknown; users?: unknown } | null;
      }>({
        query: `query ListOrganizationMembers($after: String) {
          organization {
            id
            users(first: ${MEMBER_PAGE_SIZE}, after: $after) {
              nodes { id name }
              ${PAGE_INFO_FIELDS}
            }
          }
        }`,
        variables: { after },
      });
      organizationId ??= stringValue(data.organization?.id);
      return data.organization?.users;
    });
    if (!this.isInstalledOrganization(organizationId)) return [];
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
    const data = await this.requestResourceData<{
      issueCreate: { issue?: unknown; success?: boolean };
    }>('issue', input.projectId ?? input.teamId, {
      query: `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } } }`,
      variables: { input },
    });
    if (!data.issueCreate?.success || !data.issueCreate.issue) {
      throw new Error('Linear issueCreate did not return an issue');
    }
    return normalizeLinearIssue(data.issueCreate.issue);
  }

  async createComment(input: LinearCommentCreateInput): Promise<LinearCommentSnapshot> {
    const data = await this.requestResourceData<{
      commentCreate: { comment?: unknown; success?: boolean };
    }>('comment', input.issueId, {
      query: `mutation CreateComment($input: CommentCreateInput!) {
          commentCreate(input: $input) { success comment { ${COMMENT_FIELDS} } }
        }`,
      variables: { input },
    });
    if (!data.commentCreate?.success || !data.commentCreate.comment) {
      throw new Error('Linear commentCreate did not return a comment');
    }
    return normalizeLinearComment(data.commentCreate.comment);
  }

  async updateComment(id: string, input: LinearCommentUpdateInput): Promise<LinearCommentSnapshot> {
    const data = await this.requestResourceData<{
      commentUpdate: { comment?: unknown; success?: boolean };
    }>('comment', id, {
      query: `mutation UpdateComment($id: String!, $input: CommentUpdateInput!) {
          commentUpdate(id: $id, input: $input) { success comment { ${COMMENT_FIELDS} } }
        }`,
      variables: { id, input },
    });
    if (!data.commentUpdate?.success || !data.commentUpdate.comment) {
      throw new Error('Linear commentUpdate did not return a comment');
    }
    return normalizeLinearComment(data.commentUpdate.comment);
  }

  async deleteComment(id: string): Promise<void> {
    const data = await this.requestResourceData<{ commentDelete: { success?: boolean } }>(
      'comment',
      id,
      {
        query: `mutation DeleteComment($id: String!) { commentDelete(id: $id) { success } }`,
        variables: { id },
      },
    );
    if (!data.commentDelete?.success) throw new Error('Linear commentDelete failed');
  }

  async createRelation(input: LinearRelationCreateInput): Promise<LinearRelationSnapshot> {
    const data = await this.requestResourceData<{
      issueRelationCreate: { issueRelation?: unknown; success?: boolean };
    }>('relation', input.sourceIssueId, {
      query: `mutation CreateRelation($input: IssueRelationCreateInput!) {
          issueRelationCreate(input: $input) { success issueRelation { ${RELATION_FIELDS} } }
        }`,
      variables: {
        input: {
          ...(input.id ? { id: input.id } : {}),
          issueId: input.sourceIssueId,
          relatedIssueId: input.targetIssueId,
          type: input.kind === 'relates' ? 'relates_to' : input.kind,
        },
      },
    });
    if (!data.issueRelationCreate?.success || !data.issueRelationCreate.issueRelation) {
      throw new Error('Linear issueRelationCreate did not return a relation');
    }
    return normalizeLinearRelation(data.issueRelationCreate.issueRelation, input.sourceIssueId);
  }

  async deleteRelation(id: string): Promise<void> {
    const data = await this.requestResourceData<{ issueRelationDelete: { success?: boolean } }>(
      'relation',
      id,
      {
        query: `mutation DeleteRelation($id: String!) { issueRelationDelete(id: $id) { success } }`,
        variables: { id },
      },
    );
    if (!data.issueRelationDelete?.success) throw new Error('Linear issueRelationDelete failed');
  }

  async updateIssue(id: string, input: LinearIssueUpdateInput): Promise<LinearIssueSnapshot> {
    const data = await this.requestResourceData<{
      issueUpdate: { issue?: unknown; success?: boolean };
    }>('issue', id, {
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
