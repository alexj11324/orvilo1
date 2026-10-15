import * as childProcess from 'node:child_process';
import type * as os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listDroidAcpModelsMock, listTraeAcpModelsMock } = vi.hoisted(() => ({
  listDroidAcpModelsMock: vi.fn(),
  listTraeAcpModelsMock: vi.fn(),
}));

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof os>('node:os');
  return { ...actual, platform: vi.fn(() => 'darwin') };
});

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));

vi.mock('../spawn/traeAcpSession', () => ({
  listTraeAcpModels: listTraeAcpModelsMock,
}));

vi.mock('../spawn/droidAcpSession', () => ({
  listDroidAcpModels: listDroidAcpModelsMock,
}));

const execFileMock = vi.mocked(childProcess.execFile);

const resolveExecFile = (stdout: string, stderr = '') => {
  execFileMock.mockImplementationOnce(((file: string, args: any, options: any, callback: any) => {
    callback(null, { stderr, stdout });
    return {} as any;
  }) as any);
};

const rejectExecFile = (error: Error) => {
  execFileMock.mockImplementationOnce(((file: string, args: any, options: any, callback: any) => {
    callback(error, { stderr: '', stdout: '' });
    return {} as any;
  }) as any);
};

const importModule = () => import('./listHeterogeneousAgentModels');

describe('heterogeneous agent model discovery', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    listDroidAcpModelsMock.mockReset();
    listTraeAcpModelsMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns the Claude Code static catalog without spawning ACP or the CLI', async () => {
    const { listHeterogeneousAgentModels } = await importModule();

    const result = await listHeterogeneousAgentModels({
      command: '/custom/claude',
      type: 'claude-code',
    });

    expect(result.status).toBe('success');
    expect(result.models).toEqual(
      expect.arrayContaining([
        { id: 'haiku', label: 'Haiku 5.5', modelId: 'haiku', providerId: 'anthropic' },
        { id: 'opus', label: 'Opus 5.5', modelId: 'opus', providerId: 'anthropic' },
      ]),
    );
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('lists Codex models from `debug models --bundled` and skips hidden slugs', async () => {
    resolveExecFile(
      JSON.stringify({
        models: [
          { display_name: 'GPT-5.4', slug: 'gpt-5.4' },
          { display_name: 'GPT-5.5 Mini', slug: 'gpt-5.5-mini', visibility: 'hide' },
          { display_name: 'GPT-6 Astra', slug: 'gpt-6-astra' },
        ],
      }),
    );
    const { listHeterogeneousAgentModels, parseCodexModelCatalog } = await importModule();

    expect(
      parseCodexModelCatalog(JSON.stringify({ models: [{ slug: 'gpt-5.4', visibility: 'hide' }] })),
    ).toEqual([]);

    await expect(
      listHeterogeneousAgentModels({ command: '/custom/codex', type: 'codex' }),
    ).resolves.toMatchObject({
      models: [
        { id: 'gpt-5.4', label: 'GPT-5.4', providerId: 'openai' },
        { id: 'gpt-6-astra', label: 'GPT-6 Astra', providerId: 'openai' },
      ],
      status: 'success',
    });
    expect(execFileMock).toHaveBeenCalledWith(
      '/custom/codex',
      ['debug', 'models', '--bundled'],
      expect.anything(),
      expect.any(Function),
    );
  });

  it('falls back to the Codex static catalog when discovery is empty or fails', async () => {
    resolveExecFile('{');
    const { listHeterogeneousAgentModels } = await importModule();

    await expect(
      listHeterogeneousAgentModels({ command: '/custom/codex', type: 'codex' }),
    ).resolves.toMatchObject({
      models: expect.arrayContaining([
        { id: 'gpt-6-astra', label: 'GPT-6 Astra', modelId: 'gpt-6-astra', providerId: 'openai' },
      ]),
      status: 'success',
    });

    rejectExecFile(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    const missing = await listHeterogeneousAgentModels({
      command: '/missing/codex',
      type: 'codex',
    });
    expect(missing.status).toBe('success');
    expect(missing.models.map((model) => model.id)).toContain('gpt-6-astra');
  });

  it('parses opaque model ids, splitting only at the first slash and preserving order', async () => {
    const { parseOpenCodeModelCatalog } = await importModule();

    expect(
      parseOpenCodeModelCatalog(
        [
          'openai/gpt-5.6',
          '',
          'openrouter/google/gemini-2.5-pro extra-columns',
          'cloudflare/@cf/meta/llama-3.1-8b-instruct',
          'openai/gpt-5.6',
          'PATH=/usr/local/bin:/usr/bin',
          'diagnostic-without-model-id',
        ].join('\n'),
      ),
    ).toEqual([
      { id: 'openai/gpt-5.6', modelId: 'gpt-5.6', providerId: 'openai' },
      {
        id: 'openrouter/google/gemini-2.5-pro',
        modelId: 'google/gemini-2.5-pro',
        providerId: 'openrouter',
      },
      {
        id: 'cloudflare/@cf/meta/llama-3.1-8b-instruct',
        modelId: '@cf/meta/llama-3.1-8b-instruct',
        providerId: 'cloudflare',
      },
    ]);
  });

  it('discovers only model IDs accepted by CodeBuddy --model', async () => {
    const stdout = [
      'Usage: codebuddy [options]',
      '  --model <model>  Model for the current session. Currently supported: (default-model,',
      '                   gemini-3.1-pro, gpt-5.4, deepseek-v3-2-volc, gpt-5.4)',
      '  --effort <level> Reasoning effort level',
    ].join('\n');
    resolveExecFile(stdout);
    const { listHeterogeneousAgentModels, parseCodeBuddyModelCatalog } = await importModule();

    expect(parseCodeBuddyModelCatalog(stdout)).toEqual([
      { id: 'gemini-3.1-pro', modelId: 'gemini-3.1-pro', providerId: 'codebuddy' },
      { id: 'gpt-5.4', modelId: 'gpt-5.4', providerId: 'codebuddy' },
      {
        id: 'deepseek-v3-2-volc',
        modelId: 'deepseek-v3-2-volc',
        providerId: 'codebuddy',
      },
    ]);

    await expect(
      listHeterogeneousAgentModels({
        command: '/custom/codebuddy',
        cwd: '/repo',
        env: { CODEBUDDY_CODE_API_KEY: 'test-key' },
        type: 'codebuddy',
      }),
    ).resolves.toMatchObject({
      models: [
        { id: 'gemini-3.1-pro', modelId: 'gemini-3.1-pro', providerId: 'codebuddy' },
        { id: 'gpt-5.4', modelId: 'gpt-5.4', providerId: 'codebuddy' },
        {
          id: 'deepseek-v3-2-volc',
          modelId: 'deepseek-v3-2-volc',
          providerId: 'codebuddy',
        },
      ],
      status: 'success',
    });
    expect(execFileMock).toHaveBeenLastCalledWith(
      '/custom/codebuddy',
      ['--help'],
      expect.objectContaining({
        cwd: '/repo',
        env: { CODEBUDDY_CODE_API_KEY: 'test-key' },
      }),
      expect.any(Function),
    );
  });

  it('returns an empty catalog when CodeBuddy exits successfully without reporting models', async () => {
    resolveExecFile(
      [
        'Usage: codebuddy [options]',
        '  --model <model>  Model for the current session. Please provide the model ID.',
      ].join('\n'),
    );
    const { listHeterogeneousAgentModels } = await importModule();

    await expect(
      listHeterogeneousAgentModels({
        command: '/custom/codebuddy',
        env: { CODEBUDDY_DISABLE_BUILTIN_MODELS: '1' },
        type: 'codebuddy',
      }),
    ).resolves.toMatchObject({
      models: [],
      status: 'success',
    });
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it('parses a CodeBuddy model catalog written to stderr', async () => {
    resolveExecFile(
      '',
      [
        'Usage: codebuddy [options]',
        '  --model <model>  Model for the current session. Currently supported: (default-model,',
        '                   gpt-5.4)',
      ].join('\n'),
    );
    const { listHeterogeneousAgentModels } = await importModule();

    await expect(
      listHeterogeneousAgentModels({ command: '/custom/codebuddy', type: 'codebuddy' }),
    ).resolves.toMatchObject({
      models: [{ id: 'gpt-5.4', modelId: 'gpt-5.4', providerId: 'codebuddy' }],
      status: 'success',
    });
  });

  it('accepts an explicit CodeBuddy catalog containing only the default model', async () => {
    resolveExecFile(
      '  --model <model>  Model for the current session. Currently supported: (default-model)',
    );
    const { listHeterogeneousAgentModels } = await importModule();

    await expect(
      listHeterogeneousAgentModels({ command: '/custom/codebuddy', type: 'codebuddy' }),
    ).resolves.toMatchObject({ models: [], status: 'success' });
  });

  it.each([
    ['an empty body', '()'],
    ['comma-only entries', '(, ,)'],
  ])('rejects a CodeBuddy catalog containing %s', async (_, catalog) => {
    resolveExecFile(
      `  --model <model>  Model for the current session. Currently supported: ${catalog}`,
    );
    const { listHeterogeneousAgentModels } = await importModule();

    await expect(
      listHeterogeneousAgentModels({ command: '/custom/codebuddy', type: 'codebuddy' }),
    ).resolves.toMatchObject({
      models: [],
      status: 'success',
    });
  });

  it('parses adversarial CodeBuddy help output without polynomial backtracking', async () => {
    const stdout = `${'--model <model>'.repeat(1000)}${'Currently supported:(('.repeat(1000)}`;
    const { parseCodeBuddyModelCatalog } = await importModule();
    const startedAt = performance.now();

    expect(parseCodeBuddyModelCatalog(stdout)).toEqual([]);
    expect(performance.now() - startedAt).toBeLessThan(100);
  });

  it('parses and discovers Cursor model slugs and labels', async () => {
    const stdout = [
      'Available models',
      '',
      'auto (default) - Auto',
      'claude-sonnet-4-6-thinking - Claude 4.6 Sonnet Thinking',
      'gpt-5.5-medium-fast (current) - GPT-5.5 Medium Fast',
      'claude-sonnet-4-6-thinking - Duplicate label',
      'diagnostic-without-a-label',
    ].join('\n');
    resolveExecFile(stdout);
    const { listHeterogeneousAgentModels, parseCursorModelCatalog } = await importModule();

    expect(parseCursorModelCatalog(stdout)).toEqual([
      { id: 'auto', label: 'Auto', modelId: 'auto', providerId: 'cursor' },
      {
        id: 'claude-sonnet-4-6-thinking',
        label: 'Claude 4.6 Sonnet Thinking',
        modelId: 'claude-sonnet-4-6-thinking',
        providerId: 'cursor',
      },
      {
        id: 'gpt-5.5-medium-fast',
        label: 'GPT-5.5 Medium Fast',
        modelId: 'gpt-5.5-medium-fast',
        providerId: 'cursor',
      },
    ]);

    await expect(
      listHeterogeneousAgentModels({
        command: '/custom/agent',
        cwd: '/repo',
        env: { CURSOR_API_KEY: 'test-key' },
        type: 'cursor',
      }),
    ).resolves.toMatchObject({
      models: [
        { id: 'auto', label: 'Auto', modelId: 'auto', providerId: 'cursor' },
        {
          id: 'claude-sonnet-4-6-thinking',
          label: 'Claude 4.6 Sonnet Thinking',
          modelId: 'claude-sonnet-4-6-thinking',
          providerId: 'cursor',
        },
        {
          id: 'gpt-5.5-medium-fast',
          label: 'GPT-5.5 Medium Fast',
          modelId: 'gpt-5.5-medium-fast',
          providerId: 'cursor',
        },
      ],
      status: 'success',
    });
    expect(execFileMock).toHaveBeenLastCalledWith(
      '/custom/agent',
      ['--list-models'],
      expect.objectContaining({
        cwd: '/repo',
        env: { CURSOR_API_KEY: 'test-key' },
      }),
      expect.any(Function),
    );
  });

  it('parses and discovers Devin model variants from JSON', async () => {
    const stdout = JSON.stringify({
      families: [
        {
          family_label: 'Claude Sonnet 4.6',
          variants: [
            { label: 'Claude Sonnet 4.6', model_uid: 'claude-sonnet-4-6' },
            { label: 'Claude Sonnet 4.6 Thinking', model_uid: 'claude-sonnet-4-6-thinking' },
          ],
        },
        {
          family_label: 'Duplicate',
          variants: [{ label: 'Duplicate', model_uid: 'claude-sonnet-4-6' }, {}],
        },
      ],
    });
    resolveExecFile(stdout);
    const { listHeterogeneousAgentModels, parseDevinModelCatalog } = await importModule();

    expect(parseDevinModelCatalog(stdout)).toEqual([
      {
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        modelId: 'claude-sonnet-4-6',
        providerId: 'devin',
      },
      {
        id: 'claude-sonnet-4-6-thinking',
        label: 'Claude Sonnet 4.6 Thinking',
        modelId: 'claude-sonnet-4-6-thinking',
        providerId: 'devin',
      },
    ]);
    expect(parseDevinModelCatalog('not json')).toEqual([]);

    await expect(
      listHeterogeneousAgentModels({
        command: '/custom/devin',
        cwd: '/repo',
        env: { DEVIN_MODEL: 'sonnet' },
        type: 'devin',
      }),
    ).resolves.toMatchObject({
      models: [
        { id: 'claude-sonnet-4-6', providerId: 'devin' },
        { id: 'claude-sonnet-4-6-thinking', providerId: 'devin' },
      ],
      status: 'success',
    });
    expect(execFileMock).toHaveBeenLastCalledWith(
      '/custom/devin',
      ['models', 'list', '--format', 'json'],
      expect.objectContaining({ cwd: '/repo', env: { DEVIN_MODEL: 'sonnet' } }),
      expect.any(Function),
    );
  });

  it('parses and discovers Grok Build models', async () => {
    const stdout = [
      'You are not authenticated.',
      '',
      'Default model: grok-4.6',
      '',
      'Available models:',
      '  * grok-4.6 (default)',
      '  - grok-4.5',
      '  - grok-4.6',
    ].join('\n');
    resolveExecFile(stdout);
    const { listHeterogeneousAgentModels, parseGrokBuildModelCatalog } = await importModule();

    expect(parseGrokBuildModelCatalog(stdout)).toEqual([
      { id: 'grok-4.6', modelId: 'grok-4.6', providerId: 'grok-build' },
      { id: 'grok-4.5', modelId: 'grok-4.5', providerId: 'grok-build' },
    ]);

    await expect(
      listHeterogeneousAgentModels({
        command: '/custom/grok',
        cwd: '/repo',
        env: { XAI_API_KEY: 'test-key' },
        type: 'grok-build',
      }),
    ).resolves.toMatchObject({
      models: [
        { id: 'grok-4.6', modelId: 'grok-4.6', providerId: 'grok-build' },
        { id: 'grok-4.5', modelId: 'grok-4.5', providerId: 'grok-build' },
      ],
      status: 'success',
    });
    expect(execFileMock).toHaveBeenLastCalledWith(
      '/custom/grok',
      ['models'],
      expect.objectContaining({ cwd: '/repo', env: { XAI_API_KEY: 'test-key' } }),
      expect.any(Function),
    );
  });

  it('runs the configured binary with plugins enabled and forwards cwd/env', async () => {
    resolveExecFile('openai/gpt-5.6\nopenrouter/google/gemini-2.5-pro\n');
    const { listHeterogeneousAgentModels } = await importModule();

    const result = await listHeterogeneousAgentModels({
      command: '/custom/opencode',
      cwd: '/repo',
      env: { OPENCODE_CONFIG_DIR: '/config', PATH: '/custom/bin' },
      type: 'opencode',
    });

    expect(result).toMatchObject({
      models: [
        { id: 'openai/gpt-5.6', modelId: 'gpt-5.6', providerId: 'openai' },
        {
          id: 'openrouter/google/gemini-2.5-pro',
          modelId: 'google/gemini-2.5-pro',
          providerId: 'openrouter',
        },
      ],
      status: 'success',
    });
    expect(execFileMock).toHaveBeenCalledWith(
      '/custom/opencode',
      ['models', '--verbose'],
      expect.objectContaining({
        cwd: '/repo',
        env: { OPENCODE_CONFIG_DIR: '/config', PATH: '/custom/bin' },
        maxBuffer: 256 * 1024,
        timeout: 15_000,
      }),
      expect.any(Function),
    );
  });

  it('keeps the resolver login-shell PATH when the caller also provides PATH', async () => {
    const originalShell = process.env.SHELL;
    process.env.SHELL = '/bin/zsh';
    execFileMock.mockImplementation(((
      file: string,
      args: string[],
      options: any,
      callback: any,
    ) => {
      if (file === '/bin/zsh') {
        callback(null, { stderr: '', stdout: '/login/bin:/usr/bin' });
      } else if (file === 'which' && options.env?.PATH?.includes('/login/bin')) {
        callback(null, { stderr: '', stdout: '/login/bin/opencode\n' });
      } else if (file === '/login/bin/opencode' && args.includes('--version')) {
        callback(null, { stderr: '', stdout: '1.18.3' });
      } else if (file === '/login/bin/opencode' && args.includes('models')) {
        callback(null, { stderr: '', stdout: 'openai/gpt-5.6\n' });
      } else {
        callback(new Error('unavailable in inherited environment'), { stderr: '', stdout: '' });
      }
      return {} as any;
    }) as any);

    try {
      const { listHeterogeneousAgentModels } = await importModule();
      const result = await listHeterogeneousAgentModels({
        env: { PATH: '/inherited/bin' },
        type: 'opencode',
      });

      expect(result.status).toBe('success');
      const [command, args, options] = execFileMock.mock.calls.at(-1) as unknown as [
        string,
        string[],
        { env: NodeJS.ProcessEnv },
      ];
      expect(command).toBe('/login/bin/opencode');
      expect(args).toEqual(['models', '--verbose']);
      expect(options.env.PATH?.split(path.delimiter)).toEqual(
        expect.arrayContaining(['/inherited/bin', '/login/bin', '/usr/bin']),
      );
    } finally {
      if (originalShell === undefined) delete process.env.SHELL;
      else process.env.SHELL = originalShell;
    }
  });

  it('retries `opencode models` when verbose output has no model ids', async () => {
    resolveExecFile('Usage: opencode models [--verbose]');
    resolveExecFile('openai/gpt-5.6\n');
    const { listHeterogeneousAgentModels } = await importModule();

    await expect(
      listHeterogeneousAgentModels({ command: '/custom/opencode', type: 'opencode' }),
    ).resolves.toMatchObject({
      models: [{ id: 'openai/gpt-5.6', modelId: 'gpt-5.6', providerId: 'openai' }],
      status: 'success',
    });
    expect(execFileMock.mock.calls.map((call) => call[1])).toEqual([
      ['models', '--verbose'],
      ['models'],
    ]);
  });

  it('returns an empty catalog when OpenCode is missing', async () => {
    rejectExecFile(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    rejectExecFile(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    const { listHeterogeneousAgentModels } = await importModule();

    await expect(
      listHeterogeneousAgentModels({ command: '/missing/opencode', type: 'opencode' }),
    ).resolves.toMatchObject({
      models: [],
      status: 'success',
    });
  });

  it('returns an empty catalog when OpenCode model listing times out', async () => {
    rejectExecFile(Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' }));
    rejectExecFile(Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' }));
    const { listHeterogeneousAgentModels } = await importModule();

    await expect(
      listHeterogeneousAgentModels({ command: '/slow/opencode', type: 'opencode' }),
    ).resolves.toMatchObject({
      models: [],
      status: 'success',
    });
  });

  it('parses and discovers Pi provider/model rows', async () => {
    resolveExecFile(
      [
        'provider   model                              context  max-out  thinking  images',
        'anthropic  claude-sonnet-4-5                  200K     64K      yes       yes',
        'google     gemini-2.5-pro                     1M       64K      yes       yes',
        'openrouter  google/gemini-2.5-pro             1M       64K      yes       yes',
        'anthropic  claude-sonnet-4-5                  200K     64K      yes       yes',
      ].join('\n'),
    );
    const { listHeterogeneousAgentModels, parsePiModelCatalog } = await importModule();
    const stdout = [
      'provider   model                 context  max-out  thinking  images',
      'anthropic  claude-sonnet-4-5     200K     64K      yes       yes',
      'google     gemini-2.5-pro        1M       64K      yes       yes',
    ].join('\n');

    expect(parsePiModelCatalog(stdout)).toEqual([
      {
        id: 'anthropic/claude-sonnet-4-5',
        modelId: 'claude-sonnet-4-5',
        providerId: 'anthropic',
      },
      { id: 'google/gemini-2.5-pro', modelId: 'gemini-2.5-pro', providerId: 'google' },
    ]);

    await expect(
      listHeterogeneousAgentModels({
        command: '/custom/pi',
        cwd: '/repo',
        env: { PI_CODING_AGENT_DIR: '/config' },
        type: 'pi',
      }),
    ).resolves.toMatchObject({
      models: [
        {
          id: 'anthropic/claude-sonnet-4-5',
          modelId: 'claude-sonnet-4-5',
          providerId: 'anthropic',
        },
        { id: 'google/gemini-2.5-pro', modelId: 'gemini-2.5-pro', providerId: 'google' },
        {
          id: 'openrouter/google/gemini-2.5-pro',
          modelId: 'google/gemini-2.5-pro',
          providerId: 'openrouter',
        },
      ],
      status: 'success',
    });
    expect(execFileMock).toHaveBeenLastCalledWith(
      '/custom/pi',
      ['--list-models'],
      expect.objectContaining({
        cwd: '/repo',
        env: { PI_CODING_AGENT_DIR: '/config' },
      }),
      expect.any(Function),
    );
  });

  it('parses and discovers Qoder built-in names and custom model IDs', async () => {
    const stdout = [
      'MODEL',
      'Auto',
      'Claude Sonnet 4.5',
      'Team Gateway (team-model-id)',
      'Team Gateway (team-model-id)',
      'Long custom model (model-id-that-was-truncated-at-forty-ch…)',
      '',
    ].join('\n');
    resolveExecFile(stdout);
    const { listHeterogeneousAgentModels, parseQoderModelCatalog } = await importModule();

    expect(parseQoderModelCatalog(stdout)).toEqual([
      { id: 'Auto', modelId: 'Auto', providerId: 'qoder' },
      { id: 'Claude Sonnet 4.5', modelId: 'Claude Sonnet 4.5', providerId: 'qoder' },
      {
        id: 'team-model-id',
        label: 'Team Gateway',
        modelId: 'team-model-id',
        providerId: 'qoder',
      },
    ]);

    await expect(
      listHeterogeneousAgentModels({
        command: '/custom/qodercli',
        cwd: '/repo',
        env: { QODER_CONFIG_DIR: '/config' },
        type: 'qoder',
      }),
    ).resolves.toMatchObject({
      models: [
        { id: 'Auto', modelId: 'Auto', providerId: 'qoder' },
        { id: 'Claude Sonnet 4.5', modelId: 'Claude Sonnet 4.5', providerId: 'qoder' },
        {
          id: 'team-model-id',
          label: 'Team Gateway',
          modelId: 'team-model-id',
          providerId: 'qoder',
        },
      ],
      status: 'success',
    });
    expect(execFileMock).toHaveBeenLastCalledWith(
      '/custom/qodercli',
      ['--list-models'],
      expect.objectContaining({
        cwd: '/repo',
        env: { QODER_CONFIG_DIR: '/config' },
      }),
      expect.any(Function),
    );
  });

  it('discovers TRAE models through ACP and forwards provider arguments', async () => {
    listTraeAcpModelsMock.mockResolvedValue([
      { id: 'seed-2.0-code', modelId: 'seed-2.0-code', providerId: 'trae' },
    ]);
    const { listHeterogeneousAgentModels } = await importModule();

    await expect(
      listHeterogeneousAgentModels({
        args: ['--feature=test'],
        command: '/custom/traecli',
        cwd: '/repo',
        env: { TRAE_CONFIG_DIR: '/config' },
        type: 'trae',
      }),
    ).resolves.toMatchObject({
      models: [{ id: 'seed-2.0-code', modelId: 'seed-2.0-code', providerId: 'trae' }],
      status: 'success',
    });
    expect(listTraeAcpModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['--feature=test'],
        commandPath: '/custom/traecli',
        cwd: '/repo',
        env: { TRAE_CONFIG_DIR: '/config' },
      }),
    );
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('returns an empty catalog when TRAE ACP discovery fails', async () => {
    listTraeAcpModelsMock.mockRejectedValue(new Error('timeout'));
    const { listHeterogeneousAgentModels } = await importModule();

    await expect(
      listHeterogeneousAgentModels({ command: '/custom/traecli', type: 'trae' }),
    ).resolves.toMatchObject({ models: [], status: 'success' });
  });

  it('discovers Factory Droid models through ACP and forwards only safe provider arguments', async () => {
    listDroidAcpModelsMock.mockResolvedValue([
      { id: 'gpt-5.4', modelId: 'gpt-5.4', providerId: 'droid' },
    ]);
    const { listHeterogeneousAgentModels } = await importModule();

    await expect(
      listHeterogeneousAgentModels({
        args: ['--tag', 'orvilo'],
        command: '/custom/droid',
        cwd: '/repo',
        env: { FACTORY_API_KEY: 'test-key' },
        type: 'droid',
      }),
    ).resolves.toMatchObject({
      models: [{ id: 'gpt-5.4', modelId: 'gpt-5.4', providerId: 'droid' }],
      status: 'success',
    });
    expect(listDroidAcpModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['--tag', 'orvilo'],
        commandPath: '/custom/droid',
        cwd: '/repo',
        env: { FACTORY_API_KEY: 'test-key' },
      }),
    );
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
