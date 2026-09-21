import { createHash } from 'node:crypto';

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
  /**
   * The launch identity the failure was recorded under — a caller that retries
   * hands the same key back so the durable launch (and its reconcile state) is
   * adopted instead of spawning a second writer.
   */
  readonly intentKey?: string;

  constructor(
    message: string,
    detail: {
      cancelResult?: 'confirmed' | 'unknown';
      intentKey?: string;
      operationId?: string;
      status?: AgentOperationStatus;
    } = {},
  ) {
    super(message);
    this.name = 'AcpJudgmentRunError';
    this.operationId = detail.operationId;
    this.status = detail.status;
    this.cancelResult = detail.cancelResult;
    this.intentKey = detail.intentKey;
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

  if (binding.slug) {
    if (await agents.getBuiltinAgent(binding.slug)) return { slug: binding.slug };
    // Same rule for an explicit slug: a pinned builtin identity that does not
    // resolve is a hard boundary, never a silent env fallback.
    throw new AcpJudgmentBindingError(
      `slug:${binding.slug}`,
      'the explicitly pinned slug does not resolve to a builtin agent — no env fallthrough',
    );
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
  /**
   * Optional launch identity override, stamped on `appContext.judgment.intentKey`.
   * Defaults to a unique key per call; a caller that can legitimately re-issue
   * the same logical launch may pin it so reconcile finds the same row.
   */
  intentKey?: string;
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
  /** Explicit failure code — distinguishes 'no_json' from 'schema_mismatch'. */
  errorCode?: string;
  input: unknown;
  operation: AgentOperationItem;
  output: unknown;
  purpose: string;
  schema?: GenerateObjectSchema;
  /** Failure status for runs cut short by abort/timeout (op row still runs). */
  statusOverride?: string;
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
  const outcomeStatus = params.statusOverride ?? params.operation.status;
  const success = (params.succeeded ?? true) && outcomeStatus === 'done';

  let persisted: string | null = null;
  try {
    const result = await service.record({
      agentId: params.operation.agentId ?? tracing.agentId,
      costUsd: params.operation.totalCost,
      errorCode: success
        ? null
        : (params.errorCode ?? (outcomeStatus === 'done' ? 'schema_mismatch' : outcomeStatus)),
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
  const attempt = judgment.attempt ?? 0;
  // The budget covers dispatch latency too — the deadline and the dispatch
  // abort controller are established BEFORE the execAgent side-effect so a
  // slow or lost start consumes the caller's budget instead of escaping it.
  const deadline = Date.now() + timeoutMs;
  // Launch identity: a caller may pin `judgment.intentKey` to re-issue the same
  // logical launch; otherwise the key is a content hash of the stable business
  // request (purpose + subject + payload + schema) so a plain retry dedupes
  // against the SAME durable launch — never a random id that defeats the
  // admission record.
  const intentKey =
    judgment.intentKey ??
    `${judgment.purpose}:${attempt}:${createHash('sha256')
      .update(
        JSON.stringify({
          messages: input.messages,
          parentOperationId: judgment.parentOperationId ?? null,
          schema: input.schema ?? null,
          taskId: judgment.taskId ?? null,
        }),
      )
      .digest('hex')
      .slice(0, 16)}`;

  const operations = new AgentOperationModel(db, userId, workspaceId);
  const messages = new MessageModel(db, userId, workspaceId);

  /**
   * Atomically register the launch BEFORE the execAgent side effect: the
   * unique key (principal, workspace, purpose, intentKey, attempt) is the
   * durable admission record — a same-intent concurrent call or a retry reads
   * /takes over this launch instead of spawning a second writer.
   */
  const { claimed, launch } = await operations.claimOperationLaunch({
    attempt,
    deadlineAt: new Date(deadline),
    intentKey,
    purpose: judgment.purpose,
  });

  const dispatchController = new AbortController();
  const onCallerAbort = () => dispatchController.abort(judgment.signal?.reason);
  if (judgment.signal?.aborted) dispatchController.abort(judgment.signal?.reason);
  else judgment.signal?.addEventListener('abort', onCallerAbort, { once: true });
  let onDeadline!: () => void;
  const deadlineReached = new Promise<'timeout'>((resolve) => {
    onDeadline = () => resolve('timeout');
  });
  const deadlineTimer = setTimeout(() => {
    dispatchController.abort('judgment-deadline');
    onDeadline();
  }, timeoutMs);
  deadlineTimer.unref();

  /**
   * Interrupt a run and report PHYSICAL stop authority — `interruptTask`'s
   * `cancelState` is what the host provably did: 'confirmed' means stopped,
   * 'requested'/'unknown' mean the signal may never have landed. A DB terminal
   * status is never a substitute (a row can read 'interrupted' while the
   * device writer is still alive), and `deviceCancellationConfirmed === false`
   * forces 'unknown'.
   */
  const interrupt = async (
    reason: string,
    targetOperationId: string,
  ): Promise<'confirmed' | 'unknown'> => {
    try {
      const interruption = await new AiAgentService(db, userId, { workspaceId }).interruptTask({
        operationId: targetOperationId,
      });
      if (interruption.deviceCancellationConfirmed === false) return 'unknown';
      return interruption.cancelState === 'confirmed' ? 'confirmed' : 'unknown';
    } catch (error) {
      log('judgment %s interrupt failed (%s, non-fatal): %O', targetOperationId, reason, error);
      return 'unknown';
    }
  };

  /** The operation row this launch minted — survives a lost dispatch return. */
  const reconcileIntent = () => operations.findByJudgmentIntent(intentKey).catch(() => null);

  /**
   * Honest terminal status for an error detail: a row that reached a real
   * terminal state (incl. a natural 'done' racing our cancel) reports itself —
   * only a confirmed physical interrupt may claim 'interrupted'.
   */
  const reportedStatus = (
    cancelResult: 'confirmed' | 'unknown' | undefined,
    latest: AgentOperationItem | null | undefined,
  ): AgentOperationStatus | undefined =>
    latest && isTerminalAgentOperationStatus(latest.status)
      ? latest.status
      : cancelResult === 'confirmed'
        ? 'interrupted'
        : latest?.status;

  /** Interrupt whatever operation landed — tolerates null and terminal rows. */
  const interruptIfLanded = async (op: AgentOperationItem | null) =>
    op && !isTerminalAgentOperationStatus(op.status)
      ? interrupt('dispatch outcome lost', op.id)
      : undefined;

  /**
   * Durable post-failure converge: the cancel intent is persisted on the
   * launch row BEFORE the interrupt — if this process dies mid-reconcile, a
   * later same-intent call still finds 'cancel_requested' and finishes the
   * job instead of relying on an unawaited in-process promise.
   */
  const convergeLaunch = async (
    reason: string,
    knownOperationId?: string,
  ): Promise<{
    cancelResult?: 'confirmed' | 'unknown';
    latest?: AgentOperationItem | null;
  }> => {
    await operations.requestOperationLaunchCancel(launch.id, reason).catch((error) => {
      log('judgment launch %s cancel intent persist failed (%s): %O', launch.id, reason, error);
    });
    let landed = knownOperationId
      ? await operations.findById(knownOperationId).catch(() => null)
      : null;
    landed = landed ?? (await reconcileIntent());
    if (landed && !knownOperationId) {
      await operations.bindOperationLaunch(launch.id, landed.id).catch(() => undefined);
    }
    const cancelResult = await interruptIfLanded(landed);
    // Re-read after the interrupt: a run that reached 'done' on its own while
    // the cancel was in flight reports 'done', never 'interrupted'.
    const latest = landed ? await operations.findById(landed.id).catch(() => landed) : landed;
    await operations.settleOperationLaunch(launch.id, 'failed').catch(() => undefined);
    return { cancelResult, latest };
  };

  /**
   * Read the terminal outcome of an operation into the judgment result —
   * shared by the claim owner and the same-intent adoption path, so a retry
   * that adopted an existing launch derives the identical answer/failure from
   * the durable row instead of re-dispatching.
   */
  const readJudgmentOutcome = async (
    operation: AgentOperationItem,
  ): Promise<AcpJudgmentResult<T>> => {
    const run: AcpJudgmentRunRecord = {
      assistantMessageId: (operation.metadata as { assistantMessageId?: string } | null)
        ?.assistantMessageId,
      model: operation.model,
      operationId: operation.id,
      provider: operation.provider,
      status: operation.status,
      totalCost: operation.totalCost,
      totalInputTokens: operation.totalInputTokens,
      totalOutputTokens: operation.totalOutputTokens,
    };

    if (operation.status !== 'done') {
      const detail = (operation.error as { message?: string } | null)?.message;
      await recordJudgmentTracing({
        input: input.messages,
        operation,
        output: null,
        purpose: judgment.purpose,
        schema: input.schema,
        tracing: judgment.tracing,
        userId,
        workspaceId,
      });
      throw new AcpJudgmentRunError(
        `Judgment "${judgment.purpose}" ended ${operation.status}${detail ? `: ${detail}` : ''}`,
        { intentKey, operationId: operation.id, status: operation.status },
      );
    }

    const reply = run.assistantMessageId ? await messages.findById(run.assistantMessageId) : null;
    const content = typeof reply?.content === 'string' ? reply.content : '';
    const data = content ? extractJudgmentJson(content) : undefined;
    // Server-side contract check: a `done` operation with no parseable payload
    // or a malformed one is still a FAILED judgment — the trace records
    // succeeded=false with a distinct error code BEFORE the throw.
    const hasJson = data !== undefined && data !== null;
    const validationIssues =
      hasJson && input.schema ? validateJudgmentData(input.schema.schema, data) : [];
    const succeeded = hasJson && validationIssues.length === 0;
    const tracingId = await recordJudgmentTracing({
      errorCode: succeeded ? undefined : hasJson ? 'schema_mismatch' : 'no_json',
      input: input.messages,
      operation,
      output: succeeded ? data : null,
      purpose: judgment.purpose,
      schema: input.schema,
      succeeded,
      systemPrompt: instructions,
      tracing: judgment.tracing,
      userId,
      workspaceId,
    });

    if (!hasJson) {
      throw new AcpJudgmentRunError(
        `Judgment "${judgment.purpose}" returned no parseable JSON (op ${operation.id})`,
        { intentKey, operationId: operation.id, status: operation.status },
      );
    }
    if (validationIssues.length) {
      throw new AcpJudgmentValidationError(judgment.purpose, validationIssues, operation.id);
    }

    return { data: data as T, run, tracingId };
  };

  /**
   * Abort/timeout/failure legs still write the failure tracing row — every
   * judgment attempt stays traceable even when the operation itself never
   * settles. A landed row that reached its own terminal state keeps that
   * status; an 'interrupted' produced by our own interrupt reports the
   * caller-facing failure reason instead.
   */
  const failAndTrace = async (
    message: string,
    detail: {
      cancelResult?: 'confirmed' | 'unknown';
      intentKey: string;
      operationId?: string;
      status?: AgentOperationStatus;
    },
    latest: AgentOperationItem | null | undefined,
    reason: 'error' | 'interrupted' | 'timeout',
  ): Promise<never> => {
    const reported = detail.status;
    const outcomeStatus =
      reported && reported !== 'interrupted' && isTerminalAgentOperationStatus(reported)
        ? reported
        : reason;
    await recordJudgmentTracing({
      errorCode: outcomeStatus === 'done' ? reason : undefined,
      input: input.messages,
      operation: {
        ...latest,
        id: detail.operationId ?? latest?.id,
        status: detail.status,
      } as AgentOperationItem,
      output: null,
      purpose: judgment.purpose,
      schema: input.schema,
      statusOverride: outcomeStatus,
      succeeded: false,
      tracing: judgment.tracing,
      userId,
      workspaceId,
    });
    throw new AcpJudgmentRunError(message, detail);
  };

  /**
   * Same-intent adoption: read or take over the recorded launch — never
   * spawns a second writer. A `claimed` launch whose own deadline has lapsed
   * is an orphaned claim (the winner died between claim and bind): reconcile
   * by intent — bind a late-landed row if one exists — then converge.
   */
  const adoptExistingLaunch = async (): Promise<AcpJudgmentResult<T>> => {
    for (;;) {
      const current = await operations.findOperationLaunchById(launch.id).catch(() => null);
      const live = current ?? launch;
      const landed = live.operationId
        ? await operations.findById(live.operationId).catch(() => null)
        : await reconcileIntent();
      // A row landed under this intent while the launch still awaits its
      // bind — attach it so the durable record reflects reality.
      if (landed && !live.operationId) {
        await operations.bindOperationLaunch(live.id, landed.id).catch(() => undefined);
      }

      if (live.status === 'failed') {
        await failAndTrace(
          `Judgment "${judgment.purpose}" launch already failed`,
          { intentKey, operationId: live.operationId ?? landed?.id },
          landed,
          'error',
        );
      }
      if (live.status === 'cancel_requested') {
        const { cancelResult, latest } = await convergeLaunch(
          live.cancelReason ?? 'cancel requested',
          landed?.id ?? live.operationId ?? undefined,
        );
        await failAndTrace(
          `Judgment "${judgment.purpose}" was canceled`,
          {
            cancelResult,
            intentKey,
            operationId: latest?.id ?? live.operationId ?? undefined,
            status: reportedStatus(cancelResult, latest),
          },
          latest,
          'interrupted',
        );
      }
      if (landed && isTerminalAgentOperationStatus(landed.status)) {
        await operations.settleOperationLaunch(live.id, 'settled').catch(() => undefined);
        return await readJudgmentOutcome(landed);
      }
      if (judgment.signal?.aborted) {
        const { cancelResult, latest } = await convergeLaunch(
          'caller aborted',
          landed?.id ?? live.operationId ?? undefined,
        );
        await failAndTrace(
          `Judgment "${judgment.purpose}" aborted by caller`,
          {
            cancelResult,
            intentKey,
            operationId: latest?.id ?? live.operationId ?? undefined,
            status: reportedStatus(cancelResult, latest),
          },
          latest,
          'interrupted',
        );
      }
      const launchDeadline = live.deadlineAt?.getTime() ?? deadline;
      if (Date.now() > deadline || Date.now() > launchDeadline) {
        // Orphaned claim (winner died pre-bind or mid-dispatch) or an
        // over-budget live run: reconcile only — never re-spawn.
        const { cancelResult, latest } = await convergeLaunch(
          'launch deadline exceeded',
          landed?.id ?? live.operationId ?? undefined,
        );
        await failAndTrace(
          `Judgment "${judgment.purpose}" launch missed its deadline`,
          {
            cancelResult,
            intentKey,
            operationId: latest?.id ?? live.operationId ?? undefined,
            status: reportedStatus(cancelResult, latest),
          },
          latest,
          'timeout',
        );
      }
      if (
        (await sleep(judgment.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, judgment.signal)) ===
        'aborted'
      ) {
        const { cancelResult, latest } = await convergeLaunch(
          'caller aborted',
          landed?.id ?? live.operationId ?? undefined,
        );
        await failAndTrace(
          `Judgment "${judgment.purpose}" aborted by caller`,
          {
            cancelResult,
            intentKey,
            operationId: latest?.id ?? live.operationId ?? undefined,
            status: reportedStatus(cancelResult, latest),
          },
          latest,
          'interrupted',
        );
      }
    }
  };

  const execPromise = claimed
    ? new AiAgentService(db, userId, { workspaceId }).execAgent({
        ...binding,
        appContext: {
          judgment: {
            attempt: judgment.attempt,
            budget: { maxSteps, maxWaitMs: timeoutMs },
            intentKey,
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
        signal: dispatchController.signal,
        taskId: judgment.taskId,
        title: `[judgment] ${judgment.purpose}`,
        trigger: ACP_JUDGMENT_TRIGGER,
        userInterventionConfig: { approvalMode: 'headless' },
      })
    : null;
  // `settled` never rejects — the race below decides the outcome.
  const settled = execPromise?.then(
    (value) => ({ kind: 'ok' as const, value }),
    (error) => ({ error, kind: 'err' as const }),
  );
  const callerAborted = new Promise<{ kind: 'caller' }>((resolve) => {
    if (!judgment.signal) return;
    if (judgment.signal.aborted) resolve({ kind: 'caller' });
    else
      judgment.signal.addEventListener('abort', () => resolve({ kind: 'caller' }), { once: true });
  });

  try {
    if (!claimed || !settled) {
      // Same intent already registered — adopt or reconcile the recorded
      // launch; a second writer is never spawned for the same launch.
      return await adoptExistingLaunch();
    }

    const raced = await Promise.race([
      settled,
      callerAborted,
      deadlineReached.then(() => ({ kind: 'timeout' as const })),
    ]);

    if (raced.kind !== 'ok' || judgment.signal?.aborted) {
      // Dispatch threw, the caller aborted, or the total budget was spent
      // before execAgent returned. Persist the cancel intent on the launch row
      // FIRST so a reconcile survives this process dying; then interrupt
      // whatever operation landed — never re-dispatched as a second writer.
      // A still-pending exec that lands late is reconciled in the background —
      // best-effort fast path; the durable cancel intent lives on the launch
      // row, so a later same-intent call also finishes the job.
      void settled.then(async (s) => {
        if (s.kind === 'ok') {
          await operations
            .bindOperationLaunch(launch.id, s.value.operationId)
            .catch(() => undefined);
        }
        const late =
          s.kind === 'ok'
            ? await operations.findById(s.value.operationId).catch(() => null)
            : await reconcileIntent();
        await interruptIfLanded(late);
      });
      const { cancelResult, latest } = await convergeLaunch(
        judgment.signal?.aborted || raced.kind === 'caller'
          ? 'caller aborted'
          : raced.kind === 'timeout'
            ? 'deadline exceeded during dispatch'
            : 'dispatch failed',
        raced.kind === 'ok' ? raced.value.operationId : undefined,
      );
      const detail = {
        cancelResult,
        intentKey,
        operationId: latest?.id ?? (raced.kind === 'ok' ? raced.value.operationId : undefined),
        status: reportedStatus(cancelResult, latest),
      };
      if (raced.kind === 'err' && !judgment.signal?.aborted && Date.now() <= deadline) {
        const message = raced.error instanceof Error ? raced.error.message : String(raced.error);
        await failAndTrace(
          `Judgment "${judgment.purpose}" dispatch failed: ${message}`,
          detail,
          latest,
          'error',
        );
      }
      await failAndTrace(
        judgment.signal?.aborted || raced.kind === 'caller'
          ? `Judgment "${judgment.purpose}" aborted by caller`
          : `Judgment "${judgment.purpose}" exceeded its ${timeoutMs}ms total budget during dispatch`,
        detail,
        latest,
        judgment.signal?.aborted || raced.kind === 'caller' ? 'interrupted' : 'timeout',
      );
    }
    const operationId = raced.value.operationId;
    const boundLaunch = await operations
      .bindOperationLaunch(launch.id, operationId)
      .catch(() => null);
    if (!boundLaunch) {
      // The launch moved past dispatch while the ACK was in flight — a cancel
      // intent already landed; converge against whatever exists.
      const { cancelResult, latest } = await convergeLaunch(
        'dispatch raced a cancel intent',
        operationId,
      );
      await failAndTrace(
        `Judgment "${judgment.purpose}" was canceled`,
        {
          cancelResult,
          intentKey,
          operationId,
          status: reportedStatus(cancelResult, latest),
        },
        latest,
        'interrupted',
      );
    }

    let operation = await operations.findById(operationId);
    for (;;) {
      if (Date.now() > deadline) {
        // The budget is binding even against a row that flipped terminal late:
        // a 'done' observed past the deadline is reported honestly but never
        // accepted as a successful judgment.
        const { cancelResult, latest } = await convergeLaunch('wait budget exceeded', operationId);
        await failAndTrace(
          `Judgment "${judgment.purpose}" exceeded its ${timeoutMs}ms total budget (dispatch + wait)`,
          {
            cancelResult,
            intentKey,
            operationId,
            status: reportedStatus(cancelResult, latest ?? operation),
          },
          latest ?? operation,
          'timeout',
        );
      }
      if (operation && isTerminalAgentOperationStatus(operation.status)) break;
      if (judgment.signal?.aborted) {
        const { cancelResult, latest } = await convergeLaunch('caller aborted', operationId);
        await failAndTrace(
          `Judgment "${judgment.purpose}" aborted by caller`,
          {
            cancelResult,
            intentKey,
            operationId,
            status: reportedStatus(cancelResult, latest ?? operation),
          },
          latest ?? operation,
          'interrupted',
        );
      }
      if (
        (await sleep(judgment.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, judgment.signal)) ===
        'aborted'
      ) {
        const { cancelResult, latest } = await convergeLaunch('caller aborted', operationId);
        await failAndTrace(
          `Judgment "${judgment.purpose}" aborted by caller`,
          {
            cancelResult,
            intentKey,
            operationId,
            status: reportedStatus(cancelResult, latest ?? operation),
          },
          latest ?? operation,
          'interrupted',
        );
      }
      operation = await operations.findById(operationId);
    }

    // The operation reached a terminal state — mark the launch settled first
    // so a same-intent retry derives the identical outcome from the row.
    await operations.settleOperationLaunch(launch.id, 'settled').catch((error) => {
      log('judgment launch %s settle failed (non-fatal): %O', launch.id, error);
    });
    return await readJudgmentOutcome(operation!);
  } finally {
    clearTimeout(deadlineTimer);
    judgment.signal?.removeEventListener('abort', onCallerAbort);
  }
};
