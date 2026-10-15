import type * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import type { AgentStreamEvent } from '@orvilo/agent-gateway-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as resolveCliCommand from './resolveCliCommand';

const spawnCalls: Array<{ args: string[]; command: string; options: any }> = [];
let nextFakeProc: any = null;

const detectValidatedCommandCandidatesMock = vi.mocked(
  resolveCliCommand.detectValidatedCommandCandidates,
);

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof childProcess>('node:child_process');
  return {
    ...actual,
    execFile: vi.fn(),
    spawn: vi.fn((command: string, args: string[], options: any) => {
      spawnCalls.push({ args, command, options });
      return nextFakeProc;
    }),
  };
});

vi.mock('./resolveCliCommand', async () => {
  const actual = await vi.importActual<typeof resolveCliCommand>('./resolveCliCommand');
  return {
    ...actual,
    detectHeterogeneousCliCommand: vi.fn(),
    detectValidatedCommandCandidates: vi.fn(),
  };
});

interface RpcMessage {
  id?: number;
  method?: string;
  params?: Record<string, any>;
}

/**
 * Multi-turn standard-ACP fake. Every `session/prompt` streams one text chunk
 * echoing the prompt and completes with `end_turn`, unless `holdPrompts` is
 * set — then the prompt stays pending until `session/cancel` (answered with
 * `cancelled`) or `release()`.
 */
const createMultiTurnAcpProc = ({
  resumeCapability = false,
  sessionId = 'acp-session-1',
}: { resumeCapability?: boolean; sessionId?: string } = {}) => {
  const proc = new EventEmitter() as any;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const requests: RpcMessage[] = [];
  const state = { holdPrompts: false, titleForPrompt: undefined as string | undefined };
  let heldPrompt: RpcMessage | undefined;
  const send = (message: Record<string, unknown>) =>
    stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  const update = (value: Record<string, unknown>) =>
    send({ method: 'session/update', params: { sessionId, update: value } });

  const completePrompt = (message: RpcMessage, stopReason = 'end_turn') => {
    const text = message.params?.prompt?.[0]?.text;
    update({ content: { text: `echo:${text}`, type: 'text' }, sessionUpdate: 'agent_message_chunk' });
    if (state.titleForPrompt) {
      update({ sessionUpdate: 'session_info_update', title: state.titleForPrompt });
    }
    stderr.write(`stderr:${text}\n`);
    send({ id: message.id, result: { stopReason } });
  };

  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.pid = 4242;
  proc.killed = false;
  proc.exitCode = null;
  proc.signalCode = null;
  const exit = (code: number | null, signal: NodeJS.Signals | null) => {
    if (proc.exitCode !== null || proc.signalCode !== null) return;
    proc.exitCode = code;
    proc.signalCode = signal;
    queueMicrotask(() => proc.emit('close', code, signal));
  };
  proc.kill = vi.fn((signal: NodeJS.Signals = 'SIGTERM') => {
    proc.killed = true;
    exit(null, signal);
    return true;
  });
  proc.stdin = {
    once: vi.fn(),
    write: vi.fn((chunk: string) => {
      const message = JSON.parse(chunk.trim()) as RpcMessage;
      if (!message.method) return true;
      requests.push(message);
      queueMicrotask(() => {
        switch (message.method) {
          case 'initialize': {
            send({
              id: message.id,
              result: {
                agentCapabilities: {
                  loadSession: true,
                  promptCapabilities: { image: true },
                  ...(resumeCapability ? { sessionCapabilities: { resume: {} } } : {}),
                },
                protocolVersion: 1,
              },
            });
            return;
          }
          case 'session/new': {
            send({ id: message.id, result: { sessionId } });
            return;
          }
          case 'session/resume':
          case 'session/load': {
            send({ id: message.id, result: { sessionId: message.params?.sessionId } });
            return;
          }
          case 'session/set_config_option': {
            send({ id: message.id, result: {} });
            return;
          }
          case 'session/cancel': {
            if (heldPrompt) {
              const held = heldPrompt;
              heldPrompt = undefined;
              send({ id: held.id, result: { stopReason: 'cancelled' } });
            }
            return;
          }
          case 'session/prompt': {
            if (state.holdPrompts) {
              heldPrompt = message;
              return;
            }
            completePrompt(message);
          }
        }
      });
      return true;
    }),
  };

  return {
    /** Simulate the agent dying on its own. */
    crash: () => exit(1, null),
    methods: () => requests.map(({ method }) => method),
    proc,
    release: () => {
      const held = heldPrompt;
      heldPrompt = undefined;
      if (held) completePrompt(held);
    },
    requests,
    sendTitle: (title: string) => update({ sessionUpdate: 'session_info_update', title }),
    state,
  };
};

const drain = async (events: AsyncIterable<AgentStreamEvent>): Promise<AgentStreamEvent[]> => {
  const collected: AgentStreamEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};

const readStream = (stream: NodeJS.ReadableStream): Promise<string> =>
  new Promise((resolve) => {
    let text = '';
    stream.on('data', (chunk) => (text += String(chunk)));
    stream.on('end', () => resolve(text));
  });

/** Warm-hold tests disable the per-engine cache keep-alive so `warmIdleMs` owns the hold. */
const NO_KEEPALIVE_ENV = { ORVILO_CACHE_KEEPALIVE: '0' };

const createAgent = async (overrides: Record<string, unknown> = {}) => {
  const { createPersistentAcpAgent } = await import('./persistentAcpAgent');
  return createPersistentAcpAgent({
    agentType: 'claude-code',
    cwd: process.cwd(),
    detached: false,
    env: NO_KEEPALIVE_ENV,
    ...overrides,
  });
};

describe('createPersistentAcpAgent', () => {
  beforeEach(() => {
    spawnCalls.length = 0;
    nextFakeProc = null;
    detectValidatedCommandCandidatesMock.mockImplementation(async (commands) => ({
      available: true,
      path: commands[0],
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    nextFakeProc = null;
  });

  it('rejects non-standard ACP agent types', async () => {
    await expect(createAgent({ agentType: 'cursor' })).rejects.toThrow(/unsupported agent type/);
    expect(spawnCalls).toHaveLength(0);
  });

  it('runs later turns on the same process with only session/prompt', async () => {
    const fake = createMultiTurnAcpProc({ sessionId: 'warm-session' });
    nextFakeProc = fake.proc;
    const agent = await createAgent();
    expect(agent.reusable).toBe(false);
    expect(agent.busy).toBe(false);

    const first = await agent.runTurn({ operationId: 'op-1', prompt: 'one' });
    expect(agent.busy).toBe(true);
    const firstEvents = await drain(first.events);
    await expect(first.exit).resolves.toEqual({ code: 0, signal: null });
    expect(first.sessionId).toBe('warm-session');
    expect(agent.sessionId).toBe('warm-session');
    expect(agent.busy).toBe(false);
    expect(agent.reusable).toBe(true);
    expect(agent.pid).toBe(4242);
    expect(fake.proc.kill).not.toHaveBeenCalled();

    const second = await agent.runTurn({ operationId: 'op-2', prompt: 'two' });
    const secondEvents = await drain(second.events);
    await expect(second.exit).resolves.toEqual({ code: 0, signal: null });

    expect(spawnCalls).toHaveLength(1);
    expect(fake.methods()).toEqual([
      'initialize',
      'session/new',
      'session/prompt',
      'session/prompt',
    ]);
    expect(fake.requests.at(-1)?.params).toMatchObject({
      prompt: [{ text: 'two', type: 'text' }],
      sessionId: 'warm-session',
    });

    for (const event of firstEvents) expect(event.operationId).toBe('op-1');
    for (const event of secondEvents) expect(event.operationId).toBe('op-2');
    const texts = (events: AgentStreamEvent[]) =>
      events.flatMap(({ data }) => (typeof data?.content === 'string' ? [data.content] : []));
    expect(texts(firstEvents).join('')).toContain('echo:one');
    expect(texts(firstEvents).join('')).not.toContain('echo:two');
    expect(texts(secondEvents).join('')).toContain('echo:two');
    expect(texts(secondEvents).join('')).not.toContain('echo:one');
    // Each turn is a complete run for its consumer.
    expect(firstEvents).toContainEqual(expect.objectContaining({ type: 'agent_runtime_end' }));
    expect(secondEvents).toContainEqual(expect.objectContaining({ type: 'agent_runtime_end' }));
    expect(agent.reusable).toBe(true);
    agent.close();
  });

  it('gives every turn its own stderr stream, ended at turn end', async () => {
    const fake = createMultiTurnAcpProc();
    nextFakeProc = fake.proc;
    const agent = await createAgent();

    const first = await agent.runTurn({ operationId: 'op-1', prompt: 'one' });
    const firstStderr = readStream(first.stderr);
    await drain(first.events);
    await first.exit;
    await expect(firstStderr).resolves.toContain('stderr:one');

    const second = await agent.runTurn({ operationId: 'op-2', prompt: 'two' });
    const secondStderr = readStream(second.stderr);
    await drain(second.events);
    await second.exit;
    const secondText = await secondStderr;
    expect(secondText).toContain('stderr:two');
    expect(secondText).not.toContain('stderr:one');
    agent.close();
  });

  it('delivers a title reported between turns to the next turn only', async () => {
    const fake = createMultiTurnAcpProc();
    nextFakeProc = fake.proc;
    const agent = await createAgent();

    fake.state.titleForPrompt = 'First title';
    const first = await agent.runTurn({ operationId: 'op-1', prompt: 'one' });
    const firstEvents = await drain(first.events);
    await first.exit;
    expect(firstEvents.filter(({ type }) => type === 'session_title')).toEqual([
      expect.objectContaining({ data: { title: 'First title' }, operationId: 'op-1' }),
    ]);

    fake.state.titleForPrompt = undefined;
    fake.sendTitle('Between turns');
    await vi.waitFor(() => expect(fake.proc.stdout.readableLength).toBe(0));
    await new Promise((resolve) => setImmediate(resolve));

    const second = await agent.runTurn({ operationId: 'op-2', prompt: 'two' });
    const secondEvents = await drain(second.events);
    await second.exit;
    expect(secondEvents.filter(({ type }) => type === 'session_title')).toEqual([
      expect.objectContaining({ data: { title: 'Between turns' }, operationId: 'op-2' }),
    ]);
    agent.close();
  });

  it('resumes the first turn through session/resume when advertised', async () => {
    const fake = createMultiTurnAcpProc({ resumeCapability: true });
    nextFakeProc = fake.proc;
    const agent = await createAgent({ resumeSessionId: 'prev-session' });

    const first = await agent.runTurn({ operationId: 'op-1', prompt: 'one' });
    await drain(first.events);
    await first.exit;
    const second = await agent.runTurn({ operationId: 'op-2', prompt: 'two' });
    await drain(second.events);
    await second.exit;

    expect(fake.methods()).toEqual([
      'initialize',
      'session/resume',
      'session/prompt',
      'session/prompt',
    ]);
    expect(fake.requests[1]?.params).toMatchObject({ sessionId: 'prev-session' });
    expect(agent.sessionId).toBe('prev-session');
    agent.close();
  });

  it('rejects runTurn while a turn is in flight', async () => {
    const fake = createMultiTurnAcpProc();
    fake.state.holdPrompts = true;
    nextFakeProc = fake.proc;
    const agent = await createAgent();

    const first = await agent.runTurn({ operationId: 'op-1', prompt: 'one' });
    await vi.waitFor(() => expect(fake.methods()).toContain('session/prompt'));
    await expect(agent.runTurn({ operationId: 'op-2', prompt: 'two' })).rejects.toThrow(/busy/);
    expect(agent.reusable).toBe(false);

    fake.release();
    const events = await drain(first.events);
    await expect(first.exit).resolves.toEqual({ code: 0, signal: null });
    for (const event of events) expect(event.operationId).toBe('op-1');
    expect(agent.reusable).toBe(true);
    agent.close();
  });

  it('is not reusable after an interrupt and confirms the process exited', async () => {
    const fake = createMultiTurnAcpProc();
    fake.state.holdPrompts = true;
    nextFakeProc = fake.proc;
    const agent = await createAgent();

    const turn = await agent.runTurn({ operationId: 'op-1', prompt: 'one' });
    const events = drain(turn.events);
    await vi.waitFor(() => expect(fake.methods()).toContain('session/prompt'));

    await expect(agent.interrupt()).resolves.toBe(true);
    await expect(turn.exit).resolves.toEqual({ code: null, signal: 'SIGINT' });
    await events;
    expect(fake.methods()).toContain('session/cancel');
    expect(agent.reusable).toBe(false);
    expect(agent.busy).toBe(false);
    await expect(agent.runTurn({ operationId: 'op-2', prompt: 'two' })).rejects.toThrow();
    expect(spawnCalls).toHaveLength(1);
  });

  it('maps handle.kill(SIGINT) to a cancel and other signals to a close', async () => {
    const fake = createMultiTurnAcpProc();
    fake.state.holdPrompts = true;
    nextFakeProc = fake.proc;
    const agent = await createAgent();

    const turn = await agent.runTurn({ operationId: 'op-1', prompt: 'one' });
    const events = drain(turn.events);
    await vi.waitFor(() => expect(fake.methods()).toContain('session/prompt'));
    turn.kill('SIGKILL');
    await expect(turn.exit).resolves.toEqual({ code: null, signal: 'SIGKILL' });
    await events;
    expect(fake.proc.kill).toHaveBeenCalledWith('SIGKILL');
    expect(fake.methods()).not.toContain('session/cancel');
    expect(agent.reusable).toBe(false);
  });

  it('interrupting an idle agent kills the held process', async () => {
    const fake = createMultiTurnAcpProc();
    nextFakeProc = fake.proc;
    const agent = await createAgent();

    const turn = await agent.runTurn({ operationId: 'op-1', prompt: 'one' });
    await drain(turn.events);
    await turn.exit;
    expect(agent.reusable).toBe(true);

    await expect(agent.interrupt()).resolves.toBe(true);
    expect(fake.proc.kill).toHaveBeenCalled();
    expect(agent.reusable).toBe(false);
  });

  it('is not reusable once the process dies while idle', async () => {
    const fake = createMultiTurnAcpProc();
    nextFakeProc = fake.proc;
    const statuses: string[] = [];
    const agent = await createAgent({ onRuntimeStatus: ({ state }: any) => statuses.push(state) });

    const turn = await agent.runTurn({ operationId: 'op-1', prompt: 'one' });
    await drain(turn.events);
    await turn.exit;
    expect(agent.reusable).toBe(true);

    fake.crash();
    await vi.waitFor(() => expect(agent.reusable).toBe(false));
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('closed'));
    await expect(agent.runTurn({ operationId: 'op-2', prompt: 'two' })).rejects.toThrow(
      /no longer reusable/,
    );
  });

  it('closes the held process when the idle timer fires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fake = createMultiTurnAcpProc();
    nextFakeProc = fake.proc;
    const agent = await createAgent({ warmIdleMs: 30_000 });

    const turn = await agent.runTurn({ operationId: 'op-1', prompt: 'one' });
    await drain(turn.events);
    await turn.exit;
    expect(agent.reusable).toBe(true);

    vi.advanceTimersByTime(29_999);
    expect(agent.reusable).toBe(true);
    expect(fake.proc.kill).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fake.proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(agent.reusable).toBe(false);
  });

  it('closes idempotently and spawns detached by default', async () => {
    const fake = createMultiTurnAcpProc();
    nextFakeProc = fake.proc;
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => {
      fake.proc.emit('close', null, 'SIGTERM');
      return true;
    });
    try {
      const agent = await createAgent({ detached: undefined });
      const turn = await agent.runTurn({ operationId: 'op-1', prompt: 'one' });
      await drain(turn.events);
      await turn.exit;
      expect(spawnCalls[0]?.options.detached).toBe(true);

      agent.close();
      agent.close();
      expect(processKill).toHaveBeenCalledTimes(1);
      expect(agent.reusable).toBe(false);
      await expect(agent.runTurn({ operationId: 'op-2', prompt: 'two' })).rejects.toThrow(
        /closed/,
      );
    } finally {
      processKill.mockRestore();
    }
  });

  it('adopts a live cache keep-alive hold for the next turn', async () => {
    const fake = createMultiTurnAcpProc();
    nextFakeProc = fake.proc;
    const statuses: any[] = [];
    // claude-code keeps its per-engine keep-alive default here.
    const agent = await createAgent({
      env: { ORVILO_CACHE_KEEPALIVE: '1' },
      onRuntimeStatus: (status: any) => statuses.push(status),
    });

    const first = await agent.runTurn({ operationId: 'op-1', prompt: 'one' });
    await drain(first.events);
    await first.exit;
    expect(agent.reusable).toBe(true);
    // The keeper (not the warm idle timer) holds the child: idle carries its window deadline.
    expect(statuses.findLast(({ state }) => state === 'idle')?.idleDeadlineAt).toEqual(
      expect.any(Number),
    );

    const second = await agent.runTurn({ operationId: 'op-2', prompt: 'two' });
    const events = await drain(second.events);
    await expect(second.exit).resolves.toEqual({ code: 0, signal: null });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) expect(event.operationId).toBe('op-2');
    expect(fake.methods().filter((method) => method === 'initialize')).toHaveLength(1);
    expect(agent.reusable).toBe(true);
    agent.close();
    expect(agent.reusable).toBe(false);
  });
});
