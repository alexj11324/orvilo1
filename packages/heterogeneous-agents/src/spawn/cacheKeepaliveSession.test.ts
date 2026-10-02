import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import type { AgentStreamEvent } from '@orvilo/agent-gateway-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CacheKeepaliveClock } from './cacheKeepalive';
import { CACHE_KEEPALIVE_PROMPT_TEXT } from './cacheKeepalive';
import type { HeterogeneousAgentRuntimeStatus } from './runtimeStatus';
import { createStandardAcpSession } from './standardAcpAgents';
import type { StandardAcpSessionOptions } from './standardAcpSession';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, spawn: spawnMock };
});

interface RpcMessage {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
}

/**
 * ACP stdio fake: answers the standard lifecycle and records every request.
 * On an inert keep-alive `session/prompt` (detected by the ping text) the
 * fake holds the prompt result until the client answers a probe
 * `session/request_permission` — letting tests observe mid-ping behavior.
 */
const createAcpProcess = () => {
  const child = new EventEmitter() as ChildProcess;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const requests: RpcMessage[] = [];
  const written: RpcMessage[] = [];
  let heldPromptId: number | string | undefined;
  const send = (message: Record<string, unknown>) =>
    stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

  Object.assign(child, {
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
      return true;
    }),
    killed: false,
    pid: 123_456,
    stderr,
    stdin: {
      once: vi.fn(),
      write: vi.fn((chunk: string) => {
        const message = JSON.parse(chunk.trim()) as RpcMessage;
        written.push(message);
        if (!message.method) {
          // A client answer to the inert-turn permission probe releases the
          // held keep-alive prompt result.
          if (message.id === 'perm-inert' && heldPromptId !== undefined) {
            const id = heldPromptId;
            heldPromptId = undefined;
            send({
              id,
              result: {
                stopReason: 'end_turn',
                usage: { cache_read_input_tokens: 80, input_tokens: 100 },
              },
            });
          }
          return true;
        }
        requests.push(message);
        queueMicrotask(() => {
          switch (message.method) {
            case 'initialize': {
              send({
                id: message.id,
                result: { agentCapabilities: { loadSession: true }, protocolVersion: 1 },
              });
              return;
            }
            case 'session/new': {
              send({ id: message.id, result: { configOptions: [], sessionId: 'cc-session-1' } });
              return;
            }
            case 'session/set_config_option': {
              send({ id: message.id, result: { configOptions: [] } });
              return;
            }
            case 'session/prompt': {
              send({
                method: 'session/update',
                params: {
                  sessionId: 'cc-session-1',
                  update: {
                    content: { text: 'Working', type: 'text' },
                    sessionUpdate: 'agent_message_chunk',
                  },
                },
              });
              const isKeepalivePing =
                Array.isArray(message.params?.prompt) &&
                (message.params.prompt as { text?: string }[])[0]?.text ===
                  CACHE_KEEPALIVE_PROMPT_TEXT;
              if (isKeepalivePing) {
                heldPromptId = message.id;
                send({
                  id: 'perm-inert',
                  method: 'session/request_permission',
                  params: {
                    options: [{ kind: 'allow_always', name: 'Allow', optionId: 'allow' }],
                    sessionId: 'cc-session-1',
                    toolCall: { title: 'Do something', toolCallId: 'tool-1' },
                  },
                });
                return;
              }
              send({
                id: message.id,
                result: {
                  stopReason: 'end_turn',
                  usage: { cache_read_input_tokens: 80, input_tokens: 100 },
                },
              });
              return;
            }
          }
        });
        return true;
      }),
    },
    stdout,
  });

  const promptRequests = () => requests.filter(({ method }) => method === 'session/prompt');
  return { child, promptRequests, requests, send, written };
};

/** Manual scheduler clock — timers recorded and fired by the test. */
const createFakeClock = () => {
  let now = 0;
  let pending: { callback: () => void } | undefined;
  const clock: CacheKeepaliveClock = {
    clearTimeout: () => {
      pending = undefined;
    },
    now: () => now,
    setTimeout: (callback) => {
      pending = { callback };
      return pending;
    },
  };
  return {
    advance: (ms: number) => {
      now += ms;
    },
    clock,
    fire: () => {
      const timer = pending;
      pending = undefined;
      timer?.callback();
    },
    hasPending: () => pending !== undefined,
  };
};

const createSessionOptions = (
  overrides: Partial<StandardAcpSessionOptions> = {},
): {
  events: AgentStreamEvent[];
  options: StandardAcpSessionOptions;
  statuses: HeterogeneousAgentRuntimeStatus[];
} => {
  const events: AgentStreamEvent[] = [];
  const statuses: HeterogeneousAgentRuntimeStatus[] = [];
  return {
    events,
    options: {
      args: [],
      clientVersion: '1.2.3',
      commandPath: 'claude-agent-acp',
      cwd: '/workspace',
      env: testEnv(),
      onEvents: (batch) => {
        events.push(...batch);
      },
      onRawMessage: vi.fn(),
      onRuntimeStatus: (status) => {
        statuses.push(status);
      },
      onSessionId: vi.fn(),
      onStderr: vi.fn(),
      operationId: 'operation-1',
      prompt: [{ text: 'hello', type: 'text' }],
      sessionId: 'session-1',
      ...overrides,
    },
    statuses,
  };
};

/** Repo augmentation marks these env keys required — provide them all. */
const testEnv = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  NEXT_PUBLIC_DEVELOPER_DEBUG: '',
  NEXT_PUBLIC_I18N_DEBUG: '',
  NEXT_PUBLIC_I18N_DEBUG_BROWSER: '',
  NEXT_PUBLIC_I18N_DEBUG_SERVER: '',
  ...overrides,
});

/** The client's detached-group kill goes through `process.kill(-pid)`. */
const spyProcessKill = (child: ChildProcess) =>
  vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    if (pid === -child.pid!) {
      queueMicrotask(() => child.emit('close', null, signal));
    }
    return true;
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  spawnMock.mockReset();
});

describe('AcpAgentSession cache keep-alive', () => {
  it('holds the child past turn end and pings the same ACP session on cadence', async () => {
    const fake = createAcpProcess();
    spawnMock.mockReturnValue(fake.child);
    const killSpy = spyProcessKill(fake.child);
    const clock = createFakeClock();
    const { options, statuses } = createSessionOptions({
      cacheKeepalive: {
        clock: clock.clock,
        maxPings: 2,
        maxWindowMs: 60_000,
        pingIntervalMs: 1_000,
      },
    });
    const session = createStandardAcpSession('claude-code', options);

    await session.run();

    // Turn settled: 'idle' reported with the keep-alive window deadline, the
    // child is still alive, and the first ping is scheduled.
    const idleStatus = statuses.findLast(({ state }) => state === 'idle');
    expect(idleStatus?.idleDeadlineAt).toBe(60_000);
    expect(session.keepaliveArmed).toBe(true);
    expect(killSpy).not.toHaveBeenCalled();
    expect(fake.child.kill).not.toHaveBeenCalled();
    expect(clock.hasPending()).toBe(true);

    clock.fire();
    await vi.waitFor(() =>
      expect(fake.written).toContainEqual(
        expect.objectContaining({
          id: 'perm-inert',
          result: { outcome: { outcome: 'cancelled' } },
        }),
      ),
    );
    await vi.waitFor(() => expect(fake.promptRequests()).toHaveLength(2));

    // The ping reuses the same session id and carries the inert text block.
    expect(fake.promptRequests()[1]?.params?.sessionId).toBe('cc-session-1');
    expect(fake.promptRequests()[1]?.params?.prompt).toEqual([
      { text: CACHE_KEEPALIVE_PROMPT_TEXT, type: 'text' },
    ]);

    // Break-even reached on the second ping → disarm, child killed, telemetry.
    clock.fire();
    await vi.waitFor(() =>
      expect(statuses).toContainEqual(
        expect.objectContaining({
          cacheKeepalive: expect.objectContaining({
            disarmReason: 'breakeven',
            pings: 2,
          }),
          state: 'closed',
        }),
      ),
    );
    expect(killSpy).toHaveBeenCalled();
    expect(session.keepaliveArmed).toBe(false);
  });

  it('suppresses updates and cancels permission asks during inert turns', async () => {
    const fake = createAcpProcess();
    spawnMock.mockReturnValue(fake.child);
    const killSpy = spyProcessKill(fake.child);
    const clock = createFakeClock();
    const { events, options } = createSessionOptions({
      cacheKeepalive: { clock: clock.clock, maxPings: 1, maxWindowMs: 60_000 },
    });
    const session = createStandardAcpSession('claude-code', options);
    await session.run();
    const baselineEvents = events.length;
    expect(baselineEvents).toBeGreaterThan(0);

    // While armed-but-not-inert, stray notifications stay suppressed too.
    fake.send({
      method: 'session/update',
      params: {
        sessionId: 'cc-session-1',
        update: { content: { text: 'late', type: 'text' }, sessionUpdate: 'agent_message_chunk' },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toHaveLength(baselineEvents);

    // The inert turn's session/update is suppressed AND its permission ask
    // (sent mid-ping by the fake) is cancelled — never auto-allowed, never
    // routed to the user bridge.
    clock.fire();
    await vi.waitFor(() =>
      expect(fake.written).toContainEqual(
        expect.objectContaining({
          id: 'perm-inert',
          result: { outcome: { outcome: 'cancelled' } },
        }),
      ),
    );
    await vi.waitFor(() =>
      expect(events.every(({ type }) => type !== undefined) && events.length === baselineEvents),
    );
    expect(events).toHaveLength(baselineEvents);
    // maxPings=1 → the completed ping disarms at break-even and kills the child.
    await vi.waitFor(() => expect(killSpy).toHaveBeenCalled());
  });

  it('interrupt() retires an armed keeper without a session/cancel', async () => {
    const fake = createAcpProcess();
    spawnMock.mockReturnValue(fake.child);
    const killSpy = spyProcessKill(fake.child);
    const clock = createFakeClock();
    const { options, statuses } = createSessionOptions({
      cacheKeepalive: { clock: clock.clock, maxPings: 5, maxWindowMs: 60_000 },
    });
    const session = createStandardAcpSession('claude-code', options);
    await session.run();
    expect(session.keepaliveArmed).toBe(true);

    await expect(session.interrupt()).resolves.toBe(true);

    expect(fake.requests.some(({ method }) => method === 'session/cancel')).toBe(false);
    expect(killSpy).toHaveBeenCalled();
    expect(statuses).toContainEqual(
      expect.objectContaining({
        cacheKeepalive: expect.objectContaining({ disarmReason: 'closed', pings: 0 }),
        state: 'closed',
      }),
    );
  });

  it('the global kill switch restores exit-at-turn-end', async () => {
    const fake = createAcpProcess();
    spawnMock.mockReturnValue(fake.child);
    const killSpy = spyProcessKill(fake.child);
    const { options, statuses } = createSessionOptions({
      env: testEnv({ ORVILO_CACHE_KEEPALIVE: '0' }),
    });
    const session = createStandardAcpSession('claude-code', options);

    await session.run();

    expect(session.keepaliveArmed).toBe(false);
    expect(killSpy).toHaveBeenCalled();
    expect(statuses).toContainEqual(expect.objectContaining({ state: 'closed' }));
    expect(statuses.findLast(({ state }) => state === 'idle')?.idleDeadlineAt).toBeUndefined();
  });

  it('incapable engines never arm a keeper', async () => {
    const fake = createAcpProcess();
    spawnMock.mockReturnValue(fake.child);
    const killSpy = spyProcessKill(fake.child);
    const clock = createFakeClock();
    const { options } = createSessionOptions({
      cacheKeepalive: { clock: clock.clock, maxPings: 2 },
    });
    const session = createStandardAcpSession('kimi-code', options);

    await session.run();

    expect(session.keepaliveArmed).toBe(false);
    expect(clock.hasPending()).toBe(false);
    expect(killSpy).toHaveBeenCalled();
  });

  it('applies prompt_cache_key for codex only under the env opt-in', async () => {
    const fake = createAcpProcess();
    spawnMock.mockReturnValue(fake.child);
    const killSpy = spyProcessKill(fake.child);
    const clock = createFakeClock();
    const { options } = createSessionOptions({
      cacheKeepalive: { clock: clock.clock, maxPings: 1 },
      env: testEnv({ ORVILO_CODEX_PROMPT_CACHE_KEY: '1' }),
    });
    const session = createStandardAcpSession('codex', options);

    await session.run();

    expect(fake.requests).toContainEqual(
      expect.objectContaining({
        method: 'session/set_config_option',
        params: expect.objectContaining({
          configId: 'prompt_cache_key',
          sessionId: 'cc-session-1',
          value: 'cc-session-1',
        }),
      }),
    );
    expect(session.keepaliveArmed).toBe(true);
    session.close();
    await vi.waitFor(() => expect(killSpy).toHaveBeenCalled());
  });
});
