/**
 * Prime harness/RuntimeEvent → ledger stream-event mapping (hetero parity).
 *
 * Both Prime producers — the embedded drive loop and the device-side session
 * pump — translate `thinking` / `tool_call` / `tool_progress` / `tool_result`
 * into the same `AgentStreamEvent` vocabulary the heterogeneous adapters emit
 * (`stream_chunk{reasoning|tools_calling|tool_state}`, `tool_start`,
 * `tool_result`, `tool_end`). Because the ingest reducers consume those chunks
 * agentType-agnostically, mapping here gives Prime runs identical ledger rows
 * and chat surfacing without touching hetero code.
 *
 * `tool-violation` never reaches this mapper — it stays a fail-closed runtime
 * error at each call site.
 */
import type { ChatToolPayload } from '@orvilo/types';

import type { RuntimeEvent } from './contracts';
import type { HarnessSessionEvent } from './harnessProtocol';

/** Emitted pair; each call site stamps operationId/stepIndex/timestamp. */
export interface PrimeStreamEmission {
  data: Record<string, unknown>;
  type: 'error' | 'stream_chunk' | 'tool_start' | 'tool_result' | 'tool_end';
}

/**
 * Per-turn bookkeeping, reset for each prompt/operation: cumulative tool calls
 * mirror the pi adapter's `stepToolCalls` so `tools_calling` chunks grow the
 * assistant message's `tools` array, and `toolPayloadById` re-attaches the
 * payload on `tool_end` (the renderer resolves it by id).
 */
export interface PrimeStreamState {
  completedToolResultIds: Set<string>;
  /** RLM child ids already introduced to the ledger — spawnMetadata rides
   * the FIRST event for a child only (hetero `spawnMetadata` parity). */
  seenSubagents: Set<string>;
  toolCalls: ChatToolPayload[];
  toolPayloadById: Map<string, ChatToolPayload>;
  toolStateSeqById: Map<string, number>;
}

export const createPrimeStreamState = (): PrimeStreamState => ({
  completedToolResultIds: new Set(),
  seenSubagents: new Set(),
  toolCalls: [],
  toolPayloadById: new Map(),
  toolStateSeqById: new Map(),
});

export interface SubagentContextInput {
  childId: string;
  name?: string;
  parentId?: string;
}

/** Structural minimum of the wire/embedded child-lifecycle snapshot. */
interface SubagentSnapshotInput {
  answerPreview?: string;
  error?: string;
  id: string;
  label?: string;
  parentId?: string;
  progressNote?: string;
  prompt?: string;
  sessionName?: string;
}

/**
 * `subagent_update` → ledger emissions. The lifecycle snapshot itself rides
 * the `subagent` context (the ledger lazy-creates the subagent Thread off
 * the first sighted parentToolCallId + spawnMetadata). Content the snapshot
 * carries — progress notes, answer previews, errors — surfaces as reasoning
 * / error chunks inside that Thread so nothing is dropped on the floor of
 * an unknown chunkType.
 */
const mapSubagentUpdate = (
  state: PrimeStreamState,
  child: SubagentSnapshotInput,
  scope?: SubagentContextInput,
): PrimeStreamEmission[] => {
  const subagent = subagentContext(
    state,
    scope ?? {
      childId: child.id,
      name: child.sessionName ?? child.label,
      parentId: child.parentId,
    },
    { prompt: child.prompt },
  );
  const emissions: PrimeStreamEmission[] = [
    {
      data: {
        chunkType: 'subagent_update',
        snapshot: child,
        ...(subagent ? { subagent } : {}),
      },
      type: 'stream_chunk',
    },
  ];
  const note = child.progressNote ?? child.answerPreview;
  if (typeof note === 'string' && note.length > 0) {
    emissions.push({
      data: {
        chunkType: 'reasoning',
        reasoning: note,
        ...(subagent ? { subagent } : {}),
      },
      type: 'stream_chunk',
    });
  }
  if (typeof child.error === 'string' && child.error.length > 0) {
    emissions.push({
      data: {
        message: child.error,
        ...(subagent ? { subagent } : {}),
      },
      type: 'error',
    });
  }
  return emissions;
};

/**
 * `HarnessSubagentContext` → hetero `SubagentEventContext`: the RLM child
 * node id plays `parentToolCallId`'s Thread-routing role (the spawn's
 * stable key). `spawnMetadata` appears exactly once per child — the first
 * sighted event carries it; `prompt` is only known on the subagent_update
 * admission event, never on later tool/thinking events.
 */
export const subagentContext = (
  state: PrimeStreamState,
  input: SubagentContextInput | undefined,
  spawn?: { prompt?: string },
): Record<string, unknown> | undefined => {
  if (!input) return undefined;
  const first = !state.seenSubagents.has(input.childId);
  state.seenSubagents.add(input.childId);
  return {
    parentToolCallId: input.childId,
    ...(first
      ? {
          spawnMetadata: {
            description: input.name,
            prompt: spawn?.prompt,
            subagentType: 'rlm',
          },
        }
      : {}),
  };
};

const toToolPayload = (toolCallId: string, toolName: string, args: unknown): ChatToolPayload => ({
  apiName: toolName,
  arguments: JSON.stringify(args ?? {}),
  id: toolCallId,
  identifier: 'orvilo',
  type: 'default',
});

interface NormalizedToolContent {
  content: string;
  pluginState?: Record<string, unknown>;
}

/**
 * Flatten an upstream tool result (`{content: block[], details?}` or a bare
 * block array) into ledger text + optional plugin state — same normalization
 * hetero applies (`[Image: type]` markers for non-text blocks).
 */
const normalizeToolContent = (result: unknown): NormalizedToolContent => {
  const record =
    result !== null && typeof result === 'object' ? (result as Record<string, unknown>) : undefined;
  const blocks = Array.isArray(result) ? result : record?.content;
  const parts: string[] = [];
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text);
      else if (block?.type === 'image')
        parts.push(
          `[Image: ${
            typeof block.mimeType === 'string'
              ? block.mimeType
              : typeof block.mediaType === 'string'
                ? block.mediaType
                : 'image'
          }]`,
        );
      else if (typeof block?.content === 'string') parts.push(block.content);
    }
  } else if (typeof result === 'string') parts.push(result);
  const details = record?.details;
  return {
    content: parts.join(''),
    ...(details !== null && typeof details === 'object'
      ? { pluginState: details as Record<string, unknown> }
      : {}),
  };
};

const mapToolCall = (
  state: PrimeStreamState,
  event: {
    args: unknown;
    toolCallId: string;
    toolName: string;
    subagent?: SubagentContextInput;
  },
): PrimeStreamEmission[] => {
  if (state.completedToolResultIds.has(event.toolCallId)) return [];
  const tool = toToolPayload(event.toolCallId, event.toolName, event.args);
  if (!state.toolPayloadById.has(event.toolCallId)) state.toolCalls.push(tool);
  state.toolPayloadById.set(event.toolCallId, tool);
  const subagent = subagentContext(state, event.subagent);
  return [
    {
      data: {
        chunkType: 'tools_calling',
        toolsCalling: [...state.toolCalls],
        ...(subagent ? { subagent } : {}),
      },
      type: 'stream_chunk',
    },
    {
      data: {
        toolCalling: tool,
        toolCallId: event.toolCallId,
        ...(subagent ? { subagent } : {}),
      },
      type: 'tool_start',
    },
  ];
};

const mapToolProgress = (
  state: PrimeStreamState,
  event: {
    partialResult: unknown;
    toolCallId: string;
    subagent?: SubagentContextInput;
  },
): PrimeStreamEmission[] => {
  const normalized = normalizeToolContent(event.partialResult);
  const seq = (state.toolStateSeqById.get(event.toolCallId) ?? 0) + 1;
  state.toolStateSeqById.set(event.toolCallId, seq);
  const subagent = subagentContext(state, event.subagent);
  return [
    {
      data: {
        chunkType: 'tool_state',
        pluginState: { content: normalized.content, ...normalized.pluginState },
        snapshotMode: 'replace',
        snapshotSeq: seq,
        toolCallId: event.toolCallId,
        ...(subagent ? { subagent } : {}),
      },
      type: 'stream_chunk',
    },
  ];
};

const mapToolResult = (
  state: PrimeStreamState,
  event: {
    isError: boolean;
    result: unknown;
    toolCallId: string;
    subagent?: SubagentContextInput;
  },
): PrimeStreamEmission[] => {
  if (state.completedToolResultIds.has(event.toolCallId)) return [];
  state.completedToolResultIds.add(event.toolCallId);
  const normalized = normalizeToolContent(event.result);
  const toolCalling = state.toolPayloadById.get(event.toolCallId);
  const subagent = subagentContext(state, event.subagent);
  return [
    {
      data: {
        content: normalized.content,
        isError: event.isError,
        toolCallId: event.toolCallId,
        ...(normalized.pluginState ? { state: normalized.pluginState } : {}),
        ...(subagent ? { subagent } : {}),
      },
      type: 'tool_result',
    },
    {
      data: {
        isSuccess: !event.isError,
        ...(toolCalling ? { payload: { toolCalling } } : {}),
        result: {
          content: normalized.content,
          success: !event.isError,
          ...(normalized.pluginState ? { state: normalized.pluginState } : {}),
        },
        toolCallId: event.toolCallId,
        ...(subagent ? { subagent } : {}),
      },
      type: 'tool_end',
    },
  ];
};

/**
 * Map one device-side `HarnessSessionEvent` (runner → host wire) to ledger
 * emissions. `text`/`usage`/`error`/`tool-violation` stay handled at the call
 * site; this only covers the v2 surfacing kinds and returns `[]` otherwise.
 */
export const mapHarnessSessionEvent = (
  state: PrimeStreamState,
  event: HarnessSessionEvent,
): PrimeStreamEmission[] => {
  switch (event.kind) {
    case 'thinking': {
      const subagent = subagentContext(state, event.subagent);
      return [
        {
          data: {
            chunkType: 'reasoning',
            reasoning: event.text,
            ...(subagent ? { subagent } : {}),
          },
          type: 'stream_chunk',
        },
      ];
    }
    case 'subagent_update': {
      return mapSubagentUpdate(state, event.child, event.subagent);
    }
    case 'tool_call': {
      return mapToolCall(state, event);
    }
    case 'tool_progress': {
      return mapToolProgress(state, event);
    }
    case 'tool_result': {
      return mapToolResult(state, event);
    }
    default: {
      return [];
    }
  }
};

/** Same mapping for the embedded path's `RuntimeEvent` union. */
export const mapRuntimeEvent = (
  state: PrimeStreamState,
  event: RuntimeEvent,
): PrimeStreamEmission[] => {
  switch (event.type) {
    case 'thinking': {
      const subagent = subagentContext(state, event.subagent);
      return [
        {
          data: {
            chunkType: 'reasoning',
            reasoning: event.text,
            ...(subagent ? { subagent } : {}),
          },
          type: 'stream_chunk',
        },
      ];
    }
    case 'subagent_update': {
      return mapSubagentUpdate(state, event.child, event.subagent);
    }
    case 'tool_call': {
      return mapToolCall(state, event);
    }
    case 'tool_progress': {
      return mapToolProgress(state, event);
    }
    case 'tool_result': {
      return mapToolResult(state, event);
    }
    default: {
      return [];
    }
  }
};
