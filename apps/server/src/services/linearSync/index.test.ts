import { createHmac } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deriveLinearWebhookDeliveryId,
  LinearSyncService,
  parseLinearWebhookPayload,
  verifyLinearWebhookSignature,
} from './index';
import { mergeLinearIssueSnapshots } from './merge';

const modelMocks = vi.hoisted(() => ({
  captureDelivery: vi.fn(),
  findBindingByLinearProjectId: vi.fn(),
  findInstallationByOrganization: vi.fn(),
  findIssueLinkByExternalId: vi.fn(),
  markInstallationUnavailable: vi.fn(),
  recordDomainEvent: vi.fn(),
  updateInbox: vi.fn(),
}));

vi.mock('@/database/models/linearSync', () => ({
  LinearSyncModel: class {
    constructor() {
      Object.assign(this, modelMocks);
    }
  },
}));

const payload = JSON.stringify({
  action: 'update',
  data: { id: 'issue-1', identifier: 'ENG-1', title: 'Issue' },
  organizationId: 'org-1',
  type: 'Issue',
  webhookTimestamp: 1_700_000_000_000,
});

describe('Linear webhook verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies the raw body and rejects a stale delivery', () => {
    const secret = 'test-secret';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');

    expect(
      verifyLinearWebhookSignature({
        now: 1_700_000_000_030,
        rawBody: payload,
        secret,
        signature,
        timestamp: 1_700_000_000_000,
      }),
    ).toBe(true);

    expect(
      verifyLinearWebhookSignature({
        now: 1_700_000_061_000,
        rawBody: payload,
        secret,
        signature,
        timestamp: 1_700_000_000_000,
      }),
    ).toBe(false);
  });

  it('rejects a changed body and malformed signature', () => {
    const signature = createHmac('sha256', 'test-secret').update(payload).digest('hex');

    expect(
      verifyLinearWebhookSignature({
        now: 1_700_000_000_030,
        rawBody: payload.replace('Issue', 'Changed'),
        secret: 'test-secret',
        signature,
        timestamp: 1_700_000_000_000,
      }),
    ).toBe(false);
    expect(
      verifyLinearWebhookSignature({
        now: 1_700_000_000_030,
        rawBody: payload,
        secret: 'test-secret',
        signature: 'not-hex',
        timestamp: 1_700_000_000_000,
      }),
    ).toBe(false);
  });

  it('parses the organization and webhook timestamp required for routing', () => {
    expect(parseLinearWebhookPayload(payload)).toMatchObject({
      action: 'update',
      organizationId: 'org-1',
      type: 'Issue',
      webhookTimestamp: 1_700_000_000_000,
    });
    expect(() =>
      parseLinearWebhookPayload(
        '{"action":"update","type":"Issue","webhookTimestamp":1700000000000}',
      ),
    ).toThrow('organizationId');
  });

  it('derives receipt identity from authenticated body bytes instead of transport headers', () => {
    const first = deriveLinearWebhookDeliveryId(payload);
    const replay = deriveLinearWebhookDeliveryId(payload);

    expect(first).toBe(replay);
    expect(first).toMatch(/^body:[0-9a-f]{64}$/);
  });

  it('deduplicates a signed body replay from the authenticated body bytes', async () => {
    const now = 1_700_000_000_000;
    const secret = 'test-secret';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    modelMocks.findInstallationByOrganization.mockResolvedValue({
      id: 'installation-1',
      oauthClientId: 'client-1',
      status: 'active',
    });
    modelMocks.findBindingByLinearProjectId.mockResolvedValue(null);
    modelMocks.captureDelivery
      .mockResolvedValueOnce({ inserted: true, row: { id: 'inbox-1' } })
      .mockResolvedValueOnce({ inserted: false, row: { id: 'inbox-1', status: 'received' } });
    modelMocks.updateInbox.mockResolvedValue(undefined);

    const service = new LinearSyncService({} as never, 'workspace-1');
    const input = {
      now,
      rawBody: payload,
      secret,
      signature,
      timestamp: now,
    };
    const first = await service.captureWebhook(input);
    const replay = await service.captureWebhook(input);

    expect(first).toMatchObject({
      deliveryId: deriveLinearWebhookDeliveryId(payload),
      duplicate: false,
      status: 'pending_binding',
    });
    expect(replay).toMatchObject({
      deliveryId: first.deliveryId,
      duplicate: true,
      status: 'queued',
    });
    expect(modelMocks.captureDelivery).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ deliveryId: first.deliveryId }),
    );
    expect(modelMocks.captureDelivery).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ deliveryId: first.deliveryId }),
    );
  });

  it('marks a matching OAuthApp revoked event as processed and revokes the installation', async () => {
    const revokedPayload = JSON.stringify({
      action: 'revoked',
      oauthClientId: 'client-1',
      organizationId: 'org-1',
      type: 'OAuthApp',
      webhookTimestamp: 1_700_000_000_000,
    });
    const secret = 'test-secret';
    modelMocks.findInstallationByOrganization.mockResolvedValue({
      id: 'installation-1',
      oauthClientId: 'client-1',
      status: 'active',
    });
    modelMocks.captureDelivery.mockResolvedValue({ inserted: true, row: { id: 'inbox-1' } });
    modelMocks.updateInbox.mockResolvedValue(undefined);

    const result = await new LinearSyncService({} as never, 'workspace-1').captureWebhook({
      now: 1_700_000_000_000,
      rawBody: revokedPayload,
      secret,
      signature: createHmac('sha256', secret).update(revokedPayload).digest('hex'),
      timestamp: 1_700_000_000_000,
    });

    expect(result).toMatchObject({ duplicate: false, status: 'processed' });
    expect(modelMocks.markInstallationUnavailable).toHaveBeenCalledWith('installation-1', {
      message: 'Linear OAuth app authorization was revoked by the organization',
      reason: 'oauth_app_revoked',
      status: 'revoked',
    });
    expect(modelMocks.updateInbox).toHaveBeenCalledWith('inbox-1', {
      processedAt: expect.any(Date),
      status: 'processed',
    });
  });
});

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  id: 'issue-1',
  identifier: 'ENG-1',
  title: 'Base title',
  ...overrides,
});

describe('mergeLinearIssueSnapshots', () => {
  it('accepts independent local and remote changes without clobbering either', () => {
    const result = mergeLinearIssueSnapshots({
      base: snapshot({ description: 'Base description' }),
      local: snapshot({ description: 'Local description' }),
      remote: snapshot({ description: 'Base description', priority: 1 }),
    });

    expect(result.conflicts).toBeNull();
    expect(result.merged).toMatchObject({
      description: 'Local description',
      priority: 1,
    });
  });

  it('keeps both values visible when the same field changed differently', () => {
    const result = mergeLinearIssueSnapshots({
      base: snapshot(),
      local: snapshot({ title: 'Local title' }),
      remote: snapshot({ title: 'Remote title' }),
    });

    expect(result.merged.title).toBe('Local title');
    expect(result.conflicts).toMatchObject({
      fields: ['title'],
      local: { title: 'Local title' },
      remote: { title: 'Remote title' },
    });
  });
});
