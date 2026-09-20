import { EventEmitter } from 'node:events';
import { existsSync, statSync } from 'node:fs';
import { access, mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';

import type { CodexQuotaSnapshot } from '@orvilo/electron-client-ipc';
import { HeterogeneousAgentSessionErrorCode } from '@orvilo/electron-client-ipc';
import { HETERO_EXEC_INHERIT_PROCESS_GROUP_ENV } from '@orvilo/heterogeneous-agents/protocol';
import { AcpRpcResponseError, getAcpAgentRuntime } from '@orvilo/heterogeneous-agents/spawn';
// `electron` is mocked below; this binding is the mock object so tests can
// flip `isPackaged` to exercise the packaged-build tracing gate.
import { app as electronAppMock } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HeterogeneousAgentCtr, { redactPromptArgs } from '../HeterogeneousAgentImpl';

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof os>('node:os');
  return { ...actual, platform: vi.fn(() => 'linux') };
});

const platformMock = vi.mocked(os.platform);

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, existsSync: vi.fn(() => true), statSync: vi.fn() };
});

// Working-directory checks go through `statSync`; treat every path as an
// existing directory unless a test marks one as missing.
const asDirectory = { isDirectory: () => true } as ReturnType<typeof statSync>;
const mockMissingDir = (missing: string) =>
  vi
    .mocked(statSync)
    .mockImplementation((candidate) => (candidate === missing ? undefined : asDirectory) as never);

const FAKE_DESKTOP_PATH = '/Users/fake/Desktop';

describe('redactPromptArgs', () => {
  it('redacts separated and inline Kimi prompt values without changing unrelated arguments', () => {
    expect(
      redactPromptArgs(
        [
          '--prompt',
          'private',
          '--model',
          'x',
          '-p',
          'short-private',
          '-p=inline',
          '--prompt=other',
        ],
        'kimi-code',
      ),
    ).toEqual([
      '--prompt',
      '[REDACTED]',
      '--model',
      'x',
      '-p',
      '[REDACTED]',
      '-p=[REDACTED]',
      '--prompt=[REDACTED]',
    ]);
  });

  it.each(['claude-code', 'qoder'] as const)(
    'keeps the %s mode flag and its following input-format argument intact',
    (agentType) => {
      expect(
        redactPromptArgs(['-p', '--input-format', 'stream-json', '--prompt=private'], agentType),
      ).toEqual(['-p', '--input-format', 'stream-json', '--prompt=[REDACTED]']);
    },
  );
});

const { mockGetAllWindows } = vi.hoisted(() => ({
  mockGetAllWindows: vi.fn<() => any[]>(() => []),
}));

const { loggerInfoMock } = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => mockGetAllWindows() },
  app: {
    getAppPath: vi.fn(() => '/fake/appPath'),
    getVersion: vi.fn(() => '1.0.0-test'),
    getPath: vi.fn((name: string) => (name === 'desktop' ? FAKE_DESKTOP_PATH : `/fake/${name}`)),
    isPackaged: false,
    on: vi.fn(),
  },
  ipcMain: { handle: vi.fn() },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: loggerInfoMock,
    verbose: vi.fn(),
    warn: vi.fn(),
  }),
}));

const {
  cursorAcpSessionCloseMock,
  cursorAcpSessionConstructMock,
  cursorAcpSessionInterruptMock,
  cursorAcpSessionRunMock,
  droidAcpSessionCloseMock,
  droidAcpSessionConstructMock,
  droidAcpSessionInterruptMock,
  droidAcpSessionRunMock,
  devinAcpSessionCloseMock,
  devinAcpSessionConstructMock,
  devinAcpSessionInterruptMock,
  devinAcpSessionRunMock,
  grokAcpSessionCloseMock,
  grokAcpSessionConstructMock,
  grokAcpSessionInterruptMock,
  grokAcpSessionRunMock,
  resolveAcpSpawnTargetMock,
  standardAcpSessionCloseMock,
  standardAcpSessionConstructMock,
  standardAcpSessionInterruptMock,
  standardAcpSessionRunMock,
  traeAcpSessionCloseMock,
  traeAcpSessionConstructMock,
  traeAcpSessionInterruptMock,
  traeAcpSessionRunMock,
} = vi.hoisted(() => ({
  cursorAcpSessionCloseMock: vi.fn(),
  cursorAcpSessionConstructMock: vi.fn(),
  cursorAcpSessionInterruptMock: vi.fn(),
  cursorAcpSessionRunMock: vi.fn(),
  droidAcpSessionCloseMock: vi.fn(),
  droidAcpSessionConstructMock: vi.fn(),
  droidAcpSessionInterruptMock: vi.fn(),
  droidAcpSessionRunMock: vi.fn(),
  devinAcpSessionCloseMock: vi.fn(),
  devinAcpSessionConstructMock: vi.fn(),
  devinAcpSessionInterruptMock: vi.fn(),
  devinAcpSessionRunMock: vi.fn(),
  grokAcpSessionCloseMock: vi.fn(),
  grokAcpSessionConstructMock: vi.fn(),
  grokAcpSessionInterruptMock: vi.fn(),
  grokAcpSessionRunMock: vi.fn(),
  resolveAcpSpawnTargetMock: vi.fn(),
  standardAcpSessionCloseMock: vi.fn(),
  standardAcpSessionConstructMock: vi.fn(),
  standardAcpSessionInterruptMock: vi.fn(),
  standardAcpSessionRunMock: vi.fn(),
  traeAcpSessionCloseMock: vi.fn(),
  traeAcpSessionConstructMock: vi.fn(),
  traeAcpSessionInterruptMock: vi.fn(),
  traeAcpSessionRunMock: vi.fn(),
}));

vi.mock('@orvilo/heterogeneous-agents/spawn', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  /**
   * Shared stand-in for every `ACP_RUNTIME_AGENT_TYPES` session. The real
   * `createStandardAcpSession` injects the agent's runtime spec + ACP argv
   * through a config object; the mock mirrors that so tests can assert both
   * the forwarded options and the resolved spec/args.
   */
  class MockStandardAcpSession {
    constructor(
      private readonly options: any,
      private readonly config: any,
    ) {
      standardAcpSessionConstructMock(this.config.agentType, this.options, this.config);
    }

    close() {
      standardAcpSessionCloseMock();
    }

    interrupt() {
      return standardAcpSessionInterruptMock();
    }

    async run() {
      if (standardAcpSessionRunMock.getMockImplementation()) {
        return standardAcpSessionRunMock(this.options, this.config);
      }
      const now = Date.now();
      const transport = this.config.spec.transport;
      this.options.onRuntimeStatus({
        activeTasks: [],
        lastEventAt: now,
        operationId: this.options.operationId,
        sessionId: this.options.sessionId,
        state: 'running',
        transport,
      });
      this.options.onSessionId(`${this.config.agentType}-native-session`);
      await this.options.onEvents([
        {
          data: { stopReason: 'end_turn' },
          operationId: this.options.operationId,
          stepIndex: 0,
          timestamp: now,
          type: 'agent_runtime_end',
        },
      ]);
      this.options.onRuntimeStatus({
        activeTasks: [],
        lastEventAt: now,
        operationId: this.options.operationId,
        sessionId: this.options.sessionId,
        state: 'closed',
        transport,
      });
    }
  }

  class MockGrokAcpSession {
    constructor(private readonly options: any) {
      grokAcpSessionConstructMock(options);
    }

    close() {
      grokAcpSessionCloseMock();
    }

    interrupt() {
      return grokAcpSessionInterruptMock();
    }

    run() {
      return grokAcpSessionRunMock(this.options);
    }
  }

  class MockCursorAcpSession {
    constructor(private readonly options: any) {
      cursorAcpSessionConstructMock(options);
    }

    close() {
      cursorAcpSessionCloseMock();
    }

    interrupt() {
      return cursorAcpSessionInterruptMock();
    }

    async run() {
      if (cursorAcpSessionRunMock.getMockImplementation()) {
        return cursorAcpSessionRunMock(this.options);
      }
      const now = Date.now();
      this.options.onRuntimeStatus({
        activeTasks: [],
        lastEventAt: now,
        operationId: this.options.operationId,
        sessionId: this.options.sessionId,
        state: 'running',
        transport: 'cursor-acp',
      });
      this.options.onSessionId('cursor-session-1');
      await this.options.onEvents([
        {
          data: { stopReason: 'end_turn' },
          operationId: this.options.operationId,
          stepIndex: 0,
          timestamp: now,
          type: 'agent_runtime_end',
        },
      ]);
      this.options.onRuntimeStatus({
        activeTasks: [],
        lastEventAt: now,
        operationId: this.options.operationId,
        sessionId: this.options.sessionId,
        state: 'closed',
        transport: 'cursor-acp',
      });
    }
  }

  class MockDevinAcpSession {
    constructor(private readonly options: any) {
      devinAcpSessionConstructMock(options);
    }

    close() {
      devinAcpSessionCloseMock();
    }

    interrupt() {
      return devinAcpSessionInterruptMock();
    }

    async run() {
      if (devinAcpSessionRunMock.getMockImplementation()) {
        return devinAcpSessionRunMock(this.options);
      }
      const now = Date.now();
      this.options.onRuntimeStatus({
        activeTasks: [],
        lastEventAt: now,
        operationId: this.options.operationId,
        sessionId: this.options.sessionId,
        state: 'running',
        transport: 'devin-acp',
      });
      this.options.onSessionId('devin-session-1');
      this.options.onModel?.('claude-sonnet-4-6-thinking');
      await this.options.onEvents([
        {
          data: { stopReason: 'end_turn' },
          operationId: this.options.operationId,
          stepIndex: 0,
          timestamp: now,
          type: 'agent_runtime_end',
        },
      ]);
      this.options.onRuntimeStatus({
        activeTasks: [],
        lastEventAt: now,
        operationId: this.options.operationId,
        sessionId: this.options.sessionId,
        state: 'closed',
        transport: 'devin-acp',
      });
    }
  }

  class MockTraeAcpSession {
    constructor(private readonly options: any) {
      traeAcpSessionConstructMock(options);
    }

    close() {
      traeAcpSessionCloseMock();
    }

    async interrupt() {
      return traeAcpSessionInterruptMock();
    }

    async run() {
      if (traeAcpSessionRunMock.getMockImplementation()) {
        return traeAcpSessionRunMock(this.options);
      }
      const now = Date.now();
      this.options.onRuntimeStatus({
        activeTasks: [],
        lastEventAt: now,
        operationId: this.options.operationId,
        sessionId: this.options.sessionId,
        state: 'running',
        transport: 'trae-acp',
      });
      this.options.onSessionId('trae_session_1');
      await this.options.onEvents([
        {
          data: { stopReason: 'end_turn' },
          operationId: this.options.operationId,
          stepIndex: 0,
          timestamp: now,
          type: 'agent_runtime_end',
        },
      ]);
      this.options.onRuntimeStatus({
        activeTasks: [],
        lastEventAt: now,
        operationId: this.options.operationId,
        sessionId: this.options.sessionId,
        state: 'closed',
        transport: 'trae-acp',
      });
    }
  }

  class MockDroidAcpSession {
    constructor(private readonly options: any) {
      droidAcpSessionConstructMock(options);
    }

    close() {
      droidAcpSessionCloseMock();
    }

    interrupt() {
      return droidAcpSessionInterruptMock();
    }

    async run() {
      if (droidAcpSessionRunMock.getMockImplementation()) {
        return droidAcpSessionRunMock(this.options);
      }
      const now = Date.now();
      this.options.onRuntimeStatus({
        activeTasks: [],
        lastEventAt: now,
        operationId: this.options.operationId,
        sessionId: this.options.sessionId,
        state: 'running',
        transport: 'droid-acp',
      });
      this.options.onSessionId('droid_session_1');
      await this.options.onEvents([
        {
          data: { stopReason: 'end_turn' },
          operationId: this.options.operationId,
          stepIndex: 0,
          timestamp: now,
          type: 'agent_runtime_end',
        },
      ]);
    }
  }

  return {
    ...actual,
    createStandardAcpSession: (agentType: string, options: any) =>
      new MockStandardAcpSession(options, {
        agentType,
        args: [
          ...(options.commandArgs ?? []),
          ...(actual as any).buildStandardAcpArgs(agentType, options.args),
        ],
        configOptions: options.configOptions ?? [],
        spec: (actual as any).getAcpAgentRuntime(agentType),
      }),
    CursorAcpSession: MockCursorAcpSession,
    DroidAcpSession: MockDroidAcpSession,
    DevinAcpSession: MockDevinAcpSession,
    GrokAcpSession: MockGrokAcpSession,
    // Bridge detection shells out to the filesystem; tests stub the resolver
    // instead so no `*-acp` binary has to exist on the runner.
    resolveAcpSpawnTarget: (...args: any[]) => resolveAcpSpawnTargetMock(...args),
    // Codex cumulative-usage seeding probes the real CLI; never do that in tests.
    readCodexSessionModel: vi.fn(async () => undefined),
    TraeAcpSession: MockTraeAcpSession,
  };
});

const { consumeCodexRateLimitResetCreditMock, fetchCodexQuotaMock } = vi.hoisted(() => ({
  consumeCodexRateLimitResetCreditMock: vi.fn(),
  fetchCodexQuotaMock: vi.fn(),
}));

vi.mock('@/modules/heterogeneousAgent/codexQuota', () => ({
  consumeCodexRateLimitResetCredit: consumeCodexRateLimitResetCreditMock,
  fetchCodexQuota: fetchCodexQuotaMock,
}));

// Captures the most recent spawn() call so sendPrompt tests can assert on argv.
const spawnCalls: Array<{ args: string[]; command: string; options: any }> = [];
let nextFakeProc: any = null;
const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    execFile: execFileMock,
    spawn: (command: string, args: string[], options: any) => {
      spawnCalls.push({ args, command, options });
      nextFakeProc?.__start?.();
      return nextFakeProc;
    },
  };
});

describe('HeterogeneousAgentCtr', () => {
  let appStoragePath: string;

  beforeEach(async () => {
    appStoragePath = await mkdtemp(path.join(os.tmpdir(), 'orvilo-hetero-'));
    consumeCodexRateLimitResetCreditMock.mockReset();
    fetchCodexQuotaMock.mockReset();
    standardAcpSessionCloseMock.mockReset();
    standardAcpSessionConstructMock.mockReset();
    standardAcpSessionInterruptMock.mockReset();
    standardAcpSessionInterruptMock.mockResolvedValue(true);
    standardAcpSessionRunMock.mockReset();
    resolveAcpSpawnTargetMock.mockReset();
    // Default target resolution: natives keep the vendor command (+ ACP
    // prefix); bridges get a deterministic stand-in path and the vendor
    // command forwarded through the bridge's native-command env contract.
    resolveAcpSpawnTargetMock.mockImplementation(
      async (agentType: string, vendorCommand: string, env: NodeJS.ProcessEnv = {}) => {
        const spec = getAcpAgentRuntime(agentType);
        if (!spec) throw new Error(`No ACP runtime is registered for agent type "${agentType}"`);
        if (!spec.bridge) {
          return { commandArgs: [], commandPath: vendorCommand, env };
        }
        return {
          commandArgs: [],
          commandPath: `/mock-bridges/${spec.bridge.command}`,
          env: { ...env, [spec.bridge.nativeCommandEnv]: vendorCommand },
        };
      },
    );
    cursorAcpSessionCloseMock.mockReset();
    cursorAcpSessionConstructMock.mockReset();
    cursorAcpSessionInterruptMock.mockReset();
    cursorAcpSessionInterruptMock.mockResolvedValue(true);
    cursorAcpSessionRunMock.mockReset();
    devinAcpSessionCloseMock.mockReset();
    devinAcpSessionConstructMock.mockReset();
    devinAcpSessionInterruptMock.mockReset();
    devinAcpSessionInterruptMock.mockResolvedValue(true);
    devinAcpSessionRunMock.mockReset();
    grokAcpSessionCloseMock.mockReset();
    grokAcpSessionConstructMock.mockReset();
    grokAcpSessionInterruptMock.mockReset();
    grokAcpSessionInterruptMock.mockResolvedValue(true);
    grokAcpSessionRunMock.mockReset();
    grokAcpSessionRunMock.mockImplementation(async (options) => {
      const now = Date.now();
      options.onRuntimeStatus({
        activeTasks: [],
        lastEventAt: now,
        operationId: options.operationId,
        sessionId: options.sessionId,
        state: 'running',
        transport: 'acp-stdio',
      });
      options.onSessionId('grok-native-session');
      await options.onEvents([
        {
          data: { reason: 'complete', transport: 'acp-stdio' },
          operationId: options.operationId,
          stepIndex: 0,
          timestamp: now,
          type: 'agent_runtime_end',
        },
      ]);
      options.onRuntimeStatus({
        activeTasks: [],
        lastEventAt: now,
        operationId: options.operationId,
        sessionId: options.sessionId,
        state: 'closed',
        transport: 'acp-stdio',
      });
    });
    loggerInfoMock.mockReset();
    traeAcpSessionCloseMock.mockReset();
    traeAcpSessionConstructMock.mockReset();
    traeAcpSessionInterruptMock.mockReset();
    traeAcpSessionInterruptMock.mockResolvedValue(true);
    traeAcpSessionRunMock.mockReset();
    droidAcpSessionCloseMock.mockReset();
    droidAcpSessionConstructMock.mockReset();
    droidAcpSessionInterruptMock.mockReset();
    droidAcpSessionInterruptMock.mockResolvedValue(true);
    droidAcpSessionRunMock.mockReset();
    mockGetAllWindows.mockReset();
    platformMock.mockReturnValue('linux');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue(asDirectory);
  });

  afterEach(async () => {
    await rm(appStoragePath, { force: true, recursive: true });
  });

  describe('cancelSession', () => {
    /**
     * @example A cancelled ACP turn resolves once `session/cancel` lands.
     */
    it('delegates cancellation to the active standard ACP session', async () => {
      let resolveRun: (() => void) | undefined;
      standardAcpSessionRunMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveRun = resolve;
          }),
      );
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
      });
      const prompt = ctr.sendPrompt({
        operationId: 'op-cancel-wait',
        prompt: 'sleep 60',
        sessionId,
      });
      await vi.waitFor(() => expect(standardAcpSessionConstructMock).toHaveBeenCalledOnce());

      await ctr.cancelSession({ sessionId });

      expect(standardAcpSessionInterruptMock).toHaveBeenCalledOnce();
      expect(spawnCalls).toHaveLength(0);
      resolveRun?.();
      await prompt;
    });

    it('marks the session cancelled so a late failure completes quietly', async () => {
      // Safety net: if the session ever launches, its run fails — the point of
      // this test is that the pre-launch `cancelledByUs` check short-circuits
      // first. (`sendPrompt` clears the flag on entry, so the cancel has to
      // land while preparation is still in flight.)
      standardAcpSessionRunMock.mockImplementation(async () => {
        throw new Error('session/prompt cancelled');
      });
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
      });

      // Park sendPrompt inside trace-session creation, cancel underneath it,
      // then release — the pre-launch check completes quietly instead of
      // constructing and running the ACP session.
      let completePreparation!: () => void;
      const createTraceSession = vi
        .spyOn(ctr as any, 'createCliTraceSession')
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              completePreparation = resolve;
            }),
        );

      const prompt = ctr.sendPrompt({
        operationId: 'op-cancelled-run',
        prompt: 'hello',
        sessionId,
      });
      await vi.waitFor(() => expect(createTraceSession).toHaveBeenCalledOnce());

      await ctr.cancelSession({ sessionId });
      completePreparation();
      await prompt;

      // Cancelled-during-preparation short-circuits without a session.
      expect(standardAcpSessionConstructMock).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith('heteroAgentSessionComplete', { sessionId });
      expect(send).not.toHaveBeenCalledWith(
        'heteroAgentSessionError',
        expect.objectContaining({ sessionId }),
      );
    });
  });

  describe('image cache (delegates to shared `normalizeImage`)', () => {
    // Image fetch + cache moved to `@orvilo/heterogeneous-agents/spawn`'s
    // `normalizeImage`. The desktop controller passes its own cacheDir so the
    // path-traversal invariant — id segments like `../../foo` MUST be hashed,
    // never used as path segments — is enforced by the shared helper. Verify
    // that invariant against the same cacheDir the controller would use.
    const fixtureCacheDir = (storage: string) => path.join(storage, 'heteroAgent/files');
    const importNormalize = async () => {
      const { mkdir } = await import('node:fs/promises');
      const mod = await import('@orvilo/heterogeneous-agents/spawn');
      return { mkdir, normalizeImage: mod.normalizeImage };
    };

    it('stores traversal-looking ids inside the cache root via a stable hash key', async () => {
      const { mkdir, normalizeImage } = await importNormalize();
      const cacheDir = fixtureCacheDir(appStoragePath);
      await mkdir(cacheDir, { recursive: true });

      const escapedTargetName = `${path.basename(appStoragePath)}-outside-storage`;
      const escapePath = path.join(cacheDir, `../../../${escapedTargetName}`);

      try {
        await unlink(escapePath);
      } catch {
        // best-effort cleanup
      }

      await normalizeImage(
        {
          id: `../../../${escapedTargetName}`,
          type: 'url',
          url: 'data:text/plain;base64,T1VUU0lERQ==',
        },
        { cacheDir, fetcher: (async () => new Response('OUTSIDE', { status: 200 })) as any },
      );

      const cacheEntries = await readdir(cacheDir);

      expect(cacheEntries).toHaveLength(2);
      expect(cacheEntries.every((entry) => /^[a-f0-9]{64}(?:\.meta)?$/.test(entry))).toBe(true);
      await expect(access(escapePath)).rejects.toThrow();

      try {
        await unlink(escapePath);
      } catch {
        // best-effort cleanup
      }
    });

    it('does not trust pre-seeded out-of-root traversal cache files as cache hits', async () => {
      const { mkdir, normalizeImage } = await importNormalize();
      const cacheDir = fixtureCacheDir(appStoragePath);
      await mkdir(cacheDir, { recursive: true });

      const traversalId = '../../preexisting-secret';
      const outOfRootDataPath = path.join(cacheDir, traversalId);
      const outOfRootMetaPath = path.join(cacheDir, `${traversalId}.meta`);

      await writeFile(outOfRootDataPath, 'SECRET');
      await writeFile(
        outOfRootMetaPath,
        JSON.stringify({ id: traversalId, mimeType: 'text/plain' }),
      );

      const result = await normalizeImage(
        { id: traversalId, type: 'url', url: 'data:text/plain;base64,SUdOT1JFRA==' },
        {
          cacheDir,
          fetcher: (async () =>
            new Response('IGNORED', {
              headers: { 'content-type': 'text/plain' },
              status: 200,
            })) as any,
        },
      );

      expect(Buffer.from(result.buffer).toString('utf8')).toBe('IGNORED');
      expect(result.mediaType).toBe('text/plain');
      await expect(readFile(outOfRootDataPath, 'utf8')).resolves.toBe('SECRET');
    });
  });

  describe('getCodexQuota', () => {
    beforeEach(() => {
      execFileMock.mockReset();
    });

    it('forwards desktop proxy env to the Codex quota RPC', async () => {
      execFileMock.mockImplementation(
        (
          _file: string,
          _args: string[],
          optionsOrCallback: unknown,
          callback?: (error: Error | null, result: { stderr: string; stdout: string }) => void,
        ) => {
          const resolvedCallback =
            typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
          resolvedCallback?.(null, { stderr: '', stdout: 'codex-cli 0.99.0' });
        },
      );
      fetchCodexQuotaMock.mockResolvedValue({
        error: null,
        provider: 'codex',
        session: null,
        status: 'ok',
        updatedAt: 1,
        weekly: null,
      });
      const networkProxy = {
        enableProxy: true,
        proxyPort: '7890',
        proxyServer: '127.0.0.1',
        proxyType: 'http',
      };
      const storeGet = vi.fn((key: string) => (key === 'networkProxy' ? networkProxy : undefined));
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: storeGet },
      } as any);

      await ctr.getCodexQuota({
        command: '/custom/bin/codex',
        env: { CODEX_HOME: '/tmp/codex-home', PATH: '/custom/bin' },
      });

      expect(storeGet).toHaveBeenCalledWith('networkProxy');
      expect(fetchCodexQuotaMock).toHaveBeenCalledWith({
        command: '/custom/bin/codex',
        env: expect.objectContaining({
          CODEX_HOME: '/tmp/codex-home',
          HTTPS_PROXY: 'http://127.0.0.1:7890',
          HTTP_PROXY: 'http://127.0.0.1:7890',
          PATH: '/custom/bin',
        }),
      });
    });

    it('reuses automatic quota reads while explicit refresh bypasses the cache', async () => {
      execFileMock.mockImplementation(
        (
          _file: string,
          _args: string[],
          optionsOrCallback: unknown,
          callback?: (error: Error | null, result: { stderr: string; stdout: string }) => void,
        ) => {
          const resolvedCallback =
            typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
          resolvedCallback?.(null, { stderr: '', stdout: 'codex-cli 0.99.0' });
        },
      );
      fetchCodexQuotaMock.mockResolvedValue({
        error: null,
        provider: 'codex',
        session: { resetsAt: null, usedPercent: 8, windowMinutes: 300 },
        status: 'ok',
        updatedAt: Date.now(),
        weekly: null,
      });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const params = { command: '/custom/bin/codex', env: { CODEX_HOME: '/tmp/codex-home' } };

      await ctr.getCodexQuota(params);
      await ctr.getCodexQuota(params);

      expect(fetchCodexQuotaMock).toHaveBeenCalledTimes(1);

      await ctr.getCodexQuota({ ...params, force: true });

      expect(fetchCodexQuotaMock).toHaveBeenCalledTimes(2);
    });

    it('consumes a reset credit and replaces the cached quota with a fresh snapshot', async () => {
      execFileMock.mockImplementation(
        (
          _file: string,
          _args: string[],
          optionsOrCallback: unknown,
          callback?: (error: Error | null, result: { stderr: string; stdout: string }) => void,
        ) => {
          const resolvedCallback =
            typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
          resolvedCallback?.(null, { stderr: '', stdout: 'codex-cli 0.99.0' });
        },
      );
      const initialQuota = {
        error: null,
        provider: 'codex',
        rateLimitResetCredits: { availableCount: 2 },
        session: { resetsAt: null, usedPercent: 96, windowMinutes: 300 },
        status: 'ok',
        updatedAt: 1,
        weekly: null,
      };
      const refreshedQuota = {
        ...initialQuota,
        rateLimitResetCredits: { availableCount: 1 },
        session: { resetsAt: null, usedPercent: 0, windowMinutes: 300 },
        updatedAt: 2,
      };
      fetchCodexQuotaMock.mockResolvedValueOnce(initialQuota).mockResolvedValueOnce(refreshedQuota);
      consumeCodexRateLimitResetCreditMock.mockResolvedValue('reset');
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const source = {
        command: '/custom/bin/codex',
        env: { CODEX_HOME: '/tmp/codex-home' },
      };

      await ctr.getCodexQuota(source);
      await expect(
        ctr.consumeCodexRateLimitResetCredit({
          ...source,
          creditId: 'credit-first',
          idempotencyKey: 'redeem-request-1',
        }),
      ).resolves.toEqual({ outcome: 'reset', quota: refreshedQuota });

      expect(consumeCodexRateLimitResetCreditMock).toHaveBeenCalledWith({
        command: '/custom/bin/codex',
        creditId: 'credit-first',
        env: { CODEX_HOME: '/tmp/codex-home' },
        idempotencyKey: 'redeem-request-1',
      });
      expect(fetchCodexQuotaMock).toHaveBeenCalledTimes(2);
    });

    it('bypasses an in-flight pre-reset quota read after consuming a credit', async () => {
      execFileMock.mockImplementation(
        (
          _file: string,
          _args: string[],
          optionsOrCallback: unknown,
          callback?: (error: Error | null, result: { stderr: string; stdout: string }) => void,
        ) => {
          const resolvedCallback =
            typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
          resolvedCallback?.(null, { stderr: '', stdout: 'codex-cli 0.99.0' });
        },
      );
      const refreshedAt = Date.now();
      const staleQuota = {
        error: null,
        provider: 'codex',
        rateLimitResetCredits: { availableCount: 2 },
        session: { resetsAt: null, usedPercent: 96, windowMinutes: 300 },
        status: 'ok',
        updatedAt: refreshedAt - 1,
        weekly: null,
      } satisfies CodexQuotaSnapshot;
      const refreshedQuota = {
        ...staleQuota,
        rateLimitResetCredits: { availableCount: 1 },
        session: { resetsAt: null, usedPercent: 0, windowMinutes: 300 },
        updatedAt: refreshedAt,
      } satisfies CodexQuotaSnapshot;
      let resolveStaleQuota: ((quota: CodexQuotaSnapshot) => void) | undefined;
      fetchCodexQuotaMock
        .mockImplementationOnce(
          () =>
            new Promise<CodexQuotaSnapshot>((resolve) => {
              resolveStaleQuota = resolve;
            }),
        )
        .mockResolvedValueOnce(refreshedQuota);
      consumeCodexRateLimitResetCreditMock.mockResolvedValue('reset');
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const source = {
        command: '/custom/bin/codex',
        env: { CODEX_HOME: '/tmp/codex-home' },
      };

      const staleRequest = ctr.getCodexQuota(source);
      await vi.waitFor(() => expect(fetchCodexQuotaMock).toHaveBeenCalledTimes(1));

      await expect(
        ctr.consumeCodexRateLimitResetCredit({
          ...source,
          creditId: 'credit-first',
          idempotencyKey: 'redeem-request-2',
        }),
      ).resolves.toEqual({ outcome: 'reset', quota: refreshedQuota });

      resolveStaleQuota?.(staleQuota);
      await expect(staleRequest).resolves.toEqual(staleQuota);
      await expect(ctr.getCodexQuota(source)).resolves.toEqual(refreshedQuota);
      expect(fetchCodexQuotaMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendPrompt (claude-code)', () => {
    beforeEach(() => {
      spawnCalls.length = 0;
      execFileMock.mockReset();
    });

    const runSendPrompt = async (
      prompt: string,
      sessionOverrides: Record<string, any> = {},
      sendPromptOverrides: Partial<{
        imageList: Array<{ id: string; url: string }>;
        systemContext: string;
      }> = {},
      storeGet?: (key: string, defaultValue?: any) => any,
    ) => {
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: storeGet ? vi.fn(storeGet) : vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'claude-code',
        command: 'claude',
        ...sessionOverrides,
      });
      await ctr.sendPrompt({ operationId: 'op-test', prompt, sessionId, ...sendPromptOverrides });

      const call = standardAcpSessionConstructMock.mock.calls.at(-1);
      expect(call).toBeDefined();
      const [agentType, options, config] = call!;
      return { agentType, config, ctr, options, sessionId };
    };

    it('runs through the claude-agent-acp bridge and never spawns a vendor CLI process', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      const prompt = '-- 这是破折号测试 --help';
      const { agentType, config, ctr, options, sessionId } = await runSendPrompt(prompt);

      expect(spawnCalls).toHaveLength(0);
      expect(agentType).toBe('claude-code');
      // The upstream bridge binary owns argv; the resolved vendor CLI is
      // forwarded through the bridge's native-command env contract.
      expect(options.commandPath).toBe('/mock-bridges/claude-agent-acp');
      expect(options.env.CLAUDE_CODE_EXECUTABLE).toBe('claude');
      expect(config.args).toEqual([]);
      expect(config.spec.transport).toBe('claude-code-acp');
      expect(options.prompt).toEqual([{ text: prompt, type: 'text' }]);
      await expect(ctr.getSessionInfo({ sessionId })).resolves.toEqual({
        agentSessionId: 'claude-code-native-session',
      });
      expect(send).toHaveBeenCalledWith(
        'heteroAgentRuntimeStatus',
        expect.objectContaining({ state: 'running', transport: 'claude-code-acp' }),
      );
      expect(send).toHaveBeenCalledWith('heteroAgentSessionComplete', { sessionId });
    });

    it('places system context before the user prompt in ACP content blocks', async () => {
      const { options } = await runSendPrompt(
        'user task',
        {},
        {
          systemContext: 'selected code context',
        },
      );

      expect(options.prompt).toEqual([
        { text: 'selected code context', type: 'text' },
        { text: 'user task', type: 'text' },
      ]);
    });

    it('mounts the orvilo_cc MCP server through session/new mcpServers', async () => {
      const operationId = 'op-mcp-mount';
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'claude-code',
        command: 'claude',
      });

      await ctr.sendPrompt({
        agentId: 'agent-1',
        operationId,
        prompt: 'hello',
        sessionId,
        topicId: 'topic-1',
      });

      const [, options] = standardAcpSessionConstructMock.mock.calls.at(-1)!;
      expect(options.mcpServers).toEqual([
        expect.objectContaining({ name: 'orvilo_cc', type: 'http' }),
      ]);
      expect(options.mcpServers[0].url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);
      expect(options.askUserBridge).toBeDefined();
      // No temp mcp.json files are written for the standard ACP path.
      expect(
        (await readdir(os.tmpdir())).filter((name) => name.startsWith('lobe-cc-mcp-')),
      ).toEqual([]);
      // The intervention slot is cleaned up once the run settles.
      expect((ctr as any).opIdToIntervention.has(operationId)).toBe(false);
    });

    it('does not mount the builtin MCP server for agents without AskUserQuestion tools', async () => {
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
      });

      await ctr.sendPrompt({ operationId: 'op-no-mcp', prompt: 'hello', sessionId });

      const [, options] = standardAcpSessionConstructMock.mock.calls.at(-1)!;
      expect(options.mcpServers).toBeUndefined();
      // The native permission/elicitation bridge is still attached.
      expect(options.askUserBridge).toBeDefined();
    });

    it.each([
      '-flag-looking-prompt',
      '--help please',
      '- dash at start',
      '-p -- mixed',
      'normal prompt with -dash- inside',
    ])('accepts dash-containing prompt as a plain ACP text block: %s', async (prompt) => {
      const { options } = await runSendPrompt(prompt);

      expect(options.prompt).toEqual([{ text: prompt, type: 'text' }]);
    });

    it('falls back to the user Desktop when no cwd is supplied', async () => {
      const { options } = await runSendPrompt('hello');

      // When launched from Finder the Electron parent cwd is `/` — the
      // controller must override that with the user's Desktop so CC writes
      // land somewhere sensible.
      expect(options.cwd).toBe(FAKE_DESKTOP_PATH);
    });

    it('respects an explicit cwd passed to startSession', async () => {
      const explicitCwd = '/Users/fake/projects/my-repo';
      const { options } = await runSendPrompt('hello', { cwd: explicitCwd });

      expect(options.cwd).toBe(explicitCwd);
    });

    it('omits the empty text block when only images are attached', async () => {
      const { options } = await runSendPrompt(
        '',
        {},
        {
          imageList: [{ id: 'image-1', url: 'data:image/png;base64,UE5HX1RFU1Q=' }],
        },
      );

      // Anthropic rejects `{ text: '', type: 'text' }` with
      // "messages: text content blocks must be non-empty".
      expect(options.prompt).toEqual([
        { data: 'UE5HX1RFU1Q=', mimeType: 'image/png', type: 'image' },
      ]);
    });

    it('does not leak host Anthropic auth env into the ACP child env', async () => {
      // A developer with these exported in their shell would otherwise have them
      // forwarded to the bridge — and through it to `claude` — overriding its
      // subscription login and surfacing as a baffling "Invalid API key".
      const original = {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
      };
      process.env.ANTHROPIC_API_KEY = 'sk-host-should-not-leak';
      process.env.ANTHROPIC_AUTH_TOKEN = 'host-token-should-not-leak';
      process.env.ANTHROPIC_BASE_URL = 'https://host.example/should-not-leak';

      try {
        const { options } = await runSendPrompt('hello');

        expect(options.env).not.toHaveProperty('ANTHROPIC_API_KEY');
        expect(options.env).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN');
        expect(options.env).not.toHaveProperty('ANTHROPIC_BASE_URL');
        // Unrelated inherited vars must still pass through.
        expect(options.env.PATH).toBe(process.env.PATH);
      } finally {
        for (const [key, value] of Object.entries(original)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });

    it('lets an agent-configured Anthropic key in session.env override the stripped host env', async () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-host-should-not-leak';

      try {
        const { options } = await runSendPrompt('hello', {
          env: { ANTHROPIC_API_KEY: 'sk-agent-explicit' },
        });

        // Explicit per-agent config wins; the host value is never seen.
        expect(options.env.ANTHROPIC_API_KEY).toBe('sk-agent-explicit');
      } finally {
        if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = originalKey;
      }
    });

    it('disables CodeBuddy background tasks in the spawned environment', async () => {
      const { config, options } = await runSendPrompt('hello', {
        agentType: 'codebuddy',
        command: 'codebuddy',
      });

      // Native ACP mode: the vendor binary itself is spawned with `--acp`.
      expect(options.commandPath).toBe('codebuddy');
      expect(config.args).toEqual(['--acp']);
      expect(options.env.CODEBUDDY_CODE_DISABLE_BACKGROUND_TASKS).toBe('1');
    });

    it('lifts the selected model onto the ACP session config for CodeBuddy', async () => {
      const { config, options } = await runSendPrompt('hello', {
        agentType: 'codebuddy',
        args: ['--model', 'gpt-5.4'],
        command: 'codebuddy',
      });

      expect(options.initialModel).toBe('gpt-5.4');
      expect(options.args).toEqual([]);
      expect(config.args).toEqual(['--acp']);
    });

    it('captures the native ACP session id for later resume', async () => {
      const { ctr, sessionId } = await runSendPrompt('hello');

      await expect(ctr.getSessionInfo({ sessionId })).resolves.toEqual({
        agentSessionId: 'claude-code-native-session',
      });
    });
  });

  describe('sendPrompt (cursor)', () => {
    beforeEach(() => {
      spawnCalls.length = 0;
      execFileMock.mockReset();
    });

    it('routes Cursor through ACP and persists its native session id', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'cursor',
        args: ['--model', 'composer-1.5'],
        command: 'agent',
        resumeSessionId: 'cursor-session-old',
      });

      await ctr.sendPrompt({
        operationId: 'op-cursor',
        prompt: 'private user request',
        sessionId,
        systemContext: 'private selected workspace context',
      });

      expect(spawnCalls).toHaveLength(0);
      expect(cursorAcpSessionConstructMock).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ['--model', 'composer-1.5'],
          askUserBridge: expect.any(Object),
          clientVersion: '1.0.0-test',
          commandPath: 'agent',
          cwd: FAKE_DESKTOP_PATH,
          operationId: 'op-cursor',
          prompt: [
            { text: 'private selected workspace context', type: 'text' },
            { text: 'private user request', type: 'text' },
          ],
          resumeSessionId: 'cursor-session-old',
          sessionId,
        }),
      );
      await expect(ctr.getSessionInfo({ sessionId })).resolves.toEqual({
        agentSessionId: 'cursor-session-1',
      });
      expect(send).toHaveBeenCalledWith(
        'heteroAgentRuntimeStatus',
        expect.objectContaining({ state: 'running', transport: 'cursor-acp' }),
      );
      expect(send).toHaveBeenCalledWith('heteroAgentSessionComplete', { sessionId });
    });

    it('forwards Cursor questions through the existing intervention bridge and returns the answer', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      let receivedAnswer: unknown;
      cursorAcpSessionRunMock.mockImplementation(async (options) => {
        receivedAnswer = await options.askUserBridge.pending({
          arguments: {
            questions: [
              {
                header: 'Scope',
                multiSelect: false,
                options: [{ label: 'Narrow' }, { label: 'Full' }],
                question: 'How broad?',
              },
            ],
          },
          toolCallId: 'cursor-question-1',
        });
      });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({ agentType: 'cursor', command: 'agent' });
      const run = ctr.sendPrompt({ operationId: 'op-cursor-question', prompt: 'work', sessionId });

      await vi.waitFor(() =>
        expect(send).toHaveBeenCalledWith(
          'heteroAgentEvent',
          expect.objectContaining({
            event: expect.objectContaining({
              data: expect.objectContaining({ toolCallId: 'cursor-question-1' }),
              type: 'agent_intervention_request',
            }),
            sessionId,
          }),
        ),
      );
      await ctr.submitIntervention({
        operationId: 'op-cursor-question',
        result: { 'How broad?': 'Full' },
        toolCallId: 'cursor-question-1',
      });
      await run;

      expect(receivedAnswer).toEqual({ result: { 'How broad?': 'Full' } });
    });

    it('classifies an exact Cursor ACP session/load not-found error for resume fallback', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      const missingSessionError = new AcpRpcResponseError('session/load', {
        code: -32_602,
        message: 'Session "legacy-cursor-session" not found',
      });
      cursorAcpSessionRunMock.mockImplementation(async (options) => {
        await options.onStderr('Cursor ACP diagnostic\n');
        throw missingSessionError;
      });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'cursor',
        command: 'agent',
        cwd: '/Users/fake/projects/repo',
        resumeSessionId: 'legacy-cursor-session',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-cursor-resume', prompt: 'continue', sessionId }),
      ).rejects.toThrow(
        'The saved Cursor session cannot be loaded through ACP, so a new conversation will start.',
      );

      expect(send).toHaveBeenCalledWith('heteroAgentSessionError', {
        error: {
          agentType: 'cursor',
          code: HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
          command: 'agent',
          details: {
            code: -32_602,
            message: 'Session "legacy-cursor-session" not found',
          },
          message:
            'The saved Cursor session cannot be loaded through ACP, so a new conversation will start.',
          resumeSessionId: 'legacy-cursor-session',
          stderr: missingSessionError.message,
          workingDirectory: '/Users/fake/projects/repo',
        },
        sessionId,
      });
      expect(send).not.toHaveBeenCalledWith('heteroAgentSessionComplete', { sessionId });
    });

    it.each([
      ['cancelSession', cursorAcpSessionInterruptMock],
      ['stopSession', cursorAcpSessionCloseMock],
    ] as const)('%s delegates to the active Cursor ACP session', async (action, expectedMock) => {
      let resolveRun: (() => void) | undefined;
      cursorAcpSessionRunMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveRun = resolve;
          }),
      );
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({ agentType: 'cursor', command: 'agent' });
      const run = ctr.sendPrompt({ operationId: 'op-cursor', prompt: 'work', sessionId });
      await vi.waitFor(() => expect(cursorAcpSessionConstructMock).toHaveBeenCalledOnce());

      await ctr[action]({ sessionId });

      expect(expectedMock).toHaveBeenCalledOnce();
      resolveRun?.();
      await run;
    });
  });

  describe('sendPrompt (devin ACP)', () => {
    beforeEach(() => {
      spawnCalls.length = 0;
      execFileMock.mockReset();
    });

    it('routes Devin through ACP and persists its native session and model', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'devin',
        args: ['--model', 'claude-sonnet-4-6-thinking'],
        command: 'devin',
        initialModel: 'claude-sonnet-4-6-thinking',
        resumeSessionId: 'devin-session-old',
      });

      await ctr.sendPrompt({
        operationId: 'op-devin',
        prompt: 'private user request',
        sessionId,
        systemContext: 'private selected workspace context',
      });

      expect(spawnCalls).toHaveLength(0);
      expect(devinAcpSessionConstructMock).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ['--model', 'claude-sonnet-4-6-thinking'],
          askUserBridge: expect.any(Object),
          clientVersion: '1.0.0-test',
          commandPath: 'devin',
          cwd: FAKE_DESKTOP_PATH,
          initialModel: 'claude-sonnet-4-6-thinking',
          operationId: 'op-devin',
          prompt: [
            { text: 'private selected workspace context', type: 'text' },
            { text: 'private user request', type: 'text' },
          ],
          resumeSessionId: 'devin-session-old',
          sessionId,
        }),
      );
      await expect(ctr.getSessionInfo({ sessionId })).resolves.toEqual({
        agentSessionId: 'devin-session-1',
      });
      expect(send).toHaveBeenCalledWith(
        'heteroAgentRuntimeStatus',
        expect.objectContaining({ state: 'running', transport: 'devin-acp' }),
      );
      expect(send).toHaveBeenCalledWith('heteroAgentSessionComplete', { sessionId });
    });

    it('forwards Devin permission choices through the intervention bridge', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      let receivedAnswer: unknown;
      devinAcpSessionRunMock.mockImplementation(async (options) => {
        receivedAnswer = await options.askUserBridge.pending({
          arguments: {
            questions: [
              {
                header: 'Permission required',
                multiSelect: false,
                options: [{ label: 'Allow' }, { label: 'Reject' }],
                question: 'Run tests?',
              },
            ],
          },
          toolCallId: 'devin-permission-1',
        });
      });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({ agentType: 'devin', command: 'devin' });
      const run = ctr.sendPrompt({ operationId: 'op-devin-question', prompt: 'work', sessionId });

      await vi.waitFor(() =>
        expect(send).toHaveBeenCalledWith(
          'heteroAgentEvent',
          expect.objectContaining({
            event: expect.objectContaining({
              data: expect.objectContaining({
                identifier: 'devin',
                provider: 'devin',
                toolCallId: 'devin-permission-1',
              }),
              type: 'agent_intervention_request',
            }),
            sessionId,
          }),
        ),
      );
      await ctr.submitIntervention({
        operationId: 'op-devin-question',
        result: { 'Run tests?': 'Allow' },
        toolCallId: 'devin-permission-1',
      });
      await run;

      expect(receivedAnswer).toEqual({ result: { 'Run tests?': 'Allow' } });
    });

    it('classifies a missing resumed Devin ACP session', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      const missingSessionError = new AcpRpcResponseError('session/load', {
        code: -32_016,
        data: {
          'cognition.ai/errorKind': 'session_not_found',
          'cognition.ai/retryable': false,
        },
        message: 'Session not found',
      });
      devinAcpSessionRunMock.mockRejectedValue(missingSessionError);
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'devin',
        command: 'devin',
        cwd: '/Users/fake/projects/repo',
        resumeSessionId: 'missing-devin-session',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-devin-resume', prompt: 'continue', sessionId }),
      ).rejects.toThrow(
        'The saved Devin session could not be found, so a new conversation will start.',
      );
      expect(send).toHaveBeenCalledWith('heteroAgentSessionError', {
        error: expect.objectContaining({
          agentType: 'devin',
          code: HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
          command: 'devin',
          resumeSessionId: 'missing-devin-session',
        }),
        sessionId,
      });
    });

    it.each([
      ['cancelSession', devinAcpSessionInterruptMock],
      ['stopSession', devinAcpSessionCloseMock],
    ] as const)('%s delegates to the active Devin ACP session', async (action, expectedMock) => {
      let resolveRun: (() => void) | undefined;
      devinAcpSessionRunMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveRun = resolve;
          }),
      );
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({ agentType: 'devin', command: 'devin' });
      const run = ctr.sendPrompt({ operationId: 'op-devin', prompt: 'work', sessionId });
      await vi.waitFor(() => expect(devinAcpSessionConstructMock).toHaveBeenCalledOnce());

      await ctr[action]({ sessionId });

      expect(expectedMock).toHaveBeenCalledOnce();
      resolveRun?.();
      await run;
    });
  });

  describe('sendPrompt (grok-build ACP)', () => {
    beforeEach(() => {
      spawnCalls.length = 0;
      execFileMock.mockReset();
    });

    it('uses the ACP runtime, persists the native session id, and broadcasts its lifecycle', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'grok-build',
        args: ['--model', 'grok-build'],
        command: 'grok',
      });

      await ctr.sendPrompt({
        operationId: 'op-grok',
        prompt: 'implement this',
        sessionId,
        systemContext: 'selected context',
      });

      expect(spawnCalls).toHaveLength(0);
      expect(grokAcpSessionConstructMock).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ['--model', 'grok-build'],
          clientVersion: '1.0.0-test',
          commandPath: 'grok',
          cwd: FAKE_DESKTOP_PATH,
          operationId: 'op-grok',
          prompt: [
            { text: 'selected context', type: 'text' },
            { text: 'implement this', type: 'text' },
          ],
          sessionId,
        }),
      );
      await expect(ctr.getSessionInfo({ sessionId })).resolves.toEqual({
        agentSessionId: 'grok-native-session',
      });

      const statusPayloads = send.mock.calls
        .filter(([channel]) => channel === 'heteroAgentRuntimeStatus')
        .map(([, payload]) => payload);
      expect(statusPayloads).toEqual([
        expect.objectContaining({ state: 'running', transport: 'acp-stdio' }),
        expect.objectContaining({ state: 'closed', transport: 'acp-stdio' }),
      ]);
      expect(send).toHaveBeenCalledWith(
        'heteroAgentEvent',
        expect.objectContaining({
          event: expect.objectContaining({ type: 'agent_runtime_end' }),
          sessionId,
        }),
      );
      expect(send).toHaveBeenCalledWith('heteroAgentSessionComplete', { sessionId });
    });

    it.each([
      ['cancelSession', grokAcpSessionInterruptMock],
      ['stopSession', grokAcpSessionCloseMock],
    ] as const)('%s delegates to the active ACP session', async (action, expectedMock) => {
      let resolveRun: (() => void) | undefined;
      grokAcpSessionRunMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveRun = resolve;
          }),
      );
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'grok-build',
        command: 'grok',
      });
      const promptRun = ctr.sendPrompt({ operationId: 'op-grok', prompt: 'work', sessionId });
      await vi.waitFor(() => expect(grokAcpSessionConstructMock).toHaveBeenCalledOnce());

      await ctr[action]({ sessionId });

      expect(expectedMock).toHaveBeenCalledOnce();
      resolveRun?.();
      await promptRun;
    });

    it('classifies ACP authentication failures for the existing sign-in guide', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      grokAcpSessionRunMock.mockRejectedValue(
        new Error('Authentication required. Run `grok login`, then retry.'),
      );
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'grok-build',
        command: 'grok',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-grok', prompt: 'work', sessionId }),
      ).rejects.toThrow('Grok Build could not authenticate');
      expect(send).toHaveBeenCalledWith('heteroAgentSessionError', {
        error: expect.objectContaining({
          agentType: 'grok-build',
          code: HeterogeneousAgentSessionErrorCode.AuthRequired,
          command: 'grok',
        }),
        sessionId,
      });
    });

    it('classifies a missing resumed ACP session after broadcasting its terminal error', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      const missingSessionError = new AcpRpcResponseError('session/load', {
        code: -32_603,
        data: { code: 'FS_NOT_FOUND', detail: '/sessions/missing-grok-session' },
        message: 'Path not found.',
      });
      grokAcpSessionRunMock.mockImplementation(async (options) => {
        await options.onEvents([
          {
            data: {
              agentType: 'grok-build',
              details: {
                code: missingSessionError.rpcError.code,
                data: missingSessionError.rpcError.data,
              },
              message: missingSessionError.message,
            },
            operationId: options.operationId,
            stepIndex: 0,
            timestamp: Date.now(),
            type: 'error',
          },
        ]);
        throw missingSessionError;
      });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'grok-build',
        command: 'grok',
        cwd: '/Users/fake/projects/repo',
        resumeSessionId: 'missing-grok-session',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-grok-resume', prompt: 'continue', sessionId }),
      ).rejects.toThrow(
        'The saved Grok Build session could not be found, so it can no longer be resumed.',
      );

      expect(grokAcpSessionConstructMock).toHaveBeenCalledWith(
        expect.objectContaining({ resumeSessionId: 'missing-grok-session' }),
      );
      const eventIndex = send.mock.calls.findIndex(([channel]) => channel === 'heteroAgentEvent');
      const errorIndex = send.mock.calls.findIndex(
        ([channel]) => channel === 'heteroAgentSessionError',
      );
      expect(eventIndex).toBeGreaterThanOrEqual(0);
      expect(errorIndex).toBeGreaterThan(eventIndex);
      expect(send).toHaveBeenCalledWith('heteroAgentSessionError', {
        error: {
          agentType: 'grok-build',
          code: HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
          command: 'grok',
          details: {
            code: -32_603,
            data: { code: 'FS_NOT_FOUND', detail: '/sessions/missing-grok-session' },
          },
          message:
            'The saved Grok Build session could not be found, so it can no longer be resumed.',
          resumeSessionId: 'missing-grok-session',
          stderr: missingSessionError.message,
          workingDirectory: '/Users/fake/projects/repo',
        },
        sessionId,
      });
      expect(send).not.toHaveBeenCalledWith('heteroAgentSessionComplete', { sessionId });
    });

    it('does not classify a non-load ACP filesystem error as a stale resume session', () => {
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const promptError = new AcpRpcResponseError('session/prompt', {
        code: -32_603,
        data: { code: 'FS_NOT_FOUND', detail: '/workspace/missing-file' },
        message: 'Path not found.',
      });

      const payload = (ctr as any).getSessionErrorPayload(promptError, {
        agentSessionId: 'grok-session',
        agentType: 'grok-build',
        args: [],
        command: 'grok',
        resumeSessionId: 'grok-session',
        sessionId: 'session-1',
      });

      expect(payload).toBe(promptError.message);
    });
  });

  describe('sendPrompt (codex)', () => {
    beforeEach(() => {
      spawnCalls.length = 0;
      execFileMock.mockReset();
    });

    const runSendPrompt = async (
      prompt: string,
      sessionOverrides: Record<string, any> = {},
      sendPromptOverrides: Partial<{
        imageList: Array<{ id: string; url: string }>;
        systemContext: string;
      }> = {},
      storeGet?: (key: string, defaultValue?: any) => any,
    ) => {
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: storeGet ? vi.fn(storeGet) : vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
        ...sessionOverrides,
      });
      await ctr.sendPrompt({ operationId: 'op-test', prompt, sessionId, ...sendPromptOverrides });

      const call = standardAcpSessionConstructMock.mock.calls.at(-1);
      expect(call).toBeDefined();
      const [agentType, options, config] = call!;
      return { agentType, config, ctr, options, sessionId };
    };

    it('fails fast when Codex CLI is unavailable instead of attempting spawn', async () => {
      const detect = vi.fn().mockResolvedValue({ available: false });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        binaryManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow('Codex CLI was not found');

      expect(detect).toHaveBeenCalledWith('codex');
      expect(standardAcpSessionConstructMock).not.toHaveBeenCalled();
    });

    it('validates the default desktop directory when the session cwd is omitted', async () => {
      vi.mocked(statSync).mockImplementation((candidate) =>
        candidate === FAKE_DESKTOP_PATH ? asDirectory : (undefined as never),
      );
      const detect = vi.fn().mockResolvedValue({ available: false });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        binaryManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow('Codex CLI was not found');

      expect(statSync).toHaveBeenCalledWith(FAKE_DESKTOP_PATH, expect.anything());
      expect(detect).toHaveBeenCalledWith('codex');
    });

    it('reports a missing working directory instead of claiming the Codex CLI is missing', async () => {
      const missingCwd = '/tmp/orvilo-deleted-worktree';
      mockMissingDir(missingCwd);
      const detect = vi.fn().mockResolvedValue({
        available: true,
        path: '/Applications/ChatGPT.app/Contents/Resources/codex',
      });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        binaryManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
        cwd: missingCwd,
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow(`Working directory does not exist: ${missingCwd}`);

      expect(detect).not.toHaveBeenCalled();
      expect(standardAcpSessionConstructMock).not.toHaveBeenCalled();
    });

    it('fails fast when Claude Code CLI is unavailable instead of attempting spawn', async () => {
      const detect = vi.fn().mockResolvedValue({ available: false });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        binaryManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'claude-code',
        command: 'claude',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow('Claude Code CLI was not found');

      expect(detect).toHaveBeenCalledWith('claude');
      expect(standardAcpSessionConstructMock).not.toHaveBeenCalled();
    });

    it('fails fast with CodeBuddy install guidance when CodeBuddy is unavailable', async () => {
      const detect = vi.fn().mockResolvedValue({ available: false });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        binaryManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codebuddy',
        command: 'codebuddy',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow('CodeBuddy CLI was not found');

      expect(detect).toHaveBeenCalledWith('codebuddy');
      expect(standardAcpSessionConstructMock).not.toHaveBeenCalled();
    });

    it('fails fast with AMP-specific install guidance when AMP is unavailable', async () => {
      const detect = vi.fn().mockResolvedValue({ available: false });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        binaryManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({ agentType: 'amp', command: 'amp' });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow('Amp CLI was not found');

      expect(detect).toHaveBeenCalledWith('amp');
      expect(standardAcpSessionConstructMock).not.toHaveBeenCalled();
    });

    it('fails fast with OpenCode install guidance when OpenCode is unavailable', async () => {
      const detect = vi.fn().mockResolvedValue({ available: false });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        binaryManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'opencode',
        command: 'opencode',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow('OpenCode CLI was not found');

      expect(detect).toHaveBeenCalledWith('opencode');
      expect(standardAcpSessionConstructMock).not.toHaveBeenCalled();
    });

    it('fails fast when a customized Claude command is unavailable instead of checking the default detector', async () => {
      execFileMock.mockImplementation(
        (
          file: string,
          _args: string[],
          optionsOrCallback: unknown,
          callback?: (error: Error | null, stdout: string, stderr: string) => void,
        ) => {
          const resolvedCallback =
            typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;

          resolvedCallback?.(
            Object.assign(new Error(`${file} not found`), { code: 'ENOENT' }),
            '',
            '',
          );
        },
      );

      const detect = vi.fn().mockResolvedValue({ available: true });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        binaryManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'claude-code',
        command: 'claude-alt',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow('Claude Code CLI was not found');

      expect(detect).not.toHaveBeenCalled();
      expect(standardAcpSessionConstructMock).not.toHaveBeenCalled();
    });

    it('forwards the detector-resolved vendor path to the bridge when the bare command is off PATH', async () => {
      // Codex desktop app case: `codex` is not on PATH, but the preflight
      // detector finds the CLI bundled inside ChatGPT.app. The bridge must
      // drive that absolute path, not a bare `codex` that would ENOENT.
      const resolvedPath = '/Applications/ChatGPT.app/Contents/Resources/codex';
      const detect = vi.fn().mockResolvedValue({ available: true, path: resolvedPath });

      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        binaryManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
      });
      await ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId });

      expect(resolveAcpSpawnTargetMock).toHaveBeenCalledWith(
        'codex',
        resolvedPath,
        expect.anything(),
      );
      const [, options] = standardAcpSessionConstructMock.mock.calls.at(-1)!;
      expect(options.commandPath).toBe('/mock-bridges/codex-acp');
      expect(options.env.CODEX_PATH).toBe(resolvedPath);
    });

    it('carries the detector login-shell PATH into the ACP child env for `env node` shims', async () => {
      // `codex` resolved via the login-shell PATH (mise/nvm). Spawning the
      // absolute shim under the leaner inherited PATH would fail at its
      // `#!/usr/bin/env node` shebang — the resolved PATH must reach the child.
      const resolvedPath = '/Users/h/.local/share/mise/shims/codex';
      const searchPath = '/Users/h/.local/share/mise/shims:/usr/bin:/bin';
      const detect = vi
        .fn()
        .mockResolvedValue({ available: true, path: resolvedPath, resolvedPathEnv: searchPath });

      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        binaryManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({ agentType: 'codex', command: 'codex' });
      await ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId });

      const [, options] = standardAcpSessionConstructMock.mock.calls.at(-1)!;
      expect(options.env.CODEX_PATH).toBe(resolvedPath);
      expect(options.env.PATH).toBe(searchPath);
    });

    it('keeps an explicit path-like command for the bridge instead of the detector result', async () => {
      // detectHeterogeneousCliCommand validates the custom path via --version.
      execFileMock.mockImplementation(
        (
          _file: string,
          _args: string[],
          optionsOrCallback: unknown,
          callback?: (error: Error | null, result: { stderr: string; stdout: string }) => void,
        ) => {
          const resolvedCallback =
            typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
          (resolvedCallback as any)?.(null, { stderr: '', stdout: 'codex-cli 0.99.0' });
        },
      );

      const detect = vi.fn();

      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
        binaryManager: { detect },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: '/custom/bin/codex',
      });
      await ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId });

      expect(detect).not.toHaveBeenCalled();
      expect(resolveAcpSpawnTargetMock).toHaveBeenCalledWith(
        'codex',
        '/custom/bin/codex',
        expect.anything(),
      );
    });

    it('sends the prompt as ACP content blocks — never as bridge argv', async () => {
      const prompt = '--run a shell-like prompt safely';
      const { config, options } = await runSendPrompt(prompt);

      expect(options.commandPath).toBe('/mock-bridges/codex-acp');
      // Bridge binaries own their argv outright — no vendor flags ride along.
      expect(config.args).toEqual([]);
      expect(options.prompt).toEqual([{ text: prompt, type: 'text' }]);
    });

    it('resumes an existing Codex thread through ACP session/load', async () => {
      const { options } = await runSendPrompt('continue', { resumeSessionId: 'thread_abc' });

      expect(options.resumeSessionId).toBe('thread_abc');
    });

    it('lifts Codex effort and service-tier selectors onto ACP config options', async () => {
      const { options } = await runSendPrompt('hello', {
        args: ['-c', 'model_reasoning_effort="high"', '-c', 'service_tier="fast"'],
      });

      expect(options.configOptions).toEqual([
        { configId: 'reasoning_effort', optional: true, value: 'high' },
        { configId: 'fast-mode', optional: true, value: 'on' },
      ]);
      expect(options.args).toEqual([]);
    });

    it('materializes image attachments into ACP image blocks', async () => {
      const imageList = [
        { id: 'image-1', url: 'data:image/png;base64,UE5HX1RFU1Q=' },
        { id: 'image-2', url: 'data:image/jpeg;base64,SlBFR19URVNU' },
      ];
      const { options } = await runSendPrompt('describe these screenshots', {}, { imageList });

      expect(options.prompt).toEqual([
        { text: 'describe these screenshots', type: 'text' },
        { data: 'UE5HX1RFU1Q=', mimeType: 'image/png', type: 'image' },
        { data: 'SlBFR19URVNU', mimeType: 'image/jpeg', type: 'image' },
      ]);
    });

    it('normalizes parameterized image MIME types', async () => {
      const imageList = [
        { id: 'image-with-params', url: 'data:image/png;charset=utf-8;base64,UE5HX1RFU1Q=' },
      ];
      const { options } = await runSendPrompt('describe this screenshot', {}, { imageList });

      expect(options.prompt.at(-1)).toEqual({
        data: 'UE5HX1RFU1Q=',
        mimeType: 'image/png',
        type: 'image',
      });
    });

    it('sniffs image bytes when MIME and URL do not expose a usable extension', async () => {
      const pngBytes = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('PNG_TEST'),
      ]);
      const imageList = [
        {
          id: 'image-octet',
          url: `data:application/octet-stream;base64,${pngBytes.toString('base64')}`,
        },
      ];
      const { options } = await runSendPrompt('describe this screenshot', {}, { imageList });

      expect(options.prompt.at(-1)).toEqual({
        data: pngBytes.toString('base64'),
        mimeType: 'image/png',
        type: 'image',
      });
    });

    it('fails before creating the ACP session when any image cannot be materialized', async () => {
      const imageList = [
        { id: 'good-image', url: 'data:image/png;base64,VkFMSURfSU1BR0U=' },
        { id: 'bad-image', url: 'bad://broken-image' },
      ];
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
      });

      await expect(
        ctr.sendPrompt({
          imageList,
          operationId: 'op-test',
          prompt: 'inspect the screenshots',
          sessionId,
        }),
      ).rejects.toThrow('Failed to attach image(s)');
      expect(standardAcpSessionConstructMock).not.toHaveBeenCalled();
    });

    it('does not surface Codex bridge stderr noise as the terminal error', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      standardAcpSessionRunMock.mockImplementation(async (options) => {
        await options.onStderr(
          'Reading prompt from stdin...\n' +
            '2026-04-25T09:24:08Z  WARN codex_core::session_startup_prewarm: prewarm failed\n' +
            'real Codex bridge error\n',
        );
        throw new Error('Codex ACP exited unexpectedly (code 1, signal null)');
      });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId }),
      ).rejects.toThrow(/Codex ACP exited unexpectedly/);
      expect(send).toHaveBeenCalledWith(
        'heteroAgentSessionError',
        expect.objectContaining({ sessionId }),
      );
    });

    it('writes raw ACP streams to a dev trace directory grouped by agent type', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        const prompt = 'trace this run';
        const rawLine = `${JSON.stringify({
          method: 'session/update',
          params: { update: { sessionUpdate: 'agent_message_chunk' } },
        })}\n`;
        standardAcpSessionRunMock.mockImplementation(async (options) => {
          const now = Date.now();
          options.onRawMessage?.(rawLine);
          options.onSessionId?.('codex-native-session');
          await options.onEvents?.([
            {
              data: { stopReason: 'end_turn' },
              operationId: options.operationId,
              stepIndex: 0,
              timestamp: now,
              type: 'agent_runtime_end',
            },
          ]);
        });

        const { sessionId } = await runSendPrompt(
          prompt,
          { cwd: appStoragePath },
          {
            imageList: [{ id: 'image-1', url: 'data:image/png;base64,UE5HX1RFU1Q=' }],
          },
        );
        const traceRoot = path.join(appStoragePath, '.heerogeneous-tracing');
        const agentTraceRoot = path.join(traceRoot, 'codex');
        const traceDirs = await readdir(agentTraceRoot);

        expect(traceDirs).toHaveLength(1);

        const traceDir = path.join(agentTraceRoot, traceDirs[0]);

        await expect(readFile(path.join(traceRoot, '.last-live-trace'), 'utf8')).resolves.toBe(
          `${traceDir}\n`,
        );
        const stdinPayload = await readFile(path.join(traceDir, 'stdin.txt'), 'utf8');
        expect(JSON.parse(stdinPayload)).toEqual([
          { text: 'trace this run', type: 'text' },
          { data: 'UE5HX1RFU1Q=', mimeType: 'image/png', type: 'image' },
        ]);
        await expect(readFile(path.join(traceDir, 'stdout.jsonl'), 'utf8')).resolves.toBe(rawLine);
        await expect(readFile(path.join(traceDir, 'stderr.log'), 'utf8')).resolves.toBe('');
        await expect(readFile(path.join(traceDir, 'exit.json'), 'utf8')).resolves.toContain(
          '"transport": "codex-acp"',
        );

        const meta = JSON.parse(await readFile(path.join(traceDir, 'meta.json'), 'utf8'));

        expect(meta).toMatchObject({
          agentType: 'codex',
          command: 'codex',
          cwd: appStoragePath,
          sessionId,
          stdoutFile: 'stdout.jsonl',
        });
        expect(meta.attachments).toEqual([{ id: 'image-1', urlKind: 'data' }]);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('centralizes to heteroAgent/tracing in dev too when the toggle is on', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      // Dev (isPackaged stays false), but the user opted in via the toggle.
      process.env.NODE_ENV = 'development';

      try {
        await runSendPrompt(
          'trace this opted-in dev run',
          { cwd: appStoragePath },
          {},
          (key: string) => (key === 'heteroTracingEnabled' ? true : undefined),
        );

        const agentTraceRoot = path.join(appStoragePath, 'heteroAgent', 'tracing', 'codex');
        const traceDirs = await readdir(agentTraceRoot);
        expect(traceDirs).toHaveLength(1);

        // Toggle wins over the dev cwd default.
        await expect(readdir(path.join(appStoragePath, '.heerogeneous-tracing'))).rejects.toThrow();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('traces to the centralized heteroAgent/tracing dir in packaged builds when the toggle is on', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      // The gate short-circuits to `false` under NODE_ENV=test, so simulate a
      // real packaged production process.
      process.env.NODE_ENV = 'production';
      (electronAppMock as any).isPackaged = true;

      try {
        const rawLine = `${JSON.stringify({
          method: 'session/update',
          params: { update: { sessionUpdate: 'agent_message_chunk' } },
        })}\n`;
        standardAcpSessionRunMock.mockImplementation(async (options) => {
          options.onRawMessage?.(rawLine);
        });

        await runSendPrompt(
          'trace this packaged run',
          { cwd: appStoragePath },
          {},
          (key: string) => (key === 'heteroTracingEnabled' ? true : undefined),
        );

        // Centralized under appStoragePath/heteroAgent/tracing — NOT in the cwd.
        const traceRoot = path.join(appStoragePath, 'heteroAgent', 'tracing');
        const agentTraceRoot = path.join(traceRoot, 'codex');
        const traceDirs = await readdir(agentTraceRoot);
        expect(traceDirs).toHaveLength(1);

        const traceDir = path.join(agentTraceRoot, traceDirs[0]);
        await expect(readFile(path.join(traceDir, 'stdout.jsonl'), 'utf8')).resolves.toBe(rawLine);

        // The dev-style cwd location must NOT be written in packaged mode.
        await expect(readdir(path.join(appStoragePath, '.heerogeneous-tracing'))).rejects.toThrow();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        (electronAppMock as any).isPackaged = false;
      }
    });

    it('does not trace in packaged builds when the toggle is off', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      (electronAppMock as any).isPackaged = true;

      try {
        await runSendPrompt('no trace please', { cwd: appStoragePath }, {}, (key: string) =>
          key === 'heteroTracingEnabled' ? false : undefined,
        );

        await expect(
          readdir(path.join(appStoragePath, 'heteroAgent', 'tracing')),
        ).rejects.toThrow();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        (electronAppMock as any).isPackaged = false;
      }
    });

    it('skips trace creation (and never auto-creates the cwd) when the cwd is missing', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const missingCwd = path.join(appStoragePath, 'does-not-exist');

      try {
        await runSendPrompt('trace this run', { cwd: missingCwd });

        await expect(access(missingCwd)).rejects.toThrow();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('persists the native ACP session id for later resume', async () => {
      const { ctr, sessionId } = await runSendPrompt('hello');

      await expect(ctr.getSessionInfo({ sessionId })).resolves.toEqual({
        agentSessionId: 'codex-native-session',
      });
    });

    it('classifies stale Codex resume stderr as a structured resume error', () => {
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const payload = (ctr as any).getSessionErrorPayload(
        'No conversation found for thread thread_stale_123',
        {
          agentSessionId: 'thread_stale_123',
          agentType: 'codex',
          args: [],
          command: 'codex',
          cwd: '/Users/fake/projects/repo',
          resumeSessionId: 'thread_stale_123',
          sessionId: 'session-1',
        },
      );

      expect(payload).toEqual({
        agentType: 'codex',
        code: HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
        command: 'codex',
        message: 'The saved Codex thread could not be found, so it can no longer be resumed.',
        resumeSessionId: 'thread_stale_123',
        stderr: 'No conversation found for thread thread_stale_123',
        workingDirectory: '/Users/fake/projects/repo',
      });
    });

    it('classifies a missing ACP session/load as a structured resume error', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      const missingSessionError = new AcpRpcResponseError('session/load', {
        code: -32_603,
        data: { code: 'FS_NOT_FOUND', detail: '/sessions/thread_stale_123' },
        message: 'Path not found.',
      });
      standardAcpSessionRunMock.mockRejectedValue(missingSessionError);
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'codex',
        command: 'codex',
        cwd: '/Users/fake/projects/repo',
        resumeSessionId: 'thread_stale_123',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-resume', prompt: 'continue', sessionId }),
      ).rejects.toThrow('could not be found');
      expect(send).toHaveBeenCalledWith(
        'heteroAgentSessionError',
        expect.objectContaining({
          error: expect.objectContaining({
            code: HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
          }),
          sessionId,
        }),
      );
      expect(send).not.toHaveBeenCalledWith('heteroAgentSessionComplete', { sessionId });
    });

    it('classifies CLI authentication failures as auth-required errors', () => {
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const payload = (ctr as any).getSessionErrorPayload(
        'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid authentication credentials"}}',
        {
          agentType: 'claude-code',
          args: [],
          command: 'claude',
          sessionId: 'session-1',
        },
      );

      expect(payload).toEqual({
        agentType: 'claude-code',
        code: HeterogeneousAgentSessionErrorCode.AuthRequired,
        command: 'claude',
        docsUrl: 'https://docs.anthropic.com/en/docs/claude-code/setup',
        message:
          'Claude Code could not authenticate. Sign in again or refresh its credentials, then retry.',
        stderr:
          'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid authentication credentials"}}',
      });
    });

    it('classifies missing credentials for Pi as an auth-required error', () => {
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const payload = (ctr as any).getSessionErrorPayload(
        'No API key found for provider anthropic',
        {
          agentType: 'pi',
          args: [],
          command: 'pi',
          sessionId: 'session-1',
        },
      );

      expect(payload).toEqual({
        agentType: 'pi',
        code: HeterogeneousAgentSessionErrorCode.AuthRequired,
        command: 'pi',
        docsUrl: 'https://github.com/earendil-works/pi',
        message: 'Pi could not authenticate. Run `pi`, use `/login`, then retry.',
        stderr: 'No API key found for provider anthropic',
      });
    });
  });

  describe('sendPrompt (droid)', () => {
    it('routes Factory Droid through ACP and persists the native session id', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'droid',
        args: ['--tag', 'orvilo'],
        command: 'droid',
        initialModel: 'gpt-5.4',
        resumeSessionId: 'droid_session_old',
      });

      await ctr.sendPrompt({ operationId: 'op-droid', prompt: 'inspect this repo', sessionId });

      expect(spawnCalls).toHaveLength(0);
      expect(droidAcpSessionConstructMock).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ['--tag', 'orvilo'],
          clientVersion: '1.0.0-test',
          commandPath: 'droid',
          cwd: FAKE_DESKTOP_PATH,
          initialModel: 'gpt-5.4',
          operationId: 'op-droid',
          prompt: [{ text: 'inspect this repo', type: 'text' }],
          resumeSessionId: 'droid_session_old',
          sessionId,
        }),
      );
      await expect(ctr.getSessionInfo({ sessionId })).resolves.toEqual({
        agentSessionId: 'droid_session_1',
      });
      expect(send).toHaveBeenCalledWith('heteroAgentRuntimeStatus', {
        activeTasks: [],
        lastEventAt: expect.any(Number),
        operationId: 'op-droid',
        sessionId,
        state: 'running',
        transport: 'droid-acp',
      });
      expect(send).toHaveBeenCalledWith('heteroAgentSessionComplete', { sessionId });
    });

    it('classifies a missing Droid ACP session for resume fallback', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      const missingSessionError = new AcpRpcResponseError('session/load', {
        code: -32_603,
        data: { details: 'Session missing-droid-session not found' },
        message: 'Failed to load session',
      });
      droidAcpSessionRunMock.mockImplementation(async (options) => {
        await options.onStderr('Droid ACP diagnostic\n');
        throw missingSessionError;
      });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'droid',
        command: 'droid',
        cwd: '/Users/fake/projects/repo',
        resumeSessionId: 'missing-droid-session',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-droid-resume', prompt: 'continue', sessionId }),
      ).rejects.toThrow(
        'The saved Factory Droid session could not be found, so a new conversation will start.',
      );

      expect(send).toHaveBeenCalledWith('heteroAgentSessionError', {
        error: {
          agentType: 'droid',
          code: HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
          command: 'droid',
          details: {
            code: -32_603,
            data: { details: 'Session missing-droid-session not found' },
          },
          message:
            'The saved Factory Droid session could not be found, so a new conversation will start.',
          resumeSessionId: 'missing-droid-session',
          stderr: missingSessionError.message,
          workingDirectory: '/Users/fake/projects/repo',
        },
        sessionId,
      });
      expect(send).not.toHaveBeenCalledWith('heteroAgentSessionComplete', { sessionId });
    });
  });

  describe('sendPrompt (trae)', () => {
    it('routes TRAE through ACP and persists the native session id', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'trae',
        args: ['--feature=test'],
        command: 'traecli',
        initialModel: 'gpt-5.4',
        resumeSessionId: 'trae_session_old',
      });

      await ctr.sendPrompt({ operationId: 'op-trae', prompt: 'inspect this repo', sessionId });

      expect(spawnCalls).toHaveLength(0);
      expect(traeAcpSessionConstructMock).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ['--feature=test'],
          clientVersion: '1.0.0-test',
          commandPath: 'traecli',
          cwd: FAKE_DESKTOP_PATH,
          initialModel: 'gpt-5.4',
          operationId: 'op-trae',
          prompt: [{ text: 'inspect this repo', type: 'text' }],
          resumeSessionId: 'trae_session_old',
          sessionId,
        }),
      );
      await expect(ctr.getSessionInfo({ sessionId })).resolves.toEqual({
        agentSessionId: 'trae_session_1',
      });
      expect(send).toHaveBeenCalledWith('heteroAgentRuntimeStatus', {
        activeTasks: [],
        lastEventAt: expect.any(Number),
        operationId: 'op-trae',
        sessionId,
        state: 'running',
        transport: 'trae-acp',
      });
      expect(send).toHaveBeenCalledWith('heteroAgentSessionComplete', { sessionId });
    });

    it('classifies authentication diagnostics emitted only on ACP stderr', async () => {
      const send = vi.fn();
      mockGetAllWindows.mockReturnValue([
        {
          isDestroyed: () => false,
          webContents: { send },
        },
      ]);
      traeAcpSessionRunMock.mockImplementation(async (options) => {
        await options.onStderr('Please sign in through TRAE Enterprise\n');
        throw new Error('TRAE ACP exited unexpectedly (code 1, signal null)');
      });
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({
        agentType: 'trae',
        command: 'traecli',
      });

      await expect(
        ctr.sendPrompt({ operationId: 'op-trae-auth', prompt: 'work', sessionId }),
      ).rejects.toThrow('TRAE CLI could not authenticate');
      expect(send).toHaveBeenCalledWith('heteroAgentSessionError', {
        error: expect.objectContaining({
          agentType: 'trae',
          code: HeterogeneousAgentSessionErrorCode.AuthRequired,
          command: 'traecli',
          stderr: expect.stringContaining('Please sign in through TRAE Enterprise'),
        }),
        sessionId,
      });
    });
  });

  describe('pre-launch cancellation for local transports', () => {
    beforeEach(() => {
      spawnCalls.length = 0;
      execFileMock.mockReset();
    });

    it.each([
      {
        agentType: 'codex',
        command: 'codex',
        constructMock: standardAcpSessionConstructMock,
        label: 'Codex ACP',
        runMock: standardAcpSessionRunMock,
      },
      {
        agentType: 'claude-code',
        command: 'claude',
        constructMock: standardAcpSessionConstructMock,
        label: 'Claude Code ACP',
        runMock: standardAcpSessionRunMock,
      },
      {
        agentType: 'grok-build',
        command: 'grok',
        constructMock: grokAcpSessionConstructMock,
        label: 'Grok ACP',
        runMock: grokAcpSessionRunMock,
      },
      {
        agentType: 'cursor',
        command: 'agent',
        constructMock: cursorAcpSessionConstructMock,
        label: 'Cursor ACP',
        runMock: cursorAcpSessionRunMock,
      },
      {
        agentType: 'devin',
        command: 'devin',
        constructMock: devinAcpSessionConstructMock,
        label: 'Devin ACP',
        runMock: devinAcpSessionRunMock,
      },
      {
        agentType: 'trae',
        command: 'traecli',
        constructMock: traeAcpSessionConstructMock,
        label: 'TRAE ACP',
        runMock: traeAcpSessionRunMock,
      },
    ] as const)(
      'does not start $label when cancelled during transport preparation',
      async ({ agentType, command, constructMock, runMock }) => {
        const send = vi.fn();
        mockGetAllWindows.mockReturnValue([
          {
            isDestroyed: () => false,
            webContents: { send },
          },
        ]);
        const ctr = new HeterogeneousAgentCtr({
          appStoragePath,
          storeManager: { get: vi.fn() },
        } as any);
        const { sessionId } = await ctr.startSession({
          agentType,
          command,
        });
        let completePreparation!: () => void;
        const createTraceSession = vi
          .spyOn(ctr as any, 'createCliTraceSession')
          .mockImplementationOnce(
            () =>
              new Promise<void>((resolve) => {
                completePreparation = resolve;
              }),
          );

        const sendPrompt = ctr.sendPrompt({
          operationId: `op-cancel-${agentType}`,
          prompt: 'work',
          sessionId,
        });
        await vi.waitFor(() => expect(createTraceSession).toHaveBeenCalledOnce());

        await ctr.cancelSession({ sessionId });
        completePreparation();
        await sendPrompt;

        expect(constructMock).not.toHaveBeenCalled();
        expect(runMock).not.toHaveBeenCalled();
        expect(spawnCalls).toHaveLength(0);
        expect(send).toHaveBeenCalledWith('heteroAgentSessionComplete', { sessionId });
      },
    );
  });

  describe('spawnLhHeteroExec', () => {
    const params = {
      agentType: 'opencode',
      assistantMessageId: 'asst-gateway',
      jwt: 'device-jwt',
      operationId: 'op-gateway',
      prompt: 'inspect the repository',
      serverUrl: 'https://server.example.com',
      topicId: 'topic-gateway',
    };

    const createGatewayCliProc = () => {
      const proc = new EventEmitter() as any;
      const stdin = new EventEmitter() as any;
      stdin.end = vi.fn();
      stdin.write = vi.fn(() => true);
      proc.kill = vi.fn(() => true);
      proc.pid = 4321;
      proc.stdin = stdin;
      return proc;
    };

    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(true);
      spawnCalls.length = 0;
      nextFakeProc = null;
    });

    it('uses the self-contained embedded CLI instead of a global lh from PATH', async () => {
      const proc = createGatewayCliProc();
      nextFakeProc = proc;
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const ack = ctr.spawnLhHeteroExec(params);

      expect(spawnCalls).toHaveLength(1);
      const [spawnCall] = spawnCalls;
      expect(spawnCall.command).toBe(process.execPath);
      expect(spawnCall.args.slice(0, 7)).toEqual([
        '/fake/cli/dist/index.js',
        'hetero',
        'exec',
        '--type',
        'opencode',
        '--operation-id',
        'op-gateway',
      ]);
      expect(spawnCall.options.cwd).toBe(process.cwd());
      expect(spawnCall.options.windowsHide).toBe(true);
      expect(spawnCall.options.env).toEqual(
        expect.objectContaining({
          ELECTRON_RUN_AS_NODE: '1',
          [HETERO_EXEC_INHERIT_PROCESS_GROUP_ENV]: '1',
          ORVILO_ASSISTANT_MESSAGE_ID: 'asst-gateway',
          ORVILO_JWT: 'device-jwt',
          ORVILO_SERVER: 'https://server.example.com',
        }),
      );
      expect(spawnCall.options.env).not.toHaveProperty('ORVILO_WORKSPACE_ID');
      expect(proc.stdin.write).not.toHaveBeenCalled();

      proc.emit('spawn');

      await expect(ack).resolves.toEqual({ status: 'accepted' });
      expect(proc.stdin.write).toHaveBeenCalledOnce();
      expect(proc.stdin.end).toHaveBeenCalledOnce();
    });

    it('forwards the topic workspace as ORVILO_WORKSPACE_ID for ingest', async () => {
      const proc = createGatewayCliProc();
      nextFakeProc = proc;
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const ack = ctr.spawnLhHeteroExec({ ...params, workspaceId: 'ws-orvilo' });
      proc.emit('spawn');
      await expect(ack).resolves.toEqual({ status: 'accepted' });

      expect(spawnCalls[0].options.env).toEqual(
        expect.objectContaining({ ORVILO_WORKSPACE_ID: 'ws-orvilo' }),
      );
    });

    it('encodes primary and resume fallback contexts for the embedded CLI', async () => {
      const proc = createGatewayCliProc();
      nextFakeProc = proc;
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const ack = ctr.spawnLhHeteroExec({
        ...params,
        resumeFallbackSystemContext: 'workspace rules\n\nprevious conversation',
        resumeSessionId: 'session-1',
        systemContext: 'workspace rules',
      });
      proc.emit('spawn');

      await expect(ack).resolves.toEqual({ status: 'accepted' });
      expect(proc.stdin.write).toHaveBeenCalledWith(
        JSON.stringify({
          content: [
            { text: 'workspace rules', type: 'text' },
            { text: 'inspect the repository', type: 'text' },
          ],
          resumeFallback: [
            { text: 'workspace rules\n\nprevious conversation', type: 'text' },
            { text: 'inspect the repository', type: 'text' },
          ],
        }),
      );
    });

    it('rejects the gateway request when the embedded CLI cannot spawn', async () => {
      const proc = createGatewayCliProc();
      nextFakeProc = proc;
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const ack = ctr.spawnLhHeteroExec(params);
      proc.emit('error', new Error('spawn EACCES'));

      await expect(ack).resolves.toEqual({ reason: 'spawn EACCES', status: 'rejected' });
      expect(proc.stdin.write).not.toHaveBeenCalled();
    });

    it('starts the wrapper from home so its inner preflight can report a missing cwd', async () => {
      const missingCwd = '/missing/project';
      const proc = createGatewayCliProc();
      nextFakeProc = proc;
      mockMissingDir(missingCwd);
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const ack = ctr.spawnLhHeteroExec({ ...params, cwd: missingCwd });

      expect(spawnCalls).toHaveLength(1);
      const [spawnCall] = spawnCalls;
      const cwdArgIndex = spawnCall.args.indexOf('--cwd');
      expect(spawnCall.options.cwd).toBe(os.homedir());
      expect(spawnCall.args[cwdArgIndex + 1]).toBe(missingCwd);
      expect(spawnCall.args).not.toContain('--raw-dump');
      proc.emit('spawn');

      await expect(ack).resolves.toEqual({ status: 'accepted' });
      expect(proc.stdin.write).toHaveBeenCalledOnce();
    });

    it('rejects before spawn when the embedded CLI is missing', async () => {
      vi.mocked(existsSync).mockImplementation(
        (candidate) => candidate !== '/fake/cli/dist/index.js',
      );
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      await expect(ctr.spawnLhHeteroExec(params)).resolves.toEqual({
        reason: 'Embedded CLI not found at /fake/cli/dist/index.js',
        status: 'rejected',
      });
      expect(spawnCalls).toHaveLength(0);
    });

    it('rejects a synchronous stdin write failure without throwing from the event handler', async () => {
      const proc = createGatewayCliProc();
      proc.stdin.write.mockImplementationOnce(() => {
        throw new Error('write EPIPE');
      });
      nextFakeProc = proc;
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const ack = ctr.spawnLhHeteroExec(params);
      expect(() => proc.emit('spawn')).not.toThrow();

      await expect(ack).resolves.toEqual({ reason: 'write EPIPE', status: 'rejected' });
    });

    it('handles a late stdin EPIPE after acceptance without an uncaught stream error', async () => {
      const proc = createGatewayCliProc();
      nextFakeProc = proc;
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      const ack = ctr.spawnLhHeteroExec(params);
      proc.emit('spawn');
      await expect(ack).resolves.toEqual({ status: 'accepted' });

      expect(() => proc.stdin.emit('error', new Error('write EPIPE'))).not.toThrow();
    });

    /**
     * @example A replacement waits until operation A's process group exits before operation B starts.
     */
    it('waits for the complete gateway CLI process group before confirming cancellation', async () => {
      // ROOT CAUSE:
      //
      // Device-dispatched Codex wrappers were not registered by operation id, so
      // server cancellation returned while the native thread still had an active
      // writer. A replacement resume then failed with `already has an active writer`.
      //
      // Before: spawnLhHeteroExec acknowledged the child and discarded its handle.
      // After: cancelLhHeteroExec signals the wrapper-owned process group and
      // resolves only after the complete group disappears.
      vi.useFakeTimers();
      let groupAlive = true;
      const killSpy = vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
        if (signal === 'SIGKILL') groupAlive = false;
        if (signal === 0 && !groupAlive) {
          throw Object.assign(new Error('No such process'), { code: 'ESRCH' });
        }
        return true;
      });
      const proc = createGatewayCliProc();
      nextFakeProc = proc;
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);

      try {
        const ack = ctr.spawnLhHeteroExec(params);
        proc.emit('spawn');
        await ack;

        let cancellationSettled = false;
        const cancellation = ctr
          .cancelLhHeteroExec({ operationId: params.operationId })
          .then((result) => {
            cancellationSettled = true;
            return result;
          });
        await Promise.resolve();

        expect(killSpy).toHaveBeenCalledWith(-4321, 'SIGINT');
        expect(cancellationSettled).toBe(false);

        // The wrapper can exit while a native agent or tool descendant remains.
        proc.emit('exit', 130, 'SIGINT');
        await vi.advanceTimersByTimeAsync(1950);
        expect(cancellationSettled).toBe(false);

        await vi.advanceTimersByTimeAsync(100);
        expect(killSpy).toHaveBeenCalledWith(-4321, 'SIGKILL');
        await expect(cancellation).resolves.toEqual({
          exited: true,
          pid: 4321,
          signal: 'SIGINT',
        });
      } finally {
        killSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  /**
   * Node may emit `proc.on('exit')` BEFORE stdout fully drains (documented in
   * child_process docs as "stdio streams might still be open"). The phase 0
   * refactor moved adapter ownership to main, so renderer no longer flushes
   * its own adapter on session-complete — meaning trailing events from
   * `pipeline.flush()` (e.g. Codex's synthesized `tool_end` for unfinished
   * tool calls) would race against — and lose to — the
   * `heteroAgentSessionComplete` broadcast without an explicit gate.
   *
   * The fix in `proc.on('exit')` is to await stdout `'end'/'close'` (so the
   * `stdout.on('end')` handler can schedule `pipeline.flush()` onto the
   * broadcast queue), then drain the queue, then broadcast complete.
   */
  /**
   * ACP sessions own their stream pipeline internally — `run()` only resolves
   * after the adapter has flushed trailing events (e.g. Codex's synthesized
   * `tool_end` for unfinished tool calls), so every event this controller
   * broadcasts necessarily lands before `heteroAgentSessionComplete`.
   */
  describe('event ordering', () => {
    let broadcasts: Array<{ channel: string; data: any }>;

    beforeEach(() => {
      spawnCalls.length = 0;
      execFileMock.mockReset();
      broadcasts = [];
      mockGetAllWindows.mockImplementation(() => [
        {
          isDestroyed: () => false,
          webContents: {
            send: (channel: string, data: any) => broadcasts.push({ channel, data }),
          },
        },
      ]);
    });

    afterEach(() => {
      mockGetAllWindows.mockReset();
      mockGetAllWindows.mockReturnValue([]);
    });

    it('delivers every session event BEFORE heteroAgentSessionComplete', async () => {
      standardAcpSessionRunMock.mockImplementation(async (options) => {
        const now = Date.now();
        options.onSessionId?.('codex-native-session');
        await options.onEvents?.([
          {
            data: { content: 'Final report.', contentType: 'text' },
            operationId: options.operationId,
            stepIndex: 0,
            timestamp: now,
            type: 'stream_chunk',
          },
          {
            data: { stopReason: 'end_turn' },
            operationId: options.operationId,
            stepIndex: 1,
            timestamp: now,
            type: 'agent_runtime_end',
          },
        ]);
      });

      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({ agentType: 'codex', command: 'codex' });
      await ctr.sendPrompt({ operationId: 'op-test', prompt: 'hello', sessionId });

      const completeIdx = broadcasts.findIndex((b) => b.channel === 'heteroAgentSessionComplete');
      const lastEventIdx = broadcasts.findLastIndex((b) => b.channel === 'heteroAgentEvent');

      expect(completeIdx).toBeGreaterThan(-1);
      expect(lastEventIdx).toBeGreaterThan(-1);
      // No trailing events sneak in after the renderer has been told the
      // session is done.
      expect(lastEventIdx).toBeLessThan(completeIdx);
    });
  });

  describe('app-quit cleanup', () => {
    // `before-quit` covers the user-driven Cmd+Q / `app.quit()` path; SIGTERM /
    // SIGINT cover external kills (test harnesses, OS shutdown) where Electron's
    // lifecycle events never fire. Active ACP sessions must be closed so their
    // vendor children don't outlive the host.

    const captureRegisteredHandler = (
      registerSpy: ReturnType<typeof vi.fn> | ReturnType<typeof vi.spyOn>,
      eventName: string,
    ): (() => void) => {
      const calls = (registerSpy as any).mock.calls as Array<[string, () => void]>;
      const match = calls.findLast(([evt]) => evt === eventName);
      if (!match) throw new Error(`no handler registered for "${eventName}"`);
      return match[1];
    };

    it('before-quit closes a running TRAE ACP session', async () => {
      const electron = (await import('electron')) as any;
      electron.app.on.mockClear();
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({ agentType: 'trae', command: 'traecli' });
      const session = (ctr as any).sessions.get(sessionId);
      session.traeAcpSession = { close: traeAcpSessionCloseMock };

      ctr.afterAppReady();
      const beforeQuit = captureRegisteredHandler(electron.app.on, 'before-quit');
      beforeQuit();

      expect(traeAcpSessionCloseMock).toHaveBeenCalledOnce();
      expect(session.cancelledByUs).toBe(true);
      expect((ctr as any).sessions.has(sessionId)).toBe(false);
    });

    it('before-quit closes a running standard ACP session', async () => {
      const electron = (await import('electron')) as any;
      electron.app.on.mockClear();
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({ agentType: 'codex', command: 'codex' });
      const session = (ctr as any).sessions.get(sessionId);
      session.standardAcpSession = { close: standardAcpSessionCloseMock };

      ctr.afterAppReady();
      const beforeQuit = captureRegisteredHandler(electron.app.on, 'before-quit');
      beforeQuit();

      expect(standardAcpSessionCloseMock).toHaveBeenCalledOnce();
      expect(session.cancelledByUs).toBe(true);
      expect((ctr as any).sessions.has(sessionId)).toBe(false);
    });

    it('stopSession closes the active standard ACP session', async () => {
      const ctr = new HeterogeneousAgentCtr({
        appStoragePath,
        storeManager: { get: vi.fn() },
      } as any);
      const { sessionId } = await ctr.startSession({ agentType: 'codex', command: 'codex' });
      const session = (ctr as any).sessions.get(sessionId);
      session.standardAcpSession = { close: standardAcpSessionCloseMock };

      await ctr.stopSession({ sessionId });

      expect(standardAcpSessionCloseMock).toHaveBeenCalledOnce();
      expect((ctr as any).sessions.has(sessionId)).toBe(false);
    });
  });
});
