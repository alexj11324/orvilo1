import type {
  AgenticAttempt,
  BaseAction,
  ExecutorResult,
  SignalAttempt,
} from '@orvilo/agent-signal';
import { AGENT_SIGNAL_SOURCE_TYPES } from '@orvilo/agent-signal/source';
import { MemoryApiName } from '@orvilo/builtin-tool-memory';
import { DEFAULT_MINI_SYSTEM_AGENT_ITEM } from '@orvilo/const';
import {
  createAgentSignalMemoryWriterPrompt,
  createAgentSignalMemoryWriterSystemRole,
} from '@orvilo/prompts';
import type { BuiltinServerRuntimeOutput } from '@orvilo/types';
import { RequestTrigger } from '@orvilo/types';
import { nanoid } from '@orvilo/utils';

import { UserMemoryModel } from '@/database/models/userMemory';
import type { OrviloDatabase } from '@/database/type';
import type { AgentSignalOperationMarker } from '@/server/services/agentSignal/operationMarker';
import { persistAgentSignalReceipts } from '@/server/services/agentSignal/services/receiptService';
import { buildSelfIterationReceipts } from '@/server/services/agentSignal/services/selfIteration/completion/buildSelfIterationReceipts';

import type { RuntimeProcessorContext } from '../../../runtime/context';
import { defineActionHandler } from '../../../runtime/middleware';
import {
  createMemoryService,
  MemoryActionError,
} from '../../../services/selfIteration/tools/shared';
import { hasAppliedActionIdempotency, markAppliedActionIdempotency } from '../../actionIdempotency';
import type {
  ActionUserMemoryHandle,
  AgentSignalFeedbackDomainConflictPolicy,
  AgentSignalFeedbackEvidence,
  AgentSignalFeedbackSourceHints,
} from '../../types';
import { AGENT_SIGNAL_POLICY_ACTION_TYPES } from '../../types';
import {
  MEMORY_WRITE_TARGET_BY_API_NAME,
  type MemoryActionTarget,
  type MemoryAgentActionResult,
  resolveMemoryActionResultFromState,
  resolveMemoryActionTargetFromState,
} from './memoryActionResult';

// Backward-compatible re-export: the memory finalState helpers + result types
// now live in the dependency-light ./memoryActionResult module.
export type { MemoryActionTarget, MemoryAgentActionResult };
export { resolveMemoryActionResultFromState, resolveMemoryActionTargetFromState };

export interface UserMemoryActionHandlerOptions {
  db: OrviloDatabase;
  memoryActionRunner?: (input: {
    agentId?: string;
    conflictPolicy?: AgentSignalFeedbackDomainConflictPolicy;
    evidence?: AgentSignalFeedbackEvidence[];
    feedbackHint?: 'not_satisfied' | 'satisfied';
    memoryLanguage?: string;
    message: string;
    reason?: string;
    serializedContext?: string;
    sourceHints?: AgentSignalFeedbackSourceHints;
    sourceMessageId?: string;
    topicId?: string;
  }) => Promise<MemoryAgentActionResult>;
  userId: string;
  workspaceId?: string;
}

const finalizeAttempt = (
  startedAt: number,
  status: SignalAttempt['status'],
): SignalAttempt | AgenticAttempt => ({
  completedAt: Date.now(),
  current: 1,
  startedAt,
  status,
});

const toExecutorError = (actionId: string, error: unknown, startedAt: number): ExecutorResult => {
  return {
    actionId,
    attempt: finalizeAttempt(startedAt, 'failed'),
    error: {
      cause: error,
      code: 'USER_MEMORY_EXECUTION_FAILED',
      message: error instanceof Error ? error.message : String(error),
    },
    status: 'failed',
  };
};

const isUserMemoryAction = (action: BaseAction): action is ActionUserMemoryHandle => {
  return action.actionType === AGENT_SIGNAL_POLICY_ACTION_TYPES.userMemoryHandle;
};

interface BuildUserMemoryActionAgentSignalMarkerInput {
  assistantMessageId?: string;
  sourceId: string;
  topicId?: string;
  triggerMessageId?: string;
}

export const buildUserMemoryActionAgentSignalMarker = ({
  assistantMessageId,
  sourceId,
  topicId,
  triggerMessageId,
}: BuildUserMemoryActionAgentSignalMarkerInput): AgentSignalOperationMarker => ({
  // Preserve the split: user feedback is the trigger; only a known assistant
  // reply is a durable receipt anchor. UI fallback happens in the chat list.
  ...(assistantMessageId ? { anchorMessageId: assistantMessageId } : {}),
  kind: 'memory',
  sourceId,
  ...(topicId ? { topicId } : {}),
  ...(triggerMessageId ? { triggerMessageId } : {}),
});

const MEMORY_WRITE_ACTIONS = [
  MemoryApiName.addActivityMemory,
  MemoryApiName.addContextMemory,
  MemoryApiName.addExperienceMemory,
  MemoryApiName.addIdentityMemory,
  MemoryApiName.addPreferenceMemory,
  MemoryApiName.removeIdentityMemory,
  MemoryApiName.updateIdentityMemory,
] as const;

type MemoryWriteAction = (typeof MEMORY_WRITE_ACTIONS)[number];

const MEMORY_WRITE_DECISION_SCHEMA = {
  description:
    'One durable user-memory write decision: pick a single memory API with its arguments, or "skip".',
  name: 'agent_signal_memory_write_decision',
  schema: {
    additionalProperties: false,
    properties: {
      action: {
        description:
          'The memory API to apply. "skip" means the feedback should not become durable memory.',
        enum: [...MEMORY_WRITE_ACTIONS, 'skip'],
        type: 'string',
      },
      params: {
        description:
          'Arguments for the chosen API, conforming exactly to its declared schema. Required unless action is "skip".',
        type: 'object',
      },
      reasoning: {
        description: 'Brief rationale for the decision.',
        type: 'string',
      },
    },
    required: ['action'],
    type: 'object' as const,
  },
  strict: true,
};

const isMemoryWriteAction = (action: unknown): action is MemoryWriteAction =>
  typeof action === 'string' && (MEMORY_WRITE_ACTIONS as readonly string[]).includes(action);

const toMemoryActionTarget = (
  action: MemoryWriteAction,
  output: BuiltinServerRuntimeOutput,
  params: Record<string, unknown>,
  identityTitleById: Map<string, string>,
): MemoryActionTarget | undefined => {
  const state = output.state as Record<string, unknown> | undefined;
  const targetConfig = MEMORY_WRITE_TARGET_BY_API_NAME[action];
  const id =
    (typeof state?.[targetConfig.idKey] === 'string'
      ? (state[targetConfig.idKey] as string)
      : undefined) ?? (typeof params.id === 'string' ? params.id : undefined);
  const memoryId = typeof state?.memoryId === 'string' ? state.memoryId : undefined;
  const title =
    (typeof params.title === 'string' ? params.title : undefined) ??
    (id ? identityTitleById.get(id) : undefined);

  if (!id && !memoryId) return undefined;

  return {
    ...(id ? { id } : {}),
    ...(memoryId ? { memoryId } : {}),
    memoryLayer: targetConfig.layer,
    title: title ?? 'Memory saved',
    type: 'memory',
  };
};

// Memory finalState parsing (tool-call/result walking, target resolution) lives
// in ./memoryActionResult — kept dependency-light so the completion path can
// reuse it without dragging this heavy module into its graph.

export const runMemoryActionAgent = async (
  input: {
    agentId?: string;
    conflictPolicy?: AgentSignalFeedbackDomainConflictPolicy;
    evidence?: AgentSignalFeedbackEvidence[];
    feedbackHint?: 'not_satisfied' | 'satisfied';
    memoryLanguage?: string;
    message: string;
    reason?: string;
    serializedContext?: string;
    sourceHints?: AgentSignalFeedbackSourceHints;
    /**
     * The assistant message id that triggered this memory action — carried on
     * the marker so the receipt anchors to the turn that produced it.
     */
    sourceMessageId?: string;
    topicId?: string;
  },
  options: UserMemoryActionHandlerOptions,
  /**
   * When provided, the applied write's durable receipt is projected directly
   * from the marker — the same projection the retired memory-writer op's
   * completion path produced (`writeMemory` mutation → memory receipt). Absent
   * → the caller opted out of receipt projection (self-iteration primitives).
   */
  dispatch?: { marker: AgentSignalOperationMarker },
): Promise<MemoryAgentActionResult> => {
  if (!input.agentId) {
    return {
      detail: 'Missing agentId for memory action.',
      status: 'skipped',
    };
  }

  const memoryLanguage = input.memoryLanguage ?? 'English';
  const operationId = `agent-signal-memory-${nanoid()}`;

  // Lazy-loaded on purpose: the memory server runtime + model-runtime core
  // eagerly touch server-only env at module init. This policy action sits on
  // the light agentSignal request path imported by aiAgent, so static imports
  // would couple that whole subsystem into every aiAgent import.
  const [{ initModelRuntimeFromDeploymentConfig }, { memoryRuntime }] = await Promise.all([
    import('@/server/modules/ModelRuntime'),
    import('@/server/services/toolExecution/serverRuntimes/memory'),
  ]);

  // The memory tool executes entirely server-side here — the same runtime the
  // builtin tool chain resolves, so the write applies the same validation,
  // embeddings, and Agent Signal outcome emission as an in-chat call.
  const runtime = await memoryRuntime.factory({
    agentId: input.agentId,
    operationId,
    serverDB: options.db,
    toolManifestMap: {},
    topicId: input.topicId,
    userId: options.userId,
    workspaceId: options.workspaceId,
  });

  // The retired memory-writer agent could search existing memories before
  // choosing an API; the direct path pre-fetches the same context up front so
  // the decision sees existing identities (needed for update/remove ids) and
  // related memories (dedupe) without a tool loop.
  const memoryModel = new UserMemoryModel(options.db, options.userId);
  const [identities, searchResult, taxonomyResult] = await Promise.all([
    memoryModel
      .getAllIdentitiesWithMemory()
      .catch(() => [] as { identity: { id: string }; memory: { title?: string | null } }[]),
    runtime
      .searchUserMemory({ queries: [input.message] })
      .catch((): BuiltinServerRuntimeOutput => ({ content: '', success: false })),
    runtime
      .queryTaxonomyOptions({})
      .catch((): BuiltinServerRuntimeOutput => ({ content: '', success: false })),
  ]);
  const identityTitleById = new Map<string, string>(
    identities
      .map(({ identity, memory }) => [identity.id, memory.title] as const)
      .filter((pair): pair is readonly [string, string] => Boolean(pair[0] && pair[1])),
  );

  const modelRuntime = await initModelRuntimeFromDeploymentConfig(
    options.userId,
    DEFAULT_MINI_SYSTEM_AGENT_ITEM.provider,
    options.workspaceId,
  );

  const existingContext = {
    identities: identities.slice(0, 50).map(({ identity, memory }) => ({
      ...identity,
      memoryTitle: memory.title,
    })),
    relatedMemories: searchResult.state ?? null,
    taxonomy: taxonomyResult.state ?? null,
  };

  const systemRole = [
    createAgentSignalMemoryWriterSystemRole({ memoryLanguage }),
    'Instead of calling the tool, return a JSON decision: pick exactly one memory API name as "action" and pass its arguments as "params" matching that API\'s input schema. Choose "skip" when no durable write is justified.',
  ].join('\n\n');

  const decision = (await modelRuntime.generateObject(
    {
      messages: [
        { content: systemRole, role: 'system' },
        {
          content:
            createAgentSignalMemoryWriterPrompt({ ...input, memoryLanguage }) +
            `\n\nExisting user memory context (use identity ids for update/remove; dedupe against related memories):\n${JSON.stringify(existingContext)}`,
          role: 'user',
        },
      ],
      model: DEFAULT_MINI_SYSTEM_AGENT_ITEM.model,
      schema: MEMORY_WRITE_DECISION_SCHEMA,
    },
    { metadata: { trigger: RequestTrigger.AgentSignal } },
  )) as { action?: string; params?: Record<string, unknown>; reasoning?: string };

  if (!isMemoryWriteAction(decision.action)) {
    return {
      detail: decision.reasoning ?? 'No durable memory write justified.',
      status: 'skipped',
    };
  }

  const params = (decision.params ?? {}) as Record<string, unknown>;
  const output = (await runtime[decision.action](params)) as BuiltinServerRuntimeOutput;

  if (!output.success) {
    return {
      detail: output.content || 'Memory write failed.',
      status: 'failed',
    };
  }

  const target = toMemoryActionTarget(decision.action, output, params, identityTitleById);
  const detail = output.content || 'Memory write applied.';

  if (dispatch?.marker) {
    const marker = dispatch.marker;
    const sourceId = marker.sourceId ?? operationId;
    const receipts = buildSelfIterationReceipts({
      agentId: input.agentId,
      artifacts: [],
      createdAt: Date.now(),
      marker,
      mutations: [
        {
          apiName: 'writeMemory',
          data: {
            kind: 'mutation',
            ...(target ? { target } : {}),
            resourceId: target?.id ?? target?.memoryId,
            status: 'applied',
            summary: detail,
          },
          kind: 'mutation',
        },
      ],
      operationId,
      sourceId,
      sourceType: AGENT_SIGNAL_SOURCE_TYPES.agentExecutionCompleted,
      topicId: input.topicId ?? marker.topicId ?? sourceId,
      userId: options.userId,
    });
    await persistAgentSignalReceipts(receipts);
  }

  return {
    detail,
    status: 'applied',
    ...(target ? { target } : {}),
  };
};

export const handleUserMemoryAction = async (
  action: BaseAction,
  options: UserMemoryActionHandlerOptions,
  context: RuntimeProcessorContext,
): Promise<ExecutorResult> => {
  const startedAt = Date.now();
  const idempotencyKey =
    'idempotencyKey' in action.payload && typeof action.payload.idempotencyKey === 'string'
      ? action.payload.idempotencyKey
      : undefined;

  try {
    if (await hasAppliedActionIdempotency(context, idempotencyKey)) {
      return {
        actionId: action.actionId,
        attempt: finalizeAttempt(startedAt, 'skipped'),
        detail: 'Action idempotency key already applied.',
        status: 'skipped',
      };
    }

    if (!isUserMemoryAction(action)) {
      return {
        actionId: action.actionId,
        attempt: finalizeAttempt(startedAt, 'skipped'),
        detail: 'Unsupported memory action.',
        status: 'skipped',
      };
    }

    const message =
      typeof action.payload.message === 'string' ? action.payload.message.trim() : undefined;

    if (!message) {
      return {
        actionId: action.actionId,
        attempt: finalizeAttempt(startedAt, 'skipped'),
        detail: 'Missing memory action message.',
        status: 'skipped',
      };
    }

    const feedbackHint =
      action.payload.feedbackHint === 'satisfied' || action.payload.feedbackHint === 'not_satisfied'
        ? action.payload.feedbackHint
        : undefined;
    const assistantMessageId =
      typeof action.payload.assistantMessageId === 'string'
        ? action.payload.assistantMessageId
        : undefined;
    const messageId =
      typeof action.payload.messageId === 'string' ? action.payload.messageId : undefined;
    const triggerMessageId =
      typeof action.payload.triggerMessageId === 'string'
        ? action.payload.triggerMessageId
        : messageId;
    const runnerInput = {
      agentId: typeof action.payload.agentId === 'string' ? action.payload.agentId : undefined,
      conflictPolicy:
        typeof action.payload.conflictPolicy === 'object' && action.payload.conflictPolicy
          ? action.payload.conflictPolicy
          : undefined,
      evidence: Array.isArray(action.payload.evidence) ? action.payload.evidence : undefined,
      feedbackHint,
      message,
      reason: typeof action.payload.reason === 'string' ? action.payload.reason : undefined,
      serializedContext:
        typeof action.payload.serializedContext === 'string'
          ? action.payload.serializedContext
          : undefined,
      sourceHints:
        typeof action.payload.sourceHints === 'object' && action.payload.sourceHints
          ? action.payload.sourceHints
          : undefined,
      // Anchor the receipt to the completed assistant turn when the planner has
      // one, either from the normalized payload anchor or the legacy
      // `:completion:` source id; fall back to the triggering message.
      sourceMessageId: assistantMessageId ?? triggerMessageId,
      topicId: typeof action.payload.topicId === 'string' ? action.payload.topicId : undefined,
    };
    // The marker drives the direct receipt projection inside the runner once a
    // write applies (same projection the retired op-completion path produced).
    const marker = buildUserMemoryActionAgentSignalMarker({
      ...(assistantMessageId ? { assistantMessageId } : {}),
      sourceId: idempotencyKey ?? action.actionId,
      ...(runnerInput.topicId ? { topicId: runnerInput.topicId } : {}),
      ...(triggerMessageId ? { triggerMessageId } : {}),
    });
    const runner =
      options.memoryActionRunner ?? ((input) => runMemoryActionAgent(input, options, { marker }));
    let memoryActionResult: MemoryAgentActionResult | undefined;
    const memoryService = createMemoryService({
      writeMemory: async () => {
        const result = await runner(runnerInput);
        memoryActionResult = result;

        if (result.status === 'applied') {
          return {
            memoryId: result.target?.id ?? idempotencyKey ?? action.actionId,
            summary: result.detail,
          };
        }

        throw new MemoryActionError(
          result.detail ?? 'Memory action agent did not apply a durable memory write.',
          result.status,
        );
      },
    });

    const result = await memoryService
      .writeMemory({
        evidenceRefs: [],
        idempotencyKey: idempotencyKey ?? action.actionId,
        input: {
          content: message,
          userId: options.userId,
        },
      })
      .then<MemoryAgentActionResult>((writeResult) => ({
        detail: writeResult.summary,
        status: 'applied',
        ...(memoryActionResult?.target ? { target: memoryActionResult.target } : {}),
      }))
      .catch((error: unknown): MemoryAgentActionResult => {
        if (error instanceof MemoryActionError) {
          return {
            detail: error.message,
            status: error.status,
          };
        }

        throw error;
      });

    if (result.status === 'applied') {
      await markAppliedActionIdempotency(context, idempotencyKey);

      return {
        actionId: action.actionId,
        attempt: finalizeAttempt(startedAt, 'succeeded'),
        detail: result.detail,
        ...(result.target ? { output: { target: result.target } } : {}),
        status: 'applied',
      };
    }

    if (result.status === 'failed') {
      return {
        ...toExecutorError(
          action.actionId,
          result.detail ?? 'Memory action agent failed.',
          startedAt,
        ),
        detail: result.detail,
      };
    }

    return {
      actionId: action.actionId,
      attempt: finalizeAttempt(startedAt, 'skipped'),
      detail: result.detail,
      status: 'skipped',
    };
  } catch (error) {
    return toExecutorError(action.actionId, error, startedAt);
  }
};

export const defineUserMemoryActionHandler = (options: UserMemoryActionHandlerOptions) => {
  return defineActionHandler(
    AGENT_SIGNAL_POLICY_ACTION_TYPES.userMemoryHandle,
    'handler.user-memory.handle',
    async (action, context: RuntimeProcessorContext) => {
      return handleUserMemoryAction(action, options, context);
    },
  );
};
