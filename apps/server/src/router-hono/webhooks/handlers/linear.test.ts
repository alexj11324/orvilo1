import { createHmac } from 'node:crypto';

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as LinearSyncServiceModule from '@/server/services/linearSync';

import { linearWebhook } from './linear';

const mocks = vi.hoisted(() => ({
  captureWebhook: vi.fn(),
  findInstallationByOrganization: vi.fn(),
  listInstallationWebhookCandidates: vi.fn(),
  trigger: vi.fn(),
}));

vi.mock('@/database/server', () => ({ getServerDB: vi.fn(async () => ({})) }));
vi.mock('@/database/models/linearSync', () => ({
  LinearSyncModel: class {
    findInstallationByOrganization = mocks.findInstallationByOrganization;
    listInstallationWebhookCandidates = mocks.listInstallationWebhookCandidates;
  },
}));
vi.mock('@/envs/linear', () => ({ linearEnv: { LINEAR_WEBHOOK_SIGNING_SECRET: 'secret' } }));
vi.mock('@/server/services/linearSync', async () => {
  const actual = await vi.importActual<typeof LinearSyncServiceModule>(
    '@/server/services/linearSync',
  );
  return {
    ...actual,
    LinearSyncService: class {
      captureWebhook = mocks.captureWebhook;
    },
  };
});
vi.mock('@/server/workflows/linearSync', () => ({
  LinearSyncWorkflow: { trigger: mocks.trigger },
}));

describe('linear webhook handler', () => {
  beforeEach(() => {
    mocks.captureWebhook.mockReset().mockResolvedValue({
      deliveryId: 'delivery-1',
      duplicate: false,
      status: 'queued',
    });
    mocks.findInstallationByOrganization.mockReset().mockResolvedValue({
      id: 'installation-1',
      organizationId: 'org-1',
      status: 'active',
      webhookSecretRef: null,
    });
    mocks.listInstallationWebhookCandidates.mockReset().mockResolvedValue([
      {
        id: 'installation-1',
        organizationId: 'org-1',
        status: 'active',
        webhookSecretRef: null,
      },
    ]);
    mocks.trigger.mockReset().mockResolvedValue({ workflowRunId: 'workflow-1' });
  });

  const signedRequest = (body: string, secret = 'secret', timestamp = Date.now()) =>
    new Request('http://localhost/linear/workspace-1', {
      body,
      headers: {
        'linear-delivery': 'delivery-1',
        'linear-signature': createHmac('sha256', secret).update(Buffer.from(body)).digest('hex'),
        'linear-timestamp': String(timestamp),
      },
      method: 'POST',
    });

  it('acknowledges a durably captured delivery with HTTP 200', async () => {
    const app = new Hono();
    app.post('/linear/:workspaceId', linearWebhook);

    const timestamp = Date.now();
    const body = JSON.stringify({
      action: 'update',
      data: { id: 'issue-1', title: 'Café' },
      organizationId: 'org-1',
      type: 'Issue',
      webhookTimestamp: timestamp,
    });
    const response = await app.fetch(signedRequest(body, 'secret', timestamp));

    expect(response.status).toBe(200);
    expect(mocks.captureWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody: expect.any(Uint8Array), secret: 'secret' }),
    );
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

    const timestamp = Date.now();
    const body = JSON.stringify({
      action: 'update',
      organizationId: 'org-1',
      type: 'Issue',
      webhookTimestamp: timestamp,
    });
    const response = await app.fetch(signedRequest(body, 'secret', timestamp));

    expect(response.status).toBe(503);
  });

  it('rejects an invalid signature before parsing or selecting an organization installation', async () => {
    const app = new Hono();
    app.post('/linear/:workspaceId', linearWebhook);

    const timestamp = Date.now();
    const body = JSON.stringify({
      action: 'update',
      organizationId: 'org-attacker-chosen',
      type: 'Issue',
      webhookTimestamp: timestamp,
    });
    const response = await app.fetch(signedRequest(body, 'wrong-secret', timestamp));

    expect(response.status).toBe(401);
    expect(mocks.findInstallationByOrganization).not.toHaveBeenCalled();
    expect(mocks.captureWebhook).not.toHaveBeenCalled();
  });

  it('does not let a per-installation signature select a different organization', async () => {
    const app = new Hono();
    app.post('/linear/:workspaceId', linearWebhook);
    mocks.listInstallationWebhookCandidates.mockResolvedValue([
      {
        id: 'installation-1',
        organizationId: 'org-1',
        status: 'active',
        webhookSecretRef: 'LINEAR_ORG_ONE_SECRET',
      },
    ]);
    process.env.LINEAR_ORG_ONE_SECRET = 'org-one-secret';
    mocks.findInstallationByOrganization.mockResolvedValue({
      id: 'installation-2',
      organizationId: 'org-2',
      status: 'active',
      webhookSecretRef: 'LINEAR_ORG_TWO_SECRET',
    });

    const timestamp = Date.now();
    const body = JSON.stringify({
      action: 'update',
      organizationId: 'org-2',
      type: 'Issue',
      webhookTimestamp: timestamp,
    });
    const response = await app.fetch(signedRequest(body, 'org-one-secret', timestamp));

    expect(response.status).toBe(401);
    expect(mocks.captureWebhook).not.toHaveBeenCalled();
    delete process.env.LINEAR_ORG_ONE_SECRET;
  });
});
