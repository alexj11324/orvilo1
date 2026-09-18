import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LinearSyncWorker } from './worker';

const mocks = vi.hoisted(() => ({
  claimScopeImport: vi.fn(),
  findInstallationById: vi.fn(),
  findScopeById: vi.fn(),
  listTeamLinks: vi.fn(),
  recordDomainEvent: vi.fn(),
  releaseScopeImport: vi.fn(),
  renewScopeImportLease: vi.fn(),
  updateScopeImportState: vi.fn(),
}));

vi.mock('@/database/models/linearSync', () => ({
  LINEAR_SYNC_DEFAULT_LEASE_MS: 60_000,
  LINEAR_SYNC_MAX_ATTEMPTS: 5,
  LinearSyncModel: class {
    claimScopeImport = mocks.claimScopeImport;
    findInstallationById = mocks.findInstallationById;
    findScopeById = mocks.findScopeById;
    listTeamLinks = mocks.listTeamLinks;
    recordDomainEvent = mocks.recordDomainEvent;
    releaseScopeImport = mocks.releaseScopeImport;
    renewScopeImportLease = mocks.renewScopeImportLease;
    transaction = vi.fn(async (callback: (model: unknown, db: unknown) => unknown) =>
      callback(this, {}),
    );
    updateScopeImportState = mocks.updateScopeImportState;
  },
  linearBindingReadEnabled: (binding: any) =>
    binding.settings?.readEnabled ?? binding.syncEnabled ?? true,
  linearBindingWriteEnabled: (binding: any) =>
    binding.settings?.writeEnabled ?? binding.syncEnabled ?? true,
  linearSyncRetryDelayMs: vi.fn(() => 1_000),
}));
vi.mock('@/database/models/project', () => ({ ProjectModel: class {} }));
vi.mock('@/database/models/task', () => ({ TaskModel: class {} }));
vi.mock('@/database/models/team', () => ({ TeamModel: class {} }));
vi.mock('@/database/schemas/task', () => ({ tasks: { id: 'id', workspaceId: 'workspaceId' } }));
vi.mock('@/server/services/task', () => ({ TaskService: class {} }));
vi.mock('./integrationTask', () => ({
  LinearIntegrationTaskService: class {
    addPublicComment = vi.fn();
    createPublicTask = vi.fn(async () => ({ id: 'task-new' }));
    createTeamScopedTask = vi.fn(async () => ({ id: 'task-new' }));
    findPublicTask = vi.fn();
    movePublicTaskToTeam = vi.fn();
    updatePublicTask = vi.fn();
    validateIssueScope = vi.fn(async () => true);
  },
}));

const scopeRow = (patch: Record<string, unknown> = {}) => ({
  cursors: { issuesByTeam: { 'lt-1': null } },
  id: 'scope-1',
  importCompletedAt: null,
  importPhase: 'reconciliation',
  importRunId: null,
  importStartedAt: new Date(),
  installationId: 'installation-1',
  issuesFailed: 0,
  issuesImported: 3,
  leaseFence: 4,
  leaseOwner: 'worker-a',
  lockedUntil: new Date(Date.now() + 60_000),
  projectsLinked: 1,
  scopeRevision: 9,
  settings: {},
  status: 'active',
  teamsLinked: 1,
  ...patch,
});

const claimedRow = (patch: Record<string, unknown> = {}) =>
  scopeRow({ importRunId: 'worker-a', leaseOwner: 'worker-a', status: 'importing', ...patch });

const newWorker = () => new LinearSyncWorker({} as never, 'workspace-1');

// The worker acts on the row returned by claimScopeImport — keep the read and
// the claim consistent when a test customizes cursors or phase.
const arrangeScope = (patch: Record<string, unknown> = {}) => {
  mocks.findScopeById.mockResolvedValue(scopeRow(patch));
  mocks.claimScopeImport.mockResolvedValue(claimedRow(patch));
};

describe('LinearSyncWorker.importScope lease fencing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findInstallationById.mockResolvedValue({ id: 'installation-1', status: 'active' });
    mocks.listTeamLinks.mockResolvedValue([
      { linearTeamId: 'lt-1', syncState: 'synced', teamId: 'team-1' },
    ]);
    mocks.updateScopeImportState.mockImplementation(async (_id, patch) =>
      scopeRow({ status: 'importing', ...patch }),
    );
    mocks.releaseScopeImport.mockResolvedValue(scopeRow());
    mocks.renewScopeImportLease.mockResolvedValue({
      lockedUntil: new Date(Date.now() + 60_000),
    });
  });

  it('commits the completion write under the active claim before emitting the event', async () => {
    arrangeScope({ importPhase: 'reconciliation' });

    const result = await newWorker().importScope({} as never, 'scope-1', 10);

    expect(result).toMatchObject({ claimed: true, completed: true, phase: 'completed' });
    expect(mocks.updateScopeImportState).toHaveBeenCalledTimes(1);
    expect(mocks.updateScopeImportState).toHaveBeenCalledWith(
      'scope-1',
      expect.objectContaining({ importPhase: 'completed', status: 'active' }),
      expect.objectContaining({ fence: 4, importRunId: 'worker-a', scopeRevision: 9 }),
    );
    expect(mocks.recordDomainEvent).toHaveBeenCalledTimes(1);
    expect(mocks.releaseScopeImport).toHaveBeenCalledWith(
      expect.objectContaining({ leaseFence: 4, scopeId: 'scope-1' }),
    );
    // A fresh lease (60s window, renews under 30s left) skips the write.
    expect(mocks.renewScopeImportLease).not.toHaveBeenCalled();
  });

  it('renews the lease before the completion commit when the window is half gone', async () => {
    arrangeScope({
      importPhase: 'reconciliation',
      lockedUntil: new Date(Date.now() + 10_000),
    });

    const result = await newWorker().importScope({} as never, 'scope-1', 10);

    expect(result).toMatchObject({ completed: true, phase: 'completed' });
    expect(mocks.renewScopeImportLease).toHaveBeenCalledWith(
      'scope-1',
      expect.objectContaining({ fence: 4, importRunId: 'worker-a', scopeRevision: 9 }),
    );
    expect(mocks.updateScopeImportState).toHaveBeenCalledWith(
      'scope-1',
      expect.objectContaining({ importPhase: 'completed' }),
      expect.anything(),
    );
  });

  it('treats a missed lease renewal as lease loss — the completion commit never lands', async () => {
    arrangeScope({
      importPhase: 'reconciliation',
      lockedUntil: new Date(Date.now() + 10_000),
    });
    mocks.renewScopeImportLease.mockResolvedValue(null);

    await expect(newWorker().importScope({} as never, 'scope-1', 10)).rejects.toThrow(
      'Linear sync lease is no longer owned by this worker',
    );

    expect(mocks.updateScopeImportState).not.toHaveBeenCalled();
    expect(mocks.recordDomainEvent).not.toHaveBeenCalled();
    expect(mocks.releaseScopeImport).toHaveBeenCalledTimes(1);
  });

  it('treats a missed fenced commit as lease loss — no event, release still runs', async () => {
    arrangeScope({ importPhase: 'reconciliation' });
    mocks.updateScopeImportState.mockResolvedValue(null);

    await expect(newWorker().importScope({} as never, 'scope-1', 10)).rejects.toThrow(
      'Linear sync lease is no longer owned by this worker',
    );

    expect(mocks.recordDomainEvent).not.toHaveBeenCalled();
    // The stale worker must not stamp a failure over the new owner's run:
    // the error commit is skipped once the lease loss is known.
    expect(mocks.updateScopeImportState).toHaveBeenCalledTimes(1);
    expect(mocks.releaseScopeImport).toHaveBeenCalledTimes(1);
  });

  it('fences the failure stamp and still propagates the original remote error', async () => {
    // One pending team makes the worker hit the remote before any commit.
    arrangeScope({ cursors: { issuesByTeam: {} }, importPhase: 'issues' });
    const provider = {
      listTeamIssues: vi.fn().mockRejectedValue(new Error('linear api down')),
    };
    mocks.updateScopeImportState.mockResolvedValue(null);

    await expect(newWorker().importScope(provider as never, 'scope-1', 10)).rejects.toThrow(
      'linear api down',
    );

    // The failure stamp attempted under the claim and missed — the original
    // error surfaces rather than a lease error, and no stale state landed.
    expect(mocks.updateScopeImportState).toHaveBeenCalledTimes(1);
    expect(mocks.updateScopeImportState).toHaveBeenCalledWith(
      'scope-1',
      expect.objectContaining({ lastError: 'linear api down', status: 'failed' }),
      expect.objectContaining({ fence: 4, importRunId: 'worker-a', scopeRevision: 9 }),
    );
    expect(mocks.releaseScopeImport).toHaveBeenCalledTimes(1);
  });

  it('does not reclaim a completed run', async () => {
    arrangeScope({ importPhase: 'completed' });

    const result = await newWorker().importScope({} as never, 'scope-1', 10);

    expect(result).toMatchObject({ claimed: false, completed: true, phase: 'completed' });
    expect(mocks.claimScopeImport).not.toHaveBeenCalled();
  });
});
