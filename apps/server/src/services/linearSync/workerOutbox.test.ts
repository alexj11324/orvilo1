import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LinearSyncWorker } from './worker';

const mocks = vi.hoisted(() => ({
  claimOutbox: vi.fn(),
  findIssueLinkById: vi.fn(),
  hasCurrentOutboxLease: vi.fn(),
  settleOutbox: vi.fn(),
  updateOutbox: vi.fn(),
}));

vi.mock('@/database/models/linearSync', () => ({
  LINEAR_SYNC_DEFAULT_LEASE_MS: 60_000,
  LINEAR_SYNC_MAX_ATTEMPTS: 5,
  LinearSyncModel: class {
    claimOutbox = mocks.claimOutbox;
    findIssueLinkById = mocks.findIssueLinkById;
    hasCurrentOutboxLease = mocks.hasCurrentOutboxLease;
    settleOutbox = mocks.settleOutbox;
    updateOutbox = mocks.updateOutbox;
  },
  linearSyncRetryDelayMs: vi.fn(() => 1_000),
}));
vi.mock('@/database/models/task', () => ({ TaskModel: class {} }));
vi.mock('@/database/schemas/task', () => ({ tasks: { id: 'id' } }));
vi.mock('@/server/services/task', () => ({ TaskService: class {} }));

const row = {
  attempts: 1,
  id: 'outbox-1',
  leaseFence: 4,
  leaseOwner: 'worker-1',
  linkId: 'link-1',
  payload: { title: 'Expected title' },
};

const provider = () => ({
  getIssue: vi.fn(),
  updateIssue: vi.fn(),
});

describe('LinearSyncWorker.processOutbox', () => {
  beforeEach(() => {
    mocks.claimOutbox.mockReset().mockResolvedValue([row]);
    mocks.findIssueLinkById.mockReset().mockResolvedValue({
      id: 'link-1',
      linearIssueId: 'linear-1',
    });
    mocks.hasCurrentOutboxLease.mockReset().mockResolvedValue(true);
    mocks.settleOutbox.mockReset().mockResolvedValue({ outbox: { status: 'sent' } });
    mocks.updateOutbox.mockReset().mockResolvedValue({ id: 'outbox-1' });
  });

  it('keeps a provider read failure retryable without claiming a write outcome is unknown', async () => {
    const issueProvider = provider();
    issueProvider.getIssue.mockRejectedValue(new Error('read unavailable'));

    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processOutbox(issueProvider as never),
    ).resolves.toEqual({ failed: 1, sent: 0 });
    expect(mocks.updateOutbox).toHaveBeenCalledWith(
      'outbox-1',
      expect.objectContaining({ outcomeUnknownAt: null, status: 'failed' }),
      { fence: 4, owner: 'worker-1' },
    );
    expect(issueProvider.updateIssue).not.toHaveBeenCalled();
  });

  it('records outcome_unknown only after a provider write was attempted', async () => {
    const issueProvider = provider();
    issueProvider.getIssue.mockResolvedValue({
      id: 'linear-1',
      identifier: 'LIN-1',
      title: 'Old title',
    });
    issueProvider.updateIssue.mockRejectedValue(new Error('response lost'));

    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processOutbox(issueProvider as never),
    ).resolves.toEqual({ failed: 1, sent: 0 });
    expect(mocks.updateOutbox).toHaveBeenCalledWith(
      'outbox-1',
      expect.objectContaining({ outcomeUnknownAt: expect.any(Date), status: 'outcome_unknown' }),
      { fence: 4, owner: 'worker-1' },
    );
  });

  it('reconciles a lost response without sending the same provider update again', async () => {
    const issueProvider = provider();
    const remote = { id: 'linear-1', identifier: 'LIN-1', title: 'Expected title' };
    issueProvider.getIssue.mockResolvedValue(remote);

    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processOutbox(issueProvider as never),
    ).resolves.toEqual({ failed: 0, sent: 1 });
    expect(issueProvider.updateIssue).not.toHaveBeenCalled();
    expect(mocks.settleOutbox).toHaveBeenCalledWith(
      'outbox-1',
      { fence: 4, owner: 'worker-1' },
      { issueLinkId: 'link-1', remoteSnapshot: remote },
    );
  });
});
