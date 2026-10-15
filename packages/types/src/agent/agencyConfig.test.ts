import { describe, expect, it } from 'vitest';

import type { HeterogeneousProviderConfig } from './agencyConfig';
import {
  buildHeteroExecArgs,
  buildHeteroSpawnArgs,
  canPublishAgentTopicLink,
  normalizeAgencyConfigHeterogeneousProvider,
  normalizeHeterogeneousProviderConfig,
  pruneWorkingDirByDeviceDeletes,
  resolveAgentTopicSharePolicy,
  resolveHeteroAgentSystemContext,
  resolveHeteroCliAgentType,
} from './agencyConfig';
import {
  AMP_AGENT_MODES,
  codexModelSupportsFastSpeed,
  getCodexReasoningEffortLevels,
  HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
  resolveAmpAgentMode,
  resolveClaudeCodeModel,
  resolveClaudeCodeReasoningEffort,
  resolveCodexModel,
  resolveCodexReasoningEffort,
  resolveCodexSpeedMode,
} from './heteroSelectorCapabilities';

describe('saved Agent model authority', () => {
  it.each(['subscription', 'api'] as const)(
    'uses the saved %s model over stale native arguments',
    (authMode) => {
      const normalized = normalizeAgencyConfigHeterogeneousProvider({
        heterogeneousProvider: {
          apiConfig: { model: 'api-model', providerId: 'anthropic' },
          args: ['--verbose', '--model', 'stale-model'],
          authMode,
          model: 'saved-model',
          type: 'claude-code',
        },
      });
      expect(buildHeteroSpawnArgs(normalized!.heterogeneousProvider!)).toEqual([
        '--verbose',
        '--model',
        authMode === 'api' ? 'api-model' : 'saved-model',
      ]);
    },
  );
});

describe('normalizeHeterogeneousProviderConfig', () => {
  it('recovers a legacy adapterType before considering the command', () => {
    const legacyConfig = {
      adapterType: 'codex',
      command: 'claude',
    } as unknown as HeterogeneousProviderConfig;

    expect(normalizeHeterogeneousProviderConfig(legacyConfig)).toEqual({
      command: 'claude',
      type: 'codex',
    });
  });

  it('infers legacy Claude Code and Codex identities from their commands', () => {
    const legacyClaudeConfig = {
      command: '/usr/local/bin/custom-claude',
    } as unknown as HeterogeneousProviderConfig;
    const legacyCodexConfig = {
      command: '/usr/local/bin/custom-codex',
    } as unknown as HeterogeneousProviderConfig;

    expect(normalizeHeterogeneousProviderConfig(legacyClaudeConfig).type).toBe('claude-code');
    expect(normalizeHeterogeneousProviderConfig(legacyCodexConfig).type).toBe('codex');
  });

  it('preserves the legacy Claude Code default when no identity can be recovered', () => {
    const legacyConfig = { command: 'custom-agent' } as unknown as HeterogeneousProviderConfig;

    expect(normalizeHeterogeneousProviderConfig(legacyConfig).type).toBe('claude-code');
  });
});

describe('pruneWorkingDirByDeviceDeletes', () => {
  it('deletes keys whose patch value is undefined', () => {
    const merged = { workingDirByDevice: { 'device-a': '/a', 'device-b': '/b' } };
    pruneWorkingDirByDeviceDeletes(merged, { workingDirByDevice: { 'device-a': undefined } });
    expect(merged.workingDirByDevice).toEqual({ 'device-b': '/b' });
  });

  it('leaves defined patch values untouched', () => {
    const merged = { workingDirByDevice: { 'device-a': '/a' } };
    pruneWorkingDirByDeviceDeletes(merged, { workingDirByDevice: { 'device-a': '/a' } });
    expect(merged.workingDirByDevice).toEqual({ 'device-a': '/a' });
  });

  it('is a no-op when the patch has no workingDirByDevice', () => {
    const merged = { workingDirByDevice: { 'device-a': '/a' } };
    pruneWorkingDirByDeviceDeletes(merged, {});
    pruneWorkingDirByDeviceDeletes(merged, undefined);
    pruneWorkingDirByDeviceDeletes(merged, null);
    expect(merged.workingDirByDevice).toEqual({ 'device-a': '/a' });
  });

  it('is a no-op when the merged target has no workingDirByDevice', () => {
    expect(() =>
      pruneWorkingDirByDeviceDeletes({}, { workingDirByDevice: { 'device-a': undefined } }),
    ).not.toThrow();
    expect(() =>
      pruneWorkingDirByDeviceDeletes(undefined, { workingDirByDevice: { 'device-a': undefined } }),
    ).not.toThrow();
  });
});

describe('buildHeteroSpawnArgs', () => {
  it('resolves missing Claude Code selections to Default', () => {
    expect(resolveClaudeCodeModel(undefined)).toBe(HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
    expect(resolveClaudeCodeReasoningEffort(undefined)).toBe(HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
  });

  it('resolves missing Codex selections to Default', () => {
    expect(resolveCodexModel(undefined)).toBe(HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
    expect(resolveCodexReasoningEffort(undefined)).toBe(HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
  });

  it('returns undefined when there is no provider', () => {
    expect(buildHeteroSpawnArgs(undefined)).toBeUndefined();
    expect(buildHeteroSpawnArgs(null)).toBeUndefined();
  });

  it('leaves remote providers untouched', () => {
    expect(buildHeteroSpawnArgs({ args: ['--agent', 'main'], type: 'openclaw' })).toEqual([
      '--agent',
      'main',
    ]);
  });

  it('resolves Amp mode from native args before the structured field', () => {
    expect(resolveAmpAgentMode(undefined)).toBe(HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
    expect(resolveAmpAgentMode({ mode: 'high' })).toBe('high');
    expect(resolveAmpAgentMode({ args: ['--mode=ultra'], mode: 'low' })).toBe('ultra');
  });

  it.each(AMP_AGENT_MODES)(
    'forwards structured Amp mode %s through direct and legacy-compatible device paths',
    (mode) => {
      const provider: HeterogeneousProviderConfig = { mode, type: 'amp' };

      expect(buildHeteroSpawnArgs(provider)).toEqual(['--mode', mode]);
      expect(buildHeteroExecArgs(provider)).toEqual(['--agent-arg=--mode', `--agent-arg=${mode}`]);
    },
  );

  it('does not override Amp mode when Default is selected', () => {
    const provider: HeterogeneousProviderConfig = {
      mode: HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
      type: 'amp',
    };

    expect(buildHeteroSpawnArgs(provider)).toBeUndefined();
    expect(buildHeteroExecArgs(provider)).toBeUndefined();
  });

  it('keeps raw Amp args compatible with direct spawns and orvilo hetero exec', () => {
    const provider: HeterogeneousProviderConfig = { args: ['--mode', 'high'], type: 'amp' };

    expect(buildHeteroSpawnArgs(provider)).toEqual(['--mode', 'high']);
    expect(buildHeteroExecArgs(provider)).toEqual(['--agent-arg=--mode', '--agent-arg=high']);
  });

  it('forwards Cursor native args and configured model without duplicating --model', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--mode', 'plan'],
      model: 'sonnet-4-thinking',
      type: 'cursor',
    };

    expect(buildHeteroSpawnArgs(provider)).toEqual([
      '--mode',
      'plan',
      '--model',
      'sonnet-4-thinking',
    ]);
    expect(buildHeteroExecArgs(provider)).toEqual([
      '--agent-arg=--mode',
      '--agent-arg=plan',
      '--model',
      'sonnet-4-thinking',
    ]);
    expect(
      buildHeteroSpawnArgs({
        args: ['--model', 'gpt-5'],
        model: 'sonnet-4-thinking',
        type: 'cursor',
      }),
    ).toEqual(['--model', 'gpt-5']);
  });

  it('forwards Devin native arguments and model through direct ACP and device execution', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--agent-type', 'coding'],
      model: 'claude-sonnet-4-6-thinking',
      type: 'devin',
    };

    expect(buildHeteroSpawnArgs(provider)).toEqual([
      '--agent-type',
      'coding',
      '--model',
      'claude-sonnet-4-6-thinking',
    ]);
    expect(buildHeteroExecArgs(provider)).toEqual([
      '--agent-arg=--agent-type',
      '--agent-arg=coding',
      '--model',
      'claude-sonnet-4-6-thinking',
    ]);
    expect(
      buildHeteroSpawnArgs({
        args: ['--model', 'native-model'],
        model: 'selector-model',
        type: 'devin',
      }),
    ).toEqual(['--model', 'native-model']);
  });

  it('forwards Grok Build model and effort through direct ACP and device execution', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--no-subagents'],
      effort: 'xhigh',
      model: 'grok-4.6',
      type: 'grok-build',
    };

    expect(buildHeteroSpawnArgs(provider)).toEqual([
      '--no-subagents',
      '--model',
      'grok-4.6',
      '--effort',
      'xhigh',
    ]);
    expect(buildHeteroExecArgs(provider)).toEqual([
      '--agent-arg=--no-subagents',
      '--agent-arg=--model',
      '--agent-arg=grok-4.6',
      '--agent-arg=--effort',
      '--agent-arg=xhigh',
    ]);
  });

  it('keeps native Grok Build selector flags authoritative', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['-m=grok-build', '--reasoning-effort=low'],
      effort: 'high',
      model: 'grok-4.6',
      type: 'grok-build',
    };

    expect(buildHeteroSpawnArgs(provider)).toEqual(['-m=grok-build', '--reasoning-effort=low']);
    expect(buildHeteroExecArgs(provider)).toEqual([
      '--agent-arg=-m=grok-build',
      '--agent-arg=--reasoning-effort=low',
    ]);
  });

  it('keeps TRAE model selection in the wrapper instead of native process arguments', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--feature', 'test'],
      effort: 'high',
      model: 'ignored-selector',
      type: 'trae',
    };

    expect(buildHeteroSpawnArgs(provider)).toEqual(['--feature', 'test']);
    expect(buildHeteroExecArgs(provider)).toEqual([
      '--agent-arg=--feature',
      '--agent-arg=test',
      '--model',
      'ignored-selector',
    ]);
  });

  it('keeps Droid model selection in ACP instead of native process arguments', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--tag', 'orvilo'],
      model: 'gpt-5.4',
      type: 'droid',
    };

    expect(buildHeteroSpawnArgs(provider)).toEqual(['--tag', 'orvilo']);
    expect(buildHeteroExecArgs(provider)).toEqual([
      '--agent-arg=--tag',
      '--agent-arg=orvilo',
      '--model',
      'gpt-5.4',
    ]);
  });

  it('forwards Qoder native args, model, and reasoning effort', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--verbose'],
      effort: 'high',
      model: 'qoder-model',
      type: 'qoder',
    };

    expect(buildHeteroSpawnArgs(provider)).toEqual([
      '--verbose',
      '--model',
      'qoder-model',
      '--reasoning-effort',
      'high',
    ]);
    expect(buildHeteroExecArgs(provider)).toEqual([
      '--agent-arg=--verbose',
      '--model',
      'qoder-model',
      '--effort',
      'high',
    ]);
  });

  it('forwards Kimi Code native args and an explicit model through both spawn paths', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--verbose'],
      effort: 'high',
      model: 'kimi-for-coding',
      type: 'kimi-code',
    };

    expect(buildHeteroSpawnArgs(provider)).toEqual(['--verbose', '--model', 'kimi-for-coding']);
    expect(buildHeteroExecArgs(provider)).toEqual([
      '--agent-arg=--verbose',
      '--model',
      'kimi-for-coding',
    ]);
  });

  it('preserves Qoder model and reasoning effort from native args without injecting duplicates', () => {
    expect(
      buildHeteroSpawnArgs({
        args: ['-m', 'native-model'],
        model: 'selector-model',
        type: 'qoder',
      }),
    ).toEqual(['-m', 'native-model']);
    expect(
      buildHeteroExecArgs({
        args: ['--model=native-model'],
        model: 'selector-model',
        type: 'qoder',
      }),
    ).toEqual(['--agent-arg=--model=native-model']);
    expect(
      buildHeteroSpawnArgs({
        args: ['--reasoning-effort', 'max'],
        effort: 'high',
        type: 'qoder',
      }),
    ).toEqual(['--reasoning-effort', 'max']);
    expect(
      buildHeteroExecArgs({
        args: ['--reasoning-effort=max'],
        effort: 'high',
        type: 'qoder',
      }),
    ).toEqual(['--agent-arg=--reasoning-effort=max']);
    expect(
      buildHeteroSpawnArgs({
        model: HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
        type: 'qoder',
      }),
    ).toBeUndefined();
  });

  it('forwards OpenCode native args and an explicit provider/model selection', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--variant', 'high'],
      model: 'anthropic/claude-sonnet-4',
      type: 'opencode',
    };

    expect(buildHeteroSpawnArgs(provider)).toEqual([
      '--variant',
      'high',
      '--model',
      'anthropic/claude-sonnet-4',
    ]);
    expect(buildHeteroExecArgs(provider)).toEqual([
      '--agent-arg=--variant',
      '--agent-arg=high',
      '--model',
      'anthropic/claude-sonnet-4',
    ]);
  });

  it('does not duplicate an OpenCode model already present in native args', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--model=google/gemini-2.5-pro'],
      model: 'anthropic/claude-sonnet-4',
      type: 'opencode',
    };

    expect(buildHeteroSpawnArgs(provider)).toEqual(['--model=google/gemini-2.5-pro']);
    expect(buildHeteroExecArgs(provider)).toEqual(['--agent-arg=--model=google/gemini-2.5-pro']);
  });

  it('honors the OpenCode short model flag in native args', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['-m', 'google/gemini-2.5-pro'],
      model: 'anthropic/claude-sonnet-4',
      type: 'opencode',
    };

    expect(buildHeteroSpawnArgs(provider)).toEqual(['-m', 'google/gemini-2.5-pro']);
    expect(buildHeteroExecArgs(provider)).toEqual([
      '--agent-arg=-m',
      '--agent-arg=google/gemini-2.5-pro',
    ]);
  });

  it('preserves Claude Code defaults when model/effort have not been selected', () => {
    expect(buildHeteroSpawnArgs({ type: 'claude-code' })).toBeUndefined();
    expect(buildHeteroSpawnArgs({ args: ['--verbose'], type: 'claude-code' })).toEqual([
      '--verbose',
    ]);
    // Older persisted "Default" selections should behave like unset values.
    expect(
      buildHeteroSpawnArgs({
        effort: HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
        model: HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
        type: 'claude-code',
      }),
    ).toBeUndefined();
  });

  it('preserves Codex defaults when model/effort have not been selected', () => {
    expect(buildHeteroSpawnArgs({ type: 'codex' })).toBeUndefined();
    expect(buildHeteroSpawnArgs({ args: ['--ask-for-approval', 'never'], type: 'codex' })).toEqual([
      '--ask-for-approval',
      'never',
    ]);
    expect(
      buildHeteroSpawnArgs({
        effort: HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
        model: HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
        type: 'codex',
      }),
    ).toBeUndefined();
  });

  it('forwards Pi native args and an explicit provider/model selection', () => {
    const provider = {
      args: ['--offline'],
      effort: 'high',
      model: 'anthropic/claude-sonnet-4-5',
      type: 'pi',
    } satisfies HeterogeneousProviderConfig;

    expect(buildHeteroSpawnArgs(provider)).toEqual([
      '--offline',
      '--model',
      'anthropic/claude-sonnet-4-5',
    ]);
    expect(buildHeteroExecArgs(provider)).toEqual([
      '--agent-arg=--offline',
      '--model',
      'anthropic/claude-sonnet-4-5',
    ]);
  });

  it('does not duplicate a Pi model already present in native args', () => {
    const provider = {
      args: ['--model=google/gemini-2.5-pro'],
      model: 'anthropic/claude-sonnet-4-5',
      type: 'pi',
    } satisfies HeterogeneousProviderConfig;

    expect(buildHeteroSpawnArgs(provider)).toEqual(['--model=google/gemini-2.5-pro']);
    expect(buildHeteroExecArgs(provider)).toEqual(['--agent-arg=--model=google/gemini-2.5-pro']);
  });

  it('appends --model and --effort for claude-code', () => {
    expect(buildHeteroSpawnArgs({ type: 'claude-code', model: 'opus', effort: 'high' })).toEqual([
      '--model',
      'opus',
      '--effort',
      'high',
    ]);
  });

  it('appends CodeBuddy model and effort using its Claude-compatible CLI flags', () => {
    const provider = { effort: 'high', model: 'gpt-5.4', type: 'codebuddy' } as const;

    expect(buildHeteroSpawnArgs(provider)).toEqual(['--model', 'gpt-5.4', '--effort', 'high']);
    expect(buildHeteroExecArgs(provider)).toEqual(['--model', 'gpt-5.4', '--effort', 'high']);
  });

  it('preserves existing args and appends after them', () => {
    expect(
      buildHeteroSpawnArgs({ args: ['--verbose'], type: 'claude-code', model: 'sonnet' }),
    ).toEqual(['--verbose', '--model', 'sonnet']);
  });

  it('only appends explicitly selected flags', () => {
    expect(buildHeteroSpawnArgs({ type: 'claude-code', effort: 'max' })).toEqual([
      '--effort',
      'max',
    ]);
    expect(buildHeteroSpawnArgs({ type: 'claude-code', model: 'haiku' })).toEqual([
      '--model',
      'haiku',
    ]);
  });

  it('does not duplicate a flag the user already authored in args', () => {
    // space-separated form
    expect(
      buildHeteroSpawnArgs({
        args: ['--model', 'opus'],
        type: 'claude-code',
        model: 'sonnet',
        effort: 'high',
      }),
    ).toEqual(['--model', 'opus', '--effort', 'high']);
    // `--flag=value` form
    expect(
      buildHeteroSpawnArgs({
        args: ['--effort=low'],
        type: 'claude-code',
        model: 'opus',
        effort: 'high',
      }),
    ).toEqual(['--effort=low', '--model', 'opus']);
  });

  it('resolves Codex model and reasoning effort from args before persisted selections', () => {
    expect(
      resolveCodexModel({
        args: ['--model', 'gpt-5.4'],
        model: 'gpt-5.5',
      }),
    ).toBe('gpt-5.4');
    expect(
      resolveCodexModel({
        args: ['-c', 'model = "gpt-5.3-codex-spark"'],
        model: 'gpt-5.5',
      }),
    ).toBe('gpt-5.3-codex-spark');
    expect(
      resolveCodexReasoningEffort({
        args: ['--config=model_reasoning_effort="xhigh"'],
        effort: 'low',
      }),
    ).toBe('xhigh');
    expect(resolveCodexReasoningEffort({ effort: 'max' })).toBe('max');
    expect(resolveCodexReasoningEffort({ args: ['-c', 'model_reasoning_effort="ultra"'] })).toBe(
      'ultra',
    );
  });

  it('appends --model and model_reasoning_effort config for Codex', () => {
    expect(buildHeteroSpawnArgs({ type: 'codex', model: 'gpt-5.5', effort: 'high' })).toEqual([
      '--model',
      'gpt-5.5',
      '-c',
      'model_reasoning_effort="high"',
    ]);
  });

  it('passes extended Codex reasoning efforts through spawn and exec args', () => {
    expect(buildHeteroSpawnArgs({ effort: 'ultra', model: 'gpt-5.6-sol', type: 'codex' })).toEqual([
      '--model',
      'gpt-5.6-sol',
      '-c',
      'model_reasoning_effort="ultra"',
    ]);
    expect(buildHeteroExecArgs({ effort: 'max', model: 'gpt-5.6-luna', type: 'codex' })).toEqual([
      '--model',
      'gpt-5.6-luna',
      '--effort',
      'max',
    ]);
  });

  it('does not duplicate Codex args the user already authored', () => {
    expect(
      buildHeteroSpawnArgs({
        args: ['-m', 'gpt-5.4'],
        effort: 'high',
        model: 'gpt-5.5',
        type: 'codex',
      }),
    ).toEqual(['-m', 'gpt-5.4', '-c', 'model_reasoning_effort="high"']);
    expect(
      buildHeteroSpawnArgs({
        args: ['--config=model_reasoning_effort="low"'],
        effort: 'high',
        model: 'gpt-5.5',
        type: 'codex',
      }),
    ).toEqual(['--config=model_reasoning_effort="low"', '--model', 'gpt-5.5']);
    expect(
      buildHeteroSpawnArgs({
        args: ['-c', 'model = "gpt-5.4"'],
        model: 'gpt-5.5',
        type: 'codex',
      }),
    ).toEqual(['-c', 'model = "gpt-5.4"']);
  });

  it('builds orvilo hetero exec wrapper args for Codex selectors', () => {
    expect(buildHeteroExecArgs({ type: 'codex', model: 'gpt-5.5', effort: 'high' })).toEqual([
      '--model',
      'gpt-5.5',
      '--effort',
      'high',
    ]);
  });

  it('does not append native Codex config flags to orvilo hetero exec args', () => {
    expect(
      buildHeteroExecArgs({
        args: ['-c', 'model = "gpt-5.4"'],
        effort: 'xhigh',
        type: 'codex',
      }),
    ).toEqual(['--agent-arg=-c', '--agent-arg=model = "gpt-5.4"', '--effort', 'xhigh']);
  });

  it('keeps Claude Code orvilo hetero exec selector args in the same wrapper form', () => {
    expect(buildHeteroExecArgs({ type: 'claude-code', model: 'opus', effort: 'high' })).toEqual([
      '--model',
      'opus',
      '--effort',
      'high',
    ]);
  });

  it('encodes native agent args before forwarding them to orvilo hetero exec', () => {
    expect(
      buildHeteroExecArgs({
        args: ['--ask-for-approval', 'never'],
        model: 'gpt-5.5',
        type: 'codex',
      }),
    ).toEqual(['--agent-arg=--ask-for-approval', '--agent-arg=never', '--model', 'gpt-5.5']);

    expect(
      buildHeteroExecArgs({
        args: ['--verbose'],
        effort: 'high',
        type: 'claude-code',
      }),
    ).toEqual(['--agent-arg=--verbose', '--effort', 'high']);
  });
});

describe('codex reasoning effort capabilities', () => {
  const commonLevels = ['low', 'medium', 'high', 'xhigh'];
  const maxLevels = [...commonLevels, 'max'];
  const ultraLevels = [...maxLevels, 'ultra'];

  it('returns the extended levels supported by each GPT-5.6 model', () => {
    expect(getCodexReasoningEffortLevels('gpt-5.6')).toEqual(ultraLevels);
    expect(getCodexReasoningEffortLevels('gpt-5.6-sol')).toEqual(ultraLevels);
    expect(getCodexReasoningEffortLevels('gpt-5.6-terra')).toEqual(ultraLevels);
    expect(getCodexReasoningEffortLevels('gpt-5.6-luna')).toEqual(maxLevels);
  });

  it('uses conservative common levels for old, unknown, and default models', () => {
    expect(getCodexReasoningEffortLevels('gpt-5.5')).toEqual(commonLevels);
    expect(getCodexReasoningEffortLevels('gpt-5.4-mini')).toEqual(commonLevels);
    expect(getCodexReasoningEffortLevels('custom-codex-model')).toEqual(commonLevels);
    expect(getCodexReasoningEffortLevels(HETEROGENEOUS_AGENT_DEFAULT_SELECTION)).toEqual(
      commonLevels,
    );
  });
});

describe('codex speed mode', () => {
  it('resolves missing / default selections to Default', () => {
    expect(resolveCodexSpeedMode(undefined)).toBe(HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
    expect(resolveCodexSpeedMode({ speed: HETEROGENEOUS_AGENT_DEFAULT_SELECTION })).toBe(
      HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
    );
  });

  it('resolves persisted fast selections', () => {
    expect(resolveCodexSpeedMode({ speed: 'fast' })).toBe('fast');
  });

  it('resolves service_tier from args before persisted selections', () => {
    expect(resolveCodexSpeedMode({ args: ['-c', 'service_tier="fast"'] })).toBe('fast');
    // The native request value spelling counts as fast too.
    expect(resolveCodexSpeedMode({ args: ['--config=service_tier="priority"'] })).toBe('fast');
    // Unknown tiers (e.g. flex) are displayed as Standard.
    expect(resolveCodexSpeedMode({ args: ['-c', 'service_tier="flex"'], speed: 'fast' })).toBe(
      HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
    );
  });

  it('reports fast support for catalog models and the default selection', () => {
    expect(codexModelSupportsFastSpeed(HETEROGENEOUS_AGENT_DEFAULT_SELECTION)).toBe(true);
    expect(codexModelSupportsFastSpeed('gpt-5.6')).toBe(true);
    expect(codexModelSupportsFastSpeed('gpt-5.6-sol')).toBe(true);
    expect(codexModelSupportsFastSpeed('gpt-5.6-terra')).toBe(true);
    expect(codexModelSupportsFastSpeed('gpt-5.6-luna')).toBe(true);
    expect(codexModelSupportsFastSpeed('gpt-5.5')).toBe(true);
    expect(codexModelSupportsFastSpeed('gpt-5.4')).toBe(true);
    expect(codexModelSupportsFastSpeed('gpt-5.4-mini')).toBe(false);
    expect(codexModelSupportsFastSpeed('gpt-5.3-codex-spark')).toBe(false);
  });

  it('appends service_tier config for Codex spawns when fast is selected', () => {
    expect(buildHeteroSpawnArgs({ speed: 'fast', type: 'codex' })).toEqual([
      '-c',
      'service_tier="fast"',
    ]);
    expect(buildHeteroSpawnArgs({ effort: 'high', speed: 'fast', type: 'codex' })).toEqual([
      '-c',
      'model_reasoning_effort="high"',
      '-c',
      'service_tier="fast"',
    ]);
  });

  it('does not append service_tier for default speed or user-authored overrides', () => {
    expect(
      buildHeteroSpawnArgs({ speed: HETEROGENEOUS_AGENT_DEFAULT_SELECTION, type: 'codex' }),
    ).toBeUndefined();
    expect(
      buildHeteroSpawnArgs({
        args: ['-c', 'service_tier="priority"'],
        speed: 'fast',
        type: 'codex',
      }),
    ).toEqual(['-c', 'service_tier="priority"']);
  });

  it('ignores speed for claude-code spawns', () => {
    expect(buildHeteroSpawnArgs({ speed: 'fast', type: 'claude-code' })).toBeUndefined();
  });

  it('keeps orvilo hetero exec speed overrides in wrapper form', () => {
    expect(buildHeteroExecArgs({ model: 'gpt-5.5', speed: 'fast', type: 'codex' })).toEqual([
      '--model',
      'gpt-5.5',
      '--speed',
      'fast',
    ]);
    expect(
      buildHeteroExecArgs({
        args: ['-c', 'service_tier="priority"'],
        speed: 'fast',
        type: 'codex',
      }),
    ).toEqual(['--agent-arg=-c', '--agent-arg=service_tier="priority"']);
    expect(buildHeteroExecArgs({ speed: 'fast', type: 'claude-code' })).toBeUndefined();
  });
});

describe('resolveAgentTopicSharePolicy', () => {
  it('never restricts a personal agent — there is nobody to restrict', () => {
    expect(
      resolveAgentTopicSharePolicy({
        agencyConfig: { topicSharePolicy: 'restricted' },
        workspaceId: null,
      }),
    ).toBe('member');
  });

  it('keeps legacy workspace rows on the behaviour they were created with', () => {
    expect(resolveAgentTopicSharePolicy({ workspaceId: 'workspace-1' })).toBe('member');
    expect(resolveAgentTopicSharePolicy({ agencyConfig: {}, workspaceId: 'workspace-1' })).toBe(
      'member',
    );
  });

  it('honours an explicit restriction on a workspace agent', () => {
    expect(
      resolveAgentTopicSharePolicy({
        agencyConfig: { topicSharePolicy: 'restricted' },
        workspaceId: 'workspace-1',
      }),
    ).toBe('restricted');
  });
});

describe('canPublishAgentTopicLink', () => {
  const restricted = {
    agencyConfig: { topicSharePolicy: 'restricted' as const },
    userId: 'author',
    workspaceId: 'workspace-1',
  };

  it('falls back to the role gate when no agent resolved', () => {
    // Legacy session-only topics, or a row the caller cannot read: there is no
    // policy to apply, so this must not become a second, silent denial.
    expect(canPublishAgentTopicLink(undefined, { userId: 'member' })).toBe(true);
    expect(canPublishAgentTopicLink(null, { userId: 'member' })).toBe(true);
  });

  it('blocks a plain member on a restricted agent', () => {
    expect(canPublishAgentTopicLink(restricted, { userId: 'member' })).toBe(false);
  });

  it('lets the agent author and workspace owners through', () => {
    expect(canPublishAgentTopicLink(restricted, { userId: 'author' })).toBe(true);
    expect(canPublishAgentTopicLink(restricted, { isWorkspaceOwner: true, userId: 'member' })).toBe(
      true,
    );
  });

  it('does not match an author against a missing viewer id', () => {
    expect(canPublishAgentTopicLink({ ...restricted, userId: null }, { userId: undefined })).toBe(
      false,
    );
  });
});

describe('resolveHeteroCliAgentType', () => {
  it('is the declared type — no engine indirection remains', () => {
    // The builtin Orvilo agent is its own runtime (embedded Prime), so
    // 'orvilo' flows through unchanged instead of resolving to a CLI family.
    expect(resolveHeteroCliAgentType({ type: 'orvilo' })).toBe('orvilo');
    expect(resolveHeteroCliAgentType({ type: 'claude-code' })).toBe('claude-code');
    expect(resolveHeteroCliAgentType({ type: 'codex' })).toBe('codex');
    expect(resolveHeteroCliAgentType({ type: 'openclaw' })).toBe('openclaw');
    expect(resolveHeteroCliAgentType(undefined)).toBeUndefined();
  });

  it('accepts orvilo as a declared provider type', () => {
    expect(normalizeHeterogeneousProviderConfig({ type: 'orvilo' }).type).toBe('orvilo');
  });

  it('strips a pre-cutover engine field during normalization', () => {
    // Ignore-read normalization: rows written before the Prime cutover may
    // still carry `engine`; it is dead data no reader may observe.
    expect(
      normalizeHeterogeneousProviderConfig({
        engine: 'codex-app-server',
        model: 'gpt-5.5',
        type: 'orvilo',
      } as unknown as HeterogeneousProviderConfig),
    ).toEqual({ model: 'gpt-5.5', type: 'orvilo' });
  });
});

describe('resolveHeteroAgentSystemContext', () => {
  it('prepends the persona for the builtin orvilo harness', () => {
    expect(
      resolveHeteroAgentSystemContext(
        { systemContext: 'Always run tests.', type: 'orvilo' },
        'You are a careful reviewer.',
      ),
    ).toBe('You are a careful reviewer.\n\nAlways run tests.');
  });

  it('keeps external CLI harnesses free of the agent persona', () => {
    expect(
      resolveHeteroAgentSystemContext(
        { systemContext: 'Always run tests.', type: 'claude-code' },
        'You are a careful reviewer.',
      ),
    ).toBe('Always run tests.');
    expect(resolveHeteroAgentSystemContext({ type: 'claude-code' }, 'persona')).toBeUndefined();
  });

  it('handles missing pieces', () => {
    expect(resolveHeteroAgentSystemContext({ type: 'orvilo' }, 'persona')).toBe('persona');
    expect(resolveHeteroAgentSystemContext({ type: 'orvilo' })).toBeUndefined();
    expect(resolveHeteroAgentSystemContext(undefined, 'persona')).toBeUndefined();
    expect(
      resolveHeteroAgentSystemContext({ systemContext: '  ', type: 'orvilo' }, ' '),
    ).toBeUndefined();
  });
});

describe('builtin orvilo spawn/exec args', () => {
  it('passes raw args through untouched — the builtin agent is embedded-only', () => {
    // Prime runs no local binary: no selector flag is ever encoded for
    // 'orvilo', and user-authored args pass through verbatim.
    expect(buildHeteroSpawnArgs({ type: 'orvilo' })).toBeUndefined();
    expect(
      buildHeteroSpawnArgs({ args: ['--tag', 'keep'], model: 'opus', type: 'orvilo' }),
    ).toEqual(['--tag', 'keep']);
  });

  it('passes raw args through untouched on the exec wrapper path', () => {
    expect(buildHeteroExecArgs({ type: 'orvilo' })).toBeUndefined();
    expect(buildHeteroExecArgs({ args: ['--keep'], type: 'orvilo' })).toEqual(['--keep']);
    // No --engine flag exists anywhere in the wrapper vocabulary anymore.
    expect(buildHeteroExecArgs({ model: 'opus', type: 'claude-code' })).toEqual([
      '--model',
      'opus',
    ]);
    expect(buildHeteroExecArgs({ model: 'gpt-5.5', type: 'codex' })?.join(' ')).not.toContain(
      '--engine',
    );
  });
});

describe('ACP permission dispatch', () => {
  it('preserves protocol values in the wrapper args for device and sandbox runs', () => {
    expect(
      buildHeteroExecArgs({
        type: 'codex',
        permission: {
          configId: 'approval-policy',
          value: 'agent-safe-write',
        },
      }),
    ).toEqual([
      '--acp-permission-id',
      'approval-policy',
      '--acp-permission-value',
      'agent-safe-write',
    ]);
  });
});
