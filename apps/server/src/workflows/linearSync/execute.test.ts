import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeLinearSyncWorkflow } from './execute';

const mocks = vi.hoisted(() => ({
  findInstallationById: vi.fn(),
  nextSyncWakeAt: vi.fn(),
  processInbox: vi.fn(),
  processOutbox: vi.fn(),
  processPlanning: vi.fn(),
  triggerInstallation: vi.fn(),
}));

vi.mock('@/database/server', () => ({ getServerDB: vi.fn(async () => ({})) }));
vi.mock('@/database/models/linearSync', () => ({
  LinearSyncModel: class {
    findInstallationById = mocks.findInstallationById;
    nextSyncWakeAt = mocks.nextSyncWakeAt;
  },
}));
vi.mock('@/server/services/linearSync/provider', () => ({
  createLinearGraphqlIssueProvider: vi.fn(() => ({})),
}));
vi.mock('@/server/services/linearSync/worker', () => ({
  LinearSyncWorker: class {
    processOutbox = mocks.processOutbox;
    processPending = mocks.processInbox;
  },
}));
vi.mock('@/server/services/linearSync/planning', () => ({
  LinearPlanningWorker: class {
    processPending = mocks.processPlanning;
  },
}));
vi.mock('@/server/workflows/linearSync', () => ({
  LinearSyncWorkflow: { triggerInstallation: mocks.triggerInstallation },
}));

const context = () => ({
  requestPayload: {
    dryRun: false,
    installationId: '00000000-0000-4000-8000-000000000001',
    limit: 20,
    workspaceId: 'workspace-1',
  },
  run: vi.fn(async (_name: string, callback: () => unknown) => callback()),
});

describe('executeLinearSyncWorkflow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T20:00:00.000Z'));
    mocks.findInstallationById.mockReset().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      installedByUserId: 'user-1',
      status: 'active',
    });
    mocks.processInbox
      .mockReset()
      .mockResolvedValue({ failed: 0, imported: 0, pendingBinding: 0, processed: 20 });
    mocks.processOutbox.mockReset().mockResolvedValue({ failed: 0, sent: 20 });
    mocks.processPlanning.mockReset().mockResolvedValue({ failed: 0, processed: 1, proposed: 1 });
    mocks.nextSyncWakeAt.mockReset().mockResolvedValue(null);
    mocks.triggerInstallation.mockReset().mockResolvedValue({ workflowRunId: 'continuation-1' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules a delayed continuation at the next durable retry time', async () => {
    mocks.nextSyncWakeAt.mockResolvedValue(new Date('2026-09-16T20:00:12.000Z'));

    await expect(executeLinearSyncWorkflow(context() as never)).resolves.toMatchObject({
      continuationScheduled: true,
      nextWakeAt: '2026-09-16T20:00:12.000Z',
    });
    expect(mocks.triggerInstallation).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: '00000000-0000-4000-8000-000000000001',
        workspaceId: 'workspace-1',
      }),
      { delay: 12 },
    );
  });

  it('does not create an empty continuation when all durable work is settled', async () => {
    await expect(executeLinearSyncWorkflow(context() as never)).resolves.toMatchObject({
      continuationScheduled: false,
      nextWakeAt: null,
    });
    expect(mocks.triggerInstallation).not.toHaveBeenCalled();
  });
});
