import { createHmac } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveLinearWebhookDeliveryId, LinearSyncService } from './index';

const mocks = vi.hoisted(() => ({
  captureDelivery: vi.fn(),
  findBindingById: vi.fn(),
  findBindingByLinearProjectId: vi.fn(),
  findInstallationByOrganization: vi.fn(),
  findIssueLinkByExternalId: vi.fn(),
  findTaskForIssueLink: vi.fn(),
  recordDomainEvent: vi.fn(),
  markInstallationUnavailable: vi.fn(),
  updateInbox: vi.fn(),
}));

vi.mock('@/database/models/linearSync', () => ({
  LinearSyncModel: class {
    captureDelivery = mocks.captureDelivery;
    findBindingById = mocks.findBindingById;
    findBindingByLinearProjectId = mocks.findBindingByLinearProjectId;
    findInstallationByOrganization = mocks.findInstallationByOrganization;
    findIssueLinkByExternalId = mocks.findIssueLinkByExternalId;
    findTaskForIssueLink = mocks.findTaskForIssueLink;
    markInstallationUnavailable = mocks.markInstallationUnavailable;
    recordDomainEvent = mocks.recordDomainEvent;
    updateInbox = mocks.updateInbox;
  },
  linearBindingReadEnabled: vi.fn(() => true),
}));

const secret = 'capture-test-secret';
const timestamp = 1_700_000_000_000;

const capture = async (payload: Record<string, unknown>) => {
  const rawBody = JSON.stringify({ ...payload, webhookTimestamp: timestamp });
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
  return new LinearSyncService({} as never, 'workspace-1').captureWebhook({
    deliveryId: String(payload.data && (payload.data as Record<string, unknown>).id),
    now: timestamp,
    rawBody,
    secret,
    signature,
    timestamp,
  });
};

describe('LinearSyncService.captureWebhook', () => {
  beforeEach(() => {
    mocks.captureDelivery.mockReset().mockResolvedValue({
      inserted: true,
      row: { id: 'inbox-1' },
    });
    mocks.findInstallationByOrganization.mockReset().mockResolvedValue({
      id: 'installation-1',
      oauthClientId: 'oauth-client-1',
      status: 'active',
    });
    mocks.findIssueLinkByExternalId.mockReset().mockResolvedValue({
      bindingId: 'binding-1',
      id: 'link-1',
      taskId: 'task-1',
    });
    mocks.findBindingById.mockReset().mockResolvedValue({ id: 'binding-1' });
    mocks.findBindingByLinearProjectId.mockReset().mockResolvedValue({
      id: 'binding-1',
      projectId: 'project-1',
    });
    mocks.findTaskForIssueLink
      .mockReset()
      .mockResolvedValue({ id: 'task-1', projectId: 'project-1' });
    mocks.recordDomainEvent.mockReset();
    mocks.markInstallationUnavailable.mockReset();
    mocks.updateInbox.mockReset().mockResolvedValue({ id: 'inbox-1' });
  });

  it('captures a Comment for worker replay without waking the planner at HTTP time', async () => {
    const result = await capture({
      action: 'create',
      data: { id: 'comment-1', issueId: 'issue-1' },
      organizationId: 'org-1',
      type: 'Comment',
    });

    expect(result).toMatchObject({ duplicate: false, status: 'queued' });
    expect(result.deliveryId).toMatch(/^body:[a-f0-9]{64}$/);
    expect(mocks.captureDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: result.deliveryId,
        eventType: 'Comment',
        subjectId: 'comment-1',
      }),
    );
    expect(mocks.recordDomainEvent).not.toHaveBeenCalled();
    expect(mocks.updateInbox).toHaveBeenCalledWith('inbox-1', {
      processedAt: null,
      status: 'received',
    });
  });

  it('captures relation webhooks for durable worker reconciliation', async () => {
    const result = await capture({
      action: 'create',
      data: { id: 'relation-1' },
      organizationId: 'org-1',
      type: 'IssueRelation',
    });

    expect(result.status).toBe('queued');
    expect(mocks.updateInbox).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({ processedAt: null, status: 'received' }),
    );
  });

  it('keeps inbound deliveries queued while an installation is paused or revoked', async () => {
    mocks.findInstallationByOrganization
      .mockResolvedValueOnce({ id: 'installation-1', status: 'paused' })
      .mockResolvedValueOnce({ id: 'installation-1', status: 'revoked' });

    await expect(
      capture({
        action: 'update',
        data: { id: 'issue-paused', project: { id: 'linear-project-1' } },
        organizationId: 'org-1',
        type: 'Issue',
      }),
    ).resolves.toMatchObject({ status: 'paused' });
    await expect(
      capture({
        action: 'update',
        data: { id: 'issue-revoked', project: { id: 'linear-project-1' } },
        organizationId: 'org-1',
        type: 'Issue',
      }),
    ).resolves.toMatchObject({ status: 'revoked' });
    expect(mocks.updateInbox).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({ processedAt: null, status: 'paused' }),
    );
    expect(mocks.findBindingByLinearProjectId).not.toHaveBeenCalled();
  });

  it('classifies an OAuth revocation webhook and records the installation state', async () => {
    const result = await capture({
      action: 'revoked',
      data: { id: 'oauth-revoked-1' },
      oauthClientId: 'oauth-client-1',
      organizationId: 'org-1',
      type: 'OAuthApp',
    });

    expect(result).toMatchObject({ status: 'processed' });
    expect(mocks.markInstallationUnavailable).toHaveBeenCalledWith('installation-1', {
      message: 'Linear OAuth app authorization was revoked by the organization',
      reason: 'oauth_app_revoked',
      status: 'revoked',
    });
    expect(mocks.updateInbox).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({ status: 'processed', processedAt: expect.any(Date) }),
    );
  });

  it('does not create a new planner revision for an Issue echo', async () => {
    const result = await capture({
      action: 'update',
      data: { id: 'issue-1', project: { id: 'linear-project-1' } },
      organizationId: 'org-1',
      type: 'Issue',
    });

    expect(result).toMatchObject({ duplicate: false, status: 'queued' });
    expect(result.deliveryId).toBe(
      deriveLinearWebhookDeliveryId(
        JSON.stringify({
          action: 'update',
          data: { id: 'issue-1', project: { id: 'linear-project-1' } },
          organizationId: 'org-1',
          type: 'Issue',
          webhookTimestamp: timestamp,
        }),
      ),
    );
    expect(mocks.recordDomainEvent).not.toHaveBeenCalled();
    expect(mocks.updateInbox).toHaveBeenCalledWith('inbox-1', {
      processedAt: null,
      status: 'received',
    });
  });
});
