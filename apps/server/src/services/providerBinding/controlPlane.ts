import type {
  ConfigurationAuthority,
  InferenceContentBlock,
  InferenceEvent,
  InferenceMessage,
  InferenceMessageContent,
  InferenceRequest,
  InferenceToolCall,
  InferenceToolDefinition,
  ProviderBinding,
  ProviderConfigurationScope,
  ProviderModelCapability,
  TrustedProviderBackend,
} from '@orvilo/agent-execution/controlPlane';
import {
  CONTROL_PLANE_VERSION,
  createProviderConfigurationBroker,
} from '@orvilo/agent-execution/controlPlane';
import {
  type CredentialKVPayload,
  type ProviderBindingConfig,
  providerBindingUnavailableReason,
} from '@orvilo/types';
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
  private readonly verificationRequests = new Map<string, Promise<Response | undefined>>();

  constructor(
    private readonly db: OrviloDatabase,
    private readonly reuseProviderVerification = false,
  ) {}

  private async resolveConnection(binding: ProviderBinding) {
    const bindings = new ProviderBindingModel(this.db, binding.ownerId);
    const row = await bindings.find(binding.bindingId);
    const config = row?.config;
    if (!config || row?.revision !== binding.revision) return undefined;
    const reason = providerBindingUnavailableReason({ ...config, enabled: true });
    if (reason === 'endpoint' || reason === 'protocol' || reason === 'configuration')
      return undefined;
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
    // This cache lives only for one settings mutation. Re-resolve every binding
    // before reuse; the broker still rechecks its revision and authority afterwards.
    const key = JSON.stringify([
      binding.ownerId,
      binding.providerId,
      binding.secretReference,
      connection.endpoint,
      connection.headers,
      path,
    ]);
    let pending = this.reuseProviderVerification ? this.verificationRequests.get(key) : undefined;
    if (!pending) {
      pending = fetch(`${connection.endpoint}${path}`, {
        ...init,
        headers: { ...connection.headers, ...init.headers },
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      }).catch(() => undefined);
      if (this.reuseProviderVerification) this.verificationRequests.set(key, pending);
    }
    return (await pending)?.clone();
  }

  async check(binding: ProviderBinding): Promise<boolean> {
    // Probe a real completion to verify the provider connection. Batch checks
    // reuse one representative model's response; other models are catalog-checked,
    // not individually inference-tested.
    const response = await this.request(binding, '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: binding.modelRoutes[0],
        messages: [{ role: 'user', content: 'Hi' }],
        max_completion_tokens: 16,
        stream: false,
      }),
    });
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
      .map((route) => {
        const listedRoute = body?.data?.find((item) => item.id === route);
        const contextWindow =
          typeof listedRoute?.context_length === 'number' &&
          Number.isSafeInteger(listedRoute.context_length) &&
          listedRoute.context_length > 0
            ? listedRoute.context_length
            : undefined;
        return {
          contextWindow,
          images: false,
          maxOutputTokens:
            listedRoute?.max_output_tokens ??
            listedRoute?.context_length ??
            CAPABILITY_OUTPUT_FLOOR,
          modelRoute: route,
          text: true,
          // The OpenAI-compatible wire this backend drives carries a `tools`
          // parameter — the control plane can transport tool traffic for this
          // route. Whether the deployed model function-calls is not something
          // /models declares; a provider that rejects the parameter surfaces
          // a runtime error loudly rather than silently de-tooling.
          tools: true,
        };
      });
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
        const payload: Record<string, unknown> = {
          max_tokens: request.maxOutputTokens,
          messages: toOpenAiMessages(request.messages),
          model: request.modelRoute,
          stream: true,
          stream_options: { include_usage: true },
        };
        if (Array.isArray(request.tools) && request.tools.length > 0) {
          payload.tools = toOpenAiTools(request.tools);
        }
        if (typeof request.thinkingLevel === 'string' && request.thinkingLevel !== 'off') {
          payload.reasoning_effort = request.thinkingLevel;
        }
        if (typeof request.serviceTier === 'string') {
          payload.service_tier = request.serviceTier;
        }
        // Granted provider options merge last — they may legitimately override
        // the mapped fields above (e.g. a provider-specific thinking shape).
        if (isRecord(request.providerOptions)) {
          Object.assign(payload, request.providerOptions);
        }
        response = await fetch(`${connection.endpoint}/chat/completions`, {
          body: JSON.stringify(payload),
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
        const message = isRecord(first) ? first.message : undefined;
        if (isRecord(message)) {
          const reasoning = message.reasoning_content;
          if (typeof reasoning === 'string' && reasoning.length > 0) {
            yield { text: reasoning, type: 'thinking' };
          }
          const text = message.content;
          if (typeof text === 'string' && text.length > 0) yield { text, type: 'text' };
          if (Array.isArray(message.tool_calls)) {
            for (const [index, call] of message.tool_calls.entries()) {
              const parsed = parseOpenAiToolCall(call, index);
              if (!parsed) continue;
              yield { index, name: parsed.name, toolCallId: parsed.id, type: 'toolcall_start' };
              yield { index, toolCall: parsed, type: 'toolcall_end' };
            }
          }
        }
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
    const parser = new CompletionStreamParser();
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
          const events = parser.feed(frame);
          let ended = false;
          for (const event of events) {
            if (event === 'end') {
              ended = true;
              continue;
            }
            yield event;
          }
          if (ended) {
            for (const tail of parser.close()) yield tail;
            return;
          }
        }
      }
      const remaining = buffer.trim();
      if (remaining.length > 0) {
        for (const event of parser.feed(remaining)) {
          if (event !== 'end') yield event;
        }
      }
      for (const tail of parser.close()) yield tail;
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* Provider stream teardown is best-effort. */
      }
    }
  }
}

/** Provider-side view of a tool call still being streamed. */
interface OpenToolCall {
  argumentsText: string;
  id?: string;
  name?: string;
  started: boolean;
}

const parseArguments = (raw: string): Record<string, unknown> => {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) return parsed;
    return { _unparsed: raw };
  } catch {
    return { _unparsed: raw };
  }
};

const toToolCall = (call: OpenToolCall, index: number): InferenceToolCall => ({
  arguments: parseArguments(call.argumentsText),
  id: call.id ?? `tool_call_${index}`,
  name: call.name ?? 'tool',
  type: 'toolCall',
});

/** Map one raw `tool_calls` delta item onto parser state + events. */
const feedToolCallDelta = (
  open: Map<number, OpenToolCall>,
  item: unknown,
  fallbackIndex: number,
): InferenceEvent[] => {
  if (!isRecord(item)) return [];
  const index =
    typeof item.index === 'number' && Number.isSafeInteger(item.index) ? item.index : fallbackIndex;
  // A strictly greater index marks the previous call complete (providers
  // stream calls sequentially; nothing delivers an explicit per-call end).
  const events: InferenceEvent[] = [];
  for (const [openIndex, openCall] of open) {
    if (openIndex < index) {
      events.push({
        index: openIndex,
        toolCall: toToolCall(openCall, openIndex),
        type: 'toolcall_end',
      });
      open.delete(openIndex);
    }
  }
  let call = open.get(index);
  if (!call) {
    call = { argumentsText: '', started: false };
    open.set(index, call);
  }
  if (typeof item.id === 'string' && item.id.length > 0) call.id = item.id;
  const fn = isRecord(item.function) ? item.function : undefined;
  if (typeof fn?.name === 'string' && fn.name.length > 0) call.name = fn.name;
  if (!call.started) {
    call.started = true;
    events.push({ index, name: call.name, toolCallId: call.id, type: 'toolcall_start' });
  }
  if (typeof fn?.arguments === 'string' && fn.arguments.length > 0) {
    call.argumentsText += fn.arguments;
    events.push({
      argumentsDelta: fn.arguments,
      index,
      toolCallId: call.id,
      type: 'toolcall_delta',
    });
  }
  return events;
};

/** Non-streaming `message.tool_calls` items arrive complete. */
const parseOpenAiToolCall = (item: unknown, index: number): InferenceToolCall | undefined => {
  if (!isRecord(item)) return undefined;
  const fn = isRecord(item.function) ? item.function : undefined;
  const name = typeof fn?.name === 'string' ? fn.name : 'tool';
  const argumentsText = typeof fn?.arguments === 'string' ? fn.arguments : '';
  return {
    arguments: parseArguments(argumentsText),
    id: typeof item.id === 'string' && item.id ? item.id : `tool_call_${index}`,
    name,
    type: 'toolCall',
  };
};

/**
 * Stateful OpenAI-compatible SSE parser — one `data:` frame can carry
 * content, reasoning_content and tool_calls deltas at once, and tool calls
 * close only when a later index or the frame's finish_reason/DONE arrives.
 */
class CompletionStreamParser {
  private readonly open = new Map<number, OpenToolCall>();

  feed(frame: string): (InferenceEvent | 'end')[] {
    const events: (InferenceEvent | 'end')[] = [];
    for (const line of frame.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      if (data === '[DONE]') {
        events.push('end');
        continue;
      }
      const parsed: unknown = JSON.parse(data);
      if (!isRecord(parsed)) continue;
      if (parsed.error !== undefined) {
        events.push({
          error: { code: 'runtime_failed', message: 'Provider stream error', retryable: true },
          type: 'error',
        });
        continue;
      }
      const choices = parsed.choices;
      const first = isRecord(choices) ? undefined : Array.isArray(choices) ? choices[0] : undefined;
      if (isRecord(first)) {
        const delta = isRecord(first.delta) ? first.delta : undefined;
        if (delta) {
          const reasoning = delta.reasoning_content ?? delta.reasoning;
          if (typeof reasoning === 'string' && reasoning.length > 0) {
            events.push({ text: reasoning, type: 'thinking' });
          }
          if (typeof delta.content === 'string' && delta.content.length > 0) {
            events.push({ text: delta.content, type: 'text' });
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const [position, item] of delta.tool_calls.entries()) {
              events.push(...feedToolCallDelta(this.open, item, position));
            }
          }
        }
        if (typeof first.finish_reason === 'string' && first.finish_reason) {
          events.push(...this.flush());
        }
      }
      const usage = isRecord(parsed.usage) ? parsed.usage : undefined;
      if (
        typeof usage?.prompt_tokens === 'number' &&
        typeof usage?.completion_tokens === 'number'
      ) {
        events.push({
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          type: 'usage',
        });
      }
    }
    return events;
  }

  /** Emit toolcall_end for every still-open call — invoked at DONE/teardown. */
  close(): InferenceEvent[] {
    return this.flush();
  }

  private flush(): InferenceEvent[] {
    const events: InferenceEvent[] = [];
    for (const [index, call] of this.open) {
      events.push({ index, toolCall: toToolCall(call, index), type: 'toolcall_end' });
      this.open.delete(index);
    }
    return events;
  }
}

/** Map a contract content block onto the OpenAI parts shape. */
const toOpenAiPart = (block: InferenceContentBlock): Record<string, unknown> | undefined => {
  switch (block.type) {
    case 'text': {
      return { text: block.text, type: 'text' };
    }
    case 'image': {
      return {
        image_url: { url: `data:${block.mimeType};base64,${block.data}` },
        type: 'image_url',
      };
    }
    default: {
      // thinking/toolCall blocks have no place inside a message's content
      // parts — thinking is never echoed back; assistant tool_calls ride
      // their own field.
      return undefined;
    }
  }
};

const toOpenAiContent = (content: InferenceMessageContent): string | unknown[] => {
  if (typeof content === 'string') return content;
  const parts = content
    .map(toOpenAiPart)
    .filter((part): part is Record<string, unknown> => part !== undefined);
  // A single text part degrades to a plain string — the shape the widest set
  // of providers accepts unconditionally.
  if (parts.length === 1 && parts[0]?.type === 'text') return parts[0].text as string;
  return parts;
};

const toOpenAiMessages = (messages: InferenceMessage[]): Record<string, unknown>[] =>
  messages.map((message) => {
    if (message.role === 'assistant') {
      const toolCalls =
        typeof message.content === 'string'
          ? []
          : message.content.filter(
              (block): block is InferenceToolCall & { type: 'toolCall' } =>
                block.type === 'toolCall',
            );
      const wire: Record<string, unknown> = {
        content: toOpenAiContent(
          typeof message.content === 'string'
            ? message.content
            : message.content.filter((block) => block.type !== 'toolCall'),
        ),
        role: 'assistant',
      };
      if (toolCalls.length > 0) {
        wire.tool_calls = toolCalls.map((call) => ({
          function: {
            arguments: JSON.stringify(call.arguments ?? {}),
            name: call.name,
          },
          id: call.id,
          type: 'function',
        }));
      }
      return wire;
    }
    if (message.role === 'tool') {
      const wire: Record<string, unknown> = {
        content: toOpenAiContent(message.content),
        role: 'tool',
        tool_call_id: message.toolCallId,
      };
      if (typeof message.toolName === 'string' && message.toolName) {
        wire.name = message.toolName;
      }
      return wire;
    }
    return { content: toOpenAiContent(message.content), role: message.role };
  });

const toOpenAiTools = (tools: InferenceToolDefinition[]): Record<string, unknown>[] =>
  tools.map((tool) => ({
    function: {
      ...(tool.description ? { description: tool.description } : {}),
      name: tool.name,
      parameters: tool.parameters,
    },
    type: 'function',
  }));

/** Deployment composition for the canonical configuration broker. */
export function createProviderBindingComposition(
  db: OrviloDatabase,
  options: { reuseProviderVerification?: boolean } = {},
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
      backend: new SqlTrustedProviderBackend(db, options.reuseProviderVerification),
    }),
  };
}
