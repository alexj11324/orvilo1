/**
 * AgentSessionEvent → HarnessSessionEvent mapping (pure, no upstream imports —
 * the vendored event shapes are declared structurally here so this module is
 * unit-testable without the vendor tree).
 *
 * v1 policy: text deltas and usage stream through; any tool execution or
 * toolcall content is a `tool-violation` — the runner was booted with an empty
 * tool allowlist, so a tool event means upstream escaped the sandbox and the
 * host must terminate rather than flatten the turn into text.
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

/**
 * Map one upstream event to zero or one wire event. Returns `null` when the
 * upstream event carries nothing worth streaming (lifecycle noise).
 */
export const mapAgentSessionEvent = (event: UpstreamEvent): HarnessSessionEvent | null => {
  switch (event.type) {
    case 'message_update': {
      const assistantEvent = event.assistantMessageEvent;
      if (!isRecord(assistantEvent) || typeof assistantEvent.type !== 'string') return null;
      if (
        assistantEvent.type === 'toolcall_start' ||
        assistantEvent.type === 'toolcall_delta' ||
        assistantEvent.type === 'toolcall_end'
      ) {
        return {
          kind: 'tool-violation',
          toolName: 'assistant-message',
          event: assistantEvent.type,
        };
      }
      if (assistantEvent.type === 'text_delta' && typeof assistantEvent.delta === 'string') {
        return { kind: 'text', text: assistantEvent.delta };
      }
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
      return { kind: 'tool-violation', toolName: toolNameOf(event.toolName), event: event.type };
    }
    case 'tool_execution_update': {
      return { kind: 'tool-violation', toolName: toolNameOf(event.toolName), event: event.type };
    }
    case 'tool_execution_end': {
      return { kind: 'tool-violation', toolName: toolNameOf(event.toolName), event: event.type };
    }
    default: {
      return null;
    }
  }
};

/**
 * Upstream StopReason → wire stop reason. `toolUse` is itself a violation
 * (the model asked for a tool while none are registered) — the runner reports
 * it as an error so the host terminates instead of treating it as a turn end.
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
        error: 'Model requested tool execution with an empty allowlist',
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
