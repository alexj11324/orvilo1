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
import type { CredentialKVPayload, StoredProviderBindingConfig } from '@orvilo/types';
import { eq } from 'drizzle-orm';

import { CredentialModel } from '@/database/models/credential';
import { ProviderBindingModel } from '@/database/models/providerBinding';
import { users } from '@/database/schemas/user';
import type { OrviloDatabase } from '@/database/type';

import type { ProviderConfigurationComposition } from './configuration';

const PROVIDER_REQUEST_TIMEOUT_MS = 15_000;
/** Headers a credential may never override through stored values. */
const RESERVED_HEADERS = new Set(['content-length', 'host', 'transfer-encoding']);

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
 * Conservative output-token floor for capability listings when the provider's
 * model catalog publishes no limits — understates rather than fabricates.
 */
const CAPABILITY_OUTPUT_FLOOR = 4096;

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
  row:
    | { config: StoredProviderBindingConfig; id: string; revision: number; userId: string }
    | undefined,
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
class SqlTrustedProviderBackend implements TrustedProviderBackend {
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

  async *infer(binding: ProviderBinding, request: InferenceRequest): AsyncIterable<InferenceEvent> {
    const response = await this.request(binding, '/chat/completions', {
      body: JSON.stringify({
        max_tokens: request.maxOutputTokens,
        messages: request.messages,
        model: request.modelRoute,
        stream: false,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response?.ok) {
      yield {
        error: { code: 'runtime_failed', message: 'Provider request failed', retryable: true },
        type: 'error',
      };
      return;
    }
    const body = (await response.json().catch(() => undefined)) as
      | {
          choices?: { message?: { content?: string } }[];
          usage?: { completion_tokens?: number; prompt_tokens?: number };
        }
      | undefined;
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text === 'string' && text.length > 0) yield { text, type: 'text' };
    const usage = body?.usage;
    if (typeof usage?.prompt_tokens === 'number' && typeof usage?.completion_tokens === 'number') {
      yield {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        type: 'usage',
      };
    }
  }
}

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
