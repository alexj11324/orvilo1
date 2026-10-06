import { createHmac, timingSafeEqual } from 'node:crypto';

import { isRecord } from '@orvilo/utils/object';
import { z } from 'zod';

import type { McpEventInbox } from './deliveryTypes';
import type { SqlMcpEventBindingRepository } from './inbox';

const response = (status: number, code: string) => Response.json({ code }, { status });
const MAX_BODY_BYTES = 262_144;
const idSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const deliverySchema = z.string().uuid();
const resources = ['pull_request', 'workflow_run', 'check_run', 'check_suite'];

/** GitHub signs the original body bytes, without the MCP envelope or timestamp. */
export function verifyGitHubWebhookSignature(
  raw: Uint8Array,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^sha256=[a-f\d]{64}$/.test(signature)) return false;
  const actual = Buffer.from(signature.slice(7), 'hex');
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(actual, expected);
}

export class GitHubEventReceiver {
  constructor(
    private readonly dependencies: {
      bindings: Pick<SqlMcpEventBindingRepository, 'findByCallbackToken' | 'update'>;
      decrypt: (ciphertext: string) => Promise<{ plaintext: string; wasAuthentic: boolean }>;
      inbox: McpEventInbox;
      now?: () => number;
    },
  ) {}

  async receive(request: Request, callbackToken: string): Promise<Response> {
    if (request.method !== 'POST') return response(405, 'method_not_allowed');
    if (
      request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    )
      return response(415, 'json_required');
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES)
      return response(413, 'payload_too_large');
    try {
      const binding = await this.dependencies.bindings.findByCallbackToken(callbackToken);
      if (!binding || binding.sourceType !== 'github' || !binding.github)
        return response(404, 'unknown_callback');
      let now = (this.dependencies.now ?? Date.now)();
      if (binding.state === 'revoked' || (binding.expiresAt !== null && binding.expiresAt <= now))
        return response(410, 'subscription_inactive');
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
      const secret = await this.dependencies.decrypt(binding.github.encryptedSecret);
      if (!secret.wasAuthentic || !secret.plaintext) return response(503, 'receiver_unavailable');
      if (
        !verifyGitHubWebhookSignature(
          rawBody,
          request.headers.get('x-hub-signature-256'),
          secret.plaintext,
        )
      )
        return response(401, 'invalid_signature');
      let body: unknown;
      try {
        body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
      } catch {
        return response(400, 'invalid_body');
      }
      if (
        !isRecord(body) ||
        !isRecord(body.repository) ||
        !idSchema.safeParse(body.repository.id).success ||
        String(body.repository.id) !== binding.github.repositoryId
      )
        return response(400, 'repository_mismatch');
      const hookId = request.headers.get('x-github-hook-id');
      if (
        !hookId ||
        !/^[1-9]\d*$/.test(hookId) ||
        !Number.isSafeInteger(Number(hookId)) ||
        (binding.remoteSubscriptionId !== null && binding.remoteSubscriptionId !== hookId)
      )
        return response(401, 'subscription_mismatch');
      const delivery = deliverySchema.safeParse(request.headers.get('x-github-delivery'));
      if (!delivery.success) return response(400, 'invalid_delivery');
      const eventName = request.headers.get('x-github-event');
      now = (this.dependencies.now ?? Date.now)();
      if (binding.expiresAt !== null && binding.expiresAt <= now)
        return response(410, 'subscription_inactive');
      if (eventName === 'ping') {
        if (
          !isRecord(body.hook) ||
          !idSchema.safeParse(body.hook.id).success ||
          String(body.hook.id) !== hookId
        )
          return response(400, 'hook_mismatch');
        if (binding.state === 'active') return response(200, 'verified');
        const activated = await this.dependencies.bindings.update(
          binding,
          binding.id,
          binding.state,
          { remoteSubscriptionId: hookId, state: 'active' },
          binding.revision,
        );
        return activated ? response(200, 'verified') : response(409, 'binding_changed');
      }
      if (binding.state !== 'active' || binding.remoteSubscriptionId === null)
        return response(409, 'subscription_pending');
      if (
        !eventName ||
        !resources.includes(eventName) ||
        binding.eventName !== `github.${eventName}`
      )
        return response(202, 'ignored');
      if (
        typeof body.action !== 'string' ||
        !/^[a-z][a-z0-9_]{0,63}$/.test(body.action) ||
        !isRecord(body[eventName]) ||
        !idSchema.safeParse(body[eventName].id).success
      )
        return response(400, 'invalid_event_data');
      const accepted = await this.dependencies.inbox.accept({
        bindingRevision: binding.revision,
        connectorId: binding.connectorId,
        event: {
          data: body,
          eventId: delivery.data,
          name: binding.eventName,
          timestamp: new Date(now).toISOString(),
        },
        rawBody,
        receivedAt: now,
        schemaId: binding.schemaId,
        subscriptionId: binding.id,
        tenantId: binding.tenantId,
      });
      if (accepted === 'conflict') return response(409, 'event_id_conflict');
      if (accepted === 'overloaded')
        return Response.json(
          { code: 'receiver_overloaded' },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      return response(202, accepted);
    } catch {
      return response(503, 'receiver_unavailable');
    }
  }
}
