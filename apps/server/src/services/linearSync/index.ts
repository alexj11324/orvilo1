import { createHmac, timingSafeEqual } from 'node:crypto';

import { isRecord } from '@orvilo/utils';

import { LinearSyncModel } from '@/database/models/linearSync';
import type { LobeChatDatabase } from '@/database/type';

const DEFAULT_WEBHOOK_MAX_AGE_MS = 60_000;

export interface LinearWebhookPayload {
  action: string;
  actor?: Record<string, unknown> | null;
  createdAt?: string;
  data?: Record<string, unknown>;
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

export const parseLinearWebhookPayload = (rawBody: string): LinearWebhookPayload => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
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
    type: requiredString(parsed.type, 'type'),
    updatedFrom: isRecord(parsed.updatedFrom) ? parsed.updatedFrom : undefined,
    url: typeof parsed.url === 'string' ? parsed.url : undefined,
    webhookId: typeof parsed.webhookId === 'string' ? parsed.webhookId : undefined,
    webhookTimestamp,
  };
};

export const verifyLinearWebhookSignature = (input: {
  now?: number;
  rawBody: string;
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
  status: 'ignored' | 'pending_binding' | 'queued';
}

export class LinearSyncService {
  private readonly db: LobeChatDatabase;
  private readonly model: LinearSyncModel;

  constructor(db: LobeChatDatabase, workspaceId: string) {
    this.db = db;
    this.model = new LinearSyncModel(db, workspaceId);
  }

  async captureWebhook(input: {
    deliveryId: string;
    maxAgeMs?: number;
    now?: number;
    rawBody: string;
    secret: string;
    signature?: string | null;
    timestamp: number;
  }): Promise<CaptureLinearWebhookResult> {
    const payload = parseLinearWebhookPayload(input.rawBody);
    if (Math.abs(payload.webhookTimestamp - input.timestamp) > 1_000) {
      throw new LinearWebhookError('Linear webhook timestamp headers do not match', 401);
    }
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

    const installation = await this.model.findInstallationByOrganization(payload.organizationId);
    if (!installation) {
      throw new LinearWebhookError('Linear organization is not installed in this workspace', 404);
    }

    const captured = await this.model.captureDelivery({
      action: payload.action,
      deliveryId: input.deliveryId,
      eventType: payload.type,
      installationId: installation.id,
      organizationId: payload.organizationId,
      payload: payload as unknown as Record<string, unknown>,
      subjectId: extractSubjectId(payload),
      webhookId: payload.webhookId,
    });

    if (!captured.inserted) {
      return {
        deliveryId: input.deliveryId,
        duplicate: true,
        status: captured.row?.status === 'ignored' ? 'ignored' : 'queued',
      };
    }

    if (payload.type !== 'Issue') {
      await this.model.updateInbox(captured.row.id, {
        processedAt: new Date(),
        status: 'ignored',
      });
      return { deliveryId: input.deliveryId, duplicate: false, status: 'ignored' };
    }

    const subjectId = extractSubjectId(payload);
    const linearProjectId = extractLinearProjectId(payload);
    const link = subjectId ? await this.model.findIssueLinkByExternalId(subjectId) : null;
    const binding = linearProjectId
      ? await this.model.findBindingByLinearProjectId(linearProjectId)
      : null;

    const event = await this.model.recordDomainEvent({
      action: payload.action,
      eventId: input.deliveryId,
      idempotencyKey: `linear:${input.deliveryId}`,
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
      deliveryId: input.deliveryId,
      duplicate: false,
      planningRevision: event.event.revision,
      status: binding ? 'queued' : 'pending_binding',
    };
  }
}
