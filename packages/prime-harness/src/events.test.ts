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
      { type: 'message_start', message: { role: 'user' } },
      { type: 'agent_start' },
      { type: 'turn_start' },
      { type: 'agent_end', messages: [] },
    ]) {
      expect(mapAgentSessionEvent(event)).toBeNull();
    }
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

  it.each(['tool_execution_start', 'tool_execution_update', 'tool_execution_end'])(
    'maps %s to a tool-violation',
    (type) => {
      expect(mapAgentSessionEvent({ type, toolName: 'bash', toolCallId: 'tc1' })).toEqual({
        kind: 'tool-violation',
        toolName: 'bash',
        event: type,
      });
    },
  );

  it.each(['toolcall_start', 'toolcall_delta', 'toolcall_end'])(
    'maps assistant %s content to a tool-violation',
    (type) => {
      expect(
        mapAgentSessionEvent({
          type: 'message_update',
          assistantMessageEvent: { type },
        }),
      ).toEqual({ kind: 'tool-violation', toolName: 'assistant-message', event: type });
    },
  );
});

describe('mapStopReason', () => {
  it.each([
    ['stop', { stopReason: 'end_turn' }],
    ['aborted', { stopReason: 'cancelled' }],
    ['length', { stopReason: 'budget' }],
    [
      'toolUse',
      { stopReason: 'error', error: 'Model requested tool execution with an empty allowlist' },
    ],
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
