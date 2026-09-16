import type { HeterogeneousProviderConfig } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import {
  applyEngineAwareSelection,
  buildEngineProviderPatch,
  buildHarnessProviderPatch,
  DEFAULT_ORVILO_ENGINE,
  getEngineSelectorCapability,
  isBuiltinEngineType,
  resolveEngineSelectorType,
  resolveOrviloEngineCliType,
} from './engine';

describe('isBuiltinEngineType', () => {
  it('recognizes the builtin Orvilo harness', () => {
    expect(isBuiltinEngineType('orvilo')).toBe(true);
    expect(isBuiltinEngineType('claude-code')).toBe(false);
    expect(isBuiltinEngineType('openclaw')).toBe(false);
    expect(isBuiltinEngineType(undefined)).toBe(false);
  });
});

describe('resolveOrviloEngineCliType', () => {
  it('maps claude-sdk to the claude-code family', () => {
    expect(resolveOrviloEngineCliType('claude-sdk')).toBe('claude-code');
  });

  it('maps codex-app-server to the codex family', () => {
    expect(resolveOrviloEngineCliType('codex-app-server')).toBe('codex');
  });

  it('defaults missing engines to the claude-code family', () => {
    expect(resolveOrviloEngineCliType(undefined)).toBe('claude-code');
    expect(resolveOrviloEngineCliType(null)).toBe('claude-code');
  });
});

describe('resolveEngineSelectorType', () => {
  it('resolves orvilo through its engine family', () => {
    expect(resolveEngineSelectorType({ type: 'orvilo', engine: 'codex-app-server' })).toBe('codex');
    expect(resolveEngineSelectorType({ type: 'orvilo' })).toBe('claude-code');
  });

  it('passes non-builtin types through unchanged', () => {
    expect(resolveEngineSelectorType({ type: 'claude-code' })).toBe('claude-code');
    expect(resolveEngineSelectorType({ type: 'openclaw' })).toBe('openclaw');
  });

  it('returns undefined for a missing provider', () => {
    expect(resolveEngineSelectorType(undefined)).toBeUndefined();
    expect(resolveEngineSelectorType(null)).toBeUndefined();
  });
});

describe('getEngineSelectorCapability', () => {
  it('exposes the claude-code capability for the default orvilo engine', () => {
    const capability = getEngineSelectorCapability({ type: 'orvilo' });
    expect(capability?.model?.source).toBe('static');
    expect(capability?.effort?.levels('default')).toContain('max');
  });

  it('exposes the codex capability for the codex-app-server engine', () => {
    const capability = getEngineSelectorCapability({ type: 'orvilo', engine: 'codex-app-server' });
    expect(capability?.effort?.levels('gpt-5.6')).toContain('ultra');
    expect(capability?.speed?.supported('gpt-5.5')).toBe(true);
  });

  it('returns undefined for providers without selector capabilities', () => {
    expect(getEngineSelectorCapability({ type: 'openclaw' })).toBeUndefined();
    expect(getEngineSelectorCapability(undefined)).toBeUndefined();
  });
});

describe('applyEngineAwareSelection', () => {
  it('clears claude-spelled model args on an orvilo claude-sdk provider', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--model', 'opus', '--verbose'],
      type: 'orvilo',
    };
    const patch = applyEngineAwareSelection(provider, { model: 'sonnet' });
    expect(patch.model).toBe('sonnet');
    expect(patch.args).toEqual(['--verbose']);
  });

  it('clears codex-spelled config args on an orvilo codex-app-server provider', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['-c', 'model=gpt-5.5', '--full-auto'],
      engine: 'codex-app-server',
      type: 'orvilo',
    };
    const patch = applyEngineAwareSelection(provider, { model: 'gpt-5.6' });
    expect(patch.args).toEqual(['--full-auto']);
  });

  it('clears effort encodings for the mapped engine family', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['-c', 'model_reasoning_effort=high'],
      engine: 'codex-app-server',
      type: 'orvilo',
    };
    const patch = applyEngineAwareSelection(provider, { effort: 'low' });
    expect(patch.effort).toBe('low');
    expect(patch.args).toEqual([]);
  });

  it('behaves like applyHeteroSelection for regular CLI providers', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--model', 'opus'],
      type: 'claude-code',
    };
    const patch = applyEngineAwareSelection(provider, { model: 'sonnet' });
    expect(patch.args).toEqual([]);
  });
});

describe('buildHarnessProviderPatch', () => {
  it('writes just the type for a fresh heterogeneous provider', () => {
    expect(buildHarnessProviderPatch(undefined, 'codex')).toEqual({ type: 'codex' });
    expect(buildHarnessProviderPatch(null, 'claude-code')).toEqual({ type: 'claude-code' });
  });

  it('stamps the default engine when switching to the orvilo harness', () => {
    expect(buildHarnessProviderPatch(undefined, 'orvilo')).toEqual({
      engine: DEFAULT_ORVILO_ENGINE,
      type: 'orvilo',
    });
  });

  it('nulls harness-scoped fields carried by the previous harness', () => {
    const current: HeterogeneousProviderConfig = {
      apiConfig: { model: 'm', providerId: 'p' },
      args: ['--model', 'opus'],
      authMode: 'api',
      command: 'claude',
      effort: 'max',
      env: { FOO: '1' },
      model: 'opus',
      type: 'claude-code',
    };
    const patch = buildHarnessProviderPatch(current, 'codex') as Record<string, unknown>;
    expect(patch).toEqual({
      apiConfig: null,
      args: null,
      authMode: null,
      command: null,
      effort: null,
      env: null,
      model: null,
      type: 'codex',
    });
  });

  it('clears a stored engine when leaving the orvilo harness', () => {
    const patch = buildHarnessProviderPatch(
      { engine: 'codex-app-server', type: 'orvilo' },
      'claude-code',
    ) as Record<string, unknown>;
    expect(patch).toEqual({ engine: null, type: 'claude-code' });
  });

  it('preserves systemContext across the switch', () => {
    const patch = buildHarnessProviderPatch(
      { model: 'opus', systemContext: 'Always run tests.', type: 'claude-code' },
      'orvilo',
    ) as Record<string, unknown>;
    expect(patch).toEqual({
      engine: DEFAULT_ORVILO_ENGINE,
      model: null,
      systemContext: 'Always run tests.',
      type: 'orvilo',
    });
  });

  it('does not emit nulls for fields the previous provider never set', () => {
    const patch = buildHarnessProviderPatch({ type: 'codex' }, 'amp') as Record<string, unknown>;
    expect(patch).toEqual({ type: 'amp' });
  });
});

describe('buildEngineProviderPatch', () => {
  it('upgrades a legacy model-only agent onto the orvilo harness', () => {
    expect(buildEngineProviderPatch(undefined, 'codex-app-server')).toEqual({
      engine: 'codex-app-server',
      type: 'orvilo',
    });
  });

  it('rewrites a non-orvilo provider onto the orvilo harness', () => {
    expect(buildEngineProviderPatch({ type: 'codex' }, 'claude-sdk')).toEqual({
      engine: 'claude-sdk',
      type: 'orvilo',
    });
  });

  it('clears old engine fields, preserves context, and keeps a valid effort', () => {
    const patch = buildEngineProviderPatch(
      {
        apiConfig: { model: 'legacy-model', providerId: 'legacy-provider' },
        args: ['--model', 'opus'],
        authMode: 'api',
        command: 'claude',
        effort: 'high',
        engine: 'claude-sdk',
        env: { LEGACY_ENGINE: 'claude' },
        mode: 'high',
        model: 'opus',
        platformAgentId: 'legacy-agent',
        speed: 'fast',
        systemContext: 'Always run tests.',
        type: 'orvilo',
      },
      'codex-app-server',
    );
    expect(patch).toEqual({
      apiConfig: null,
      args: null,
      effort: 'high',
      engine: 'codex-app-server',
      authMode: null,
      command: null,
      env: null,
      mode: null,
      model: 'default',
      platformAgentId: null,
      speed: 'default',
      systemContext: 'Always run tests.',
    });
  });

  it('resets an effort the new engine cannot serve', () => {
    const patch = buildEngineProviderPatch(
      { effort: 'ultra', engine: 'codex-app-server', model: 'gpt-5.6', type: 'orvilo' },
      'claude-sdk',
    );
    expect(patch).toEqual({
      args: null,
      effort: 'default',
      engine: 'claude-sdk',
      model: 'default',
      speed: 'default',
    });
  });

  it('is a minimal write when the engine is unchanged', () => {
    expect(
      buildEngineProviderPatch(
        { engine: 'claude-sdk', model: 'opus', type: 'orvilo' },
        'claude-sdk',
      ),
    ).toEqual({ engine: 'claude-sdk' });
  });
});
