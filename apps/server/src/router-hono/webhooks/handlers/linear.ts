import type { Context } from 'hono';

import { LinearSyncModel } from '@/database/models/linearSync';
import { getServerDB } from '@/database/server';
import { linearEnv } from '@/envs/linear';
import {
  LinearSyncService,
  LinearWebhookError,
  parseLinearWebhookPayload,
} from '@/server/services/linearSync';
import { LinearSyncWorkflow } from '@/server/workflows/linearSync';

/**
 * Capture a Linear delivery for one workspace. The workspace is part of the
 * configured webhook URL so the receiver never guesses ownership from a task
 * title or Linear identifier.
 *
 * The handler only verifies and persists the delivery. Planning and provider
 * writes happen after the request, so Linear receives a fast acknowledgement.
 */
export const linearWebhook = async (c: Context): Promise<Response> => {
  const workspaceId = c.req.param('workspaceId');
  if (!workspaceId) return c.json({ error: 'workspaceId is required' }, 400);

  const rawBody = await c.req.raw.text();
  const signature = c.req.header('linear-signature');
  const deliveryId = c.req.header('linear-delivery');
  const timestampHeader = c.req.header('linear-timestamp');
  const timestamp = Number(timestampHeader);

  if (!deliveryId || !timestampHeader || !Number.isFinite(timestamp)) {
    return c.json({ error: 'Linear webhook headers are incomplete' }, 400);
  }

  try {
    const db = await getServerDB();
    const payload = parseLinearWebhookPayload(rawBody);
    const installation = await new LinearSyncModel(db, workspaceId).findInstallationByOrganization(
      payload.organizationId,
    );
    if (!installation) {
      return c.json({ error: 'Linear organization is not installed in this workspace' }, 404);
    }

    const secret = installation.webhookSecretRef
      ? process.env[installation.webhookSecretRef]
      : linearEnv.LINEAR_WEBHOOK_SIGNING_SECRET;
    if (!secret) {
      console.error('[linear:webhook] webhook secret is not configured for installation');
      return c.json({ error: 'Linear webhook verification is not configured' }, 503);
    }

    const result = await new LinearSyncService(db, workspaceId).captureWebhook({
      deliveryId,
      now: Date.now(),
      rawBody,
      secret,
      signature,
      timestamp,
    });

    // The inbox/domain-event write is the acknowledgement boundary. Queue the
    // leased workers after that durable write; a missing local QStash setup must
    // never turn a successfully captured Linear delivery into a retry storm.
    void LinearSyncWorkflow.trigger({
      installationId: installation.id,
      limit: 20,
      workspaceId,
    }).catch((error) => {
      console.error('[linear:webhook] failed to schedule durable sync worker', error);
    });

    // Linear retries non-2xx deliveries even when the inbox row was durably
    // written. The body reports queued/duplicate state; the transport status
    // must remain a successful acknowledgement for both paths.
    return c.json(result, 200);
  } catch (error) {
    if (error instanceof LinearWebhookError) {
      return c.json({ error: error.message }, error.status);
    }

    console.error('[linear:webhook] failed to capture delivery', error);
    return c.json({ error: 'Failed to capture Linear webhook' }, 500);
  }
};
