import { createHmac } from 'node:crypto';

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { slackWebhook } from './slack';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), enqueue: vi.fn() }));
vi.mock('@/envs/slack', () => ({ slackEnv: { SLACK_SIGNING_SECRET: 'test-secret' } }));
vi.mock('@/database/server', () => ({ getServerDB: vi.fn(async () => ({})) }));
vi.mock('@/server/services/slackIntegration', () => ({
  createSlackIntegrationService: () => ({ getInstallationByTeamId: mocks.lookup }),
}));
vi.mock('@/libs/hatchet', () => ({ enqueueHatchetTask: mocks.enqueue }));

const app = new Hono().post('/slack', slackWebhook);
const deliver = (body: object, signatureOverride?: string) => {
  const raw = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `v0=${createHmac('sha256', 'test-secret').update(`v0:${timestamp}:${raw}`).digest('hex')}`;
  return app.request('/slack', {
    body: raw,
    headers: {
      'content-type': 'application/json',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': signatureOverride ?? signature,
    },
    method: 'POST',
  });
};

describe('Slack ingress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lookup.mockResolvedValue({
      id: 'installation',
      slackTeamId: 'T123',
      tokenRevision: 'revision',
    });
    mocks.enqueue.mockResolvedValue('queued');
  });

  it('never looks up a tenant or enqueues an unsigned event', async () => {
    const response = await deliver({ team_id: 'T123', type: 'event_callback' }, 'v0=invalid');
    expect(response.status).toBe(401);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('answers a signed Slack URL challenge before an installation exists', async () => {
    const response = await deliver({
      challenge: 'verification-challenge',
      type: 'url_verification',
    });
    expect(await response.json()).toEqual({ challenge: 'verification-challenge' });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('acknowledges accepted work and rejects unknown installations', async () => {
    const body = { event_id: 'Ev123', team_id: 'T123', type: 'event_callback' };
    expect((await deliver(body)).status).toBe(200);
    expect(mocks.enqueue).toHaveBeenCalledWith('orvilo-slack-integration-event', {
      body,
      conversationKey: '["T123",null,null]',
      installationId: 'installation',
      teamId: 'T123',
      tokenRevision: 'revision',
    });
    mocks.lookup.mockResolvedValueOnce(null);
    expect((await deliver(body)).status).toBe(404);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });

  it('returns a retryable failure when the queue did not accept delivery', async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));
    expect((await deliver({ team_id: 'T123', type: 'event_callback' })).status).toBe(503);
  });
});
