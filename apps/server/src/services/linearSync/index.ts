import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { isRecord } from '@orvilo/utils';

import { LinearSyncModel } from '@/database/models/linearSync';
import type { LobeChatDatabase } from '@/database/type';

const DEFAULT_WEBHOOK_MAX_AGE_MS = 60_000;

export type LinearWebhookRawBody = string | Uint8Array;

export interface LinearWebhookPayload {
  action: string;
  actor?: Record<string, unknown> | null;
  createdAt?: string;
  data?: Record<string, unknown>;
  oauthClientId?: string;
  organizationId: string;
  type: string;
  updatedFrom?: Record<string, unknown>;
  url?: string;
  webhookId?: string;
  webhookTimestamp: number;
}

export class LinearWebhookError extends Error {
  readonly status: 400 | 401 | 404;

  constructor(message: string, status: 400 | 401 | 404) {
    super(message);
    this.name = 'LinearWebhookError';
    this.status = status;
  }
}

const requiredString = (value: unknown, field: string) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new LinearWebhookError(`Linear webhook field "${field}" is missing`, 400);
  }
  return value;
};

const decodeLinearWebhookBody = (rawBody: LinearWebhookRawBody): string =>
  typeof rawBody === 'string' ? rawBody : new TextDecoder().decode(rawBody);

export const parseLinearWebhookPayload = (rawBody: LinearWebhookRawBody): LinearWebhookPayload => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeLinearWebhookBody(rawBody));
  } catch {
    throw new LinearWebhookError('Linear webhook body is not valid JSON', 400);
  }

  if (!isRecord(parsed)) {
    throw new LinearWebhookError('Linear webhook body must be an object', 400);
  }

  const webhookTimestamp = parsed.webhookTimestamp;
  if (typeof webhookTimestamp !== 'number' || !Number.isFinite(webhookTimestamp)) {
    throw new LinearWebhookError('Linear webhook timestamp is missing', 400);
  }

  return {
    action: requiredString(parsed.action, 'action'),
    actor: isRecord(parsed.actor) ? parsed.actor : null,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined,
    data: isRecord(parsed.data) ? parsed.data : undefined,
    organizationId: requiredString(parsed.organizationId, 'organizationId'),
    oauthClientId: typeof parsed.oauthClientId === 'string' ? parsed.oauthClientId : undefined,
    type: requiredString(parsed.type, 'type'),
    updatedFrom: isRecord(parsed.updatedFrom) ? parsed.updatedFrom : undefined,
    url: typeof parsed.url === 'string' ? parsed.url : undefined,
    webhookId: typeof parsed.webhookId === 'string' ? parsed.webhookId : undefined,
    webhookTimestamp,
  };
};

/**
 * Linear-Delivery is transport metadata and is not covered by the HMAC. Use
 * the authenticated request bytes as the durable receipt identity instead.
 */
export const deriveLinearWebhookDeliveryId = (rawBody: LinearWebhookRawBody): string =>
  `body:${createHash('sha256').update(rawBody).digest('hex')}`;

export const verifyLinearWebhookSignature = (input: {
  now?: number;
  rawBody: LinearWebhookRawBody;
  secret: string;
  signature?: string | null;
  timestamp: number;
  maxAgeMs?: number;
}): boolean => {
  if (!input.signature || !input.secret) return false;

  const age = Math.abs((input.now ?? Date.now()) - input.timestamp);
  if (age > (input.maxAgeMs ?? DEFAULT_WEBHOOK_MAX_AGE_MS)) return false;

  const expected = createHmac('sha256', input.secret).update(input.rawBody).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(input.signature, 'hex');
  } catch {
    return false;
  }

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

const extractSubjectId = (payload: LinearWebhookPayload) => {
  const subjectId = payload.data?.id;
  return typeof subjectId === 'string' ? subjectId : undefined;
};

const extractLinearProjectId = (payload: LinearWebhookPayload) => {
  const project = payload.data?.project;
  return isRecord(project) && typeof project.id === 'string' ? project.id : undefined;
};

export interface CaptureLinearWebhookResult {
  deliveryId: string;
  duplicate: boolean;
  planningRevision?: number;
  status: 'ignored' | 'pending_binding' | 'processed' | 'queued';
}

export class LinearSyncService {
  private readonly db: LobeChatDatabase;
  private readonly model: LinearSyncModel;

  constructor(db: LobeChatDatabase, workspaceId: string) {
    this.db = db;
    this.model = new LinearSyncModel(db, workspaceId);
  }

  async captureWebhook(input: {
    maxAgeMs?: number;
    now?: number;
    rawBody: LinearWebhookRawBody;
    secret: string;
    signature?: string | null;
    timestamp: number;
  }): Promise<CaptureLinearWebhookResult> {
    if (
      !verifyLinearWebhookSignature({
        maxAgeMs: input.maxAgeMs,
        now: input.now,
        rawBody: input.rawBody,
        secret: input.secret,
        signature: input.signature,
        timestamp: input.timestamp,
      })
    ) {
      throw new LinearWebhookError('Linear webhook signature or timestamp is invalid', 401);
    }

    // Authenticate the exact request bytes before parsing organizationId or
    // using it to select an installation-specific secret.
    const payload = parseLinearWebhookPayload(input.rawBody);
    const deliveryId = deriveLinearWebhookDeliveryId(input.rawBody);
    if (Math.abs(payload.webhookTimestamp - input.timestamp) > 1_000) {
      throw new LinearWebhookError('Linear webhook timestamp headers do not match', 401);
    }

    const installation = await this.model.findInstallationByOrganization(payload.organizationId);
    if (!installation || installation.status !== 'active') {
      throw new LinearWebhookError('Linear organization is not installed in this workspace', 404);
    }

    const captured = await this.model.captureDelivery({
      action: payload.action,
      deliveryId,
      eventType: payload.type,
      installationId: installation.id,
      organizationId: payload.organizationId,
      payload: payload as unknown as Record<string, unknown>,
      subjectId: extractSubjectId(payload),
      webhookId: payload.webhookId,
    });

    if (!captured.inserted) {
      return {
        deliveryId,
        duplicate: true,
        status:
          captured.row?.status === 'ignored'
            ? 'ignored'
            : captured.row?.status === 'processed'
              ? 'processed'
              : 'queued',
      };
    }

    if (
      payload.type === 'OAuthApp' &&
      payload.action === 'revoked' &&
      payload.oauthClientId &&
      payload.oauthClientId === installation.oauthClientId
    ) {
      await this.model.markInstallationUnavailable(installation.id, {
        message: 'Linear OAuth app authorization was revoked by the organization',
        reason: 'oauth_app_revoked',
        status: 'revoked',
      });
      await this.model.updateInbox(captured.row.id, {
        processedAt: new Date(),
        status: 'processed',
      });
      return { deliveryId, duplicate: false, status: 'processed' };
    }

    if (payload.type !== 'Issue') {
      await this.model.updateInbox(captured.row.id, {
        processedAt: new Date(),
        status: 'ignored',
      });
      return { deliveryId, duplicate: false, status: 'ignored' };
    }

    const subjectId = extractSubjectId(payload);
    const linearProjectId = extractLinearProjectId(payload);
    const link = subjectId ? await this.model.findIssueLinkByExternalId(subjectId) : null;
    const binding = linearProjectId
      ? await this.model.findBindingByLinearProjectId(linearProjectId)
      : null;

    if (!binding) {
      await this.model.updateInbox(captured.row.id, {
        processedAt: null,
        status: 'pending_binding',
      });
      return {
        deliveryId,
        duplicate: false,
        status: 'pending_binding',
      };
    }

    const event = await this.model.recordDomainEvent({
      action: payload.action,
      eventId: deliveryId,
      idempotencyKey: `linear:${deliveryId}`,
      payload: payload as unknown as Record<string, unknown>,
      projectId: binding?.projectId,
      source: 'linear',
      taskId: link?.taskId,
      type: 'linear.issue.changed',
    });

    // The delivery is durable and has woken the planner, but no task mutation
    // has happened yet. A later worker owns reconciliation; do not mark the
    // inbox row processed merely because the HTTP request was acknowledged.
    const status = binding ? 'received' : 'pending_binding';
    await this.model.updateInbox(captured.row.id, {
      processedAt: null,
      status,
    });

    return {
      deliveryId,
      duplicate: false,
      planningRevision: event.event.revision,
      status: binding ? 'queued' : 'pending_binding',
    };
  }
}
