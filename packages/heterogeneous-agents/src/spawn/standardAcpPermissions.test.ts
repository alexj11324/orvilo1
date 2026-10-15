import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AskUserBridge } from '../askUser/AskUserBridge';
import { createStandardAcpSession, listStandardAcpPermissions } from './standardAcpAgents';
import {
  answerNativePermissionRequest,
  parseStandardAcpPermissionCatalogs,
  resolveNativeFullAccessPermission,
} from './standardAcpPermissions';
import type { StandardAcpSessionOptions } from './standardAcpSession';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  spawn: spawnMock,
}));
interface RpcMessage {
  error?: unknown;
  id?: number | string;
  jsonrpc?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
}

interface FakeAcpProcessOptions {
  initializeResult?: Record<string, unknown>;
  onMessage?: (message: RpcMessage, context: { child: ChildProcess; send: Send }) => boolean | void;
}

type Send = (message: Record<string, unknown>) => void;

const createAcpProcess = (options: FakeAcpProcessOptions = {}) => {
  const child = new EventEmitter() as ChildProcess;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const requests: RpcMessage[] = [];
  const send: Send = (message) => stdout.write(`${JSON.stringify(message)}\n`);

  Object.assign(child, {
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
      return true;
    }),
    killed: false,
    pid: 987_654,
    stderr,
    stdin: {
      once: vi.fn(),
      write: vi.fn((chunk: string) => {
        const message = JSON.parse(chunk.trim()) as RpcMessage;
        requests.push(message);
        queueMicrotask(() => {
          if (options.onMessage?.(message, { child, send })) return;
          switch (message.method) {
            case 'initialize': {
              send({
                id: message.id,
                result: options.initializeResult ?? {
                  agentCapabilities: {
                    loadSession: true,
                    promptCapabilities: { image: true },
                  },
                  protocolVersion: 1,
                },
              });
              return;
            }
            case 'session/new':
            case 'session/load': {
              send({ id: message.id, result: { sessionId: 'trae-session-1' } });
              return;
            }
            case 'session/set_mode':
            case 'session/set_model': {
              send({ id: message.id, result: {} });
              return;
            }
            case 'session/set_config_option': {
              send({ id: message.id, result: { configOptions: [] } });
              return;
            }
            case 'session/close': {
              send({ id: message.id, result: {} });
              return;
            }
            case 'session/prompt': {
              send({ id: message.id, result: { stopReason: 'end_turn' } });
            }
          }
        });
        return true;
      }),
    },
    stdout,
  });

  return { child, requests, send, stderr, stdout };
};

const createSessionOptions = (
  overrides: Partial<StandardAcpSessionOptions> = {},
): StandardAcpSessionOptions => ({
  args: ['--feature=test'],
  clientVersion: '1.2.3',
  commandPath: 'traecli',
  cwd: '/workspace',
  env: process.env,
  onEvents: vi.fn(),
  onRawMessage: vi.fn(),
  onRuntimeStatus: vi.fn(),
  onSessionId: vi.fn(),
  onStderr: vi.fn(),
  operationId: 'operation-1',
  prompt: 'hello',
  sessionId: 'session-1',
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
  spawnMock.mockReset();
});
const permission = {
  type: 'select',
  category: 'permission',
  id: 'approval',
  name: 'Tool approval',
  currentValue: 'ask',
  options: [
    { name: 'Ask before tools', value: 'ask', description: 'Require confirmation' },
    { name: 'Agent decides', value: 'auto' },
  ],
};
const modes = {
  currentModeId: 'plan',
  availableModes: [
    { id: 'plan', name: 'Planning', description: 'Read only' },
    { id: 'build', name: 'Build' },
  ],
};
const spawnWithCatalog = (catalog: Record<string, unknown>, rejection = false) => {
  const fake = createAcpProcess({
    onMessage(message, { send }) {
      if (message.method === 'session/new' || message.method === 'session/load') {
        send({ id: message.id, result: { ...catalog, sessionId: 'native-session' } });
        return true;
      }
      if (rejection && message.method === 'session/set_config_option') {
        send({ id: message.id, error: { code: -32602, message: 'Permission rejected' } });
        return true;
      }
    },
  });
  spawnMock.mockReturnValue(fake.child);
  return fake;
};
describe('standard ACP permissions', () => {
  it('preserves advertised labels/current values and prefers permission config over modes', () => {
    expect(parseStandardAcpPermissionCatalogs({ configOptions: [permission], modes })).toEqual([
      {
        configId: 'approval',
        name: 'Tool approval',
        currentValue: 'ask',
        options: permission.options,
      },
    ]);
    expect(parseStandardAcpPermissionCatalogs({ modes })).toEqual([
      {
        configId: 'mode',
        name: 'mode',
        currentValue: 'plan',
        options: [
          { value: 'plan', name: 'Planning', description: 'Read only' },
          { value: 'build', name: 'Build' },
        ],
      },
    ]);
    expect(parseStandardAcpPermissionCatalogs({})).toEqual([]);
  });
  it('retains modern mode-category config options without legacy modes', () => {
    const modern = { ...permission, category: 'mode', configId: 'agent-mode', id: undefined };
    expect(parseStandardAcpPermissionCatalogs({ configOptions: [modern] })).toEqual([
      {
        configId: 'agent-mode',
        name: permission.name,
        currentValue: 'ask',
        options: permission.options,
      },
    ]);
  });
  it('recognizes only known permission ids when category is absent and ignores other selectors', () => {
    const option = { ...permission, category: undefined, id: 'mode' };
    expect(
      parseStandardAcpPermissionCatalogs({
        configOptions: [
          option,
          { ...option, id: 'model' },
          { ...option, id: 'effort' },
          { ...option, id: 'mode', type: 'boolean' },
          { ...option, id: 'mode', category: 'model' },
        ],
      }),
    ).toEqual([
      { configId: 'mode', name: permission.name, currentValue: 'ask', options: permission.options },
    ]);
    for (const id of ['permission', 'approval', 'permission-mode', 'approval-mode']) {
      expect(
        parseStandardAcpPermissionCatalogs({ configOptions: [{ ...option, id }] })[0]?.configId,
      ).toBe(id);
    }
  });
  it('flattens advertised select groups while preserving choice labels and descriptions', () => {
    expect(
      parseStandardAcpPermissionCatalogs({
        configOptions: [
          {
            ...permission,
            options: [
              { group: 'Confirm', options: [permission.options[0]] },
              { group: 'Autonomous', options: [permission.options[1]] },
            ],
          },
        ],
      })[0]?.options,
    ).toEqual(permission.options);
  });
  it.each(['mode', undefined])(
    'applies modern config mode with category %s through its advertised config id',
    async (category) => {
      const modern = { ...permission, id: 'permission-mode', category };
      const fake = spawnWithCatalog({ configOptions: [modern], modes });
      await createStandardAcpSession(
        'codex',
        createSessionOptions({
          args: [],
          initialPermission: { configId: 'permission-mode', value: 'ask' },
        }),
      ).run();
      expect(fake.requests.map(({ method }) => method)).toEqual([
        'initialize',
        'session/new',
        'session/set_config_option',
        'session/prompt',
      ]);
      expect(fake.requests[2].params).toEqual({
        configId: 'permission-mode',
        value: 'ask',
        sessionId: 'native-session',
      });
    },
  );
  it('discovers permissions without changing agent configuration or prompting', async () => {
    const fake = spawnWithCatalog({ configOptions: [permission] });
    expect(
      await listStandardAcpPermissions('codex', {
        commandPath: 'codex-acp',
        cwd: '/workspace',
        env: process.env,
      }),
    ).toEqual(parseStandardAcpPermissionCatalogs({ configOptions: [permission] }));
    expect(fake.requests.map(({ method }) => method)).toEqual(['initialize', 'session/new']);
  });
  it('applies a selected permission before the prompt, without a bypass override', async () => {
    const fake = spawnWithCatalog({ configOptions: [permission] });
    await createStandardAcpSession(
      'codex',
      createSessionOptions({ args: [], initialPermission: { configId: 'approval', value: 'ask' } }),
    ).run();
    const methods = fake.requests.map(({ method }) => method);
    expect(methods).toEqual([
      'initialize',
      'session/new',
      'session/set_config_option',
      'session/prompt',
    ]);
    expect(fake.requests[2].params).toEqual({
      configId: 'approval',
      value: 'ask',
      sessionId: 'native-session',
    });
  });
  it('applies actual legacy session modes through set_mode', async () => {
    const fake = spawnWithCatalog({ modes });
    await createStandardAcpSession(
      'codex',
      createSessionOptions({ args: [], initialPermission: { configId: 'mode', value: 'build' } }),
    ).run();
    expect(fake.requests[2]).toMatchObject({
      method: 'session/set_mode',
      params: { modeId: 'build', sessionId: 'native-session' },
    });
  });
  it.each([
    { configId: 'approval', value: 'unknown' },
    { configId: 'missing', value: 'ask' },
  ])('rejects unavailable selection %j before prompting', async (initialPermission) => {
    const fake = spawnWithCatalog({ configOptions: [permission] });
    await expect(
      createStandardAcpSession(
        'codex',
        createSessionOptions({ args: [], initialPermission }),
      ).run(),
    ).rejects.toThrow('permission is unavailable');
    expect(fake.requests.some(({ method }) => method === 'session/prompt')).toBe(false);
  });
  it('rejects a selected permission when the agent advertises no choices', async () => {
    const fake = spawnWithCatalog({});
    await expect(
      createStandardAcpSession(
        'codex',
        createSessionOptions({ args: [], initialPermission: { configId: 'mode', value: 'build' } }),
      ).run(),
    ).rejects.toThrow('permission is unavailable');
    expect(fake.requests.some(({ method }) => method === 'session/prompt')).toBe(false);
  });
  it('propagates application rejection without prompting or falling back', async () => {
    const fake = spawnWithCatalog({ configOptions: [permission] }, true);
    await expect(
      createStandardAcpSession(
        'codex',
        createSessionOptions({
          args: [],
          initialPermission: { configId: 'approval', value: 'ask' },
        }),
      ).run(),
    ).rejects.toThrow('Permission rejected');
    expect(fake.requests.some(({ method }) => method === 'session/prompt')).toBe(false);
  });
  it('refuses tool permission requests without an interactive bridge', async () => {
    spawnWithCatalog({ configOptions: [permission] });
    const session = createStandardAcpSession(
      'codex',
      createSessionOptions({ args: [], initialPermission: { configId: 'approval', value: 'ask' } }),
    );
    await expect(
      Reflect.get(session, 'handleServerRequest').call(session, {
        id: 1,
        method: 'session/request_permission',
        params: { options: [{ optionId: 'approve', kind: 'allow_always' }] },
      }),
    ).rejects.toThrow('requires an interactive bridge');
    session.close();
  });
});

it('requires an explicitly advertised native full-access option', () => {
  const catalog = parseStandardAcpPermissionCatalogs({ modes });
  expect(resolveNativeFullAccessPermission(catalog)).toBeUndefined();
  const full = {
    configId: 'native-mode',
    name: 'Native mode',
    currentValue: 'auto',
    options: [{ value: 'opaque-mode', name: 'Full access' }],
  };
  expect(resolveNativeFullAccessPermission([full])).toEqual({
    configId: 'native-mode',
    value: 'opaque-mode',
  });
});

it('automation refuses before prompt when full access is unadvertised', async () => {
  const fake = spawnWithCatalog({ configOptions: [permission] });
  await expect(
    createStandardAcpSession(
      'codex',
      createSessionOptions({ args: [], nativeFullAccess: true }),
    ).run(),
  ).rejects.toThrow('no advertised native unattended mode');
  expect(fake.requests.some(({ method }) => method === 'session/prompt')).toBe(false);
});

it.each(['codex', 'grok-build', 'trae'])(
  '%s waits for an explicit native permission answer',
  async (provider) => {
    const bridge = new AskUserBridge('permission-test');
    const updates: Record<string, unknown>[] = [];
    let settled = false;
    const response = answerNativePermissionRequest(
      {
        id: 9,
        method: 'session/request_permission',
        params: {
          toolCall: { toolCallId: 'native-tool', title: 'Write file?' },
          options: [{ optionId: 'native-allow', name: 'Allow', kind: 'allow_always' }],
        },
      },
      bridge,
      async (update) => {
        updates.push(update);
      },
      provider,
    ).then((result) => {
      settled = true;
      return result;
    });
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(settled).toBe(false);
    bridge.resolve(`${provider}-permission-9-native-tool`, {
      result: { 'Write file?': ['native-allow'] },
    });
    expect(await response).toEqual({ outcome: { outcome: 'selected', optionId: 'native-allow' } });
    expect(updates).toHaveLength(2);
    bridge.cancelAll();
  },
);

it('automation overrides the saved interactive permission with the advertised native choice', async () => {
  const fake = spawnWithCatalog({
    modes: {
      currentModeId: 'ask',
      availableModes: [
        { id: 'ask', name: 'Ask' },
        { id: 'native-full', name: 'Full access' },
      ],
    },
  });
  await createStandardAcpSession(
    'codex',
    createSessionOptions({
      args: [],
      nativeFullAccess: true,
      initialPermission: { configId: 'mode', value: 'ask' },
    }),
  ).run();
  expect(fake.requests.find(({ method }) => method === 'session/set_mode')?.params).toEqual({
    sessionId: 'native-session',
    modeId: 'native-full',
  });
});

it('selects an advertised unattended mode and refuses an interactive-only catalog', () => {
  const catalog = (options: Array<{ name: string; value: string }>) => [
    {
      configId: 'mode',
      currentValue: options[0]!.value,
      name: 'Mode',
      options,
    },
  ];
  expect(
    resolveNativeFullAccessPermission(catalog([{ name: 'Autonomous', value: 'autonomous' }])),
  ).toEqual({ configId: 'mode', value: 'autonomous' });
  expect(
    resolveNativeFullAccessPermission(
      catalog([{ name: 'Run Everything', value: 'run-everything' }]),
    ),
  ).toEqual({ configId: 'mode', value: 'run-everything' });
  expect(
    resolveNativeFullAccessPermission(
      catalog([
        { name: 'Auto', value: 'auto' },
        { name: 'Run Everything', value: 'run-everything' },
      ]),
    ),
  ).toEqual({ configId: 'mode', value: 'run-everything' });
  for (const option of [
    { name: 'Auto', value: 'auto' },
    { name: 'Smart', value: 'smart' },
    { name: 'Accept edits', value: 'accept-edits' },
    { name: 'Allowlist', value: 'allowlist' },
  ]) {
    expect(resolveNativeFullAccessPermission(catalog([option]))).toBeUndefined();
  }
});

it('recognizes the installed Codex ACP full-access option verbatim', () => {
  expect(
    resolveNativeFullAccessPermission([
      {
        configId: 'mode',
        currentValue: 'agent',
        name: 'Mode',
        options: [{ value: 'agent-full-access', name: 'Agent (full access)' }],
      },
    ]),
  ).toEqual({ configId: 'mode', value: 'agent-full-access' });
});

it('reports the actual native fallback and continues the ordinary prompt', async () => {
  const onEvents = vi.fn();
  const fake = createAcpProcess({
    onMessage(message, { send }) {
      if (message.method === 'session/new') {
        send({
          id: message.id,
          result: { sessionId: 'native-session', configOptions: [permission] },
        });
        return true;
      }
      if (message.method === 'session/prompt') {
        send({
          method: 'session/update',
          params: {
            sessionId: 'native-session',
            update: {
              sessionUpdate: 'config_option_update',
              configOptions: [{ ...permission, currentValue: 'auto' }],
            },
          },
        });
      }
    },
  });
  spawnMock.mockReturnValue(fake.child);
  await createStandardAcpSession(
    'codex',
    createSessionOptions({
      args: [],
      onEvents,
      initialPermission: { configId: 'approval', value: 'ask' },
    }),
  ).run();
  expect(JSON.stringify(onEvents.mock.calls)).toContain(
    'Native permission mode: Agent decides (auto).',
  );
  expect(fake.requests.some(({ method }) => method === 'session/prompt')).toBe(true);
});

it('refuses an automation mode downgraded by the native set-mode notification before prompt', async () => {
  const fake = createAcpProcess({
    onMessage(message, { send }) {
      if (message.method === 'session/new') {
        send({
          id: message.id,
          result: {
            sessionId: 'native-session',
            modes: {
              currentModeId: 'ask',
              availableModes: [
                { id: 'ask', name: 'Ask' },
                { id: 'full-access', name: 'Full access' },
              ],
            },
          },
        });
        return true;
      }
      if (message.method === 'session/set_mode') {
        send({
          method: 'session/update',
          params: {
            sessionId: 'native-session',
            update: { sessionUpdate: 'current_mode_update', currentModeId: 'ask' },
          },
        });
      }
    },
  });
  spawnMock.mockReturnValue(fake.child);
  await expect(
    createStandardAcpSession(
      'codex',
      createSessionOptions({ args: [], nativeFullAccess: true }),
    ).run(),
  ).rejects.toThrow('did not enable its native unattended mode');
  expect(fake.requests.some(({ method }) => method === 'session/prompt')).toBe(false);
});

it('fails automation when native full access is withdrawn during the prompt', async () => {
  const fake = createAcpProcess({
    onMessage(message, { send }) {
      if (message.method === 'session/new') {
        send({
          id: message.id,
          result: {
            sessionId: 'native-session',
            modes: {
              currentModeId: 'ask',
              availableModes: [
                { id: 'ask', name: 'Ask' },
                { id: 'full-access', name: 'Full access' },
              ],
            },
          },
        });
        return true;
      }
      if (message.method === 'session/prompt') {
        send({
          method: 'session/update',
          params: {
            sessionId: 'native-session',
            update: { sessionUpdate: 'current_mode_update', currentModeId: 'ask' },
          },
        });
      }
    },
  });
  spawnMock.mockReturnValue(fake.child);
  await expect(
    createStandardAcpSession(
      'codex',
      createSessionOptions({ args: [], nativeFullAccess: true }),
    ).run(),
  ).rejects.toThrow('native unattended mode is no longer active');
});
