// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockModel = {
  listInstallationRecoveryState: vi.fn(),
  listRecoveryRows: vi.fn(),
  retryRecoveryRow: vi.fn(),
};

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(() => ({})),
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
    mockModel.retryRecoveryRow.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      installationId: '00000000-0000-4000-8000-000000000002',
    });
    mockTriggerInstallation.mockResolvedValue({ messageId: 'msg-1' });
  });

  it('returns safe operation metadata without a payload field', async () => {
    const result = await caller().operations({ limit: 10 });

    expect(result.data).toEqual([expect.objectContaining({ kind: 'outbox', status: 'failed' })]);
    expect(result.data[0]).not.toHaveProperty('payload');
    expect(mockModel.listRecoveryRows).toHaveBeenCalledWith(10);
  });

  it('uses the row timestamp as a CAS fence and wakes the installation workflow', async () => {
    const result = await caller().retryOperation({
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'outbox',
    });

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
});
