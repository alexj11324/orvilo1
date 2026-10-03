// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { mapAgentSessionEvent, mapStopReason } from './events';

describe('mapAgentSessionEvent', () => {
  it('maps text deltas to wire text events', () => {
    expect(
      mapAgentSessionEvent({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'hello' },
      }),
    ).toEqual({ kind: 'text', text: 'hello' });
  });

  it('drops non-delta assistant events and lifecycle noise', () => {
    for (const event of [
      { type: 'message_update', assistantMessageEvent: { type: 'start' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_end' } },
      { type: 'message_update', assistantMessageEvent: { type: 'toolcall_start' } },
      { type: 'message_update', assistantMessageEvent: { type: 'toolcall_delta' } },
      { type: 'message_update', assistantMessageEvent: { type: 'toolcall_end' } },
      { type: 'message_start', message: { role: 'user' } },
      { type: 'agent_start' },
      { type: 'turn_start' },
      { type: 'agent_end', messages: [] },
    ]) {
      expect(mapAgentSessionEvent(event)).toBeNull();
    }
  });

  it('maps thinking deltas to wire thinking events', () => {
    expect(
      mapAgentSessionEvent({
        type: 'message_update',
        assistantMessageEvent: { type: 'thinking_delta', delta: 'pondering' },
      }),
    ).toEqual({ kind: 'thinking', text: 'pondering' });
  });

  it('maps message_end usage to a wire usage event', () => {
    expect(
      mapAgentSessionEvent({
        type: 'message_end',
        message: {
          role: 'assistant',
          usage: {
            input: 10,
            output: 3,
            totalTokens: 13,
            cost: { input: 1, output: 2, total: 3 },
          },
        },
      }),
    ).toEqual({
      kind: 'usage',
      inputTokens: 10,
      outputTokens: 3,
      totalTokens: 13,
      cost: { input: 1, output: 2, cacheRead: undefined, cacheWrite: undefined, total: 3 },
    });
  });

  it('maps tool_execution_start to a tool_call wire event', () => {
    expect(
      mapAgentSessionEvent({
        type: 'tool_execution_start',
        toolName: 'ipython',
        toolCallId: 'call-1',
        args: { code: '1+1' },
      }),
    ).toEqual({
      kind: 'tool_call',
      toolCallId: 'call-1',
      toolName: 'ipython',
      args: { code: '1+1' },
    });
  });

  it('maps tool_execution_update to a tool_progress wire event', () => {
    expect(
      mapAgentSessionEvent({
        type: 'tool_execution_update',
        toolName: 'ipython',
        toolCallId: 'call-1',
        partialResult: { chunk: 'partial' },
      }),
    ).toEqual({
      kind: 'tool_progress',
      toolCallId: 'call-1',
      toolName: 'ipython',
      partialResult: { chunk: 'partial' },
    });
  });

  it('maps tool_execution_end to a tool_result wire event', () => {
    expect(
      mapAgentSessionEvent({
        type: 'tool_execution_end',
        toolName: 'ipython',
        toolCallId: 'call-1',
        result: { content: '2' },
        isError: false,
      }),
    ).toEqual({
      kind: 'tool_result',
      toolCallId: 'call-1',
      toolName: 'ipython',
      result: { content: '2' },
      isError: false,
    });
  });

  it.each(['tool_execution_start', 'tool_execution_update', 'tool_execution_end'])(
    'maps %s without a toolCallId to the fail-closed tool-violation invariant',
    (type) => {
      expect(mapAgentSessionEvent({ type, toolName: 'bash' })).toEqual({
        kind: 'tool-violation',
        toolName: 'bash',
        event: type,
      });
    },
  );
});

describe('mapStopReason', () => {
  it.each([
    ['stop', { stopReason: 'end_turn' }],
    ['aborted', { stopReason: 'cancelled' }],
    ['length', { stopReason: 'budget' }],
    ['toolUse', { stopReason: 'error', error: 'Run ended on unexecuted tool calls' }],
    ['error', { stopReason: 'error', error: 'Assistant message ended with an error' }],
    [undefined, { stopReason: 'error', error: 'Unsupported upstream stop reason: none' }],
    ['bogus', { stopReason: 'error', error: 'Unsupported upstream stop reason: bogus' }],
  ])('maps %s', (upstream, expected) => {
    expect(mapStopReason(upstream, false)).toEqual(expected);
  });

  it('reports cancelled when the runner aborted regardless of upstream reason', () => {
    expect(mapStopReason('stop', true)).toEqual({ stopReason: 'cancelled' });
  });
});
