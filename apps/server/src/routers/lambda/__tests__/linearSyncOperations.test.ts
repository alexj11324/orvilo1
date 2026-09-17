// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockModel = {
  listIssueConflicts: vi.fn(),
  listInstallationRecoveryState: vi.fn(),
  listRecoveryRows: vi.fn(),
  retryRecoveryRow: vi.fn(),
};
const mockResolveConflict = vi.fn();

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(() => ({})),
}));
// Workspace membership is verified for real — callers carrying workspaceId
// resolve through this model seam, so tests stub an active member row.
vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/database/models/workspace')>()),
  getActiveWorkspaceMembershipRole: vi.fn().mockResolvedValue('member'),
}));

vi.mock('@/database/models/linearSync', () => ({
  LINEAR_ISSUE_LINK_LIST_DEFAULT_LIMIT: 100,
  LINEAR_ISSUE_LINK_TASK_ID_CAP: 100,
  LinearSyncModel: vi.fn(function () {
    return mockModel;
  }),
}));
vi.mock('@/database/models/project', () => ({ ProjectModel: vi.fn() }));
vi.mock('@/database/models/task', () => ({ TaskModel: vi.fn() }));
vi.mock('@/server/services/linearSync/integrationTask', () => ({
  LinearIntegrationTaskService: vi.fn(),
}));
vi.mock('@/server/services/linearSync/conflictResolution', () => ({
  LinearConflictResolutionError: class extends Error {},
  LinearConflictResolutionService: vi.fn(function () {
    return { resolve: mockResolveConflict };
  }),
}));
vi.mock('@/server/services/linearSync/oauth', () => ({
  buildLinearAuthorizationUrl: vi.fn(),
  createLinearPkcePair: vi.fn(),
  generateLinearOAuthState: vi.fn(),
  getLinearOAuthConfig: vi.fn(),
  getLinearOAuthRedirectUri: vi.fn(),
  revokeLinearToken: vi.fn(),
}));
vi.mock('@/server/services/linearSync/oauthState', () => ({ saveLinearOAuthState: vi.fn() }));
vi.mock('@/server/services/linearSync/planning', () => ({ LinearPlanningWorker: vi.fn() }));
vi.mock('@/server/services/linearSync/provider', () => ({
  LinearScopeValidationError: class extends Error {},
  createLinearGraphqlIssueProvider: vi.fn(),
}));
vi.mock('@/server/services/linearSync/worker', () => ({ LinearSyncWorker: vi.fn() }));
const mockTrigger = vi.fn();
const mockTriggerInstallation = vi.fn();
vi.mock('@/server/workflows/linearSync', () => ({
  LinearSyncWorkflow: {
    trigger: mockTrigger,
    triggerInstallation: mockTriggerInstallation,
  },
}));
vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({ KeyVaultsGateKeeper: vi.fn() }));

const { linearSyncRouter } = await import('../linearSync');

describe('linearSyncRouter recovery operations', () => {
  const caller = () =>
    linearSyncRouter.createCaller({
      serverDB: {},
      userId: 'user-1',
      workspaceId: 'workspace-1',
    } as any);

  beforeEach(() => {
    vi.clearAllMocks();
    mockModel.listRecoveryRows.mockResolvedValue([
      {
        attempts: 2,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        id: '00000000-0000-4000-8000-000000000001',
        kind: 'outbox',
        lastError: 'safe error',
        status: 'failed',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    mockModel.listInstallationRecoveryState.mockResolvedValue([]);
    mockModel.listIssueConflicts.mockResolvedValue([]);
    mockModel.retryRecoveryRow.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      installationId: '00000000-0000-4000-8000-000000000002',
    });
    mockTriggerInstallation.mockResolvedValue({ messageId: 'msg-1' });
    mockResolveConflict.mockResolvedValue({
      installationId: '00000000-0000-4000-8000-000000000002',
      issueLink: { id: '00000000-0000-4000-8000-000000000003' },
      outboxQueued: true,
      strategy: 'keep_local',
    });
  });

  it('returns safe operation metadata without a payload field', async () => {
    const result = await caller().operations({ limit: 10 });
    if (!result) throw new Error('Expected operations result');

    expect(result.data).toEqual([expect.objectContaining({ kind: 'outbox', status: 'failed' })]);
    const [operation] = result.data;
    expect(operation).not.toHaveProperty('payload');
    expect(mockModel.listRecoveryRows).toHaveBeenCalledWith(10);
  });

  it('uses the row timestamp as a CAS fence and wakes the installation workflow', async () => {
    const result = await caller().retryOperation({
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'outbox',
    });
    if (!result) throw new Error('Expected retry result');

    expect(result.success).toBe(true);
    expect(mockModel.retryRecoveryRow).toHaveBeenCalledWith({
      expectedUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'outbox',
    });
    expect(mockTriggerInstallation).toHaveBeenCalledWith({
      installationId: '00000000-0000-4000-8000-000000000002',
      limit: 20,
      workspaceId: 'workspace-1',
    });
  });

  it('lists only conflict rows from the bounded model query', async () => {
    await caller().conflicts({
      bindingId: '00000000-0000-4000-8000-000000000004',
      limit: 10,
    });

    expect(mockModel.listIssueConflicts).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000004',
      10,
    );
  });

  it('passes both conflict versions to the resolver and wakes a queued outbox', async () => {
    const result = await caller().resolveConflict({
      expectedDetectedAt: '2026-09-17T10:01:00.000Z',
      expectedLocalRevision: 7,
      expectedRemoteUpdatedAt: '2026-09-17T10:00:00.000Z',
      issueLinkId: '00000000-0000-4000-8000-000000000003',
      strategy: 'keep_local',
    });
    if (!result) throw new Error('Expected conflict result');

    expect(result.success).toBe(true);
    expect(mockResolveConflict).toHaveBeenCalledWith({
      expectedDetectedAt: '2026-09-17T10:01:00.000Z',
      expectedLocalRevision: 7,
      expectedRemoteUpdatedAt: '2026-09-17T10:00:00.000Z',
      issueLinkId: '00000000-0000-4000-8000-000000000003',
      strategy: 'keep_local',
    });
    expect(mockTriggerInstallation).toHaveBeenCalledWith({
      installationId: '00000000-0000-4000-8000-000000000002',
      limit: 20,
      workspaceId: 'workspace-1',
    });
  });
});
