import type * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as resolveCliCommand from './resolveCliCommand';

const spawnCalls: Array<{ args: string[]; command: string; options: any }> = [];
let nextFakeProc: any = null;
const tempDirs: string[] = [];

const platformMock = vi.mocked(os.platform);
const detectHeterogeneousCliCommandMock = vi.mocked(
  resolveCliCommand.detectHeterogeneousCliCommand,
);
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

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof os>('node:os');
  return { ...actual, platform: vi.fn(() => 'linux') };
});

vi.mock('./resolveCliCommand', async () => {
  const actual = await vi.importActual<typeof resolveCliCommand>('./resolveCliCommand');
  return {
    ...actual,
    detectHeterogeneousCliCommand: vi.fn(),
    detectValidatedCommandCandidates: vi.fn(),
  };
});

const createGrokAcpProc = ({
  loadError = false,
  promptAutoComplete = true,
}: { loadError?: boolean; promptAutoComplete?: boolean } = {}) => {
  const proc = new EventEmitter() as any;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const requests: Array<{
    id?: number | string;
    method?: string;
    params?: Record<string, unknown>;
  }> = [];
  const send = (message: Record<string, unknown>) => {
    stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  };

  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.pid = 54_321;
  proc.killed = false;
  proc.kill = vi.fn(() => true);
  proc.stdin = {
    once: vi.fn(),
    write: vi.fn((chunk: string) => {
      const message = JSON.parse(chunk.trim());
      requests.push(message);
      queueMicrotask(() => {
        switch (message.method) {
          case 'initialize': {
            send({
              id: message.id,
              result: {
                _meta: { defaultAuthMethodId: 'cached_token' },
                authMethods: [{ id: 'cached_token' }],
                protocolVersion: 1,
              },
            });
            return;
          }
          case 'authenticate': {
            send({ id: message.id, result: {} });
            return;
          }
          case 'session/new': {
            send({ id: message.id, result: { sessionId: 'grok-cli-session' } });
            return;
          }
          case 'session/load': {
            if (loadError) {
              send({
                error: {
                  code: -32_603,
                  data: { code: 'FS_NOT_FOUND', detail: 'missing session' },
                  message: 'Path not found.',
                },
                id: message.id,
              });
            } else {
              send({ id: message.id, result: {} });
            }
            return;
          }
          case 'session/prompt': {
            if (!promptAutoComplete) return;
            send({
              method: 'session/update',
              params: {
                sessionId: 'grok-cli-session',
                update: {
                  content: { text: 'done', type: 'text' },
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
  };

  return { proc, requests };
};

/**
 * Generic standard-ACP fake covering `StandardAcpSession`'s request surface:
 * initialize → session/new | session/load → set_config_option → session/prompt.
 */
const createStandardAcpProc = ({
  extraConfigOptions,
  loadError = false,
  modelOptions,
  promptAutoComplete = true,
  responseText = 'ACP response',
  sessionId = 'acp-session-1',
}: {
  /** Additional advertised `configOptions` entries (e.g. `effort`, `reasoning_effort`). */
  extraConfigOptions?: Record<string, unknown>[];
  loadError?: boolean;
  /** Extra entries merged into the fake `model` config-option catalog. */
  modelOptions?: Array<{ name: string; value: string }>;
  promptAutoComplete?: boolean;
  responseText?: string;
  sessionId?: string;
} = {}) => {
  const proc = new EventEmitter() as any;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const requests: Array<{
    id?: number;
    method?: string;
    params?: Record<string, unknown>;
  }> = [];
  const send = (message: Record<string, unknown>) =>
    stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.pid = 12_345;
  proc.killed = false;
  proc.kill = vi.fn(() => true);
  proc.stdin = {
    once: vi.fn(),
    write: vi.fn((chunk: string) => {
      const message = JSON.parse(chunk.trim()) as {
        id?: number;
        method?: string;
        params?: Record<string, unknown>;
      };
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
                },
                protocolVersion: 1,
              },
            });
            return;
          }
          case 'session/new': {
            send({
              id: message.id,
              result: {
                configOptions: [
                  {
                    category: 'model',
                    currentValue: 'seed-2.0-code',
                    id: 'model',
                    name: 'Model',
                    options: [
                      { name: 'GPT 5.4', value: 'gpt-5.4' },
                      { name: 'Sonnet', value: 'sonnet' },
                      ...(modelOptions ?? []),
                    ],
                    type: 'select',
                  },
                  ...(extraConfigOptions ?? []),
                ],
                sessionId,
              },
            });
            return;
          }
          case 'session/load': {
            if (loadError) {
              send({
                error: {
                  code: -32_002,
                  message: 'Session not found',
                },
                id: message.id,
              });
            } else {
              send({ id: message.id, result: { sessionId: message.params?.sessionId } });
            }
            return;
          }
          case 'session/set_config_option':
          case 'session/set_model': {
            send({ id: message.id, result: {} });
            return;
          }
          case 'session/prompt': {
            if (!promptAutoComplete) return;
            send({
              method: 'session/update',
              params: {
                sessionId,
                update: {
                  content: { text: responseText, type: 'text' },
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
  };

  return { proc, requests };
};

const createCursorAcpProc = () => {
  const proc = new EventEmitter() as any;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const requests: Array<{
    id?: number;
    method?: string;
    params?: Record<string, unknown>;
  }> = [];
  const send = (message: Record<string, unknown>) =>
    stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  Object.assign(proc, {
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
      return true;
    }),
    killed: false,
    pid: 67_890,
    stderr,
    stdin: {
      once: vi.fn(),
      write: vi.fn((chunk: string) => {
        const message = JSON.parse(chunk.trim());
        requests.push(message);
        queueMicrotask(() => {
          switch (message.method) {
            case 'initialize': {
              send({
                id: message.id,
                result: {
                  agentCapabilities: { loadSession: true },
                  authMethods: [{ id: 'cursor_login' }],
                  protocolVersion: 1,
                },
              });
              return;
            }
            case 'authenticate': {
              send({ id: message.id, result: {} });
              return;
            }
            case 'session/load': {
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

  return { proc, requests };
};

const lastSpawnEnv = () => spawnCalls.at(-1)?.options?.env as NodeJS.ProcessEnv;

describe('spawnAgent', () => {
  beforeEach(() => {
    spawnCalls.length = 0;
    nextFakeProc = null;
    platformMock.mockReturnValue('linux');
    detectHeterogeneousCliCommandMock.mockResolvedValue({ available: true, path: 'traecli' });
    // Bridge detection: the first candidate wins — without an override env the
    // bare bridge command (`claude-agent-acp` / `codex-acp` / …) resolves.
    detectValidatedCommandCandidatesMock.mockImplementation(async (commands) => ({
      available: true,
      path: commands[0],
    }));
  });

  afterEach(async () => {
    nextFakeProc = null;
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  });

  it('runs Claude Code through the claude-agent-acp bridge and forwards the vendor CLI path', async () => {
    const fake = createStandardAcpProc({ sessionId: 'cc-acp-session' });
    nextFakeProc = fake.proc;
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'claude-code',
        operationId: 'op-1',
        prompt: 'do a thing',
      });

      const events: any[] = [];
      for await (const event of handle.events) events.push(event);
      await expect(handle.exit).resolves.toEqual({ code: 0, signal: null });

      // The bridge binary is the spawned process; the vendor CLI is forwarded
      // through CLAUDE_CODE_EXECUTABLE, never on the bridge argv.
      expect(spawnCalls[0]).toMatchObject({
        args: [],
        command: 'claude-agent-acp',
      });
      expect(lastSpawnEnv().CLAUDE_CODE_EXECUTABLE).toBe('claude');

      const methods = fake.requests.map(({ method }) => method).filter(Boolean);
      expect(methods).toEqual([
        'initialize',
        'session/new',
        'session/set_config_option',
        'session/prompt',
      ]);
      // Headless permission preset lands as a session config option.
      expect(
        fake.requests.find(({ method }) => method === 'session/set_config_option')?.params,
      ).toMatchObject({ configId: 'mode', sessionId: 'cc-acp-session' });
      // Prompt is an ACP content-block array on session/prompt, never argv/stdin text.
      expect(fake.requests.at(-1)?.params).toMatchObject({
        prompt: [{ text: 'do a thing', type: 'text' }],
        sessionId: 'cc-acp-session',
      });
      expect(handle.sessionId).toBe('cc-acp-session');
      expect(events.some(({ data }) => data?.content === 'ACP response')).toBe(true);
      expect(events).toContainEqual(expect.objectContaining({ type: 'agent_runtime_end' }));
      for (const event of events) expect(event.operationId).toBe('op-1');
    } finally {
      processKill.mockRestore();
    }
  });

  it('reports a missing ACP bridge binary before spawning anything', async () => {
    detectValidatedCommandCandidatesMock.mockResolvedValue({ available: false });

    const { spawnAgent } = await import('./spawnAgent');
    await expect(
      spawnAgent({ agentType: 'claude-code', operationId: 'op-1', prompt: 'hi' }),
    ).rejects.toThrow(/claude-agent-acp/);
    expect(spawnCalls).toHaveLength(0);
  });

  it('honors a custom vendor --command override through the bridge env', async () => {
    const fake = createStandardAcpProc();
    nextFakeProc = fake.proc;
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'claude-code',
        command: '/usr/local/bin/claude-wrapped',
        operationId: 'op-1',
        prompt: 'hi',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      expect(spawnCalls[0].command).toBe('claude-agent-acp');
      expect(lastSpawnEnv().CLAUDE_CODE_EXECUTABLE).toBe('/usr/local/bin/claude-wrapped');
    } finally {
      processKill.mockRestore();
    }
  });

  it('sends image prompt blocks through session/prompt', async () => {
    const fake = createStandardAcpProc();
    nextFakeProc = fake.proc;
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const pngBytes = Buffer.from('89504e470d0a1a0a00', 'hex');
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'claude-code',
        operationId: 'op-1',
        prompt: [
          { text: 'describe this', type: 'text' },
          {
            source: { data: pngBytes.toString('base64'), mediaType: 'image/png', type: 'base64' },
            type: 'image',
          },
        ],
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      const promptParams = fake.requests.find(({ method }) => method === 'session/prompt')?.params;
      expect(promptParams?.prompt).toEqual([
        { text: 'describe this', type: 'text' },
        expect.objectContaining({ type: 'image' }),
      ]);
    } finally {
      processKill.mockRestore();
    }
  });

  it('resumes a Claude Code session through ACP session/load', async () => {
    const fake = createStandardAcpProc();
    nextFakeProc = fake.proc;
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'claude-code',
        operationId: 'op-1',
        prompt: 'continue',
        resumeSessionId: 'cc-prev-123',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      const loadRequest = fake.requests.find(({ method }) => method === 'session/load');
      expect(loadRequest?.params).toMatchObject({ sessionId: 'cc-prev-123' });
      expect(handle.sessionId).toBe('cc-prev-123');
    } finally {
      processKill.mockRestore();
    }
  });

  it('inherits an outer wrapper process group instead of detaching again', async () => {
    const fake = createStandardAcpProc({ promptAutoComplete: false });
    nextFakeProc = fake.proc;
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'claude-code',
        detached: false,
        operationId: 'op-inherited-group',
        prompt: 'do a thing',
      });

      await vi.waitFor(() => {
        expect(fake.requests.some(({ method }) => method === 'session/prompt')).toBe(true);
      });
      expect(spawnCalls[0].options.detached).toBe(false);
      handle.kill('SIGKILL');
      // Non-detached: the child itself is signaled — no negative-pid group kill.
      expect(fake.proc.kill).toHaveBeenCalledWith('SIGKILL');
      expect(processKill).not.toHaveBeenCalled();
      await expect(handle.exit).resolves.toEqual({ code: null, signal: 'SIGKILL' });
    } finally {
      processKill.mockRestore();
    }
  });

  it('runs Grok Build through ACP and exposes its native session to CLI callers', async () => {
    const fake = createGrokAcpProc();
    nextFakeProc = fake.proc;
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const { spawnAgent } = await import('./spawnAgent');
    const handle = await spawnAgent({
      agentType: 'grok-build',
      extraArgs: ['--model', 'grok-build'],
      operationId: 'op-grok',
      prompt: 'do a thing',
    });

    const events: any[] = [];
    for await (const event of handle.events) events.push(event);
    await expect(handle.exit).resolves.toEqual({ code: 0, signal: null });

    expect(spawnCalls[0]).toMatchObject({
      args: [
        '--no-auto-update',
        'agent',
        '--no-leader',
        '--always-approve',
        '--model',
        'grok-build',
        'stdio',
      ],
      command: 'grok',
    });
    expect(fake.requests.map(({ method }) => method)).toEqual([
      'initialize',
      'authenticate',
      'session/new',
      'session/prompt',
    ]);
    expect(fake.requests.at(-1)?.params).toMatchObject({
      prompt: [{ text: 'do a thing', type: 'text' }],
      sessionId: 'grok-cli-session',
    });
    expect(handle.sessionId).toBe('grok-cli-session');
    expect(events.some(({ data }) => data?.content === 'done')).toBe(true);
    expect(events.at(-1)).toMatchObject({
      data: { reason: 'complete', transport: 'acp-stdio' },
      type: 'agent_runtime_end',
    });

    processKill.mockRestore();
  });

  it('preserves SIGKILL when force-stopping a Grok ACP run', async () => {
    const fake = createGrokAcpProc({ promptAutoComplete: false });
    nextFakeProc = fake.proc;
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const { spawnAgent } = await import('./spawnAgent');
    const handle = await spawnAgent({
      agentType: 'grok-build',
      operationId: 'op-grok-force-stop',
      prompt: 'keep running',
    });
    await vi.waitFor(() => {
      expect(fake.requests.some(({ method }) => method === 'session/prompt')).toBe(true);
    });

    handle.kill('SIGKILL');

    expect(processKill).toHaveBeenCalledWith(-54_321, 'SIGKILL');
    await expect(handle.exit).resolves.toEqual({ code: null, signal: 'SIGKILL' });
    processKill.mockRestore();
  });

  it('preserves SIGINT when the transport fails during graceful cancellation', async () => {
    const fake = createGrokAcpProc({ promptAutoComplete: false });
    nextFakeProc = fake.proc;
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const { spawnAgent } = await import('./spawnAgent');
    const handle = await spawnAgent({
      agentType: 'grok-build',
      operationId: 'op-grok-interrupted-failure',
      prompt: 'keep running',
    });
    await vi.waitFor(() => {
      expect(fake.requests.some(({ method }) => method === 'session/prompt')).toBe(true);
    });

    handle.kill('SIGINT');
    fake.proc.emit('close', 1, null);

    await expect(handle.exit).resolves.toEqual({ code: null, signal: 'SIGINT' });
    await expect(
      (async () => {
        for await (const _event of handle.events) {
          // Host cancellation ends the event stream without a transport error.
        }
      })(),
    ).resolves.toBeUndefined();
    processKill.mockRestore();
  });

  it('ends the Grok event iterable normally after emitting a structured ACP request error', async () => {
    const fake = createGrokAcpProc({ loadError: true });
    nextFakeProc = fake.proc;
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const { spawnAgent } = await import('./spawnAgent');
    const handle = await spawnAgent({
      agentType: 'grok-build',
      operationId: 'op-grok-resume',
      prompt: 'continue',
      resumeSessionId: 'missing-session',
    });

    const events: any[] = [];
    for await (const event of handle.events) events.push(event);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      data: {
        agentType: 'grok-build',
        details: { data: { code: 'FS_NOT_FOUND' }, method: 'session/load' },
      },
      type: 'error',
    });
    await expect(handle.exit).resolves.toEqual({ code: 1, signal: null });
    processKill.mockRestore();
  });

  it('fails before spawn when the configured working directory no longer exists', async () => {
    const missingCwd = path.join(os.tmpdir(), `orvilo-missing-cwd-${Date.now()}`);
    const { spawnAgent } = await import('./spawnAgent');

    await expect(
      spawnAgent({
        agentType: 'codex',
        cwd: missingCwd,
        operationId: 'op-missing-cwd',
        prompt: 'hello',
      }),
    ).rejects.toMatchObject({
      code: 'HETERO_WORKING_DIRECTORY_NOT_FOUND',
      workingDirectory: missingCwd,
    });
    expect(spawnCalls).toHaveLength(0);
  });

  it('runs Cursor through ACP with native args and an ACP-native resume id', async () => {
    const fake = createCursorAcpProc();
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const { spawnAgent } = await import('./spawnAgent');
    const handle = await spawnAgent({
      agentType: 'cursor',
      extraArgs: ['--model', 'sonnet', '--mode', 'plan'],
      operationId: 'op-cursor',
      prompt: 'do a thing',
      resumeSessionId: 'cursor-session',
    });
    const events = [];
    for await (const event of handle.events) events.push(event);
    await expect(handle.exit).resolves.toEqual({ code: 0, signal: null });

    expect(spawnCalls[0]).toMatchObject({
      args: ['--model', 'sonnet', '--mode', 'plan', 'acp'],
      command: 'agent',
    });
    expect(fake.requests.map(({ method }) => method).filter(Boolean)).toEqual([
      'initialize',
      'authenticate',
      'session/load',
      'session/prompt',
    ]);
    expect(fake.requests.find(({ method }) => method === 'session/prompt')?.params).toEqual({
      prompt: [{ text: 'do a thing', type: 'text' }],
      sessionId: 'cursor-session',
    });
    expect(handle.sessionId).toBe('cursor-session');
    expect(events).toContainEqual(expect.objectContaining({ type: 'agent_runtime_end' }));
    killSpy.mockRestore();
  });

  it('runs Devin through ACP behind the standard handle contract', async () => {
    const fake = createStandardAcpProc({
      responseText: 'Devin response',
      sessionId: 'devin-session-1',
    });
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'devin',
        extraArgs: ['--model', 'sonnet'],
        initialModel: 'sonnet',
        operationId: 'op-devin',
        prompt: 'do a thing',
      });
      const events = [];
      for await (const event of handle.events) events.push(event);

      await expect(handle.exit).resolves.toEqual({ code: 0, signal: null });
      expect(spawnCalls[0]).toMatchObject({
        args: ['acp', '--model', 'sonnet'],
        command: 'devin',
      });
      expect(fake.requests.map(({ method }) => method).filter(Boolean)).toEqual([
        'initialize',
        'session/new',
        'session/set_config_option',
        'session/prompt',
      ]);
      expect(
        fake.requests.find(({ method }) => method === 'session/set_config_option')?.params,
      ).toEqual({
        configId: 'model',
        sessionId: 'devin-session-1',
        value: 'sonnet',
      });
      expect(handle.sessionId).toBe('devin-session-1');
      expect(events).toContainEqual(expect.objectContaining({ type: 'agent_runtime_end' }));
    } finally {
      killSpy.mockRestore();
    }
  });

  it('applies a permission mode through ACP session/set_config_option', async () => {
    const fake = createStandardAcpProc({
      responseText: 'Devin response',
      sessionId: 'devin-session-1',
    });
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'devin',
        extraArgs: ['--model', 'sonnet'],
        initialModel: 'sonnet',
        operationId: 'op-devin',
        permissionMode: 'bypass',
        prompt: 'do a thing',
      });
      const events = [];
      for await (const event of handle.events) events.push(event);

      await expect(handle.exit).resolves.toEqual({ code: 0, signal: null });
      expect(spawnCalls[0]).toMatchObject({
        args: ['acp', '--model', 'sonnet'],
        command: 'devin',
      });
      const setConfigRequests = fake.requests.filter(
        ({ method }) => method === 'session/set_config_option',
      );
      expect(setConfigRequests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            params: { configId: 'mode', sessionId: 'devin-session-1', value: 'bypass' },
          }),
        ]),
      );
      expect(handle.sessionId).toBe('devin-session-1');
      expect(events).toContainEqual(expect.objectContaining({ type: 'agent_runtime_end' }));
    } finally {
      killSpy.mockRestore();
    }
  });

  it('runs TRAE through ACP behind the standard handle contract', async () => {
    const fake = createStandardAcpProc({
      responseText: 'TRAE response',
      sessionId: 'trae-session-1',
    });
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'trae',
        extraArgs: ['--feature=test'],
        initialModel: 'gpt-5.4',
        operationId: 'op-trae',
        prompt: 'do a thing',
      });

      const events: any[] = [];
      for await (const event of handle.events) events.push(event);

      await expect(handle.exit).resolves.toEqual({ code: 0, signal: null });
      expect(detectHeterogeneousCliCommandMock).toHaveBeenCalledWith(
        'trae',
        'traecli',
        expect.objectContaining({ PATH: process.env.PATH }),
      );
      expect(spawnCalls[0]).toMatchObject({
        args: ['acp', 'serve', '--yolo', '--feature=test'],
        command: 'traecli',
      });
      expect(fake.requests.map((request) => request.method)).toEqual([
        'initialize',
        'session/new',
        'session/set_config_option',
        'session/prompt',
      ]);
      expect(handle.sessionId).toBe('trae-session-1');
      expect(
        events.some(
          (event) =>
            event.type === 'stream_chunk' &&
            event.data?.chunkType === 'text' &&
            event.data?.content === 'TRAE response',
        ),
      ).toBe(true);
    } finally {
      killSpy.mockRestore();
    }
  });

  it('runs Factory Droid through its fixed safe ACP invocation', async () => {
    const fake = createStandardAcpProc({
      responseText: 'Droid response',
      sessionId: 'droid-session-1',
    });
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'droid',
        extraArgs: ['--tag', 'orvilo'],
        initialModel: 'gpt-5.4',
        operationId: 'op-droid',
        prompt: 'do a thing',
      });

      const events: any[] = [];
      for await (const event of handle.events) events.push(event);

      await expect(handle.exit).resolves.toEqual({ code: 0, signal: null });
      expect(spawnCalls[0]).toMatchObject({
        args: ['exec', '--output-format', 'acp', '--tag', 'orvilo'],
        command: 'droid',
      });
      expect(fake.requests.map((request) => request.method)).toEqual([
        'initialize',
        'session/new',
        'session/set_config_option',
        'session/prompt',
      ]);
      expect(handle.sessionId).toBe('droid-session-1');
      expect(
        events.some(
          (event) =>
            event.type === 'stream_chunk' &&
            event.data?.chunkType === 'text' &&
            event.data?.content === 'Droid response',
        ),
      ).toBe(true);
      expect(events.find((event) => event.type === 'stream_start')?.data?.provider).toBe('droid');
    } finally {
      killSpy.mockRestore();
    }
  });

  it('preserves SIGKILL when force-stopping a TRAE ACP run', async () => {
    const fake = createStandardAcpProc({ promptAutoComplete: false });
    nextFakeProc = fake.proc;
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'trae',
        operationId: 'op-trae-force-stop',
        prompt: 'keep running',
      });
      await vi.waitFor(() => {
        expect(fake.requests.some(({ method }) => method === 'session/prompt')).toBe(true);
      });

      handle.kill('SIGKILL');

      // The ACP spawn bridge reports host kills as signal exits, uniformly
      // across ACP agents.
      expect(processKill).toHaveBeenCalledWith(-12_345, 'SIGKILL');
      await expect(handle.exit).resolves.toEqual({ code: null, signal: 'SIGKILL' });
    } finally {
      processKill.mockRestore();
    }
  });

  it('allows the official canonical trae-cli command to run through ACP', async () => {
    const fake = createStandardAcpProc();
    nextFakeProc = fake.proc;
    detectHeterogeneousCliCommandMock.mockResolvedValue({
      available: true,
      path: '/usr/local/bin/trae-cli',
    });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'trae',
        command: 'trae-cli',
        env: { PATH: '/custom/node/bin' },
        operationId: 'op-trae',
        prompt: 'do a thing',
      });

      for await (const _event of handle.events) {
        // Consume the ACP session to completion.
      }
      await expect(handle.exit).resolves.toEqual({ code: 0, signal: null });
      expect(spawnCalls[0]).toMatchObject({
        args: ['acp', 'serve', '--yolo'],
        command: '/usr/local/bin/trae-cli',
        options: { env: { PATH: '/custom/node/bin' } },
      });
      expect(detectHeterogeneousCliCommandMock).toHaveBeenCalledWith(
        'trae',
        'trae-cli',
        expect.objectContaining({ PATH: '/custom/node/bin' }),
      );
    } finally {
      killSpy.mockRestore();
    }
  });

  it('resolves a relative TRAE command against the child working directory before probing', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'orvilo-trae-cwd-'));
    tempDirs.push(cwd);
    const relativeCommand = './bin/traecli';
    const resolvedCommand = path.resolve(cwd, relativeCommand);
    const fake = createStandardAcpProc();
    nextFakeProc = fake.proc;
    detectHeterogeneousCliCommandMock.mockImplementationOnce(async (_agentType, command) => ({
      available: true,
      path: command,
    }));
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'trae',
        command: relativeCommand,
        cwd,
        operationId: 'op-trae-relative',
        prompt: 'do a thing',
      });

      for await (const _event of handle.events) {
        // Consume the ACP session to completion.
      }
      await expect(handle.exit).resolves.toEqual({ code: 0, signal: null });
      expect(detectHeterogeneousCliCommandMock).toHaveBeenCalledWith(
        'trae',
        resolvedCommand,
        expect.objectContaining({ PATH: process.env.PATH }),
      );
      expect(spawnCalls[0]).toMatchObject({
        command: resolvedCommand,
        options: { cwd },
      });
    } finally {
      killSpy.mockRestore();
    }
  });

  it('rejects a custom TRAE command that does not expose the ACP runtime', async () => {
    detectHeterogeneousCliCommandMock.mockResolvedValue({ available: false });

    const { spawnAgent } = await import('./spawnAgent');

    await expect(
      spawnAgent({
        agentType: 'trae',
        command: 'trae-cli',
        operationId: 'op-trae',
        prompt: 'do a thing',
      }),
    ).rejects.toThrow('TRAE command does not expose the required ACP runtime: trae-cli');
    expect(detectHeterogeneousCliCommandMock).toHaveBeenCalledWith(
      'trae',
      'trae-cli',
      expect.objectContaining({ PATH: process.env.PATH }),
    );
    expect(spawnCalls).toHaveLength(0);
  });

  it('runs Kimi Code through its native `kimi acp` mode with user args after the prefix', async () => {
    const fake = createStandardAcpProc({ sessionId: 'kimi-acp-session' });
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'kimi-code',
        extraArgs: ['--verbose'],
        operationId: 'op-kimi',
        prompt: 'hello kimi',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await expect(handle.exit).resolves.toEqual({ code: 0, signal: null });

      expect(spawnCalls[0]).toMatchObject({
        args: ['acp', '--verbose'],
        command: 'kimi',
      });
      expect(handle.sessionId).toBe('kimi-acp-session');
    } finally {
      killSpy.mockRestore();
    }
  });

  it('lifts a --model selector onto the ACP session instead of the kimi argv', async () => {
    const fake = createStandardAcpProc({
      modelOptions: [{ name: 'Kimi for Coding', value: 'kimi-for-coding' }],
    });
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'kimi-code',
        extraArgs: ['--model', 'kimi-for-coding'],
        operationId: 'op-kimi-model',
        prompt: 'hello',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      // Selector lifted: argv keeps only the ACP prefix, the model is applied
      // through session/set_config_option.
      expect(spawnCalls[0].args).toEqual(['acp']);
      const setConfig = fake.requests.find(({ method }) => method === 'session/set_config_option');
      expect(setConfig?.params).toMatchObject({ configId: 'model', value: 'kimi-for-coding' });
    } finally {
      killSpy.mockRestore();
    }
  });

  it('runs Qoder through its native `qoder --acp` mode and resumes via session/load', async () => {
    const fake = createStandardAcpProc();
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'qoder',
        operationId: 'op-qoder',
        prompt: 'continue with Qoder',
        resumeSessionId: 'qoder-prev-123',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      expect(spawnCalls[0]).toMatchObject({
        args: ['--acp'],
        command: 'qodercli',
      });
      expect(fake.requests.find(({ method }) => method === 'session/load')?.params).toMatchObject({
        sessionId: 'qoder-prev-123',
      });
    } finally {
      killSpy.mockRestore();
    }
  });

  it('runs CodeBuddy through its native `codebuddy --acp` mode', async () => {
    const fake = createStandardAcpProc();
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'codebuddy',
        operationId: 'op-codebuddy',
        prompt: 'continue',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      expect(spawnCalls[0]).toMatchObject({
        args: ['--acp'],
        command: 'codebuddy',
      });
      expect(fake.requests.map(({ method }) => method).filter(Boolean)).toEqual([
        'initialize',
        'session/new',
        'session/prompt',
      ]);
    } finally {
      killSpy.mockRestore();
    }
  });

  it('runs OpenCode through its native `opencode acp` mode', async () => {
    const fake = createStandardAcpProc();
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'opencode',
        operationId: 'op-open',
        prompt: 'hello opencode',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      expect(spawnCalls[0]).toMatchObject({
        args: ['acp'],
        command: 'opencode',
      });
    } finally {
      killSpy.mockRestore();
    }
  });

  it('runs Amp through the amp-acp bridge with the vendor CLI forwarded', async () => {
    const fake = createStandardAcpProc();
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'amp',
        operationId: 'op-amp',
        prompt: 'hello',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      expect(spawnCalls[0]).toMatchObject({ args: [], command: 'amp-acp' });
      expect(lastSpawnEnv().AMP_CLI_PATH).toBe('amp');
      // The bypass posture lands as a session config option.
      expect(
        fake.requests.find(({ method }) => method === 'session/set_config_option')?.params,
      ).toMatchObject({ configId: 'permission', value: 'bypass' });
    } finally {
      killSpy.mockRestore();
    }
  });

  it('runs Codex through the codex-acp bridge and resumes via session/load', async () => {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), 'lobe-codex-spawn-'));
    tempDirs.push(codexHome);
    const threadId = '019dba1e-eec2-7a22-bdfb-ac6175e03081';
    const sessionDir = path.join(codexHome, 'sessions', '2026', '06', '11');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      path.join(sessionDir, `rollout-2026-06-11T01-31-27-${threadId}.jsonl`),
      JSON.stringify({
        type: 'turn.completed',
        usage: { cached_input_tokens: 42_000, input_tokens: 51_000, output_tokens: 300 },
      }),
    );

    const fake = createStandardAcpProc();
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'codex',
        env: { CODEX_HOME: codexHome },
        operationId: 'op-codex',
        prompt: 'continue',
        resumeSessionId: threadId,
      });
      for await (const _event of handle.events) {
        // drain
      }
      await expect(handle.exit).resolves.toEqual({ code: 0, signal: null });

      expect(spawnCalls[0]).toMatchObject({ args: [], command: 'codex-acp' });
      expect(lastSpawnEnv().CODEX_PATH).toBe('codex');
      expect(lastSpawnEnv().CODEX_HOME).toBe(codexHome);
      expect(fake.requests.find(({ method }) => method === 'session/load')?.params).toMatchObject({
        sessionId: threadId,
      });
      // Agent-full-access posture lands as a session config option.
      expect(
        fake.requests.find(({ method }) => method === 'session/set_config_option')?.params,
      ).toMatchObject({ configId: 'mode', value: 'agent-full-access' });
      expect(handle.sessionId).toBe(threadId);
    } finally {
      killSpy.mockRestore();
    }
  });

  it('maps codex -c reasoning/service-tier selectors onto ACP config options', async () => {
    const fake = createStandardAcpProc({
      extraConfigOptions: [
        {
          id: 'reasoning_effort',
          name: 'Reasoning Effort',
          options: [
            { name: 'High', value: 'high' },
            { name: 'Extra High', value: 'xhigh' },
          ],
          type: 'select',
        },
        {
          id: 'fast-mode',
          name: 'Fast Mode',
          options: [
            { name: 'Off', value: 'off' },
            { name: 'On', value: 'on' },
          ],
          type: 'select',
        },
      ],
      modelOptions: [{ name: 'GPT 5.5', value: 'gpt-5.5' }],
    });
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'codex',
        extraArgs: [
          '--model',
          'gpt-5.5',
          '-c',
          'model_reasoning_effort="xhigh"',
          '-c',
          'service_tier="fast"',
        ],
        operationId: 'op-codex-selectors',
        prompt: 'hello',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      // Bridge argv stays empty — selectors ride the session-config surface.
      expect(spawnCalls[0].args).toEqual([]);
      const configValues = fake.requests
        .filter(({ method }) => method === 'session/set_config_option')
        .map(({ params }) => [params?.configId, params?.value]);
      expect(configValues).toEqual(
        expect.arrayContaining([
          ['reasoning_effort', 'xhigh'],
          ['fast-mode', 'on'],
        ]),
      );
    } finally {
      killSpy.mockRestore();
    }
  });

  it('lifts an amp --mode selector onto the advertised amp-mode config option', async () => {
    const fake = createStandardAcpProc({
      extraConfigOptions: [
        {
          id: 'amp-mode',
          name: 'Amp Mode',
          options: [
            { name: 'Medium', value: 'medium' },
            { name: 'High', value: 'high' },
          ],
          type: 'select',
        },
      ],
    });
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'amp',
        extraArgs: ['--mode', 'high'],
        operationId: 'op-amp-mode',
        prompt: 'hello',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      // The bridge argv stays clean — the selector rides the session surface.
      expect(spawnCalls[0]).toMatchObject({ args: [], command: 'amp-acp' });
      const configValues = fake.requests
        .filter(({ method }) => method === 'session/set_config_option')
        .map(({ params }) => [params?.configId, params?.value]);
      expect(configValues).toEqual(
        expect.arrayContaining([
          ['permission', 'bypass'],
          ['amp-mode', 'high'],
        ]),
      );
    } finally {
      killSpy.mockRestore();
    }
  });

  it('lifts a claude-code --effort selector onto the advertised effort config option', async () => {
    const fake = createStandardAcpProc({
      extraConfigOptions: [
        {
          id: 'effort',
          name: 'Effort',
          options: [
            { name: 'Medium', value: 'medium' },
            { name: 'High', value: 'high' },
          ],
          type: 'select',
        },
      ],
    });
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'claude-code',
        extraArgs: ['--effort', 'high'],
        operationId: 'op-cc-effort',
        prompt: 'hello',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      const configValues = fake.requests
        .filter(({ method }) => method === 'session/set_config_option')
        .map(({ params }) => [params?.configId, params?.value]);
      expect(configValues).toEqual(expect.arrayContaining([['effort', 'high']]));
    } finally {
      killSpy.mockRestore();
    }
  });

  it('skips a selector config option the agent never advertised and notes it on stderr', async () => {
    // The fake advertises only `model`; `effort` is not in the vocabulary.
    const fake = createStandardAcpProc();
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'claude-code',
        extraArgs: ['--effort', 'high'],
        operationId: 'op-cc-effort-skip',
        prompt: 'hello',
      });
      const stderrChunks: string[] = [];
      handle.stderr.on('data', (chunk) => stderrChunks.push(String(chunk)));
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      const configIds = fake.requests
        .filter(({ method }) => method === 'session/set_config_option')
        .map(({ params }) => params?.configId);
      expect(configIds).not.toContain('effort');
      // The required permission preset still lands unconditionally.
      expect(configIds).toContain('mode');
      expect(stderrChunks.join('')).toContain('skipped session config option "effort=high"');
    } finally {
      killSpy.mockRestore();
    }
  });

  it('runs Pi through the pi-acp bridge and folds --provider into the model selector', async () => {
    const fake = createStandardAcpProc({
      modelOptions: [{ name: 'Claude Sonnet 4.5', value: 'anthropic/claude-sonnet-4-5' }],
    });
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'pi',
        extraArgs: ['--provider', 'anthropic', '--model', 'claude-sonnet-4-5'],
        operationId: 'op-pi',
        prompt: 'continue',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      expect(spawnCalls[0]).toMatchObject({ args: [], command: 'pi-acp' });
      expect(lastSpawnEnv().PI_ACP_PI_COMMAND).toBe('pi');
      const setConfig = fake.requests.find(({ method }) => method === 'session/set_config_option');
      expect(setConfig?.params).toMatchObject({
        configId: 'model',
        value: 'anthropic/claude-sonnet-4-5',
      });
    } finally {
      killSpy.mockRestore();
    }
  });

  it('mounts mcpServers on session/new for standard-ACP agents', async () => {
    const fake = createStandardAcpProc();
    nextFakeProc = fake.proc;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    try {
      const { spawnAgent } = await import('./spawnAgent');
      const handle = await spawnAgent({
        agentType: 'claude-code',
        mcpServers: [{ name: 'lobe_cc', type: 'http', url: 'http://127.0.0.1:9999/op' }],
        operationId: 'op-mcp',
        prompt: 'hi',
      });
      for await (const _event of handle.events) {
        // drain
      }
      await handle.exit;

      expect(
        fake.requests.find(({ method }) => method === 'session/new')?.params?.mcpServers,
      ).toEqual([{ name: 'lobe_cc', type: 'http', url: 'http://127.0.0.1:9999/op' }]);
    } finally {
      killSpy.mockRestore();
    }
  });

  it('rejects with an error on unknown agent type', async () => {
    nextFakeProc = createStandardAcpProc().proc;
    const { spawnAgent } = await import('./spawnAgent');
    await expect(
      spawnAgent({ agentType: 'kimi-cli', operationId: 'op-1', prompt: 'hi' }),
    ).rejects.toThrow('Unknown local heterogeneous agent type: "kimi-cli"');
  });
});
