import { computePromptHash, resolveScenario } from '@orvilo/llm-generation-tracing';
import type { GenerateObjectPayload, GenerateObjectSchema } from '@orvilo/model-runtime';
import type { AgentOperationStatus, OpenAIChatMessage } from '@orvilo/types';
import { isTerminalAgentOperationStatus } from '@orvilo/types';
import Ajv from 'ajv';
import debug from 'debug';

import { AgentModel } from '@/database/models/agent';
import { AgentOperationModel } from '@/database/models/agentOperation';
import { MessageModel } from '@/database/models/message';
import type { AgentOperationItem } from '@/database/schemas/agentOperations';
import type { OrviloDatabase } from '@/database/type';
import { getLLMGenerationTracingService } from '@/server/services/llmGenerationTracing';

const log = debug('orvilo-server:ai-generation:judgment');

/**
 * Operator-configured fallback binding for retained judgments: an agent id or
 * builtin slug the deployment designates for machine judgments. Individual
 * consumers always prefer their own domain binding (task assignee, verify
 * agent, project coordinator, ...) and only reach this env var when the domain
 * has no natural agent.
 */
export const ACP_JUDGMENT_AGENT_ENV = 'ACP_JUDGMENT_AGENT_ID';

/** Trigger stamped on judgment operations and topics for audit queries. */
export const ACP_JUDGMENT_TRIGGER = 'acp_judgment';

const DEFAULT_MAX_STEPS = 4;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * A retained judgment was asked for without an authorized ACP binding. This is
 * the explicit-block contract: the caller receives a typed error it may surface
 * or convert to a blocked domain state, but there is NO silent fallback to the
 * deployment provider credentials.
 */
export class AcpJudgmentBindingError extends Error {
  readonly code = 'ACP_JUDGMENT_NO_BINDING' as const;

  constructor(purpose: string, reason?: string) {
    super(
      `No authorized ACP judgment agent for "${purpose}". ${reason ?? `Bind an agent (domain binding or ${ACP_JUDGMENT_AGENT_ENV}) — deployment credentials are never used as a fallback for judgments.`}`,
    );
    this.name = 'AcpJudgmentBindingError';
  }
}

export const isAcpJudgmentBindingError = (error: unknown): error is AcpJudgmentBindingError =>
  error instanceof AcpJudgmentBindingError ||
  (typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ACP_JUDGMENT_NO_BINDING');

/** The judgment operation reached a non-success terminal state or the wait ended. */
export class AcpJudgmentRunError extends Error {
  readonly code = 'ACP_JUDGMENT_RUN_FAILED' as const;
  readonly operationId?: string;
  readonly status?: AgentOperationStatus;
  /** Result of the interrupt attempt — 'unknown' must not be read as stopped. */
  readonly cancelResult?: 'confirmed' | 'unknown';

  constructor(
    message: string,
    detail: {
      cancelResult?: 'confirmed' | 'unknown';
      operationId?: string;
      status?: AgentOperationStatus;
    } = {},
  ) {
    super(message);
    this.name = 'AcpJudgmentRunError';
    this.operationId = detail.operationId;
    this.status = detail.status;
    this.cancelResult = detail.cancelResult;
  }
}

export const isAcpJudgmentRunError = (error: unknown): error is AcpJudgmentRunError =>
  error instanceof AcpJudgmentRunError ||
  (typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ACP_JUDGMENT_RUN_FAILED');

/**
 * The bound agent replied, but the payload fails the declared schema. Typed
 * separately from a run failure: the operation may have completed `done`, yet
 * the answer is unusable and must never reach a planning/acceptance write.
 */
export class AcpJudgmentValidationError extends Error {
  readonly code = 'ACP_JUDGMENT_SCHEMA_MISMATCH' as const;
  readonly issues: string[];
  readonly operationId?: string;

  constructor(purpose: string, issues: string[], operationId?: string) {
    super(`Judgment "${purpose}" reply failed schema validation: ${issues.join('; ')}`);
    this.name = 'AcpJudgmentValidationError';
    this.issues = issues;
    this.operationId = operationId;
  }
}

export const isAcpJudgmentValidationError = (error: unknown): error is AcpJudgmentValidationError =>
  error instanceof AcpJudgmentValidationError ||
  (typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ACP_JUDGMENT_SCHEMA_MISMATCH');

/**
 * The binding a consumer offers for one judgment. `agentId` pins a user agent
 * (the run keeps that agent's own runtime config); `slug` names a builtin
 * domain agent and accepts a model/provider override. The env fallback —
 * `ACP_JUDGMENT_AGENT_ID`, an agent id or builtin slug — applies last unless
 * `allowEnvFallback` is false.
 */
export interface AcpJudgmentBinding {
  agentId?: string | null;
  allowEnvFallback?: boolean;
  slug?: string | null;
}

export type ResolvedAcpJudgmentAgent = { agentId: string } | { slug: string };

/**
 * Resolve the agent a judgment run executes as. Returns `undefined` when no
 * candidate exists — the caller decides whether that is a hard block
 * ({@link AcpJudgmentBindingError}) or a domain-level degrade.
 */
export const resolveAcpJudgmentAgent = async (
  db: OrviloDatabase,
  userId: string,
  binding: AcpJudgmentBinding,
  workspaceId?: string,
): Promise<ResolvedAcpJudgmentAgent | undefined> => {
  const agents = new AgentModel(db, userId, workspaceId);

  if (binding.agentId) {
    if (await agents.existsById(binding.agentId)) return { agentId: binding.agentId };
    // An explicitly pinned execution identity that no longer exists is a hard
    // boundary — falling through to slug/env would run the judgment as a
    // different identity than the caller authorized.
    throw new AcpJudgmentBindingError(
      `pinned:${binding.agentId}`,
      'the explicitly pinned agent no longer exists — no slug/env fallthrough',
    );
  }

  if (binding.slug && (await agents.getBuiltinAgent(binding.slug))) {
    return { slug: binding.slug };
  }

  if (binding.allowEnvFallback === false) return undefined;

  const envRef = process.env[ACP_JUDGMENT_AGENT_ENV]?.trim();
  if (!envRef) return undefined;
  if (await agents.existsById(envRef)) return { agentId: envRef };
  if (await agents.getBuiltinAgent(envRef)) return { slug: envRef };
  log('%s=%s resolved to no agent — binding refused', ACP_JUDGMENT_AGENT_ENV, envRef);
  return undefined;
};

interface SerializedContent {
  /** File ids the prompt references by position (kept for execAgent.fileIds). */
  text: string;
}

const serializeContent = (content: unknown): SerializedContent => {
  if (typeof content === 'string') return { text: content };
  if (!Array.isArray(content)) return { text: String(content ?? '') };
  const parts = (content as { image_url?: { url?: string }; text?: unknown; type?: string }[]).map(
    (part) => {
      if (part?.type === 'text' || typeof part?.text === 'string') return part.text ?? '';
      // Keep image URLs legible in the transcript — the bound agent's runtime
      // resolves them (the same `fileIds` are attached to the judgment turn).
      if (part?.type === 'image_url' && part.image_url?.url)
        return `[image: ${part.image_url.url}]`;
      return `[${part?.type ?? 'attachment'}]`;
    },
  );
  return { text: parts.join('\n') };
};

/**
 * Flatten the generateObject message list into an execAgent instruction pair:
 * system/developer turns ride `instructions` (appended after the agent's own
 * system role), the rest become the user-turn transcript.
 */
export const serializeJudgmentMessages = (
  messages: { content?: unknown; role?: string }[],
): { instructions?: string; prompt: string } => {
  const instructions: string[] = [];
  const transcript: string[] = [];
  for (const message of messages) {
    const role = message?.role ?? 'user';
    const { text } = serializeContent(message?.content);
    if (role === 'system' || role === 'developer') {
      if (text.trim()) instructions.push(text);
    } else {
      transcript.push(`${role.toUpperCase()}:\n${text}`);
    }
  }
  return {
    instructions: instructions.length ? instructions.join('\n\n') : undefined,
    prompt: transcript.join('\n\n'),
  };
};

const OUTPUT_CONTRACT = [
  '## Output contract',
  'Reply with a single JSON object that satisfies the JSON Schema below.',
  'Return JSON only — no prose, no markdown fences, no tool calls.',
].join('\n');

const buildJudgmentPrompt = (transcript: string, schema?: GenerateObjectSchema): string =>
  [
    transcript,
    OUTPUT_CONTRACT,
    schema ? JSON.stringify({ name: schema.name, schema: schema.schema }) : '{}',
  ]
    .filter(Boolean)
    .join('\n\n');

/** Extract the first JSON object embedded in an assistant reply. */
export const extractJudgmentJson = (content: string): unknown => {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through — the model may have wrapped the object in prose or fences
  }
  const fenceOpen = trimmed.indexOf('```');
  if (fenceOpen >= 0) {
    const fenceClose = trimmed.indexOf('```', fenceOpen + 3);
    if (fenceClose > fenceOpen) {
      const inner = trimmed
        .slice(fenceOpen + 3, fenceClose)
        .replace(/^\s*json\b/i, '')
        .trim();
      try {
        return JSON.parse(inner);
      } catch {
        // keep looking — a fence can hold prose before the JSON
      }
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // no parseable object — report failure upstream
    }
  }
  return undefined;
};

export interface AcpJudgmentRunParams {
  /** Attempt counter for retried judgments — recorded on the operation row. */
  attempt?: number;
  /** Explicit binding the consumer resolved for this judgment. */
  binding: AcpJudgmentBinding;
  /** Evidence files the judgment must see (attached to the judgment turn). */
  fileIds?: string[];
  /** Agent step cap — the per-run step budget. Defaults to a one-shot judgment. */
  maxSteps?: number;
  /** Advisory model/provider override — applied to slug-bound runs only. */
  model?: string;
  /** Parent operation this judgment serves (verified run, task op, ...). */
  parentOperationId?: string;
  /** Internal: polling cadence for the operation row (tests shrink this). */
  pollIntervalMs?: number;
  provider?: string;
  /** Stable consumer id recorded on `appContext.judgment.purpose`. */
  purpose: string;
  /** Wall-clock abort from the caller. */
  signal?: AbortSignal;
  /** Task linkage recorded on the operation row. */
  taskId?: string;
  /** Wall-clock wait budget before the run is interrupted. */
  timeoutMs?: number;
  /**
   * Structured tracing config forwarded onto the `llm_generation_tracing` row
   * the runner writes after the operation completes. `onPersisted` callbacks
   * fire once the row is committed, exactly like the direct-runtime hook.
   */
  tracing?: Record<string, unknown>;
}

export interface AcpJudgmentRunRecord {
  assistantMessageId?: string;
  model?: string | null;
  operationId: string;
  provider?: string | null;
  status: AgentOperationStatus;
  totalCost?: number | null;
  totalInputTokens?: number | null;
  totalOutputTokens?: number | null;
}

export interface AcpJudgmentResult<T = unknown> {
  /** Parsed JSON payload the bound agent replied with. */
  data: T;
  /** The durable execution record — identity, cost, and terminal status. */
  run: AcpJudgmentRunRecord;
  /** The id of the llm_generation_tracing row written for this judgment, if any. */
  tracingId?: string | null;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<'aborted' | 'elapsed'>((resolve) => {
    if (signal?.aborted) {
      resolve('aborted');
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve('aborted');
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve('elapsed');
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

let ajvInstance: Ajv | undefined;
const getAjv = () => (ajvInstance ??= new Ajv({ allErrors: true, strict: false }));

/**
 * Server-side validation of a judgment reply against the declared JSON Schema.
 * Returns the list of validation issues (empty = valid). An uncompilable
 * schema is reported as an issue — the run cannot be treated as conformant.
 */
const validateJudgmentData = (schema: GenerateObjectSchema['schema'], data: unknown): string[] => {
  let validate: ReturnType<Ajv['compile']>;
  try {
    validate = getAjv().compile(schema);
  } catch (error) {
    return [`schema is not a valid JSON Schema: ${(error as Error).message}`];
  }
  if (validate(data)) return [];
  return (validate.errors ?? []).map(
    (issue) => `${issue.instancePath || '/'} ${issue.message ?? 'invalid'}`,
  );
};

const pickTracingString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const readTracing = (raw: Record<string, unknown> | undefined) => ({
  agentId: pickTracingString(raw?.agentId),
  inputHint: pickTracingString(raw?.inputHint),
  metadata:
    raw?.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : undefined,
  onPersisted:
    typeof raw?.onPersisted === 'function'
      ? (raw.onPersisted as (tracingId: string | null) => void | Promise<void>)
      : undefined,
  parentTracingId: pickTracingString(raw?.parentTracingId),
  promptVersion: pickTracingString(raw?.promptVersion),
  scenario: pickTracingString(raw?.scenario),
  schemaName: pickTracingString(raw?.schemaName),
  systemPrompt: pickTracingString(raw?.systemPrompt),
  topicId: pickTracingString(raw?.topicId),
  tracingId: pickTracingString(raw?.tracingId),
  trigger: pickTracingString(raw?.trigger),
});

/**
 * Write the `llm_generation_tracing` row for a completed judgment run so the
 * tracing surface stays uniform with the retired direct-runtime path — plus
 * `metadata.operationId`, which is the durable link to the ACP operation that
 * produced the judgment.
 */
const recordJudgmentTracing = async (params: {
  input: unknown;
  operation: AgentOperationItem;
  output: unknown;
  purpose: string;
  schema?: GenerateObjectSchema;
  /** False when the reply failed schema validation — success needs both halves. */
  succeeded?: boolean;
  systemPrompt?: string;
  tracing?: Record<string, unknown>;
  userId: string;
  workspaceId?: string;
}): Promise<string | null> => {
  const service = getLLMGenerationTracingService();
  const tracing = readTracing(params.tracing);
  if (!service.isEnabled()) {
    if (tracing.onPersisted) await tracing.onPersisted(null);
    return null;
  }

  const systemPrompt = params.systemPrompt ?? tracing.systemPrompt ?? '';
  const promptHash = computePromptHash(systemPrompt, params.schema);
  const { promptVersion, scenario } = resolveScenario({
    promptVersion: tracing.promptVersion,
    scenario: tracing.scenario ?? params.purpose,
    trigger: tracing.trigger ?? ACP_JUDGMENT_TRIGGER,
  });
  const success = (params.succeeded ?? true) && params.operation.status === 'done';

  let persisted: string | null = null;
  try {
    const result = await service.record({
      agentId: params.operation.agentId ?? tracing.agentId,
      costUsd: params.operation.totalCost,
      errorCode: success
        ? null
        : params.operation.status === 'done'
          ? 'schema_mismatch'
          : params.operation.status,
      inputHint: tracing.inputHint,
      inputTokens: params.operation.totalInputTokens,
      latencyMs: params.operation.processingTimeMs,
      metadata: { ...tracing.metadata, operationId: params.operation.id },
      model: params.operation.model,
      outputTokens: params.operation.totalOutputTokens,
      parentTracingId: tracing.parentTracingId,
      payload: {
        input: params.input,
        output: params.output,
        schema: params.schema,
        systemPrompt,
      },
      promptHash,
      promptVersion,
      provider: params.operation.provider,
      scenario,
      schemaName: tracing.schemaName ?? params.schema?.name,
      success,
      topicId: tracing.topicId ?? params.operation.topicId,
      tracingId: tracing.tracingId,
      trigger: tracing.trigger ?? ACP_JUDGMENT_TRIGGER,
      userId: params.userId,
      workspaceId: params.workspaceId,
    });
    persisted = result?.tracingId ?? null;
  } catch (error) {
    log('judgment tracing record failed (non-fatal): %O', error);
  }

  if (tracing.onPersisted) {
    try {
      await tracing.onPersisted(persisted);
    } catch (error) {
      log('tracing onPersisted callback failed (non-fatal): %O', error);
    }
  }
  return persisted;
};

/**
 * Run a retained structured judgment as an explicitly-authorized ACP operation.
 *
 * Every judgment is a real `agent_operations` row: `execAgent` dispatches a
 * headless run under the resolved binding, the caller waits (bounded) on the
 * durable row for a terminal state, and the result is read back from the run's
 * assistant message and JSON-parsed. The operation row already records identity
 * (agentId), cost and token totals, the `appContext.judgment` marker carries
 * purpose/attempt/budget, and `signal`/timeout cancel propagate through
 * `interruptTask` — so operation/attempt/cancel/budget are all auditable.
 *
 * No binding resolves → {@link AcpJudgmentBindingError} (never a deployment
 * key fallback). Non-success terminal states and empty replies →
 * {@link AcpJudgmentRunError}.
 */
export const runAcpJudgment = async <T = unknown>(
  db: OrviloDatabase,
  userId: string,
  params: {
    input: {
      messages: OpenAIChatMessage[] | GenerateObjectPayload['messages'];
      schema?: GenerateObjectSchema;
    };
    judgment: AcpJudgmentRunParams;
    workspaceId?: string;
  },
): Promise<AcpJudgmentResult<T>> => {
  const { input, judgment, workspaceId } = params;
  const binding = await resolveAcpJudgmentAgent(db, userId, judgment.binding, workspaceId);
  if (!binding) throw new AcpJudgmentBindingError(judgment.purpose);

  const { instructions, prompt } = serializeJudgmentMessages(input.messages);
  const body = buildJudgmentPrompt(prompt, input.schema);

  // Imported lazily on purpose: services/aiAgent transitively reaches back into
  // judgment consumers (agentSignal, verify). A static import here would close
  // an aiAgent → agentSignal → aiGeneration → aiAgent module cycle.
  const { AiAgentService } = await import('@/server/services/aiAgent');

  const slugBound = 'slug' in binding;
  const maxSteps = judgment.maxSteps ?? DEFAULT_MAX_STEPS;
  const timeoutMs = judgment.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // The wait budget covers dispatch latency too — establish the deadline
  // before the execAgent side-effect so a slow start cannot escape it.
  const deadline = Date.now() + timeoutMs;

  const exec = await new AiAgentService(db, userId, { workspaceId }).execAgent({
    ...binding,
    appContext: {
      judgment: {
        attempt: judgment.attempt,
        budget: { maxSteps, maxWaitMs: timeoutMs },
        purpose: judgment.purpose,
      },
      suppressSignal: true,
      taskId: judgment.taskId ?? null,
    },
    autoStart: true,
    disableTools: true,
    fileIds: judgment.fileIds,
    instructions,
    // Advisory override: a slug-bound builtin has no user tuning, so it takes
    // the resolved model/provider. A pinned agent keeps its own runtime config.
    ...(slugBound && judgment.model ? { model: judgment.model } : {}),
    ...(slugBound && judgment.provider ? { provider: judgment.provider } : {}),
    maxSteps,
    parentOperationId: judgment.parentOperationId,
    prompt: body,
    signal: judgment.signal,
    taskId: judgment.taskId,
    title: `[judgment] ${judgment.purpose}`,
    trigger: ACP_JUDGMENT_TRIGGER,
    userInterventionConfig: { approvalMode: 'headless' },
  });

  const operationId = exec.operationId;
  const operations = new AgentOperationModel(db, userId, workspaceId);
  const messages = new MessageModel(db, userId, workspaceId);

  /**
   * Interrupt the run and confirm via the durable row. Returns 'unknown' when
   * the interrupt request failed or the row did not reach a terminal status —
   * callers must treat 'unknown' as possibly-still-running, never as stopped.
   */
  const interrupt = async (reason: string): Promise<'confirmed' | 'unknown'> => {
    try {
      await new AiAgentService(db, userId, { workspaceId }).interruptTask({ operationId });
      const after = await operations.findById(operationId).catch(() => undefined);
      return after && isTerminalAgentOperationStatus(after.status) ? 'confirmed' : 'unknown';
    } catch (error) {
      log('judgment %s interrupt failed (%s, non-fatal): %O', operationId, reason, error);
      return 'unknown';
    }
  };

  let operation = await operations.findById(operationId);
  for (;;) {
    if (operation && isTerminalAgentOperationStatus(operation.status)) break;
    if (judgment.signal?.aborted) {
      const cancelResult = await interrupt('caller signal aborted');
      throw new AcpJudgmentRunError(`Judgment "${judgment.purpose}" aborted by caller`, {
        cancelResult,
        operationId,
        // Only a confirmed interrupt may claim 'interrupted' — an unconfirmed
        // cancel reports the last durable status, not a state we never proved.
        status: cancelResult === 'confirmed' ? 'interrupted' : operation?.status,
      });
    }
    if (Date.now() > deadline) {
      const cancelResult = await interrupt('wait budget exceeded');
      throw new AcpJudgmentRunError(
        `Judgment "${judgment.purpose}" exceeded its ${timeoutMs}ms total budget (dispatch + wait)`,
        {
          cancelResult,
          operationId,
          status: cancelResult === 'confirmed' ? 'interrupted' : operation?.status,
        },
      );
    }
    if (
      (await sleep(judgment.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, judgment.signal)) ===
      'aborted'
    ) {
      const cancelResult = await interrupt('caller signal aborted');
      throw new AcpJudgmentRunError(`Judgment "${judgment.purpose}" aborted by caller`, {
        cancelResult,
        operationId,
        status: cancelResult === 'confirmed' ? 'interrupted' : operation?.status,
      });
    }
    operation = await operations.findById(operationId);
  }

  const run: AcpJudgmentRunRecord = {
    assistantMessageId: (operation!.metadata as { assistantMessageId?: string } | null)
      ?.assistantMessageId,
    model: operation!.model,
    operationId,
    provider: operation!.provider,
    status: operation!.status,
    totalCost: operation!.totalCost,
    totalInputTokens: operation!.totalInputTokens,
    totalOutputTokens: operation!.totalOutputTokens,
  };

  if (operation!.status !== 'done') {
    const detail = (operation!.error as { message?: string } | null)?.message;
    await recordJudgmentTracing({
      input: input.messages,
      operation: operation!,
      output: null,
      purpose: judgment.purpose,
      schema: input.schema,
      tracing: judgment.tracing,
      userId,
      workspaceId,
    });
    throw new AcpJudgmentRunError(
      `Judgment "${judgment.purpose}" ended ${operation!.status}${detail ? `: ${detail}` : ''}`,
      { operationId, status: operation!.status },
    );
  }

  const reply = run.assistantMessageId ? await messages.findById(run.assistantMessageId) : null;
  const content = typeof reply?.content === 'string' ? reply.content : '';
  const data = content ? extractJudgmentJson(content) : undefined;
  // Server-side contract check: a `done` operation with a malformed payload is
  // still a failed judgment. Validation precedes tracing so the recorded
  // `success` flag means execution AND contract conformance.
  const validationIssues =
    data !== undefined && data !== null && input.schema
      ? validateJudgmentData(input.schema.schema, data)
      : [];
  const tracingId = await recordJudgmentTracing({
    input: input.messages,
    operation: operation!,
    output: validationIssues.length ? null : (data ?? null),
    purpose: judgment.purpose,
    schema: input.schema,
    succeeded: validationIssues.length === 0,
    systemPrompt: instructions,
    tracing: judgment.tracing,
    userId,
    workspaceId,
  });

  if (data === undefined || data === null) {
    throw new AcpJudgmentRunError(
      `Judgment "${judgment.purpose}" returned no parseable JSON (op ${operationId})`,
      { operationId, status: operation!.status },
    );
  }
  if (validationIssues.length) {
    throw new AcpJudgmentValidationError(judgment.purpose, validationIssues, operationId);
  }

  return { data: data as T, run, tracingId };
};
