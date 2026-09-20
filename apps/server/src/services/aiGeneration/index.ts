import type {
  ChatCompletionTool,
  GenerateObjectPayload,
  GenerateObjectSchema,
} from '@orvilo/model-runtime';
import type { OpenAIChatMessage } from '@orvilo/types';

import type { OrviloDatabase } from '@/database/type';
import { initModelRuntimeFromDeploymentConfig } from '@/server/modules/ModelRuntime';

import type { AcpJudgmentBinding, AcpJudgmentResult } from './judgment';
import { runAcpJudgment } from './judgment';

export type {
  AcpJudgmentBinding,
  AcpJudgmentResult,
  AcpJudgmentRunParams,
  AcpJudgmentRunRecord,
  ResolvedAcpJudgmentAgent,
} from './judgment';
export {
  ACP_JUDGMENT_AGENT_ENV,
  ACP_JUDGMENT_TRIGGER,
  AcpJudgmentBindingError,
  AcpJudgmentRunError,
  isAcpJudgmentBindingError,
  isAcpJudgmentRunError,
  resolveAcpJudgmentAgent,
} from './judgment';

export interface AiGenerationObjectInput {
  messages: GenerateObjectPayload['messages'] | OpenAIChatMessage[];
  model: string;
  provider: string;
  schema?: GenerateObjectSchema;
  thinking?: GenerateObjectPayload['thinking'];
  tools?: ChatCompletionTool[];
}

interface AiGenerationObjectContext {
  /**
   * Free-form context forwarded to non-tracing hooks (billing, routing). Use
   * `tracing` instead for `llm_generation_tracing` config.
   */
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
  /**
   * Structured tracing config (scenario / promptVersion / schemaName /
   * agentId / topicId / inputHint / ...). Strongly typed by `TracingOptions`
   * from `@orvilo/llm-generation-tracing` at call sites.
   */
  tracing?: Record<string, unknown>;
}

/**
 * Retained machine judgments — planning, review, reflection — are explicitly
 * authorized ACP operations, never deployment-key LLM calls. The bound agent
 * executes the judgment, the durable `agent_operations` row records identity /
 * cost / cancel / budget, and the parsed JSON reply comes back.
 */
export interface AiGenerationJudgmentOptions extends AiGenerationObjectContext {
  judgment: {
    /** 1-based attempt counter for retried judgments. */
    attempt?: number;
    /** The ACP binding the consumer resolved — see {@link AcpJudgmentBinding}. */
    binding: AcpJudgmentBinding;
    /** Evidence file ids the judgment must read. */
    fileIds?: string[];
    /** Agent step cap for the run. */
    maxSteps?: number;
    /** Operation this judgment is part of (verify run, task op, ...). */
    parentOperationId?: string;
    /** Stable consumer identifier recorded on the operation row. */
    purpose: string;
    /** Task linkage recorded on the operation row. */
    taskId?: string;
    /** Wall-clock wait budget before the run is interrupted (default 180s). */
    timeoutMs?: number;
  };
  kind: 'judgment';
}

/**
 * Explicitly enumerated non-agent exceptions — ASR, embeddings, chunking,
 * file/image/video processing, knowledge-base retrieval, memory tooling —
 * that remain on deployment-provider configuration. Adding a caller requires
 * updating {@link BASIC_GENERATION_CALLERS} and the exception table in
 * `docs/development/acp-judgment-closure.md`.
 */
export type BasicGenerationCaller =
  | 'asr'
  | 'chunk'
  | 'file'
  | 'image'
  | 'knowledgeBase'
  | 'memory'
  | 'ragEval'
  | 'video'
  | 'videoBackgroundPolling';

export const BASIC_GENERATION_CALLERS: readonly BasicGenerationCaller[] = [
  'asr',
  'chunk',
  'file',
  'image',
  'knowledgeBase',
  'memory',
  'ragEval',
  'video',
  'videoBackgroundPolling',
];

export interface AiGenerationBasicOptions extends AiGenerationObjectContext {
  /** Enumerated non-agent consumer — anything else throws. */
  caller: BasicGenerationCaller;
  kind: 'basic';
}

export type AiGenerationObjectOptions = AiGenerationBasicOptions | AiGenerationJudgmentOptions;

/**
 * The former "thin wrapper over deployment config" is now a split contract.
 *
 * Almost every server-side caller that produces structured output goes through
 * one of two audited paths:
 * - `kind: 'judgment'` — a retained machine judgment. Dispatched as an
 *   explicitly-authorized ACP operation (see `runAcpJudgment`); there is no
 *   deployment-key fallback and a missing binding throws.
 * - `kind: 'basic'` — an enumerated non-agent exception (ASR / chunk / video /
 *   image / file / ragEval / knowledgeBase / memory / videoBackgroundPolling)
 *   that keeps using `initModelRuntimeFromDeploymentConfig`.
 *
 * Construct one per request — `db` and `userId` come from the request context.
 */
export class AiGenerationService {
  private readonly db: OrviloDatabase;
  private readonly userId: string;
  private readonly workspaceId?: string;

  constructor(db: OrviloDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  async generateObject<T = unknown>(
    input: AiGenerationObjectInput,
    options: AiGenerationObjectOptions,
  ): Promise<T> {
    if (options.kind === 'judgment') {
      if (input.tools?.length) {
        throw new Error('Judgment runs are tool-free; drop `tools` or use kind "basic"');
      }
      const result: AcpJudgmentResult<T> = await runAcpJudgment<T>(this.db, this.userId, {
        input: { messages: input.messages, schema: input.schema },
        judgment: {
          attempt: options.judgment.attempt,
          binding: options.judgment.binding,
          fileIds: options.judgment.fileIds,
          maxSteps: options.judgment.maxSteps,
          model: input.model,
          parentOperationId: options.judgment.parentOperationId,
          provider: input.provider,
          purpose: options.judgment.purpose,
          signal: options.signal,
          taskId: options.judgment.taskId,
          timeoutMs: options.judgment.timeoutMs,
          tracing: options.tracing,
        },
        workspaceId: this.workspaceId,
      });
      return result.data;
    }

    if (!BASIC_GENERATION_CALLERS.includes(options.caller)) {
      throw new Error(`"${String(options.caller)}" is not an enumerated basic-generation caller`);
    }
    const runtime = await initModelRuntimeFromDeploymentConfig(
      this.userId,
      input.provider,
      this.workspaceId,
    );
    return (await runtime.generateObject(
      {
        messages: input.messages as GenerateObjectPayload['messages'],
        model: input.model,
        schema: input.schema,
        thinking: input.thinking,
        tools: input.tools,
      },
      { metadata: options.metadata, signal: options.signal, tracing: options.tracing },
    )) as T;
  }
}
