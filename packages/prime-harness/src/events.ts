/**
 * AgentSessionEvent → HarnessSessionEvent mapping (pure, no upstream imports —
 * the vendored event shapes are declared structurally here so this module is
 * unit-testable without the vendor tree).
 *
 * v2 policy: negotiated tools are the normal path — `tool_execution_*` maps to
 * real `tool_call`/`tool_progress`/`tool_result` wire events and
 * `thinking_delta` maps to `thinking`. `tool-violation` survives only as the
 * fail-closed invariant for events that carry no declared tool identity — a
 * tool event outside the negotiated surface still means upstream escaped the
 * sandbox and the host must terminate rather than flatten it into text.
 */

import type {
  HarnessSessionEvent,
  HarnessStopReason,
} from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { isRecord } from '@orvilo/utils/object';

/** Structural view over the upstream AgentSessionEvent union — every member
 * carries `type` plus arbitrary fields, so `type` is the only honest key. */
interface UpstreamEvent {
  [key: string]: unknown;
  type: string;
}

const toolNameOf = (value: unknown): string =>
  typeof value === 'string' && value.length > 0 ? value : 'unknown';

const toolCallIdOf = (event: UpstreamEvent): string | undefined =>
  typeof event.toolCallId === 'string' && event.toolCallId.length > 0
    ? event.toolCallId
    : undefined;

/**
 * Map one upstream event to zero or one wire event. Returns `null` when the
 * upstream event carries nothing worth streaming (lifecycle noise).
 */
export const mapAgentSessionEvent = (event: UpstreamEvent): HarnessSessionEvent | null => {
  switch (event.type) {
    case 'message_update': {
      const assistantEvent = event.assistantMessageEvent;
      if (!isRecord(assistantEvent) || typeof assistantEvent.type !== 'string') return null;
      if (assistantEvent.type === 'thinking_delta' && typeof assistantEvent.delta === 'string') {
        return { kind: 'thinking', text: assistantEvent.delta };
      }
      if (assistantEvent.type === 'text_delta' && typeof assistantEvent.delta === 'string') {
        return { kind: 'text', text: assistantEvent.delta };
      }
      // toolcall_* assistant events stream the model's in-flight call args —
      // the ledger's tool truth is the tool_execution_* events below, so
      // these stay off the wire rather than double-reporting one call.
      return null;
    }
    case 'message_end': {
      const message = event.message;
      if (!isRecord(message) || !isRecord(message.usage)) return null;
      const { usage } = message;
      if (typeof usage.input !== 'number' || typeof usage.output !== 'number') return null;
      const cost = isRecord(usage.cost)
        ? {
            input: typeof usage.cost.input === 'number' ? usage.cost.input : undefined,
            output: typeof usage.cost.output === 'number' ? usage.cost.output : undefined,
            cacheRead: typeof usage.cost.cacheRead === 'number' ? usage.cost.cacheRead : undefined,
            cacheWrite:
              typeof usage.cost.cacheWrite === 'number' ? usage.cost.cacheWrite : undefined,
            total: typeof usage.cost.total === 'number' ? usage.cost.total : undefined,
          }
        : undefined;
      return {
        kind: 'usage',
        inputTokens: usage.input,
        outputTokens: usage.output,
        totalTokens: typeof usage.totalTokens === 'number' ? usage.totalTokens : undefined,
        cost,
      };
    }
    case 'tool_execution_start': {
      const toolCallId = toolCallIdOf(event);
      if (!toolCallId) {
        return { kind: 'tool-violation', toolName: toolNameOf(event.toolName), event: event.type };
      }
      return {
        args: event.args,
        kind: 'tool_call',
        toolCallId,
        toolName: toolNameOf(event.toolName),
      };
    }
    case 'tool_execution_update': {
      const toolCallId = toolCallIdOf(event);
      if (!toolCallId) {
        return { kind: 'tool-violation', toolName: toolNameOf(event.toolName), event: event.type };
      }
      return {
        kind: 'tool_progress',
        partialResult: event.partialResult,
        toolCallId,
        toolName: toolNameOf(event.toolName),
      };
    }
    case 'tool_execution_end': {
      const toolCallId = toolCallIdOf(event);
      if (!toolCallId) {
        return { kind: 'tool-violation', toolName: toolNameOf(event.toolName), event: event.type };
      }
      return {
        isError: event.isError === true,
        kind: 'tool_result',
        result: event.result,
        toolCallId,
        toolName: toolNameOf(event.toolName),
      };
    }
    case 'rlm_child_update': {
      // Snapshot of a child in this session's RLM tree — the parent's own
      // stream carries these (grandchildren bubble up through each level).
      const child = event.child;
      if (!isRecord(child) || typeof child.id !== 'string' || child.id.length === 0) return null;
      return {
        child: {
          id: child.id,
          activeSessionId:
            typeof child.activeSessionId === 'string' ? child.activeSessionId : undefined,
          activity:
            isRecord(child.activity) &&
            (child.activity.kind === 'waiting' ||
              child.activity.kind === 'writing' ||
              child.activity.kind === 'executing')
              ? {
                  kind: child.activity.kind,
                  toolName:
                    typeof child.activity.toolName === 'string'
                      ? child.activity.toolName
                      : undefined,
                }
              : undefined,
          answerPreview: typeof child.answerPreview === 'string' ? child.answerPreview : undefined,
          durationMs: typeof child.durationMs === 'number' ? child.durationMs : undefined,
          error: typeof child.error === 'string' ? child.error : undefined,
          label: typeof child.label === 'string' ? child.label : undefined,
          model: typeof child.model === 'string' ? child.model : undefined,
          parentId: typeof child.parentId === 'string' ? child.parentId : undefined,
          progressNote: typeof child.progressNote === 'string' ? child.progressNote : undefined,
          sessionDir: typeof child.sessionDir === 'string' ? child.sessionDir : undefined,
          sessionName: typeof child.sessionName === 'string' ? child.sessionName : undefined,
          status:
            child.status === 'running' ||
            child.status === 'done' ||
            child.status === 'error' ||
            child.status === 'cancelled' ||
            child.status === 'queued'
              ? child.status
              : 'queued',
          toolUseCount: typeof child.toolUseCount === 'number' ? child.toolUseCount : undefined,
        },
        kind: 'subagent_update',
      };
    }
    default: {
      return null;
    }
  }
};

/**
 * Upstream StopReason → wire stop reason. With real tools enabled `toolUse`
 * means the model's final assistant message ended on tool calls the session
 * did not execute — an abnormal end the host should see honestly (the normal
 * multi-turn loop executes the calls and ends on `stop` instead).
 */
export const mapStopReason = (
  upstream: string | undefined,
  aborted: boolean,
): { stopReason: HarnessStopReason; error?: string } => {
  if (aborted || upstream === 'aborted') return { stopReason: 'cancelled' };
  switch (upstream) {
    case 'stop': {
      return { stopReason: 'end_turn' };
    }
    case 'length': {
      return { stopReason: 'budget' };
    }
    case 'toolUse': {
      return {
        stopReason: 'error',
        error: 'Run ended on unexecuted tool calls',
      };
    }
    case 'error': {
      return { stopReason: 'error', error: 'Assistant message ended with an error' };
    }
    default: {
      return {
        stopReason: 'error',
        error: `Unsupported upstream stop reason: ${upstream ?? 'none'}`,
      };
    }
  }
};
