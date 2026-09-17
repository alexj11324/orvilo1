import type { Context } from 'hono';

import { LinearSyncModel } from '@/database/models/linearSync';
import { getServerDB } from '@/database/server';
import { linearEnv } from '@/envs/linear';
import {
  LinearSyncService,
  LinearWebhookError,
  parseLinearWebhookPayload,
  verifyLinearWebhookSignature,
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

  // Keep the original request bytes. Linear signs the exact body, so parsing
  // or re-serializing JSON before verification would change the message.
  const rawBody = new Uint8Array(await c.req.raw.arrayBuffer());
  const signature = c.req.header('linear-signature');
  const timestampHeader = c.req.header('linear-timestamp');
  const timestamp = Number(timestampHeader);

  if (!timestampHeader || !Number.isFinite(timestamp)) {
    return c.json({ error: 'Linear webhook headers are incomplete' }, 400);
  }

  try {
    const db = await getServerDB();
    const installationModel = new LinearSyncModel(db, workspaceId);
    const installations = await installationModel.listInstallationWebhookCandidates();
    const verificationCandidates = [
      ...(linearEnv.LINEAR_WEBHOOK_SIGNING_SECRET
        ? [{ installationId: null, secret: linearEnv.LINEAR_WEBHOOK_SIGNING_SECRET }]
        : []),
      ...installations.flatMap((candidate) => {
        if (candidate.status !== 'active' || !candidate.webhookSecretRef) return [];
        const secret = process.env[candidate.webhookSecretRef];
        return secret ? [{ installationId: candidate.id, secret }] : [];
      }),
    ];
    if (verificationCandidates.length === 0) {
      console.error('[linear:webhook] webhook secret is not configured');
      return c.json({ error: 'Linear webhook verification is not configured' }, 503);
    }

    const verifiedCandidates = verificationCandidates.filter(({ secret }) =>
      verifyLinearWebhookSignature({
        now: Date.now(),
        rawBody,
        secret,
        signature,
        timestamp,
      }),
    );
    if (verifiedCandidates.length === 0) {
      return c.json({ error: 'Linear webhook signature or timestamp is invalid' }, 401);
    }

    // Only now is organizationId trusted for installation lookup. If a
    // workspace uses per-installation secrets, the authenticated candidate
    // must also be the organization selected by the signed payload.
    const payload = parseLinearWebhookPayload(rawBody);
    const installation = await installationModel.findInstallationByOrganization(
      payload.organizationId,
    );
    if (!installation) {
      return c.json({ error: 'Linear organization is not installed in this workspace' }, 404);
    }
    if (installation.status !== 'active') {
      return c.json({ error: 'Linear installation is unavailable' }, 404);
    }
    const globalCandidate = verifiedCandidates.find(
      ({ installationId }) => installationId === null,
    );
    const installationCandidate = verifiedCandidates.find(
      ({ installationId }) => installationId === installation.id,
    );
    if (!globalCandidate && !installationCandidate) {
      return c.json({ error: 'Linear webhook organization is not authenticated' }, 401);
    }
    const secret = installationCandidate?.secret ?? globalCandidate?.secret;
    if (!secret) return c.json({ error: 'Linear webhook signature is invalid' }, 401);

    const result = await new LinearSyncService(db, workspaceId).captureWebhook({
      now: Date.now(),
      rawBody,
      secret,
      signature,
      timestamp,
    });

    // Await the durable enqueue before acknowledging. If enqueueing fails,
    // Linear retries the same delivery; captureWebhook is idempotent, so that
    // retry schedules the already-persisted inbox row without duplicating it.
    if (result.status === 'queued' || result.status === 'pending_binding') {
      try {
        await LinearSyncWorkflow.trigger({
          installationId: installation.id,
          limit: 20,
          workspaceId,
        });
      } catch (error) {
        console.error('[linear:webhook] failed to schedule durable sync worker', error);
        return c.json({ error: 'Linear delivery was captured but could not be scheduled' }, 503);
      }
    }

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
