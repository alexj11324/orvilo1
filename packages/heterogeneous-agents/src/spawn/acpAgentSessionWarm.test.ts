import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import type { AgentStreamEvent } from '@orvilo/agent-gateway-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CacheKeepaliveClock } from './cacheKeepalive';
import { CACHE_KEEPALIVE_PROMPT_TEXT } from './cacheKeepalive';
import { createStandardAcpSession } from './standardAcpAgents';
import type { StandardAcpSessionOptions } from './standardAcpSession';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, spawn: spawnMock };
});

interface RpcMessage {
  id?: number;
  method?: string;
  params?: Record<string, any>;
}

/** Standard ACP fake whose keep-alive pings stay pending until `releasePing()`. */
const createAcpProcess = () => {
  const child = new EventEmitter() as ChildProcess;
  const stdout = new PassThrough();
  const requests: RpcMessage[] = [];
  let heldPing: RpcMessage | undefined;
  const send = (message: Record<string, unknown>) =>
    stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

  Object.assign(child, {
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
      return true;
    }),
    killed: false,
    pid: 777,
    stderr: new PassThrough(),
    stdin: {
      once: vi.fn(),
      write: vi.fn((chunk: string) => {
        const message = JSON.parse(chunk.trim()) as RpcMessage;
        if (!message.method) return true;
        requests.push(message);
        queueMicrotask(() => {
          switch (message.method) {
            case 'initialize': {
              send({ id: message.id, result: { protocolVersion: 1 } });
              return;
            }
            case 'session/new': {
              send({ id: message.id, result: { sessionId: 'warm-1' } });
              return;
            }
            case 'session/prompt': {
              const text = message.params?.prompt?.[0]?.text;
              if (text === CACHE_KEEPALIVE_PROMPT_TEXT) {
                heldPing = message;
                return;
              }
              send({
                method: 'session/update',
                params: {
                  sessionId: 'warm-1',
                  update: {
                    content: { text: `echo:${text}`, type: 'text' },
                    sessionUpdate: 'agent_message_chunk',
                  },
                },
              });
              send({ id: message.id, result: { stopReason: 'end_turn' } });
            }
          }
        });
        return true;
      }),
    },
    stdout,
  });

  return {
    child,
    prompts: () =>
      requests
        .filter(({ method }) => method === 'session/prompt')
        .map(({ params }) => params?.prompt?.[0]?.text),
    releasePing: () => {
      const ping = heldPing;
      heldPing = undefined;
      if (ping) send({ id: ping.id, result: { stopReason: 'end_turn' } });
    },
    requests,
  };
};

const createManualClock = () => {
  let pending: (() => void) | undefined;
  const clock: CacheKeepaliveClock = {
    clearTimeout: () => {
      pending = undefined;
    },
    now: () => 0,
    setTimeout: (callback) => {
      pending = callback;
      return callback;
    },
  };
  return {
    clock,
    fire: () => {
      const callback = pending;
      pending = undefined;
      callback?.();
    },
  };
};

const baseOptions = (overrides: Partial<StandardAcpSessionOptions> = {}) => {
  const events: AgentStreamEvent[] = [];
  const options: StandardAcpSessionOptions = {
    args: [],
    clientVersion: 'test',
    commandPath: 'claude-agent-acp',
    cwd: '/workspace',
    detached: false,
    env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv,
    onEvents: (batch) => {
      events.push(...batch);
    },
    onRawMessage: vi.fn(),
    onRuntimeStatus: vi.fn(),
    onSessionId: vi.fn(),
    onStderr: vi.fn(),
    operationId: 'op-1',
    prompt: 'one',
    sessionId: 'op-1',
    ...overrides,
  };
  return { events, options };
};

const textOf = (events: AgentStreamEvent[]) =>
  events.flatMap(({ data }) => (typeof data?.content === 'string' ? [data.content] : [])).join('');

afterEach(() => {
  spawnMock.mockReset();
});

describe('AcpAgentSession.runWarm', () => {
  it('throws when there is no live child to reuse', async () => {
    const fake = createAcpProcess();
    spawnMock.mockReturnValue(fake.child);
    const { options } = baseOptions({ cacheKeepalive: { enabled: false } });
    const session = createStandardAcpSession('claude-code', options);

    await session.run();
    expect(session.reusable).toBe(false);
    await expect(session.runWarm({ operationId: 'op-2', prompt: 'two' })).rejects.toThrow(
      /not reusable/,
    );
  });

  it('reuses a warm-held child and rebinds the per-turn options', async () => {
    const fake = createAcpProcess();
    spawnMock.mockReturnValue(fake.child);
    const { options, events } = baseOptions({
      cacheKeepalive: { enabled: false },
      warmIdleMs: 60_000,
    });
    const session = createStandardAcpSession('claude-code', options);

    await session.run();
    expect(session.reusable).toBe(true);

    const secondEvents: AgentStreamEvent[] = [];
    await session.runWarm({
      onEvents: (batch) => {
        secondEvents.push(...batch);
      },
      operationId: 'op-2',
      prompt: 'two',
    });

    expect(fake.requests.map(({ method }) => method)).toEqual([
      'initialize',
      'session/new',
      'session/prompt',
      'session/prompt',
    ]);
    expect(textOf(events)).toBe('echo:one');
    expect(textOf(secondEvents)).toBe('echo:two');
    for (const event of secondEvents) expect(event.operationId).toBe('op-2');
    // The second turn re-announces the session to its fresh pipeline.
    expect(session.nativeSessionId).toBe('warm-1');
    expect(session.reusable).toBe(true);
    session.close();
    expect(session.reusable).toBe(false);
  });

  it('waits for an in-flight keep-alive ping before prompting', async () => {
    const fake = createAcpProcess();
    spawnMock.mockReturnValue(fake.child);
    const manual = createManualClock();
    const { options } = baseOptions({
      cacheKeepalive: {
        clock: manual.clock,
        maxPings: 5,
        maxWindowMs: 60_000,
        pingIntervalMs: 1_000,
      },
    });
    const session = createStandardAcpSession('claude-code', options);

    await session.run();
    expect(session.keepaliveArmed).toBe(true);
    manual.fire();
    await vi.waitFor(() => expect(fake.prompts()).toEqual(['one', CACHE_KEEPALIVE_PROMPT_TEXT]));

    const secondEvents: AgentStreamEvent[] = [];
    const warm = session.runWarm({
      onEvents: (batch) => {
        secondEvents.push(...batch);
      },
      operationId: 'op-2',
      prompt: 'two',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Still only the ping: one ACP session never takes two concurrent prompts.
    expect(fake.prompts()).toEqual(['one', CACHE_KEEPALIVE_PROMPT_TEXT]);

    fake.releasePing();
    await warm;
    expect(fake.prompts()).toEqual(['one', CACHE_KEEPALIVE_PROMPT_TEXT, 'two']);
    expect(textOf(secondEvents)).toBe('echo:two');
    // The keeper was retired by the adopting turn and did not close the child.
    expect(fake.child.kill).not.toHaveBeenCalled();
    session.close();
  });
});
