import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LinearSyncWorkflow } from './index';

const mocks = vi.hoisted(() => ({ triggerHatchetWorkflow: vi.fn() }));

vi.mock('@/server/services/hatchet/workflows', () => ({
  triggerHatchetWorkflow: mocks.triggerHatchetWorkflow,
}));
vi.mock('@/libs/observability/traceparent', () => ({
  injectActiveTraceHeaders: vi.fn(),
}));

describe('LinearSyncWorkflow', () => {
  beforeEach(() => {
    mocks.triggerHatchetWorkflow.mockReset().mockResolvedValue({ workflowRunId: 'run-1' });
  });

  it('queues a workspace-scoped Hatchet process with normalized defaults', async () => {
    await LinearSyncWorkflow.trigger({ workspaceId: 'workspace:one', limit: 5 });

    expect(mocks.triggerHatchetWorkflow).toHaveBeenCalledWith(
      '/api/workflows/linear-sync/process',
      { dryRun: false, limit: 5, workspaceId: 'workspace:one' },
      expect.objectContaining({
        concurrencyKey: 'workspace:one',
        headers: {},
      }),
    );
  });

  it('passes delayed continuation identity to the Hatchet adapter', async () => {
    await LinearSyncWorkflow.triggerInstallation(
      { installationId: '00000000-0000-4000-8000-000000000001', workspaceId: 'workspace-1' },
      { delay: 3, workflowRunId: 'continuation-1' },
    );

    expect(mocks.triggerHatchetWorkflow).toHaveBeenCalledWith(
      '/api/workflows/linear-sync/execute',
      {
        dryRun: false,
        installationId: '00000000-0000-4000-8000-000000000001',
        limit: 20,
        workspaceId: 'workspace-1',
      },
      expect.objectContaining({
        concurrencyKey: 'workspace-1',
        delayMs: 3000,
        workflowRunId: 'continuation-1',
      }),
    );
  });

  it('passes a bounded delay to a continuation run', async () => {
    await LinearSyncWorkflow.triggerInstallation(
      { installationId: '00000000-0000-4000-8000-000000000001', workspaceId: 'workspace-1' },
      { delay: 12 },
    );

    expect(mocks.triggerHatchetWorkflow).toHaveBeenCalledWith(
      '/api/workflows/linear-sync/execute',
      expect.objectContaining({ installationId: '00000000-0000-4000-8000-000000000001' }),
      expect.objectContaining({ delayMs: 12_000 }),
    );
  });
});
