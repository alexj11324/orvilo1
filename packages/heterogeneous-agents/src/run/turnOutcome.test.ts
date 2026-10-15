import { describe, expect, it, vi } from 'vitest';

import type { AgentStreamEvent } from '../spawn';
import { consumeTurnEvents, deriveTurnOutcome } from './turnOutcome';

const event = (type: string, data: Record<string, unknown> = {}): AgentStreamEvent =>
  ({ data, operationId: 'op', stepIndex: 0, timestamp: 0, type }) as AgentStreamEvent;

async function* stream(...events: AgentStreamEvent[]) {
  yield* events;
}

describe('consumeTurnEvents', () => {
  it('withholds a resume failure while intercepting and forwards everything else', async () => {
    const onEvent = vi.fn();
    const onWithheld = vi.fn();
    const summary = await consumeTurnEvents(
      stream(event('stream_chunk'), event('error', { message: 'Session not found' })),
      { interceptResumeErrors: true, onEvent, onWithheld },
    );

    expect(summary.resumeNotFound).toBe(true);
    expect(summary.sawTerminalError).toBe(false);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onWithheld).toHaveBeenCalledTimes(1);
  });

  it('records a terminal error when not intercepting', async () => {
    const onEvent = vi.fn();
    const summary = await consumeTurnEvents(stream(event('error', { message: 'rate limited' })), {
      interceptResumeErrors: false,
      onEvent,
    });

    expect(summary).toMatchObject({ sawTerminalError: true, terminalErrorMessage: 'rate limited' });
    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});

describe('deriveTurnOutcome', () => {
  const base = {
    cancelled: false,
    code: 0,
    ingestError: false,
    sawTerminalError: false,
    signal: null,
    stderrContent: '',
    terminalErrorData: undefined,
    terminalErrorMessage: undefined,
  };

  it('reports success for a clean turn', () => {
    expect(deriveTurnOutcome({ agentType: 'claude-code' }, base)).toEqual({
      error: undefined,
      result: 'success',
    });
  });

  it('reports cancelled without an error', () => {
    expect(deriveTurnOutcome({ agentType: 'claude-code' }, { ...base, cancelled: true })).toEqual({
      error: undefined,
      result: 'cancelled',
    });
  });

  it('fails a clean exit that relayed a terminal error', () => {
    const outcome = deriveTurnOutcome(
      { agentType: 'claude-code' },
      { ...base, sawTerminalError: true, terminalErrorMessage: 'overloaded' },
    );
    expect(outcome.result).toBe('error');
    expect(outcome.error?.message).toContain('overloaded');
  });
});
