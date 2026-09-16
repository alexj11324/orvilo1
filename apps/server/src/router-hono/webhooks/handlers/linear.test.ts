import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { linearWebhook } from './linear';

const mocks = vi.hoisted(() => ({ trigger: vi.fn() }));

vi.mock('@/database/server', () => ({ getServerDB: vi.fn(async () => ({})) }));
vi.mock('@/database/models/linearSync', () => ({
  LinearSyncModel: class {
    async findInstallationByOrganization() {
      return { id: 'installation-1', webhookSecretRef: null };
    }
  },
}));
vi.mock('@/envs/linear', () => ({ linearEnv: { LINEAR_WEBHOOK_SIGNING_SECRET: 'secret' } }));
vi.mock('@/server/services/linearSync', () => ({
  LinearSyncService: class {
    async captureWebhook(input: { deliveryId: string }) {
      return { deliveryId: input.deliveryId, duplicate: false, status: 'queued' };
    }
  },
  LinearWebhookError: class extends Error {
    status = 400;
  },
  parseLinearWebhookPayload: vi.fn(() => ({ organizationId: 'org-1' })),
}));
vi.mock('@/server/workflows/linearSync', () => ({
  LinearSyncWorkflow: { trigger: mocks.trigger },
}));

describe('linear webhook handler', () => {
  beforeEach(() => {
    mocks.trigger.mockReset().mockResolvedValue({ workflowRunId: 'workflow-1' });
  });

  it('acknowledges a durably captured delivery with HTTP 200', async () => {
    const app = new Hono();
    app.post('/linear/:workspaceId', linearWebhook);

    const response = await app.request('/linear/workspace-1', {
      body: '{}',
      headers: {
        'linear-delivery': 'delivery-1',
        'linear-signature': 'signature',
        'linear-timestamp': String(Date.now()),
      },
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(mocks.trigger).toHaveBeenCalledWith({
      installationId: 'installation-1',
      limit: 20,
      workspaceId: 'workspace-1',
    });
  });

  it('asks Linear to retry when the durable workflow enqueue fails', async () => {
    mocks.trigger.mockRejectedValue(new Error('QStash unavailable'));
    const app = new Hono();
    app.post('/linear/:workspaceId', linearWebhook);

    const response = await app.request('/linear/workspace-1', {
      body: '{}',
      headers: {
        'linear-delivery': 'delivery-1',
        'linear-signature': 'signature',
        'linear-timestamp': String(Date.now()),
      },
      method: 'POST',
    });

    expect(response.status).toBe(503);
  });
});
