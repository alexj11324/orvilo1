import type {
  ConfigurationAuthority,
  InferenceEvent,
  InferenceRequest,
  ProviderBinding,
  ProviderConfigurationScope,
  ProviderModelCapability,
  TrustedProviderBackend,
} from '@orvilo/agent-execution/controlPlane';
import {
  CONTROL_PLANE_VERSION,
  createProviderConfigurationBroker,
} from '@orvilo/agent-execution/controlPlane';
import type { CredentialKVPayload, ProviderBindingConfig } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';
import { eq } from 'drizzle-orm';

import { CredentialModel } from '@/database/models/credential';
import { ProviderBindingModel } from '@/database/models/providerBinding';
import { users } from '@/database/schemas/user';
import type { OrviloDatabase } from '@/database/type';

import type { ProviderConfigurationComposition } from './configuration';

const PROVIDER_REQUEST_TIMEOUT_MS = 15_000;
/**
 * Real completions take far longer than the catalog/check budget. Bounded by
 * the caller's iterator cancellation (broker.cancel unwinds the fetch) plus
 * this ceiling for a provider that never finishes.
 */
const PROVIDER_INFER_TIMEOUT_MS = 300_000;
/** Headers a credential may never override through stored values. */
const RESERVED_HEADERS = new Set(['content-length', 'host', 'transfer-encoding']);
/**
 * Conservative output-token floor for capability listings when the provider's
 * model catalog publishes no limits — understates rather than fabricates.
 */
const CAPABILITY_OUTPUT_FLOOR = 4096;

/**
 * Decrypt the referenced personal credential and map it onto provider request
 * headers. `kv-header` secrets forward their stored headers verbatim (minus
 * reserved hop-by-hop names); `kv-env` secrets fold into the two de-facto auth
 * headers (`Authorization: Bearer` + `x-api-key`). The mapping stays inside
 * this trusted boundary — the returned headers are request material, never a
 * client-facing representation.
 */
export const resolveProviderCredentialHeaders = async (
  db: OrviloDatabase,
  ownerId: string,
  secretReference: string,
): Promise<Record<string, string> | undefined> => {
  const credentials = new CredentialModel(db, ownerId);
  const credential = await credentials.findPersonalById(
    secretReference.slice('credential:'.length),
  );
  if (!credential) return undefined;
  const payload = await credentials.decryptPayload(credential);
  if (!payload || typeof payload !== 'object' || !('values' in payload)) return undefined;
  const headers: Record<string, string> = {};
  const values = (payload as CredentialKVPayload).values ?? {};
  if (credential.type === 'kv-header') {
    for (const [name, value] of Object.entries(values)) {
      if (!RESERVED_HEADERS.has(name.toLowerCase())) headers[name] = value;
    }
  } else {
    // Env-style keys become the two de-facto provider auth headers.
    const secret =
      Object.entries(values).find(([key]) => /KEY|TOKEN|SECRET|AUTH/i.test(key))?.[1] ??
      Object.values(values)[0];
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
      headers['x-api-key'] = secret;
    }
  }
  return Object.keys(headers).length === 0 ? undefined : headers;
};

/**
 * Personal-scope convention: a binding is tenant-scoped to its owning user,
 * so tenantId === ownerId === the users row id. The persisted `updatedAt`
 * timestamps the authority snapshot — any account change bumps the revision
 * the configuration broker's pre/post recheck compares.
 */
const authorizePersonalScope =
  (db: OrviloDatabase) =>
  async (userId: string): Promise<ProviderConfigurationScope> => {
    const [user] = await db
      .select({ updatedAt: users.updatedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return {
      authorityRevision: user?.updatedAt.getTime() ?? 0,
      ownerId: userId,
      principalId: userId,
      tenantId: userId,
    };
  };

const toContractBinding = (
  row: { config: ProviderBindingConfig; id: string; revision: number; userId: string } | undefined,
): ProviderBinding => {
  const config = row?.config;
  return {
    bindingId: row?.id ?? '',
    modelRoutes: config?.model ? [config.model] : [],
    ownerId: row?.userId ?? '',
    providerId: config?.provider ?? '',
    revision: row?.revision ?? -1,
    schemaVersion: CONTROL_PLANE_VERSION,
    secretReference: config?.secretReference ?? '',
    tenantId: row?.userId ?? '',
  };
};

/**
 * Trusted backend: resolves the persisted endpoint/model and decrypts the
 * referenced credential inside this boundary — raw secrets and endpoints
 * never cross it. `check` must make a real provider request; a stored
 * configuration row alone never yields `ready`.
 */
export class SqlTrustedProviderBackend implements TrustedProviderBackend {
  constructor(private readonly db: OrviloDatabase) {}

  private async resolveConnection(binding: ProviderBinding) {
    const bindings = new ProviderBindingModel(this.db, binding.ownerId);
    const row = await bindings.find(binding.bindingId);
    const config = row?.config;
    if (!config || row?.revision !== binding.revision) return undefined;
    const headers = await resolveProviderCredentialHeaders(
      this.db,
      binding.ownerId,
      binding.secretReference,
    );
    if (!headers) return undefined;
    return { endpoint: config.endpoint.replace(/\/+$/, ''), headers, model: config.model };
  }

  private async request(
    binding: ProviderBinding,
    path: string,
    init: RequestInit,
  ): Promise<Response | undefined> {
    const connection = await this.resolveConnection(binding);
    if (!connection) return undefined;
    try {
      return await fetch(`${connection.endpoint}${path}`, {
        ...init,
        headers: { ...connection.headers, ...init.headers },
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      });
    } catch {
      return undefined;
    }
  }

  async check(binding: ProviderBinding): Promise<boolean> {
    // A real OpenAI-compatible model catalog read — the binding must prove
    // endpoint reachability AND credential acceptance, not just stored shape.
    const response = await this.request(binding, '/models', { method: 'GET' });
    return response?.ok === true;
  }

  async capabilities(binding: ProviderBinding): Promise<ProviderModelCapability[]> {
    const response = await this.request(binding, '/models', { method: 'GET' });
    if (!response?.ok) return [];
    const body = (await response.json().catch(() => undefined)) as
      { data?: { context_length?: number; id?: string; max_output_tokens?: number }[] } | undefined;
    const listed = new Set(
      (body?.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id)),
    );
    return binding.modelRoutes
      .filter((route) => listed.has(route))
      .map((route) => ({
        images: false,
        maxOutputTokens:
          body?.data?.find((item) => item.id === route)?.max_output_tokens ??
          body?.data?.find((item) => item.id === route)?.context_length ??
          CAPABILITY_OUTPUT_FLOOR,
        modelRoute: route,
        text: true,
        tools: false,
      }));
  }

  async *infer(
    binding: ProviderBinding,
    request: InferenceRequest,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<InferenceEvent> {
    const connection = await this.resolveConnection(binding);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_INFER_TIMEOUT_MS);
    // Callers (broker.cancel, session.abort) abort us here — the fetch signal
    // drops the held upstream request immediately.
    options?.signal?.addEventListener('abort', () => controller.abort(), { once: true });
    if (options?.signal?.aborted) controller.abort();
    try {
      if (!connection) {
        yield {
          error: { code: 'runtime_failed', message: 'Provider request failed', retryable: true },
          type: 'error',
        };
        return;
      }
      let response: Response | undefined;
      try {
        response = await fetch(`${connection.endpoint}/chat/completions`, {
          body: JSON.stringify({
            max_tokens: request.maxOutputTokens,
            messages: request.messages,
            model: request.modelRoute,
            stream: true,
            stream_options: { include_usage: true },
          }),
          headers: { 'content-type': 'application/json', ...connection.headers },
          method: 'POST',
          signal: controller.signal,
        });
      } catch {
        response = undefined;
      }
      if (!response?.ok) {
        yield {
          error: { code: 'runtime_failed', message: 'Provider request failed', retryable: true },
          type: 'error',
        };
        return;
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/event-stream')) {
        yield* this.streamCompletions(response);
        return;
      }
      // Some providers silently ignore `stream` and answer JSON instead.
      const body: unknown = await response.json().catch(() => undefined);
      if (isRecord(body)) {
        const first = Array.isArray(body.choices) ? body.choices[0] : undefined;
        const text = isRecord(first) && isRecord(first.message) ? first.message.content : undefined;
        if (typeof text === 'string' && text.length > 0) yield { text, type: 'text' };
        const usage = isRecord(body.usage) ? body.usage : undefined;
        if (
          typeof usage?.prompt_tokens === 'number' &&
          typeof usage?.completion_tokens === 'number'
        ) {
          yield {
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            type: 'usage',
          };
        }
      }
    } finally {
      // On early iterator exit (broker.cancel / revocation), abort the open
      // provider call rather than letting it run to its own timeout.
      clearTimeout(timer);
      controller.abort();
    }
  }

  private async *streamCompletions(response: Response): AsyncIterable<InferenceEvent> {
    if (!response.body) {
      yield {
        error: { code: 'runtime_failed', message: 'Provider stream ended', retryable: true },
        type: 'error',
      };
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replaceAll('\r\n', '\n');
        for (;;) {
          const end = buffer.indexOf('\n\n');
          if (end === -1) break;
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = parseCompletionFrame(frame);
          if (event === 'end') return;
          if (event) yield event;
        }
      }
      const remaining = buffer.trim();
      if (remaining.length > 0) {
        const event = parseCompletionFrame(remaining);
        if (event !== 'end' && event) yield event;
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* Provider stream teardown is best-effort. */
      }
    }
  }
}

/**
 * One OpenAI-compatible SSE frame → one contract event. Providers emit a single
 * `data:` line per frame; extra/keepalive lines are ignored and `[DONE]` closes.
 * Malformed JSON throws — the inference broker sanitizes it to a loud error.
 */
const parseCompletionFrame = (frame: string): InferenceEvent | 'end' | undefined => {
  for (const line of frame.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    if (data === '[DONE]') return 'end';
    const parsed: unknown = JSON.parse(data);
    if (!isRecord(parsed)) return undefined;
    if (parsed.error !== undefined) {
      return {
        error: { code: 'runtime_failed', message: 'Provider stream error', retryable: true },
        type: 'error',
      };
    }
    const choices = parsed.choices;
    const first = isRecord(choices) ? undefined : Array.isArray(choices) ? choices[0] : undefined;
    const delta = isRecord(first) && isRecord(first.delta) ? first.delta.content : undefined;
    if (typeof delta === 'string' && delta.length > 0) return { text: delta, type: 'text' };
    const usage = isRecord(parsed.usage) ? parsed.usage : undefined;
    if (typeof usage?.prompt_tokens === 'number' && typeof usage?.completion_tokens === 'number') {
      return {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        type: 'usage',
      };
    }
  }
  return undefined;
};

/** Deployment composition for the canonical configuration broker. */
export function createProviderBindingComposition(
  db: OrviloDatabase,
): ProviderConfigurationComposition {
  const authorizeScope = authorizePersonalScope(db);
  const authority: ConfigurationAuthority = {
    resolve: async (request) => {
      const ownerId = request.scope.ownerId;
      const [scope, [user], row] = await Promise.all([
        authorizeScope(ownerId),
        db.select({ banned: users.banned }).from(users).where(eq(users.id, ownerId)).limit(1),
        new ProviderBindingModel(db, ownerId).find(request.bindingId),
      ]);
      return {
        binding: toContractBinding(row),
        canCheck: Boolean(user && !user.banned),
        revoked: Boolean(user?.banned),
        scope,
      };
    },
  };
  return {
    authorizeScope,
    broker: createProviderConfigurationBroker({
      authority,
      backend: new SqlTrustedProviderBackend(db),
    }),
  };
}
