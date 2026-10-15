import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { AskUserBridge } from '../askUser/AskUserBridge';
import type { AgentStreamEvent, SpawnAgentHandle } from '../spawn';
import type { AcpTurnBindings, PersistentAcpAgent } from '../spawn/persistentAcpAgent';
import { type HeteroRunClient, runHeteroTurn, type RunHeteroTurnParams } from './runHeteroTurn';

const event = (type: AgentStreamEvent['type'], data: unknown, stepIndex = 0): AgentStreamEvent =>
  ({ data, operationId: 'op-1', stepIndex, timestamp: 0, type }) as AgentStreamEvent;

interface Script {
  events?: AgentStreamEvent[];
  exit?: { code: number | null; signal: NodeJS.Signals | null };
  /** Throw from the events iterator after yielding `events`. */
  iteratorError?: Error;
  /** Keep the turn open until `interrupt()` is called. */
  pendingUntilInterrupt?: boolean;
  runTurnError?: Error;
  sessionId?: string;
  stderr?: string;
}

const createFakeAgent = (script: Script) => {
  let releaseTurn: (() => void) | undefined;
  const turnHeld = new Promise<void>((resolve) => {
    releaseTurn = resolve;
  });
  const turns: AcpTurnBindings[] = [];
  const interrupt = vi.fn(async () => {
    releaseTurn?.();
    return true;
  });

  const agent: PersistentAcpAgent = {
    busy: false,
    close: vi.fn(),
    interrupt,
    pid: 123,
    reusable: true,
    runTurn: async (turn) => {
      turns.push(turn);
      if (script.runTurnError) throw script.runTurnError;
      const stderr = new PassThrough();
      if (script.stderr) stderr.write(script.stderr);
      async function* events() {
        for (const e of script.events ?? []) yield e;
        if (script.pendingUntilInterrupt) await turnHeld;
        if (script.iteratorError) throw script.iteratorError;
      }
      const handle: SpawnAgentHandle = {
        events: events(),
        exit: (async () => {
          if (script.pendingUntilInterrupt) await turnHeld;
          return script.exit ?? { code: 0, signal: null };
        })(),
        kill: vi.fn(),
        pid: 123,
        sessionId: script.sessionId,
        stderr,
      };
      return handle;
    },
    sessionId: script.sessionId,
  };
  return { agent, interrupt, turns };
};

const createFakeClient = (opts: { finishError?: Error } = {}) => {
  const ingested: AgentStreamEvent[] = [];
  const finishes: any[] = [];
  const pollResponses: Array<{ events: Array<{ data: unknown }>; lastEventId: string }> = [];
  const pollCalls: any[] = [];
  const client: HeteroRunClient = {
    aiAgent: {
      heteroFinish: {
        mutate: async (input: any) => {
          finishes.push(input);
          if (opts.finishError) throw opts.finishError;
          return {};
        },
      },
      heteroIngest: {
        mutate: async (input: any) => {
          ingested.push(...input.events);
          return {};
        },
      },
      waitInterventionResponse: {
        query: async (input) => {
          pollCalls.push(input);
          const next = pollResponses.shift();
          if (next) return next;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { events: [], lastEventId: input.lastEventId };
        },
      },
    },
  };
  return { client, finishes, ingested, pollCalls, pollResponses };
};

const baseParams = (
  client: HeteroRunClient,
  agents: PersistentAcpAgent[],
  extra: Partial<RunHeteroTurnParams> = {},
) => {
  const acquire = vi.fn(async () => {
    const next = agents.shift();
    if (!next) throw new Error('no agent');
    return next;
  });
  const params: RunHeteroTurnParams = {
    agentType: 'kimi-code',
    agents: { acquire },
    client,
    operationId: 'op-1',
    prompt: 'hello',
    topicId: 'topic-1',
    ...extra,
  };
  return { acquire, params };
};

const nonTextTypes = (events: AgentStreamEvent[]) =>
  events.filter((e) => e.type !== 'step_complete').map((e) => e.type);

describe('runHeteroTurn', () => {
  it('ingests events in order and finishes success with the session id', async () => {
    const fake = createFakeClient();
    const { agent, turns } = createFakeAgent({
      events: [
        event('stream_start', {}),
        event('tool_start', { id: 't1' }, 1),
        event('tool_end', { id: 't1' }, 1),
        event('stream_end', {}, 2),
      ],
      sessionId: 'sess-1',
    });
    const onAgentStarted = vi.fn();
    const { acquire, params } = baseParams(fake.client, [agent], {
      assistantMessageId: 'msg-1',
      onAgentStarted,
      runGeneration: 3,
    });

    const result = await runHeteroTurn(params);

    expect(result).toEqual({
      error: undefined,
      finishDeliveryFailed: false,
      result: 'success',
      resumeSessionInvalidated: false,
      sessionId: 'sess-1',
    });
    expect(acquire).toHaveBeenCalledWith({ fresh: false, resumeSessionId: undefined });
    expect(turns[0]).toMatchObject({ operationId: 'op-1', prompt: 'hello' });
    expect(onAgentStarted).toHaveBeenCalledWith(agent);
    expect(nonTextTypes(fake.ingested)).toEqual([
      'stream_start',
      'tool_start',
      'tool_end',
      'stream_end',
    ]);
    expect(fake.finishes).toEqual([
      expect.objectContaining({
        agentType: 'kimi-code',
        assistantMessageId: 'msg-1',
        operationId: 'op-1',
        result: 'success',
        resumeSessionInvalidated: undefined,
        runGeneration: 3,
        sessionId: 'sess-1',
        topicId: 'topic-1',
      }),
    ]);
  });

  it('retries fresh with the fallback prompt when the resumed session is gone', async () => {
    const fake = createFakeClient();
    const first = createFakeAgent({
      events: [event('error', { message: 'Session abc not found' })],
      exit: { code: 1, signal: null },
    });
    const second = createFakeAgent({
      events: [event('stream_start', {}), event('stream_end', {})],
      sessionId: 'sess-new',
    });
    const { acquire, params } = baseParams(fake.client, [first.agent, second.agent], {
      resumeFallbackPrompt: 'full history + hello',
      resumeSessionId: 'sess-old',
    });

    const result = await runHeteroTurn(params);

    expect(acquire.mock.calls).toEqual([
      [{ fresh: false, resumeSessionId: 'sess-old' }],
      [{ fresh: true }],
    ]);
    expect(second.turns[0].prompt).toBe('full history + hello');
    expect(result).toMatchObject({
      result: 'success',
      resumeSessionInvalidated: true,
      sessionId: 'sess-new',
    });
    expect(fake.ingested.some((e) => e.type === 'error')).toBe(false);
    expect(fake.finishes[0]).toMatchObject({
      result: 'success',
      resumeSessionInvalidated: true,
      sessionId: 'sess-new',
    });
  });

  it('detects a dead resume from stderr when the agent exits non-zero silently', async () => {
    const fake = createFakeClient();
    const first = createFakeAgent({
      exit: { code: 1, signal: null },
      stderr: 'Error: No conversation found with session ID sess-old',
    });
    const second = createFakeAgent({ sessionId: 'sess-new' });
    const { params } = baseParams(fake.client, [first.agent, second.agent], {
      resumeSessionId: 'sess-old',
    });

    const result = await runHeteroTurn(params);

    expect(second.turns[0].prompt).toBe('hello');
    expect(result).toMatchObject({ resumeSessionInvalidated: true, result: 'success' });
  });

  it('fails a turn that relayed a terminal error even though it exited 0', async () => {
    const fake = createFakeClient();
    const { agent } = createFakeAgent({
      events: [event('error', { message: 'rate limited' })],
      sessionId: 'sess-1',
    });
    const { params } = baseParams(fake.client, [agent]);

    const result = await runHeteroTurn(params);

    expect(result.result).toBe('error');
    expect(result.error?.message).toContain('rate limited');
    expect(fake.ingested.some((e) => e.type === 'error')).toBe(true);
    expect(fake.finishes[0]).toMatchObject({ result: 'error', sessionId: 'sess-1' });
  });

  it('reports an acquire rejection as a finish error without throwing', async () => {
    const fake = createFakeClient();
    const params: RunHeteroTurnParams = {
      agentType: 'kimi-code',
      agents: {
        acquire: async () => {
          throw Object.assign(new Error('spawn boom'), { code: 'EACCES' });
        },
      },
      client: fake.client,
      operationId: 'op-1',
      prompt: 'hello',
      topicId: 'topic-1',
    };

    const result = await runHeteroTurn(params);

    expect(result.result).toBe('error');
    expect(result.error).toBeDefined();
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0].result).toBe('error');
    expect(fake.finishes[0].error.message).toBeTruthy();
  });

  it('reports a runTurn rejection as a finish error', async () => {
    const fake = createFakeClient();
    const { agent } = createFakeAgent({ runTurnError: new Error('busy') });
    const { params } = baseParams(fake.client, [agent]);

    const result = await runHeteroTurn(params);

    expect(result).toMatchObject({ result: 'error', error: { message: 'busy' } });
    expect(fake.finishes[0]).toMatchObject({ result: 'error', error: { message: 'busy' } });
  });

  it('finishes as error with a stream_error when the event iterator throws', async () => {
    const fake = createFakeClient();
    const { agent, interrupt } = createFakeAgent({
      events: [event('stream_start', {})],
      iteratorError: new Error('pipe broke'),
    });
    const { params } = baseParams(fake.client, [agent]);

    const result = await runHeteroTurn(params);

    expect(result.result).toBe('error');
    expect(result.error).toMatchObject({ type: 'stream_error' });
    expect(result.error?.message).toContain('pipe broke');
    expect(interrupt).toHaveBeenCalled();
    expect(nonTextTypes(fake.ingested)).toEqual(['stream_start']);
    expect(fake.finishes[0]).toMatchObject({ result: 'error', error: { type: 'stream_error' } });
  });

  it('interrupts the in-flight agent on abort and finishes cancelled', async () => {
    const fake = createFakeClient();
    const { agent, interrupt } = createFakeAgent({
      events: [event('stream_start', {})],
      exit: { code: null, signal: 'SIGINT' },
      pendingUntilInterrupt: true,
      sessionId: 'sess-1',
    });
    const controller = new AbortController();
    const { params } = baseParams(fake.client, [agent], {
      onAgentStarted: () => setTimeout(() => controller.abort(), 5),
      signal: controller.signal,
    });

    const result = await runHeteroTurn(params);

    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ error: undefined, result: 'cancelled', sessionId: 'sess-1' });
    expect(fake.finishes[0]).toMatchObject({ result: 'cancelled' });
  });

  it('does not start the agent when aborted before the turn', async () => {
    const fake = createFakeClient();
    const controller = new AbortController();
    controller.abort();
    const { acquire, params } = baseParams(fake.client, [], { signal: controller.signal });

    const result = await runHeteroTurn(params);

    expect(acquire).not.toHaveBeenCalled();
    expect(result.result).toBe('cancelled');
    expect(fake.finishes[0]).toMatchObject({ result: 'cancelled' });
  });

  it('long-polls answers for a pending bridge question and resolves it', async () => {
    const fake = createFakeClient();
    const bridge = new AskUserBridge('op-1', { identifier: 'kimi-code', provider: 'kimi-code' });
    let answer: unknown;
    const { agent, interrupt } = createFakeAgent({ pendingUntilInterrupt: true });
    // The "agent" asks a question mid-turn and ends its turn once answered.
    const originalRunTurn = agent.runTurn;
    agent.runTurn = async (turn) => {
      const handle = await originalRunTurn(turn);
      void turn.askUserBridge!.pending({ arguments: { q: 'pick' }, toolCallId: 'tc-1' }).then(
        async (a) => {
          answer = a;
          await interrupt();
        },
      );
      return handle;
    };
    fake.pollResponses.push({
      events: [{ data: { result: { choice: 'A' }, toolCallId: 'tc-1' } }],
      lastEventId: '1-0',
    });
    const { params } = baseParams(fake.client, [agent], { bridge });

    const result = await runHeteroTurn(params);

    expect(answer).toEqual({ result: { choice: 'A' } });
    expect(fake.pollCalls[0]).toEqual({ lastEventId: '0-0', operationId: 'op-1' });
    expect(fake.ingested.map((e) => e.type)).toEqual(
      expect.arrayContaining(['agent_intervention_request', 'agent_intervention_response']),
    );
    expect(result.result).toBe('success');
    // The bridge is torn down at turn end.
    await expect(bridge.pending({ arguments: {} })).rejects.toThrow(/closed/);
  });

  it('reports finishDeliveryFailed when heteroFinish cannot be delivered', async () => {
    const fake = createFakeClient({
      finishError: Object.assign(new Error('denied'), { data: { code: 'UNAUTHORIZED' } }),
    });
    const { agent } = createFakeAgent({ sessionId: 'sess-1' });
    const { params } = baseParams(fake.client, [agent]);

    const result = await runHeteroTurn(params);

    expect(result).toMatchObject({ finishDeliveryFailed: true, result: 'success' });
  });
});
