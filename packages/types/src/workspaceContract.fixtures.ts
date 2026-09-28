import type {
  CommandContext,
  DeliveryContext,
  PlanningScopeRef,
  ResolvedExecutionTarget,
} from './domainCommand';
import type { LinearWorkspaceImportSummary } from './linearSync';
import type { AssociationDecisionItem, RepositoryItem } from './repository';
import type { TeamItem, TeamWorkflowStateItem } from './team';

/**
 * Shared contract fixtures (linear-workspace-v3, WM-01). Every module —
 * database models, sync workers, planning, routers, UI tests — builds test
 * data from these builders so a contract change breaks all consumers at once
 * instead of drifting per package.
 *
 * Fixture ids are deterministic and obviously fake (`ws-fixture-*`); they are
 * never valid against a real backend.
 */

export const FIXTURE_WORKSPACE_ID = 'ws-fixture-0001';
export const FIXTURE_TEAM_ID = 'team-fixture-0001';
export const FIXTURE_PROJECT_ID = 'proj-fixture-0001';
export const FIXTURE_TASK_ID = 'task_fixture0001';
export const FIXTURE_REPOSITORY_ID = 'repo-fixture-0001';
export const FIXTURE_CHECKOUT_ID = 'checkout-fixture-0001';
export const FIXTURE_USER_ID = 'user-fixture-0001';
export const FIXTURE_AGENT_ID = 'agent-fixture-0001';
export const FIXTURE_GRANT_ID = 'grant-fixture-0001';
export const FIXTURE_BASE_SHA = '0'.repeat(40);
export const FIXTURE_HEAD_SHA = '1'.repeat(40);
export const FIXTURE_LINEAR_TEAM_ID = 'lin-team-fixture-0001';
export const FIXTURE_LINEAR_PROJECT_ID = 'lin-proj-fixture-0001';
export const FIXTURE_LINEAR_ISSUE_ID = 'lin-issue-fixture-0001';

export const fixtureCommandContext = (overrides: Partial<CommandContext> = {}): CommandContext => ({
  authorizationRevision: 1,
  correlationId: 'corr-fixture-0001',
  idempotencyKey: 'idem-fixture-0001',
  principal: { id: FIXTURE_USER_ID, kind: 'user' },
  workspaceId: FIXTURE_WORKSPACE_ID,
  ...overrides,
});

export const fixturePlanningScopeRef = (
  kind: PlanningScopeRef['kind'] = 'team',
  id: string = FIXTURE_TEAM_ID,
): PlanningScopeRef => ({ id, kind });

export const fixtureTeam = (overrides: Partial<TeamItem> = {}): TeamItem => ({
  createdAt: new Date('2026-01-01T00:00:00Z'),
  defaultAgentId: null,
  id: FIXTURE_TEAM_ID,
  isDefault: true,
  key: 'ENG',
  name: 'Engineering',
  nextIssueSeq: 1,
  orchestrationPolicy: {},
  policyRevision: 1,
  status: 'active',
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  visibility: 'public',
  workspaceId: FIXTURE_WORKSPACE_ID,
  ...overrides,
});

export const fixtureWorkflowState = (
  overrides: Partial<TeamWorkflowStateItem> = {},
): TeamWorkflowStateItem => ({
  category: 'backlog',
  id: 'state-fixture-0001',
  name: 'Backlog',
  position: 0,
  remoteStateId: null,
  teamId: FIXTURE_TEAM_ID,
  workspaceId: FIXTURE_WORKSPACE_ID,
  ...overrides,
});

export const fixtureRepository = (overrides: Partial<RepositoryItem> = {}): RepositoryItem => ({
  coordinate: {
    name: 'orvilo1',
    owner: 'alexj11324',
    url: 'https://github.com/alexj11324/orvilo1',
  },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  id: FIXTURE_REPOSITORY_ID,
  isFork: false,
  localOnlyKey: null,
  providerHost: 'github.com',
  remoteRepositoryId: '123456789',
  status: 'active',
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  visibility: 'private',
  workspaceId: FIXTURE_WORKSPACE_ID,
  ...overrides,
});

export const fixtureExecutionTarget = (
  overrides: Partial<ResolvedExecutionTarget> = {},
): ResolvedExecutionTarget => ({
  allowedWritePaths: ['**'],
  authorizationRevision: 1,
  checkoutStartSha: FIXTURE_BASE_SHA,
  environment: { checkoutId: FIXTURE_CHECKOUT_ID, deviceId: 'device-fixture-0001', kind: 'device' },
  generation: 1,
  grantId: FIXTURE_GRANT_ID,
  policyRevision: 1,
  providerHost: 'github.com',
  remoteRepositoryId: '123456789',
  repositoryId: FIXTURE_REPOSITORY_ID,
  requirementRevision: 1,
  targetBaseRef: 'canary',
  targetBaseSha: FIXTURE_BASE_SHA,
  taskRevision: 1,
  ...overrides,
});

export const fixtureDeliveryContext = (
  overrides: Partial<DeliveryContext> = {},
): DeliveryContext => ({
  checkoutStartSha: FIXTURE_BASE_SHA,
  deliveryBranch: 'task/T-1',
  generation: 1,
  repositoryId: FIXTURE_REPOSITORY_ID,
  status: 'active',
  targetBaseRef: 'canary',
  targetBaseSha: FIXTURE_BASE_SHA,
  taskId: FIXTURE_TASK_ID,
  ...overrides,
});

export const fixtureAssociationDecision = (
  overrides: Partial<AssociationDecisionItem> = {},
): AssociationDecisionItem => ({
  confidence: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  decidedAt: null,
  decidedByUserId: null,
  decisionRevision: 1,
  evidence: [{ detail: 'verified remote repository id', kind: 'verified_remote' }],
  id: 'assoc-fixture-0001',
  idempotencyKey: 'idem-assoc-fixture-0001',
  inputRevision: 1,
  policyRevision: 1,
  relation: 'project_repository',
  revokedAt: null,
  source: 'deterministic',
  sourceId: FIXTURE_PROJECT_ID,
  sourceKind: 'project',
  status: 'proposed',
  targetRepositoryId: FIXTURE_REPOSITORY_ID,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  workspaceId: FIXTURE_WORKSPACE_ID,
  ...overrides,
});

export const fixtureImportSummary = (
  overrides: Partial<LinearWorkspaceImportSummary> = {},
): LinearWorkspaceImportSummary => ({
  importRunId: 'import-fixture-0001',
  issuesFailed: 0,
  issuesImported: 0,
  lastError: null,
  phase: 'teams',
  projectsLinked: 0,
  scopeRevision: 1,
  startedAt: new Date('2026-01-01T00:00:00Z'),
  status: 'importing',
  teamsLinked: 0,
  ...overrides,
});
