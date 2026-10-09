import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import type { AgentStreamEvent } from '@orvilo/agent-gateway-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SESSION_TITLE_LINGER_MS } from './acpAgentSession';
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
}

type Send = (message: Record<string, unknown>) => void;

const update = (body: Record<string, unknown>, params: Record<string, unknown> = {}) => ({
  method: 'session/update',
  params: { sessionId: 'cc-session-1', update: body, ...params },
});

/**
 * ACP stdio fake. `onSessionNew` / `beforePromptResult` script the
 * notifications the bridge sends around the prompt; the returned `send`
 * injects anything later (e.g. a title that follows the prompt response).
 */
const createAcpProcess = (script: {
  beforePromptResult?: (send: Send) => void;
  onSessionNew?: (send: Send) => void;
  stopReason?: string;
}) => {
  const child = new EventEmitter() as ChildProcess;
  const stdout = new PassThrough();
  const send: Send = (message) =>
    void stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

  Object.assign(child, {
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
      return true;
    }),
    killed: false,
    pid: 123_457,
    stderr: new PassThrough(),
    stdin: {
      once: vi.fn(),
      write: vi.fn((chunk: string) => {
        const message = JSON.parse(chunk.trim()) as RpcMessage;
        if (!message.method) return true;
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
              script.onSessionNew?.(send);
              return;
            }
            case 'session/set_config_option': {
              send({ id: message.id, result: { configOptions: [] } });
              return;
            }
            case 'session/prompt': {
              script.beforePromptResult?.(send);
              send({ id: message.id, result: { stopReason: script.stopReason ?? 'end_turn' } });
              return;
            }
          }
        });
        return true;
      }),
    },
    stdout,
  });
  return { child, send };
};

const createOptions = (overrides: Partial<StandardAcpSessionOptions> = {}) => {
  const events: AgentStreamEvent[] = [];
  const options: StandardAcpSessionOptions = {
    args: [],
    cacheKeepalive: { enabled: false },
    clientVersion: '1.2.3',
    commandPath: 'claude-agent-acp',
    cwd: '/workspace',
    env: {
      NEXT_PUBLIC_DEVELOPER_DEBUG: '',
      NEXT_PUBLIC_I18N_DEBUG: '',
      NEXT_PUBLIC_I18N_DEBUG_BROWSER: '',
      NEXT_PUBLIC_I18N_DEBUG_SERVER: '',
      NODE_ENV: 'test',
    },
    onEvents: (batch) => {
      events.push(...batch);
    },
    onRawMessage: vi.fn(),
    onRuntimeStatus: vi.fn(),
    onSessionId: vi.fn(),
    onStderr: vi.fn(),
    operationId: 'operation-1',
    prompt: [{ text: 'hello', type: 'text' }],
    sessionId: 'session-1',
    ...overrides,
  };
  return { events, options };
};

const keepaliveOptions = {
  enabled: true,
  maxPings: 1,
  maxWindowMs: 60_000,
  pingIntervalMs: 30_000,
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  spawnMock.mockReset();
});

describe('AcpAgentSession onSessionTitle', () => {
  it('delivers a title reported during the turn, outside the event stream', async () => {
    const fake = createAcpProcess({
      beforePromptResult: (send) => {
        send(update({ sessionUpdate: 'session_info_update', title: 'Refactor the router' }));
      },
    });
    spawnMock.mockReturnValue(fake.child);
    const onSessionTitle = vi.fn();
    const { events, options } = createOptions({ onSessionTitle });

    await createStandardAcpSession('claude-code', options).run();

    expect(onSessionTitle).toHaveBeenCalledExactlyOnceWith('Refactor the router');
    // The ingest schema is a closed enum: no title may enter the event stream.
    expect(JSON.stringify(events)).not.toContain('Refactor the router');
  });

  it('still delivers a title that arrives after the prompt completed', async () => {
    const fake = createAcpProcess({});
    spawnMock.mockReturnValue(fake.child);
    const onSessionTitle = vi.fn();
    // Keep-alive holds the child past the turn, like the bridge's own ~2s
    // background title generation would need.
    const { events, options } = createOptions({
      cacheKeepalive: keepaliveOptions,
      onSessionTitle,
    });
    const session = createStandardAcpSession('claude-code', options);

    await session.run();
    expect(session.keepaliveArmed).toBe(true);
    const eventsAtTurnEnd = events.length;

    fake.send(update({ sessionUpdate: 'session_info_update', title: 'Late generated title' }));
    await vi.waitFor(() => expect(onSessionTitle).toHaveBeenCalledWith('Late generated title'));

    expect(events).toHaveLength(eventsAtTurnEnd);
    session.close();
  });

  it('keeps every other late update gated', async () => {
    const fake = createAcpProcess({});
    spawnMock.mockReturnValue(fake.child);
    const onSessionTitle = vi.fn();
    const { events, options } = createOptions({
      cacheKeepalive: keepaliveOptions,
      onSessionTitle,
    });
    const session = createStandardAcpSession('claude-code', options);
    await session.run();
    const eventsAtTurnEnd = events.length;

    fake.send(
      update({ content: { text: 'trailing', type: 'text' }, sessionUpdate: 'agent_message_chunk' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onSessionTitle).not.toHaveBeenCalled();
    expect(events).toHaveLength(eventsAtTurnEnd);
    session.close();
  });

  it('ignores _meta-only, blank, null and replayed updates, and repeats of a title', async () => {
    const fake = createAcpProcess({
      // After session/new but before session/prompt: history replay.
      onSessionNew: (send) => {
        send(update({ sessionUpdate: 'session_info_update', title: 'Replayed old title' }));
      },
      beforePromptResult: (send) => {
        send(update({ _meta: { x: 1 }, sessionUpdate: 'session_info_update' }));
        send(update({ sessionUpdate: 'session_info_update', title: null }));
        send(update({ sessionUpdate: 'session_info_update', title: '   ' }));
        send(
          update(
            { sessionUpdate: 'session_info_update', title: 'Marked replay' },
            { _meta: { isReplay: true } },
          ),
        );
        send(update({ sessionUpdate: 'session_info_update', title: 'Real title' }));
        send(update({ sessionUpdate: 'session_info_update', title: 'Real title' }));
      },
    });
    spawnMock.mockReturnValue(fake.child);
    const onSessionTitle = vi.fn();
    const { options } = createOptions({ onSessionTitle });

    await createStandardAcpSession('claude-code', options).run();

    expect(onSessionTitle).toHaveBeenCalledExactlyOnceWith('Real title');
  });

  it('keeps a title out of the stream when nobody consumes it', async () => {
    const fake = createAcpProcess({
      beforePromptResult: (send) => {
        send(update({ sessionUpdate: 'session_info_update', title: 'Nobody listens' }));
      },
    });
    spawnMock.mockReturnValue(fake.child);
    const { events, options } = createOptions();

    await createStandardAcpSession('claude-code', options).run();
    expect(JSON.stringify(events)).not.toContain('Nobody listens');
  });
});

describe('AcpAgentSession title linger', () => {
  const setup = (script: Parameters<typeof createAcpProcess>[0] = {}, overrides = {}) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fake = createAcpProcess(script);
    spawnMock.mockReturnValue(fake.child);
    const onSessionTitle = vi.fn();
    const { options } = createOptions({ onSessionTitle, ...overrides });
    const session = createStandardAcpSession('claude-code', options);
    return { fake, onSessionTitle, session };
  };

  it('keeps the child alive after the turn, without delaying run()', async () => {
    const { fake, session } = setup();

    await session.run();

    expect(session.titleLingering).toBe(true);
    expect(fake.child.kill).not.toHaveBeenCalled();
  });

  it('delivers a title that arrives during the linger, then closes', async () => {
    const { fake, onSessionTitle, session } = setup();
    await session.run();

    fake.send(update({ sessionUpdate: 'session_info_update', title: 'Generated later' }));
    await vi.waitFor(() => expect(onSessionTitle).toHaveBeenCalledWith('Generated later'));

    expect(fake.child.kill).toHaveBeenCalledTimes(1);
    expect(session.titleLingering).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes at the cap when no title arrives', async () => {
    const { fake, session } = setup();
    await session.run();

    vi.advanceTimersByTime(SESSION_TITLE_LINGER_MS - 1);
    expect(fake.child.kill).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(fake.child.kill).toHaveBeenCalledTimes(1);
    expect(session.titleLingering).toBe(false);
  });

  it('does not linger when a title was already delivered during the turn', async () => {
    const { fake, session } = setup({
      beforePromptResult: (send) => {
        send(update({ sessionUpdate: 'session_info_update', title: 'Already here' }));
      },
    });

    await session.run();

    expect(session.titleLingering).toBe(false);
    expect(fake.child.kill).toHaveBeenCalledTimes(1);
  });

  it('does not linger after a cancelled turn', async () => {
    const { fake, session } = setup({ stopReason: 'cancelled' });

    await session.run();

    expect(session.titleLingering).toBe(false);
    expect(fake.child.kill).toHaveBeenCalledTimes(1);
  });

  it('does not linger without a title consumer', async () => {
    const { fake, session } = setup({}, { onSessionTitle: undefined });

    await session.run();

    expect(session.titleLingering).toBe(false);
    expect(fake.child.kill).toHaveBeenCalledTimes(1);
  });

  it('a forced close during the linger kills immediately and clears the timer', async () => {
    const { fake, session } = setup();
    await session.run();

    session.close();
    session.close();

    expect(fake.child.kill).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(session.titleLingering).toBe(false);
  });

  it('interrupt during the linger kills immediately', async () => {
    const { fake, session } = setup();
    await session.run();

    await session.interrupt();

    expect(fake.child.kill).toHaveBeenCalledTimes(1);
    // (the remaining timer is interrupt()'s own exit-grace race, not the linger)
    expect(session.titleLingering).toBe(false);
  });

  it('release joins the pending linger instead of cutting it short or restarting it', async () => {
    const { fake, session } = setup();
    await session.run();

    session.release();
    session.release();

    expect(fake.child.kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(SESSION_TITLE_LINGER_MS);
    expect(fake.child.kill).toHaveBeenCalledTimes(1);
  });

  it('release closes at once when there is nothing to wait for', async () => {
    const { fake, session } = setup({ stopReason: 'cancelled' });
    await session.run();
    session.release();

    expect(fake.child.kill).toHaveBeenCalledTimes(1);
  });

  it('closes the child even when the title callback throws', async () => {
    const { fake, onSessionTitle, session } = setup();
    onSessionTitle.mockImplementation(() => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await session.run();

    fake.send(update({ sessionUpdate: 'session_info_update', title: 'Title' }));
    await vi.waitFor(() => expect(fake.child.kill).toHaveBeenCalledTimes(1));

    expect(vi.getTimerCount()).toBe(0);
  });
});
