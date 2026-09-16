import type { HeterogeneousProviderConfig, HeteroSelectorCapability } from '@orvilo/types';
import { applyHeteroSelection, getHeteroSelectorCapability } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { getStaticModelOptions } from './modelOptions';
import type { ModelCapability } from './selectorView';
import { resolveModelSwitchSelection } from './selectorView';

const selectorCapabilityOf = (type: string): HeteroSelectorCapability => {
  const capability = getHeteroSelectorCapability(type);
  if (!capability || Object.keys(capability).length === 0) {
    throw new Error(`no selector capability for ${type}`);
  }

  return capability;
};

const capabilityOf = (type: string): ModelCapability => {
  const capability = selectorCapabilityOf(type);
  if (!capability.model) throw new Error(`no model capability for ${type}`);

  return { ...capability, model: capability.model };
};

describe('selector capabilities behind the engine form', () => {
  it('offers Astra before older Codex models', () => {
    expect(getStaticModelOptions('codex')[0]).toEqual({
      label: 'GPT-6 Astra',
      value: 'gpt-6-astra',
    });
  });

  it('labels Claude aliases without claiming a fixed model version', () => {
    expect(getStaticModelOptions('claude-code')).toEqual([
      { label: 'Fable', value: 'fable' },
      { label: 'Opus', value: 'opus' },
      { label: 'Sonnet', value: 'sonnet' },
      { label: 'Haiku', value: 'haiku' },
    ]);
  });

  it('narrows codex reasoning levels to what the model serves', () => {
    const capability = selectorCapabilityOf('codex');

    expect(capability.effort?.levels('gpt-5.6-sol')).toContain('ultra');
    expect(capability.effort?.levels('gpt-5.6-luna')).toContain('max');
    expect(capability.effort?.levels('gpt-5.6-luna')).not.toContain('ultra');
  });

  it('gates codex fast speed on the model', () => {
    const capability = selectorCapabilityOf('codex');

    expect(capability.speed?.supported('gpt-5.6-sol')).toBe(true);
    expect(capability.speed?.supported('gpt-5.3-codex-spark')).toBe(false);
  });
});

describe('resolveModelSwitchSelection', () => {
  it.each(['max', 'ultra'] as const)('handles %s when switching to Astra', (effort) => {
    expect(
      resolveModelSwitchSelection({
        capability: capabilityOf('codex'),
        effort,
        isFastSpeed: false,
        value: 'gpt-6-astra',
      }),
    ).toEqual(
      effort === 'max' ? { model: 'gpt-6-astra' } : { effort: 'default', model: 'gpt-6-astra' },
    );
  });

  it('resets a fast speed the newly picked codex model cannot serve', () => {
    expect(
      resolveModelSwitchSelection({
        capability: capabilityOf('codex'),
        isFastSpeed: true,
        value: 'gpt-5.3-codex-spark',
      }),
    ).toEqual({ model: 'gpt-5.3-codex-spark', speed: 'default' });
  });

  it('keeps a fast speed the newly picked codex model still serves', () => {
    expect(
      resolveModelSwitchSelection({
        capability: capabilityOf('codex'),
        isFastSpeed: true,
        value: 'gpt-5.5',
      }),
    ).toEqual({ model: 'gpt-5.5' });
  });

  it('resets an effort level the newly picked codex model cannot serve', () => {
    expect(
      resolveModelSwitchSelection({
        capability: capabilityOf('codex'),
        effort: 'ultra',
        isFastSpeed: false,
        value: 'gpt-5.4',
      }),
    ).toEqual({ effort: 'default', model: 'gpt-5.4' });
  });

  it('never resets effort for providers whose levels do not depend on the model', () => {
    expect(
      resolveModelSwitchSelection({
        capability: capabilityOf('claude-code'),
        effort: 'max',
        isFastSpeed: false,
        value: 'haiku',
      }),
    ).toEqual({ model: 'haiku' });
  });
});

describe('what a pick persists', () => {
  it('clears the contradicting claude-code arg', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--verbose', '--model', 'haiku'],
      type: 'claude-code',
    };

    expect(
      applyHeteroSelection(
        provider,
        resolveModelSwitchSelection({
          capability: capabilityOf('claude-code'),
          isFastSpeed: false,
          value: 'opus',
        }),
      ),
    ).toEqual({ args: ['--verbose'], model: 'opus' });
  });

  it('clears both codex model spellings', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['-m', 'gpt-5.5', '-c', 'model="gpt-5.4"'],
      type: 'codex',
    };

    expect(
      applyHeteroSelection(
        provider,
        resolveModelSwitchSelection({
          capability: capabilityOf('codex'),
          isFastSpeed: false,
          value: 'gpt-5.6-sol',
        }),
      ),
    ).toEqual({ args: [], model: 'gpt-5.6-sol' });
  });

  it('clears the qoder reasoning-effort flag', () => {
    const provider: HeterogeneousProviderConfig = {
      args: ['--reasoning-effort', 'high', '-p'],
      type: 'qoder',
    };

    expect(applyHeteroSelection(provider, { effort: 'low' })).toEqual({
      args: ['-p'],
      effort: 'low',
    });
  });
});
