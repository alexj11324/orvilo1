import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import type { AgentStreamEvent } from '@orvilo/agent-gateway-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
              send({ id: message.id, result: { stopReason: 'end_turn' } });
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
