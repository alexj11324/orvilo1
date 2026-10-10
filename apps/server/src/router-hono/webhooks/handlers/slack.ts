import type { Context } from 'hono';

import { getServerDB } from '@/database/server';
import { slackEnv } from '@/envs/slack';
import { enqueueHatchetTask } from '@/libs/hatchet';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';
import { createSlackIntegrationService } from '@/server/services/slackIntegration';
import {
  parseSlackWebhookBody,
  slackConversationLane,
  verifySlackWebhookSignature,
} from '@/server/services/slackIntegration/webhook';

export const slackWebhook = async (c: Context): Promise<Response> => {
  const secret = slackEnv.SLACK_SIGNING_SECRET;
  if (!secret) return c.json({ error: 'Slack is not configured' }, 503);
  const rawBody = await c.req.text();
  if (
    !verifySlackWebhookSignature({
      body: rawBody,
      secret,
      signature: c.req.header('x-slack-signature'),
      timestamp: c.req.header('x-slack-request-timestamp'),
    })
  )
    return c.json({ error: 'Invalid Slack signature' }, 401);

  let payload: ReturnType<typeof parseSlackWebhookBody>;
  try {
    payload = parseSlackWebhookBody(rawBody, c.req.header('content-type') ?? '');
  } catch {
    return c.json({ error: 'Invalid Slack payload' }, 400);
  }
  if (payload.challenge !== undefined) return c.json({ challenge: payload.challenge });
  if (!payload.teamId) return c.json({ error: 'Missing Slack team' }, 400);

  try {
    const service = createSlackIntegrationService(await getServerDB());
    const installation = await service.getInstallationByTeamId(payload.teamId);
    if (!installation) return c.json({ error: 'Slack workspace is not connected' }, 404);
    // Await acceptance by the durable queue before acknowledging Slack. A queue
    // failure leaves Slack free to retry, and Channels deduplicates delivery IDs.
    await enqueueHatchetTask(HATCHET_TASK_NAMES.slackIntegrationEvent, {
      body: payload.body,
      conversationKey: slackConversationLane(payload.teamId, payload.body),
      installationId: installation.id,
      teamId: installation.slackTeamId,
      tokenRevision: installation.tokenRevision,
    });
    return c.json({ ok: true });
  } catch (error) {
    console.error('[slack:webhook] could not enqueue delivery', {
      name: error instanceof Error ? error.name : 'Error',
    });
    return c.json({ error: 'Slack delivery could not be queued' }, 503);
  }
};
