import type { HeterogeneousProviderConfig } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { buildHarnessProviderPatch, isBuiltinEngineType } from './engine';

describe('isBuiltinEngineType', () => {
  it('recognizes the builtin Orvilo harness', () => {
    expect(isBuiltinEngineType('orvilo')).toBe(true);
    expect(isBuiltinEngineType('claude-code')).toBe(false);
    expect(isBuiltinEngineType('openclaw')).toBe(false);
    expect(isBuiltinEngineType(undefined)).toBe(false);
  });
});

describe('buildHarnessProviderPatch', () => {
  it('writes just the type for a fresh heterogeneous provider', () => {
    expect(buildHarnessProviderPatch(undefined, 'codex')).toEqual({ type: 'codex' });
    expect(buildHarnessProviderPatch(null, 'claude-code')).toEqual({ type: 'claude-code' });
  });

  it('writes just the type when switching to the builtin Orvilo harness', () => {
    // The builtin agent is bound to Prime — fixed: no engine is stamped.
    expect(buildHarnessProviderPatch(undefined, 'orvilo')).toEqual({ type: 'orvilo' });
  });

  it('nulls harness-scoped fields carried by the previous harness', () => {
    const current: HeterogeneousProviderConfig = {
      args: ['--model', 'opus'],
      command: 'claude',
      effort: 'max',
      env: { FOO: '1' },
      model: 'opus',
      type: 'claude-code',
    };
    const patch = buildHarnessProviderPatch(current, 'codex') as Record<string, unknown>;
    expect(patch).toEqual({
      args: null,
      command: null,
      effort: null,
      env: null,
      model: null,
      type: 'codex',
    });
  });

  it('nulls harness-scoped fields when leaving a legacy engine-carrying provider', () => {
    const patch = buildHarnessProviderPatch(
      // A pre-cutover row still carrying `engine`: the field is dead data —
      // switching harness clears harness-scoped fields and never writes it.
      { args: ['--model', 'opus'], model: 'opus', type: 'orvilo' },
      'claude-code',
    ) as Record<string, unknown>;
    expect(patch).toEqual({ args: null, model: null, type: 'claude-code' });
  });

  it('preserves systemContext across the switch', () => {
    const patch = buildHarnessProviderPatch(
      { model: 'opus', systemContext: 'Always run tests.', type: 'claude-code' },
      'orvilo',
    ) as Record<string, unknown>;
    expect(patch).toEqual({
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
