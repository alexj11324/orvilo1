import { createHmac, timingSafeEqual } from 'node:crypto';

import { isRecord } from '@orvilo/utils/object';
import Ajv from 'ajv';

import type { McpEventBinding, McpEventInbox } from './deliveryTypes';
import {
  decodeMcpSigningSecret,
  mcpEventOccurrenceSchema,
  mcpVerificationChallengeSchema,
} from './protocol';

export interface McpReceiverBindings {
  findByCallbackToken: (token: string) => Promise<McpEventBinding | undefined>;
  verifyPending: (
    token: string,
    remoteId: string,
    webhookId: string,
    challenge: string,
    now: number,
    expectedRevision?: number,
  ) => Promise<boolean>;
}

const response = (status: number, code: string) => Response.json({ code }, { status });
const MAX_BODY_BYTES = 262_144;
const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Verify Standard Webhooks v1 over the original byte sequence, including whitespace. */
export function verifyMcpWebhookSignature(
  rawBody: Uint8Array,
  headers: Headers,
  binding: McpEventBinding,
  now: number,
) {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  const seconds = Number(timestamp);
  if (
    !Number.isSafeInteger(seconds) ||
    Math.abs(Math.floor(now / 1000) - seconds) > SIGNATURE_TOLERANCE_SECONDS
  )
    return false;
  const candidates = signatures.split(/\s+/).filter((value) => value.startsWith('v1,'));
  return binding.signingKeys.some((key) => {
    if (key.expiresAt !== undefined && key.expiresAt <= now) return false;
    const expected = createHmac('sha256', decodeMcpSigningSecret(key.secret))
      .update(`${id}.${timestamp}.`)
      .update(rawBody)
      .digest();
    return candidates.some((candidate) => {
      const signature = candidate.slice(3);
      if (!/^[A-Z0-9+/]{43}=$/i.test(signature)) return false;
      const decoded = Buffer.from(signature, 'base64');
      return decoded.length === expected.length && timingSafeEqual(decoded, expected);
    });
  });
}

export class McpEventReceiver {
  // Unsupported formats/keywords fail compilation rather than silently weakening a schema.
  private readonly ajv = new Ajv({ strict: true, allErrors: false, validateFormats: true });

  constructor(
    private readonly dependencies: {
      inbox: McpEventInbox;
      bindings: McpReceiverBindings;
      now?: () => number;
    },
  ) {}

  async receive(request: Request, callbackToken: string): Promise<Response> {
    if (request.method !== 'POST') return response(405, 'method_not_allowed');
    if (
      request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    )
      return response(415, 'json_required');
    const declaredLength = request.headers.get('content-length');
    if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES)
      return response(413, 'payload_too_large');
    let now = (this.dependencies.now ?? Date.now)();
    try {
      const binding = await this.dependencies.bindings.findByCallbackToken(callbackToken);
      if (!binding || binding.sourceType === 'github') return response(404, 'unknown_callback');
      if (binding.state === 'revoked' || (binding.expiresAt !== null && binding.expiresAt <= now))
        return response(410, 'subscription_inactive');
      // Read a bounded stream: an absent/misleading content-length cannot allocate an unbounded body.
      const reader = request.body?.getReader();
      if (!reader) return response(400, 'invalid_body');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return response(413, 'payload_too_large');
        }
        chunks.push(chunk.value);
      }
      const rawBody = Buffer.concat(chunks, size);
      now = (this.dependencies.now ?? Date.now)();
      if (binding.expiresAt !== null && binding.expiresAt <= now)
        return response(410, 'subscription_inactive');
      const remoteId = request.headers.get('x-mcp-subscription-id');
      if (
        !remoteId ||
        (binding.remoteSubscriptionId !== null && remoteId !== binding.remoteSubscriptionId)
      )
        return response(401, 'subscription_mismatch');
      if (!verifyMcpWebhookSignature(rawBody, request.headers, binding, now))
        return response(401, 'invalid_signature');
      let body: unknown;
      try {
        body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
      } catch {
        return response(400, 'invalid_body');
      }
      const challenge = mcpVerificationChallengeSchema.safeParse(body);
      if (challenge.success) {
        const verified = await this.dependencies.bindings.verifyPending(
          callbackToken,
          remoteId,
          request.headers.get('webhook-id')!,
          challenge.data.challenge,
          now,
          binding.revision,
        );
        return verified
          ? Response.json({ challenge: challenge.data.challenge })
          : response(409, 'challenge_replay');
      }
      // Zod strips unknown keys, so examine the wire envelope before parsing control type.
      if (isRecord(body) && 'type' in body) return response(400, 'unsupported_control');
      if (binding.state !== 'active' || binding.remoteSubscriptionId === null)
        return response(409, 'subscription_pending');
      const parsed = mcpEventOccurrenceSchema.safeParse(body);
      if (
        !parsed.success ||
        parsed.data.eventId !== request.headers.get('webhook-id') ||
        parsed.data.name !== binding.eventName
      )
        return response(400, 'event_mismatch');
      if (!this.ajv.validate(binding.payloadSchema, parsed.data.data))
        return response(400, 'invalid_event_data');
      const accepted = await this.dependencies.inbox.accept({
        bindingRevision: binding.revision,
        tenantId: binding.tenantId,
        connectorId: binding.connectorId,
        schemaId: binding.schemaId,
        subscriptionId: binding.id,
        event: parsed.data,
        rawBody,
        receivedAt: now,
      });
      if (accepted === 'conflict') return response(409, 'event_id_conflict');
      if (accepted === 'overloaded')
        return Response.json(
          { code: 'receiver_overloaded' },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      return response(202, accepted);
    } catch {
      // Storage/configuration errors remain retryable; never leak payloads or credentials.
      return response(503, 'receiver_unavailable');
    }
  }
}
