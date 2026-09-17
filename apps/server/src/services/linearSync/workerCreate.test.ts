import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LinearSyncWorker } from './worker';

const mocks = vi.hoisted(() => ({
  claimOutbox: vi.fn(),
  findBindingById: vi.fn(),
  findBindingByTaskId: vi.fn(),
  findInstallationById: vi.fn(),
  findPublicTask: vi.fn(),
  hasCurrentOutboxLease: vi.fn(),
  settleCreateIssueOutbox: vi.fn(),
  updateOutbox: vi.fn(),
}));

vi.mock('@/database/models/linearSync', () => ({
  LINEAR_SYNC_DEFAULT_LEASE_MS: 60_000,
  LINEAR_SYNC_MAX_ATTEMPTS: 5,
  LinearSyncModel: class {
    claimOutbox = mocks.claimOutbox;
    findBindingById = mocks.findBindingById;
    findBindingByTaskId = mocks.findBindingByTaskId;
    findInstallationById = mocks.findInstallationById;
    hasCurrentOutboxLease = mocks.hasCurrentOutboxLease;
    settleCreateIssueOutbox = mocks.settleCreateIssueOutbox;
    updateOutbox = mocks.updateOutbox;
  },
  linearBindingReadEnabled: vi.fn(() => true),
  linearBindingWriteEnabled: (binding: any) =>
    binding.settings?.writeEnabled ?? binding.syncEnabled ?? true,
  linearSyncRetryDelayMs: vi.fn(() => 1_000),
}));
vi.mock('@/database/models/task', () => ({ TaskModel: class {} }));
vi.mock('@/database/schemas/task', () => ({ tasks: { id: 'id', workspaceId: 'workspaceId' } }));
vi.mock('./integrationTask', () => ({
  LinearIntegrationTaskService: class {
    findPublicTask = mocks.findPublicTask;
    validateIssueScope = vi.fn(async () => true);
  },
}));

const createRow = (attempts = 1) => ({
  attempts,
  id: 'outbox-create-1',
  installationId: 'installation-1',
  leaseFence: attempts,
  leaseOwner: 'worker-1',
  operation: 'linear-issue:create:task-1',
  payload: {
    bindingId: 'binding-1',
    description: 'Build it',
    projectId: 'linear-project-1',
    remoteIssueId: '550e8400-e29b-41d4-a716-446655440000',
    teamId: 'team-1',
    title: 'Build it',
  },
  taskId: 'task-1',
});

const issue = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  identifier: 'ENG-1',
  projectId: 'linear-project-1',
  title: 'Build it',
};

describe('LinearSyncWorker create_issue outbox', () => {
  beforeEach(() => {
    mocks.claimOutbox.mockReset().mockResolvedValue([createRow()]);
    mocks.findBindingById.mockReset().mockResolvedValue({
      defaultTeamId: 'team-1',
      id: 'binding-1',
      installationId: 'installation-1',
      linearProjectId: 'linear-project-1',
      projectId: 'project-1',
      syncEnabled: true,
      teamIds: ['team-1'],
    });
    mocks.findBindingByTaskId.mockReset().mockResolvedValue({ syncEnabled: true });
    mocks.findInstallationById.mockReset().mockResolvedValue({
      id: 'installation-1',
      organizationId: 'org-1',
      status: 'active',
    });
    mocks.hasCurrentOutboxLease.mockReset().mockResolvedValue(true);
    mocks.findPublicTask.mockReset().mockResolvedValue({
      id: 'task-1',
      projectId: 'project-1',
      visibility: 'public',
    });
    mocks.settleCreateIssueOutbox.mockReset().mockResolvedValue({ link: { id: 'link-1' } });
    mocks.updateOutbox.mockReset().mockResolvedValue({ id: 'outbox-create-1' });
  });

  it('creates exactly one issue and settles the durable local link', async () => {
    const provider = {
      createIssue: vi.fn().mockResolvedValue(issue),
      findIssueById: vi.fn().mockResolvedValue(null),
    };

    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processOutbox(provider as never),
    ).resolves.toEqual({ failed: 0, sent: 1 });
    expect(provider.findIssueById).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    expect(provider.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    );
    expect(mocks.settleCreateIssueOutbox).toHaveBeenCalledWith(
      'outbox-create-1',
      expect.objectContaining({ fence: 1, owner: 'worker-1' }),
      expect.objectContaining({
        linearIssueId: '550e8400-e29b-41d4-a716-446655440000',
        taskId: 'task-1',
      }),
    );
  });

  it('recovers a lost create response by lookup without creating a duplicate', async () => {
    const provider = {
      createIssue: vi.fn().mockRejectedValue(new Error('response lost')),
      findIssueById: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(issue),
    };
    const worker = new LinearSyncWorker({} as never, 'workspace-1');

    await expect(worker.processOutbox(provider as never)).resolves.toEqual({ failed: 1, sent: 0 });
    expect(mocks.updateOutbox).toHaveBeenCalledWith(
      'outbox-create-1',
      expect.objectContaining({ status: 'outcome_unknown' }),
      expect.anything(),
    );

    mocks.claimOutbox.mockResolvedValueOnce([createRow(2)]);
    mocks.settleCreateIssueOutbox.mockClear();
    await expect(worker.processOutbox(provider as never)).resolves.toEqual({ failed: 0, sent: 1 });
    expect(provider.createIssue).toHaveBeenCalledTimes(1);
    expect(provider.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    );
    expect(provider.findIssueById).toHaveBeenNthCalledWith(
      2,
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(mocks.settleCreateIssueOutbox).toHaveBeenCalledWith(
      'outbox-create-1',
      expect.objectContaining({ fence: 2 }),
      expect.objectContaining({ linearIssueId: '550e8400-e29b-41d4-a716-446655440000' }),
    );
  });

  it('keeps the create intent pending while sync is disabled', async () => {
    mocks.findBindingByTaskId.mockResolvedValue({ id: 'binding-1', syncEnabled: false });
    const provider = {
      createIssue: vi.fn(),
      findIssueById: vi.fn(),
    };

    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processOutbox(provider as never),
    ).resolves.toEqual({ failed: 0, sent: 0 });
    expect(provider.createIssue).not.toHaveBeenCalled();
    expect(provider.findIssueById).not.toHaveBeenCalled();
    expect(mocks.updateOutbox).toHaveBeenCalledWith(
      'outbox-create-1',
      expect.objectContaining({ status: 'paused' }),
      expect.anything(),
    );
  });
});
