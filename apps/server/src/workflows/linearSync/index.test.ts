import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LinearSyncWorkflow } from './index';

const mocks = vi.hoisted(() => ({ trigger: vi.fn() }));

vi.mock('@/libs/qstash', () => ({ workflowClient: { trigger: mocks.trigger } }));
vi.mock('@/libs/observability/traceparent', () => ({
  injectActiveTraceHeaders: vi.fn(),
}));
vi.mock('@/envs/app', () => ({
  appEnv: { APP_URL: 'https://app.example.test', INTERNAL_APP_URL: undefined },
}));

describe('LinearSyncWorkflow', () => {
  beforeEach(() => {
    mocks.trigger.mockReset().mockResolvedValue({ messageId: 'message-1' });
    vi.stubEnv('QSTASH_TOKEN', 'qstash-test');
  });

  it('queues a workspace-scoped process and normalizes the flow-control key', async () => {
    await LinearSyncWorkflow.trigger({ workspaceId: 'workspace:one', limit: 5 });

    expect(mocks.trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { dryRun: false, limit: 5, workspaceId: 'workspace:one' },
        flowControl: { key: 'linear-sync.workspace.workspace_one', parallelism: 1 },
        url: 'https://app.example.test/api/workflows/linear-sync/process',
      }),
    );
  });

  it('rejects queueing when QStash is not configured', async () => {
    vi.stubEnv('QSTASH_TOKEN', '');

    await expect(LinearSyncWorkflow.trigger({ workspaceId: 'workspace-1' })).rejects.toThrow(
      'workflow is unavailable',
    );
  });
});
