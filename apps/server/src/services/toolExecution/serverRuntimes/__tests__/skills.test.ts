import { beforeEach, describe, expect, it, vi } from 'vitest';

import { skillsRuntime } from '../skills';

const mocks = vi.hoisted(() => {
  const sandboxService = {
    callTool: vi.fn(),
    capabilities: {
      backgroundCommands: true,
      exportFile: true,
      files: true,
      languages: ['python'],
      persistentSession: true,
      shell: true,
      skillScripts: true,
    },
    exportAndUploadFile: vi.fn(),
    kind: 'onlyboxes',
  };

  return {
    buildDeviceLhEnv: vi.fn(),
    checkHash: vi.fn(),
    createSandboxService: vi.fn(function () {
      return sandboxService;
    }),
    executeToolCall: vi.fn(),
    fileService: {
      getFullFileUrl: vi.fn(),
    },
    findAll: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    isLhCommand: vi.fn(),
    getAgentConfigById: vi.fn(),
    getAgentSkills: vi.fn(),
    getUserSettings: vi.fn(),
    marketService: {},
    prepareSkillDirectory: vi.fn(),
    preprocessLhCommand: vi.fn(),
    readResource: vi.fn(),
    resolveContentWorkspaceId: vi.fn(),
    resolveRunWorkspaceId: vi.fn(),
    sandboxService,
  };
});

vi.mock('@orvilo/edge-config', () => ({ EdgeConfig: vi.fn() }));

vi.mock('@orvilo/builtin-skills', () => ({
  builtinSkills: [],
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn(function () {
    return {
      getAgentConfigById: mocks.getAgentConfigById,
    };
  }),
}));

vi.mock('@/database/models/agentSkill', () => ({
  AgentSkillModel: vi.fn(function () {
    return {
      findAll: mocks.findAll,
      findById: mocks.findById,
      findByName: mocks.findByName,
    };
  }),
}));

vi.mock('@/database/models/file', () => ({
  FileModel: vi.fn(function () {
    return {
      checkHash: mocks.checkHash,
    };
  }),
}));

vi.mock('@/database/models/user', () => ({
  UserModel: vi.fn(function () {
    return {
      getUserSettings: mocks.getUserSettings,
    };
  }),
}));

vi.mock('@/helpers/skillFilters', () => ({
  filterBuiltinSkills: vi.fn(function (skills: unknown) {
    return skills;
  }),
}));

vi.mock('@/server/services/agentDocuments', () => ({
  AgentDocumentsService: vi.fn(function () {
    return {
      getAgentSkills: mocks.getAgentSkills,
    };
  }),
}));

vi.mock('@/server/services/file', () => ({
  FileService: vi.fn(function () {
    return mocks.fileService;
  }),
}));

vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn(function () {
    return mocks.marketService;
  }),
}));

vi.mock('@/server/services/sandbox', async () => {
  const actual = await vi.importActual('@/server/services/sandbox');

  return {
    ...(actual as Record<string, unknown>),
    createSandboxService: mocks.createSandboxService,
  };
});

vi.mock('@/server/services/skill/resource', () => ({
  SkillResourceService: vi.fn(function () {
    return {
      readResource: mocks.readResource,
    };
  }),
}));

vi.mock('@/server/services/toolExecution/preprocessLhCommand', () => ({
  buildDeviceLhEnv: mocks.buildDeviceLhEnv,
  isLhCommand: mocks.isLhCommand,
  preprocessLhCommand: mocks.preprocessLhCommand,
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: {
    prepareSkillDirectory: mocks.prepareSkillDirectory,
  },
}));

vi.mock('@/server/services/deviceGateway/authorizedToolCall', () => ({
  executeAuthorizedDeviceToolCall: (_serverDB: unknown, ...args: unknown[]) =>
    mocks.executeToolCall(...args),
}));

vi.mock('../resolveWorkspaceScope', () => ({
  resolveContentWorkspaceId: mocks.resolveContentWorkspaceId,
  resolveRunWorkspaceId: mocks.resolveRunWorkspaceId,
}));

describe('skillsRuntime', () => {
  it.each(
    (['runCommand', 'execScript', 'exportFile'] as const).flatMap((api) =>
      (['returned', 'thrown', 'stderr'] as const)
        .filter((mode) => api !== 'exportFile' || mode !== 'stderr')
        .map((mode) => ({ api, mode })),
    ),
  )(
    'preserves sandbox $mode errors through the $api runtime',
    async ({ api, mode }) => {
      const error = { name: 'MarketAPIError', message: 'Forbidden' };
      mocks.sandboxService.callTool.mockResolvedValue({ error, result: null, success: false });
      mocks.sandboxService.exportAndUploadFile.mockResolvedValue({
        error,
        filename: 'page.html',
        success: false,
      });
      if (mode === 'thrown') {
        const thrown = Object.assign(new Error('Forbidden'), { status: 403 });
        mocks.sandboxService.callTool.mockRejectedValue(thrown);
        mocks.sandboxService.exportAndUploadFile.mockRejectedValue(thrown);
      } else if (mode === 'stderr') {
        mocks.sandboxService.callTool.mockResolvedValue({
          success: true,
          result: { success: false, exitCode: 1, stdout: '', stderr: 'Forbidden' },
        });
      }
      const runtime = await skillsRuntime.factory({
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
      });
      const execute = () =>
        api === 'exportFile'
          ? runtime.exportFile({ path: '/page.html', filename: 'page.html' })
          : runtime[api]({ command: 'echo example', description: 'Example' });
      const result = await execute();
      expect(result.success).toBe(false);
      if (mode === 'stderr') {
        expect(result.content).toContain('Forbidden');
        expect(result.content).not.toContain('Do not retry');
        expect(result.error?.code).not.toBe('FORBIDDEN');
        return;
      }
      expect(result.error).toMatchObject(
        mode === 'thrown'
          ? {
              code: 'FORBIDDEN',
              hint: expect.stringContaining('Do not retry'),
              kind: 'stop',
              message: 'Forbidden',
            }
          : error,
      );
    },
    30_000,
  );

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.checkHash.mockResolvedValue({ isExist: true, url: 'skills/user-skill.zip' });
    mocks.fileService.getFullFileUrl.mockResolvedValue('https://files.example.com/user-skill.zip');
    mocks.findAll.mockResolvedValue({ data: [], total: 0 });
    mocks.findById.mockResolvedValue(undefined);
    mocks.getAgentConfigById.mockResolvedValue(undefined);
    mocks.findByName.mockImplementation(async (name: string) => {
      if (name === 'user-skill') {
        return {
          id: 'user-skill-id',
          name: 'user-skill',
          zipFileHash: 'zip-hash-1',
        };
      }

      return undefined;
    });
    mocks.getAgentSkills.mockResolvedValue([]);
    mocks.getUserSettings.mockResolvedValue({ market: { accessToken: 'market-token' } });
    // Pass-through by default: the runtime now routes both runCommand and
    // execScript through preprocessing, so a fixed return value would rewrite
    // every command in the suite.
    mocks.preprocessLhCommand.mockImplementation(async (command: string) => ({
      command,
      isLhCommand: false,
      skipSkillLookup: false,
    }));
    mocks.isLhCommand.mockReturnValue(false);
    mocks.buildDeviceLhEnv.mockReturnValue(undefined);
    mocks.resolveContentWorkspaceId.mockResolvedValue(undefined);
    mocks.resolveRunWorkspaceId.mockResolvedValue(undefined);
    mocks.sandboxService.callTool.mockResolvedValue({
      result: {
        exitCode: 0,
        output: 'ok',
        stdout: 'ok',
        success: true,
      },
      success: true,
    });
  });

  // First dynamic `import('../skills')` in the file pays the real transform
  // cost for this (now larger) module — default 5s timeout is marginal for
  // that cold cost alone, independent of test logic.
  it('executes sandbox scripts without distributing persisted skill zips', async () => {
    const { skillsRuntime } = await import('../skills');
    const runtime = await skillsRuntime.factory({
      serverDB: {} as never,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
    });

    const result = await runtime.execScript({
      activatedSkills: [
        { id: 'user-skill-id', name: 'user-skill' },
        { id: 'builtin-skill-id', name: 'builtin-skill' },
      ],
      command: 'python scripts/run.py',
      description: 'Run skill script',
    });

    expect(result.success).toBe(true);
    expect(mocks.checkHash).not.toHaveBeenCalled();
    expect(mocks.sandboxService.callTool.mock.calls[0][1]).not.toHaveProperty('skillZipUrls');
  }, 20_000);

  it('tags sandbox exec results with executionEnv for plugin-state observability', async () => {
    const { skillsRuntime } = await import('../skills');
    const runtime = await skillsRuntime.factory({
      serverDB: {} as never,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
    });

    const result = await runtime.execScript({
      activatedSkills: [],
      command: 'echo hi',
      description: 'plain command',
    });

    expect(result.state).toMatchObject({ executionEnv: 'sandbox' });
  });

  it('passes workspace scope when preprocessing sandbox orvilo commands', async () => {
    mocks.preprocessLhCommand.mockResolvedValueOnce({
      command: 'ORVILO_WORKSPACE_ID=workspace-1 npx -y @orvilo/cli agent edit agt_123',
      isLhCommand: true,
      skipSkillLookup: true,
    });

    const { skillsRuntime } = await import('../skills');
    const runtime = await skillsRuntime.factory({
      serverDB: {} as never,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });

    await runtime.runCommand({ command: 'orvilo agent edit agt_123 -s "new prompt"' });

    expect(mocks.preprocessLhCommand).toHaveBeenCalledWith(
      'orvilo agent edit agt_123 -s "new prompt"',
      'user-1',
      'workspace-1',
    );
    expect(mocks.sandboxService.callTool).toHaveBeenCalledWith('runCommand', {
      command: 'ORVILO_WORKSPACE_ID=workspace-1 npx -y @orvilo/cli agent edit agt_123',
    });
  });

  it('recovers workspace scope for sandbox orvilo commands when context lost it', async () => {
    mocks.preprocessLhCommand.mockResolvedValueOnce({
      command: 'ORVILO_WORKSPACE_ID=workspace-1 npx -y @orvilo/cli agent edit agt_123',
      isLhCommand: true,
      skipSkillLookup: true,
    });
    mocks.isLhCommand.mockReturnValue(true);
    mocks.resolveContentWorkspaceId.mockResolvedValueOnce('workspace-1');

    const { skillsRuntime } = await import('../skills');
    const runtime = await skillsRuntime.factory({
      agentId: 'agent-1',
      serverDB: {} as never,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
    });

    await runtime.runCommand({ command: 'orvilo agent edit agt_123 -s "new prompt"' });

    expect(mocks.resolveContentWorkspaceId).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-1' }),
    );
    expect(mocks.preprocessLhCommand).toHaveBeenCalledWith(
      'orvilo agent edit agt_123 -s "new prompt"',
      'user-1',
      'workspace-1',
    );
  });

  // The client-side executor (routers/tools/market.ts) has always preprocessed
  // execScript too; on Cloud, where gateway mode routes through this runtime
  // instead, `orvilo` inside execScript reached the sandbox raw — no CLI, no
  // credentials, no workspace scope.
  it('preprocesses orvilo commands passed to execScript, not just runCommand', async () => {
    mocks.preprocessLhCommand.mockResolvedValueOnce({
      command:
        'orvilo() { ORVILO_WORKSPACE_ID=\'workspace-1\' npx -y @orvilo/cli "$@"; }\nlh agent edit agt_123 -t x',
      isLhCommand: true,
      skipSkillLookup: true,
    });

    const { skillsRuntime } = await import('../skills');
    const runtime = await skillsRuntime.factory({
      serverDB: {} as never,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });

    await runtime.execScript({
      activatedSkills: [],
      command: 'orvilo agent edit agt_123 -t x',
      description: 'Edit myself',
    });

    expect(mocks.preprocessLhCommand).toHaveBeenCalledWith(
      'orvilo agent edit agt_123 -t x',
      'user-1',
      'workspace-1',
    );
    expect(mocks.sandboxService.callTool).toHaveBeenCalledWith(
      'execScript',
      expect.objectContaining({
        command:
          'orvilo() { ORVILO_WORKSPACE_ID=\'workspace-1\' npx -y @orvilo/cli "$@"; }\nlh agent edit agt_123 -t x',
      }),
    );
  });

  it('surfaces a preprocessing auth failure from execScript instead of running raw', async () => {
    mocks.preprocessLhCommand.mockResolvedValueOnce({
      command: 'orvilo agent list',
      error: 'Failed to authenticate for CLI execution',
      isLhCommand: true,
      skipSkillLookup: true,
    });

    const { skillsRuntime } = await import('../skills');
    const runtime = await skillsRuntime.factory({
      serverDB: {} as never,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
    });

    const result = await runtime.execScript({
      activatedSkills: [],
      command: 'orvilo agent list',
      description: 'List agents',
    });

    expect(mocks.sandboxService.callTool).not.toHaveBeenCalled();
    expect(result.state).toMatchObject({ success: false });
  });

  it('scopes device-routed execScript orvilo commands to the run workspace', async () => {
    mocks.buildDeviceLhEnv.mockReturnValue({ ORVILO_WORKSPACE_ID: 'workspace-1' });
    mocks.resolveContentWorkspaceId.mockResolvedValue('workspace-1');
    mocks.executeToolCall.mockResolvedValue({
      state: { exitCode: 0, stdout: 'ok', success: true },
      success: true,
    });

    const { skillsRuntime } = await import('../skills');
    const runtime = await skillsRuntime.factory({
      activeDeviceId: 'device-1',
      agentId: 'agent-1',
      operationId: 'op-1',
      serverDB: {} as never,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });

    await runtime.execScript({
      activatedSkills: [],
      command: 'orvilo agent edit agt_123 -t x',
      description: 'Edit myself',
    });

    const [, toolCall] = mocks.executeToolCall.mock.calls.at(-1)!;
    expect(JSON.parse(toolCall.arguments).env).toEqual({ ORVILO_WORKSPACE_ID: 'workspace-1' });
    // Auth stays with the device — the caller's token must not travel there.
    expect(JSON.parse(toolCall.arguments).env).not.toHaveProperty('ORVILO_JWT');
  });

  describe('disabled skill enforcement', () => {
    it('refuses to activate a DB skill the agent has disabled, even though it exists', async () => {
      mocks.getAgentConfigById.mockResolvedValue({
        plugins: [{ identifier: 'user-skill-identifier', mode: 'disabled' }],
      });
      mocks.findByName.mockImplementation(async (name: string) =>
        name === 'user-skill'
          ? { id: 'user-skill-id', identifier: 'user-skill-identifier', name: 'user-skill' }
          : undefined,
      );

      const { skillsRuntime } = await import('../skills');
      const runtime = await skillsRuntime.factory({
        agentId: 'agent-1',
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
      });

      const result = await runtime.activateSkill({ name: 'user-skill' });

      expect(result.success).toBe(false);
    });

    it('still activates the skill when it is not disabled', async () => {
      mocks.getAgentConfigById.mockResolvedValue({ plugins: [] });
      mocks.findByName.mockImplementation(async (name: string) =>
        name === 'user-skill'
          ? {
              content: '# User skill',
              id: 'user-skill-id',
              identifier: 'user-skill-identifier',
              name: 'user-skill',
            }
          : undefined,
      );

      const { skillsRuntime } = await import('../skills');
      const runtime = await skillsRuntime.factory({
        agentId: 'agent-1',
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
      });

      const result = await runtime.activateSkill({ name: 'user-skill' });

      expect(result.success).toBe(true);
    });
  });

  // Regression guard for the server/gateway migration: when the execution plan
  // routed a device (activeDeviceId present), execScript must run ON the device
  // — prepare the skill archives via the prepareSkillDirectory RPC and execute
  // through local-system over the gateway — never in the cloud sandbox.
  describe('device execution branch', () => {
    it('ignores platform archives while keeping routed local command execution', async () => {
      mocks.executeToolCall.mockResolvedValue({
        content: 'ok',
        state: { exitCode: 0, stdout: 'ok', success: true },
        success: true,
      });
      const { skillsRuntime } = await import('../skills');
      const runtime = await skillsRuntime.factory({
        activeDeviceId: 'device-1',
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
      });
      const result = await runtime.execScript({
        activatedSkills: [{ id: 'user-skill-id', name: 'user-skill' }],
        command: 'echo ok',
        description: 'Run script',
      });
      expect(result.success).toBe(true);
      expect(mocks.prepareSkillDirectory).not.toHaveBeenCalled();
      expect(mocks.checkHash).not.toHaveBeenCalled();
      expect(mocks.sandboxService.callTool).not.toHaveBeenCalled();
    });

    it('runs without a skill dir (workingDirectory cwd) when no archive exists', async () => {
      mocks.executeToolCall.mockResolvedValue({
        content: 'ok',
        state: { exitCode: 0, stdout: 'ok', success: true },
        success: true,
      });

      const { skillsRuntime } = await import('../skills');
      const runtime = await skillsRuntime.factory({
        activeDeviceId: 'device-1',
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
        workingDirectory: '/Users/me/project',
      });

      const result = await runtime.execScript({
        activatedSkills: [{ id: 'builtin-skill-id', name: 'builtin-skill' }],
        command: 'echo hi',
        description: 'no archive',
      });

      expect(result.success).toBe(true);
      expect(mocks.prepareSkillDirectory).not.toHaveBeenCalled();
      expect(mocks.executeToolCall).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          arguments: JSON.stringify({ command: 'echo hi', cwd: '/Users/me/project' }),
        }),
        undefined,
      );
    });

    // Filesystem (project/device) skills have no DB archive — their SKILL.md
    // directory on the device is the cwd, and the last activated skill wins
    // over earlier archive-backed ones.
    it('uses the project skill directory as cwd, winning over earlier archives', async () => {
      mocks.prepareSkillDirectory.mockResolvedValue({
        extractedDir: '/home/user/.orvilo/skills/extracted/zip-hash-1',
        success: true,
      });
      mocks.executeToolCall.mockResolvedValue({
        content: 'ok',
        state: { exitCode: 0, stdout: 'ok', success: true },
        success: true,
      });

      const { skillsRuntime } = await import('../skills');
      const runtime = await skillsRuntime.factory({
        activeDeviceId: 'device-1',
        projectSkills: [
          { location: '/ws/.agents/skills/foo/SKILL.md', name: 'foo', source: 'project' },
        ],
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
      });

      const result = await runtime.execScript({
        activatedSkills: [
          { id: 'user-skill-id', name: 'user-skill' },
          // Filesystem activations carry no DB id — matching is by name only.
          { name: 'foo' },
        ],
        command: 'python scripts/run.py',
        description: 'Run project skill script',
      });

      expect(result.success).toBe(true);
      // The archive-backed skill is still prepared (activated earlier)...
      expect(mocks.prepareSkillDirectory).not.toHaveBeenCalled();
      // ...but the project skill activated last wins the cwd.
      expect(mocks.executeToolCall).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          arguments: JSON.stringify({
            command: 'python scripts/run.py',
            cwd: '/ws/.agents/skills/foo',
          }),
        }),
        undefined,
      );
    });

    it('reports a still-running command instead of pretending completion', async () => {
      mocks.executeToolCall.mockResolvedValue({
        content: 'Command is still running after the wait window.',
        state: { commandId: 'shell-9', stdout: '', success: true },
        success: true,
      });

      const { skillsRuntime } = await import('../skills');
      const runtime = await skillsRuntime.factory({
        activeDeviceId: 'device-1',
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
      });

      const result = await runtime.execScript({
        activatedSkills: [],
        command: 'sleep 600',
        description: 'long script',
      });

      expect(result.success).toBe(true);
      expect(result.state).toMatchObject({ executionEnv: 'device', shellId: 'shell-9' });
      expect(result.state).not.toHaveProperty('exitCode', 0);
      expect(result.content).toContain('still running');
      expect(result.content).toContain('shell-9');
      expect(result.content).not.toContain('completed successfully');
    });

    // The device ComputerRuntime reports service failures (spawn error, shell
    // lost) with a delivered envelope: `success: true`, `state.success:
    // false`, and no exitCode — they must surface as failures, not as a
    // still-running command.
    it('reports failure when the device service fails without an exit code', async () => {
      mocks.executeToolCall.mockResolvedValue({
        content: 'spawn ENOENT',
        state: { error: 'spawn ENOENT', isBackground: false, success: false },
        success: true,
      });

      const { skillsRuntime } = await import('../skills');
      const runtime = await skillsRuntime.factory({
        activeDeviceId: 'device-1',
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
      });

      const result = await runtime.execScript({
        activatedSkills: [],
        command: 'python scripts/run.py',
        description: 'spawn failure',
      });

      expect(result.success).toBe(false);
      expect(result.content).toContain('spawn ENOENT');
      expect(result.content).not.toContain('still running');
    });

    // The device shell observation reports success: true for any delivered
    // observation — the actual exit status only lives in exitCode.
    it('reports failure when the script exits non-zero despite a successful observation', async () => {
      mocks.executeToolCall.mockResolvedValue({
        content: '',
        state: { exitCode: 2, stderr: 'boom', stdout: '', success: true },
        success: true,
      });

      const { skillsRuntime } = await import('../skills');
      const runtime = await skillsRuntime.factory({
        activeDeviceId: 'device-1',
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
      });

      const result = await runtime.execScript({
        activatedSkills: [],
        command: 'exit 2',
        description: 'failing script',
      });

      expect(result.success).toBe(false);
      expect(result.state).toMatchObject({ executionEnv: 'device', exitCode: 2 });
      expect(result.content).toContain('boom');
    });

    it('forwards executionTimeoutMs as the shell observation timeout in the runCommand args', async () => {
      mocks.executeToolCall.mockResolvedValue({
        content: 'ok',
        state: { exitCode: 0, stdout: 'ok', success: true },
        success: true,
      });

      const { skillsRuntime } = await import('../skills');
      const runtime = await skillsRuntime.factory({
        activeDeviceId: 'device-1',
        executionTimeoutMs: 300_000,
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
      });

      await runtime.execScript({
        activatedSkills: [],
        command: 'sleep 60',
        description: 'long script',
      });

      expect(mocks.executeToolCall).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          arguments: JSON.stringify({ command: 'sleep 60', timeout: 300_000 }),
        }),
        300_000,
      );
    });

    // Large streams are truncated to a preview device-side with the full
    // output saved to disk — dropping state.outputFiles would lose the only
    // retrieval path for the truncated output.
    it('carries saved-output file paths through for truncated device output', async () => {
      mocks.executeToolCall.mockResolvedValue({
        content: 'preview…',
        state: {
          exitCode: 0,
          outputFiles: {
            stdout: {
              path: '/tmp/orvilo-shell/shell-1.stdout.log',
              size: 5_242_880,
              truncated: true,
            },
          },
          stdout: 'preview…',
          success: true,
        },
        success: true,
      });

      const { skillsRuntime } = await import('../skills');
      const runtime = await skillsRuntime.factory({
        activeDeviceId: 'device-1',
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
      });

      const result = await runtime.execScript({
        activatedSkills: [],
        command: 'cat big.log',
        description: 'noisy script',
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('/tmp/orvilo-shell/shell-1.stdout.log');
      expect(result.state).toMatchObject({
        outputFiles: { stdout: expect.objectContaining({ truncated: true }) },
      });
    });

    // The device manifest hides the sandbox-only APIs, but the builtin
    // executor dispatches any method on the runtime regardless of the
    // manifest — a prompt-following or hallucinated call must be refused at
    // execution time, not silently run in the sandbox.
    it('refuses the sandbox runCommand while a device is routed', async () => {
      const { skillsRuntime } = await import('../skills');
      const runtime = await skillsRuntime.factory({
        activeDeviceId: 'device-1',
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
      });

      const result = await runtime.runCommand({ command: 'ls' });

      expect(result.success).toBe(false);
      expect(result.content).toContain('orvilo-local-system');
      expect(mocks.createSandboxService).not.toHaveBeenCalled();
    });

    it('refuses the sandbox exportFile while a device is routed', async () => {
      const { skillsRuntime } = await import('../skills');
      const runtime = await skillsRuntime.factory({
        activeDeviceId: 'device-1',
        serverDB: {} as never,
        toolManifestMap: {},
        topicId: 'topic-1',
        userId: 'user-1',
      });

      const result = await runtime.exportFile({ filename: 'out.csv', path: '/tmp/out.csv' });

      expect(result.success).toBe(false);
      expect(result.content).toContain("already on the user's machine");
      expect(mocks.sandboxService.exportAndUploadFile).not.toHaveBeenCalled();
    });
  });

  // Regression guard for the device-gating fix: builtin skills must be filtered
  // with canExecuteOnDevice derived from the run's activeDeviceId, not the
  // compile-time isDesktop constant (always false on the server).
  it('gates device-only builtin skills on activeDeviceId presence', async () => {
    const { filterBuiltinSkills } = await import('@/helpers/skillFilters');
    const { skillsRuntime } = await import('../skills');

    await skillsRuntime.factory({
      serverDB: {} as never,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(filterBuiltinSkills).toHaveBeenLastCalledWith(expect.anything(), {
      canExecuteOnDevice: false,
    });

    await skillsRuntime.factory({
      activeDeviceId: 'device-1',
      serverDB: {} as never,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(filterBuiltinSkills).toHaveBeenLastCalledWith(expect.anything(), {
      canExecuteOnDevice: true,
    });
  });

  // Regression guard for the split-sandbox bug: the sandbox session is keyed by
  // the acting account, which is derived from the trusted-client token. Without
  // `workspaceId` this runtime acted as the personal account while `orvilo-creds`
  // and `orvilo-cloud-sandbox` (which pass it) acted as the workspace, so
  // credentials injected for a workspace topic were invisible to every command
  // run here.
  it('scopes the market identity to the run workspace so sandbox calls share one session', async () => {
    const { MarketService } = await import('@/server/services/market');
    const { skillsRuntime } = await import('../skills');

    await skillsRuntime.factory({
      serverDB: {} as never,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });

    expect(MarketService).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userInfo: { userId: 'user-1', workspaceId: 'workspace-1' },
      }),
    );

    await skillsRuntime.factory({
      serverDB: {} as never,
      toolManifestMap: {},
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(MarketService).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userInfo: { userId: 'user-1', workspaceId: undefined },
      }),
    );
  });
});
