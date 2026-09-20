import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TraeAcpAdapter } from '../adapters/traeAcp';
import {
  HETEROGENEOUS_AGENT_CONFIGS,
  LOCAL_HETEROGENEOUS_AGENT_TYPES,
  REMOTE_HETEROGENEOUS_AGENT_CONFIGS,
} from '../config';
import { listLiveAgentTypes, listTraceDecoderTypes } from '../registry';
import type { AcpAgentRuntimeSpec } from './acpRuntime';
import { getAcpAgentRuntime } from './acpRuntime';
import { AgentStreamPipeline } from './agentStreamPipeline';
import { StandardAcpSession } from './standardAcpSession';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, spawn: spawnMock };
});

/**
 * A fake ACP peer standing in for a future agent that speaks ACP v1 over
 * stdio — e.g. an Orvilo cloud harness. It answers the protocol handshake and
 * session lifecycle out of `handlers`, records every request/notification the
 * host sends, and writes `session/update` notifications back on stdout.
 */
const createFakePeer = (handlers: {
  initialize?: (params: unknown) => unknown;
  prompt?: (params: unknown) => unknown;
  sessionCancel?: (params: unknown) => void;
  sessionNew?: (params: unknown) => unknown;
}) => {
  const child = new EventEmitter() as any;
  const stdout = new PassThrough();
  const requests: { method: string; params: unknown }[] = [];
  const notifications: { method: string; params: unknown }[] = [];
  const pendingPrompts = new Map<string | number, (params: unknown) => unknown>();

  child.pid = 654_321;
  child.killed = false;
  child.kill = vi.fn(() => {
    queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
    return true;
  });
  child.stdout = stdout;
  child.stderr = new PassThrough();
  child.stdin = {
    once: vi.fn(),
    write: vi.fn((chunk: string) => {
      for (const line of chunk.trim().split('\n')) {
        const message = JSON.parse(line);
        const method = message.method as string;
        const params = message.params;
        if (message.id === undefined) {
          notifications.push({ method, params });
          if (method === 'session/cancel') {
            handlers.sessionCancel?.(params);
            for (const [id, handler] of pendingPrompts) {
              stdout.write(`${JSON.stringify({ id, jsonrpc: '2.0', result: handler(params) })}\n`);
            }
            pendingPrompts.clear();
            // Exit after the cancelled-prompt response has been consumed —
            // closing earlier races the in-flight `session/prompt` settlement.
            setTimeout(() => child.emit('close', 0, null), 20);
          }
          continue;
        }
        requests.push({ method, params });
        const respond = (result: unknown) =>
          stdout.write(`${JSON.stringify({ id: message.id, jsonrpc: '2.0', result })}\n`);
        switch (method) {
          case 'initialize': {
            respond(handlers.initialize?.(params));
            break;
          }
          case 'session/new': {
            respond(handlers.sessionNew?.(params) ?? { sessionId: 'fake-session-1' });
            break;
          }
          case 'session/prompt': {
            const handler = handlers.prompt;
            if (handler) {
              const result = handler(params);
              if (result !== undefined) respond(result);
              else pendingPrompts.set(message.id, () => ({ stopReason: 'cancelled' }));
            } else {
              respond({ stopReason: 'end_turn' });
            }
            break;
          }
          case 'session/close': {
            respond({});
            break;
          }
          default: {
            respond({});
          }
        }
      }
      return true;
    }),
  };
  spawnMock.mockReturnValue(child);

  const emitUpdate = (update: Record<string, unknown>) =>
    stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: { sessionId: 'fake-session-1', update },
      })}\n`,
    );

  return { child, emitUpdate, notifications, requests, stdout };
};

const FAKE_SPEC: AcpAgentRuntimeSpec = {
  acpArgs: ['acp'],
  eventPrefix: 'pi',
  label: 'Orvilo Fake Harness',
  provider: 'orvilo-harness',
  transport: 'acp-stdio',
};

const createSession = (overrides: Record<string, unknown> = {}) => {
  const events: { data: unknown; type: string }[] = [];
  const statuses: { state: string; transport: string }[] = [];
  const sessionIds: string[] = [];
  const session = new StandardAcpSession(
    {
      args: [],
      clientVersion: '9.9.9',
      commandPath: 'fake-harness-acp',
      cwd: '/tmp/fake-workspace',
      env: {},
      onEvents: (batch) => {
        events.push(...(batch as { data: unknown; type: string }[]));
      },
      onRawMessage: () => {},
      onRuntimeStatus: (status) => {
        statuses.push({ state: status.state, transport: status.transport });
      },
      onSessionId: (id) => sessionIds.push(id),
      onStderr: () => {},
      operationId: 'op-1',
      prompt: 'hello harness',
      sessionId: 'op-1',
      ...overrides,
    },
    { agentType: 'pi', args: [], spec: FAKE_SPEC },
  );
  return { events, session, sessionIds, statuses };
};

afterEach(() => {
  vi.restoreAllMocks();
  spawnMock.mockReset();
});

describe('ACP extension contract — a new agent type without core changes', () => {
  it('runs a full prompt turn over the standard session lifecycle', async () => {
    const peer = createFakePeer({
      initialize: () => ({
        agentCapabilities: {
          loadSession: false,
          promptCapabilities: { image: false },
          sessionCapabilities: { close: true },
        },
        protocolVersion: 1,
      }),
      prompt: (params) => {
        expect(params).toMatchObject({
          prompt: [{ text: 'hello harness', type: 'text' }],
          sessionId: 'fake-session-1',
        });
        // Stream a chunk before the turn result, like a real ACP peer.
        peer.emitUpdate({
          content: { text: 'Hello from the fake harness', type: 'text' },
          sessionUpdate: 'agent_message_chunk',
        });
        return { stopReason: 'end_turn' };
      },
    });
    const { events, session, sessionIds, statuses } = createSession();

    await session.run();

    const initialize = peer.requests.find((r) => r.method === 'initialize');
    expect(initialize?.params).toMatchObject({
      clientInfo: { name: 'orvilo', title: 'Orvilo' },
      protocolVersion: 1,
    });
    expect(peer.requests.map((r) => r.method)).toEqual([
      'initialize',
      'session/new',
      'session/prompt',
    ]);
    expect(sessionIds).toEqual(['fake-session-1']);
    expect(events.map((e) => e.type)).toContain('stream_chunk');
    expect(events.map((e) => e.type)).toContain('agent_runtime_end');
    expect(statuses.map((s) => s.state)).toEqual(['starting', 'running', 'idle', 'closed']);
    expect(statuses[0].transport).toBe('acp-stdio');
    expect(peer.child.kill).toHaveBeenCalled();
  });

  it('cancels a pending prompt through session/cancel and confirms the exit', async () => {
    let promptPending = false;
    const peer = createFakePeer({
      initialize: () => ({ protocolVersion: 1 }),
      prompt: () => {
        promptPending = true;
        return undefined; // hold the turn open until the cancel lands
      },
    });
    const { session } = createSession();
    const run = session.run();

    await vi.waitFor(() => expect(promptPending).toBe(true));
    await expect(session.interrupt()).resolves.toBe(true);
    await run;

    expect(peer.notifications.map((n) => n.method)).toContain('session/cancel');
  });

  it('rejects a peer answering initialize with an unsupported protocol version', async () => {
    createFakePeer({ initialize: () => ({ protocolVersion: 2 }) });
    const { session } = createSession();

    await expect(session.run()).rejects.toThrow(/unsupported protocol version/);
  });
});

describe('adapter axis — vendor identity is configuration, not code', () => {
  it('maps an unregistered vendor prefix/provider through the standard ACP vocabulary', async () => {
    const pipeline = new AgentStreamPipeline({
      adapter: new TraeAcpAdapter({ eventPrefix: 'fakeharness', provider: 'orvilo-harness' }),
      agentType: 'fake-harness',
      operationId: 'op-fake',
    });

    await pipeline.push(`${JSON.stringify({ sessionId: 's1', type: 'fakeharness_session' })}\n`);
    const midEvents = await pipeline.push(
      `${JSON.stringify({
        content: { text: 'chunk-1', type: 'text' },
        sessionUpdate: 'agent_message_chunk',
      })}\n`,
    );
    const endEvents = await pipeline.push(
      `${JSON.stringify({ stopReason: 'end_turn', type: 'fakeharness_prompt_completed' })}\n`,
    );

    const types = [...midEvents, ...endEvents].map((event) => event.type);
    expect(types).toContain('stream_start');
    expect(types).toContain('stream_chunk');
    expect(types).toContain('agent_runtime_end');
    expect(pipeline.sessionId).toBe('s1');
  });
});

describe('production registries expose only implemented paths', () => {
  it('every selectable local type resolves a live adapter or a documented transport alias', () => {
    const live = new Set(listLiveAgentTypes());
    const missing = LOCAL_HETEROGENEOUS_AGENT_TYPES.filter((type) => !live.has(type));
    // `cursor` is decoder-only; its live sessions run under the `cursor-acp`
    // transport key, which must stay registered.
    expect(missing).toEqual(['cursor']);
    expect(live.has('cursor-acp')).toBe(true);
    expect(live.has('droid-acp')).toBe(true);
  });

  it('every remote type stays on the implemented remote-task dispatch kind', () => {
    for (const config of REMOTE_HETEROGENEOUS_AGENT_CONFIGS) {
      expect(config.kind).toBe('remote-task');
      expect(config.cli.command).toBeTruthy();
    }
  });

  it('registers no test/fake adapters in production config', () => {
    const keys = [
      ...LOCAL_HETEROGENEOUS_AGENT_TYPES,
      ...REMOTE_HETEROGENEOUS_AGENT_CONFIGS.map(({ type }) => type),
      ...listTraceDecoderTypes(),
    ];
    expect(keys.filter((key) => /fake|mock|stub|test/i.test(key))).toEqual([]);
  });

  it('keeps the ACP runtime map in sync with the standard-ACP adapter bindings', () => {
    for (const config of HETEROGENEOUS_AGENT_CONFIGS) {
      if (config.type === 'pi') continue;
      // spot-check the parameterized family: every type whose adapter is a
      // spec-driven TraeAcpAdapter must resolve an ACP runtime spec
      const spec = getAcpAgentRuntime(config.type);
      if (
        ['amp', 'claude-code', 'codebuddy', 'codex', 'kimi-code', 'opencode', 'qoder'].includes(
          config.type,
        )
      ) {
        expect(spec, `missing ACP runtime spec for ${config.type}`).toBeTruthy();
        expect(spec!.eventPrefix).toBeTruthy();
      }
    }
  });
});
