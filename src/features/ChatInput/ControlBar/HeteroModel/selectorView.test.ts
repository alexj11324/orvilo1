import type { HeterogeneousProviderConfig, HeteroSelectorCapability } from '@orvilo/types';
import { applyHeteroSelection, getHeteroSelectorCapability } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import type { ModelCapability } from './selectorView';
import {
  hasConversationEffortSelector,
  hasConversationModelSelector,
  resolveComposerCurrentEffort,
  resolveComposerEffortReset,
  resolveModelSwitchSelection,
} from './selectorView';

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

describe('conversation selector dimensions', () => {
  it('offers a model picker only where the harness exposes a model dimension', () => {
    expect(hasConversationModelSelector('codex')).toBe(true);
    expect(hasConversationModelSelector('cursor')).toBe(true);
    // Prime is absent from the ACP capability table — its list is the provider
    // bindings — so it must be admitted by the builtin branch, or its picker
    // renders as the inert "cannot switch models" chip.
    expect(hasConversationModelSelector('orvilo')).toBe(true);
    // mode-only and empty capabilities have no model to switch in the composer.
    expect(hasConversationModelSelector('amp')).toBe(false);
    expect(hasConversationModelSelector('kimi-code')).toBe(false);
    expect(hasConversationModelSelector('not-a-harness')).toBe(false);
    expect(hasConversationModelSelector(undefined)).toBe(false);
  });

  it('offers an effort picker only where the harness exposes an effort dimension', () => {
    expect(hasConversationEffortSelector('codex')).toBe(true);
    expect(hasConversationEffortSelector('claude-code')).toBe(true);
    // model-only harnesses simply have no effort dimension.
    expect(hasConversationEffortSelector('cursor')).toBe(false);
    expect(hasConversationEffortSelector('droid')).toBe(false);
    expect(hasConversationEffortSelector(undefined)).toBe(false);
  });
});

describe('selector capabilities behind the engine form', () => {
  it.each(['claude-code', 'codex'])('reads %s models from the runtime catalog', (type) => {
    expect(capabilityOf(type).model.source).toBe('catalog');
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

describe('resolveComposerCurrentEffort', () => {
  const codex = { type: 'codex' } as HeterogeneousProviderConfig;

  it('reads the pick held by a conversation with no topic yet', () => {
    // A blank composer keeps its pick in chat state, so nothing the provider
    // carries can stand in for it.
    expect(
      resolveComposerCurrentEffort({
        composerEffort: 'ultra',
        provider: { ...codex, effort: 'low' },
      }),
    ).toBe('ultra');
  });

  it('falls back to the topic pin, then the agent config', () => {
    expect(
      resolveComposerCurrentEffort({
        provider: { ...codex, effort: 'low' },
        topicPin: { effort: 'high', model: 'gpt-5.5', provider: 'codex' },
      }),
    ).toBe('high');
    expect(resolveComposerCurrentEffort({ provider: codex })).toBeUndefined();
  });
});

describe('resolveComposerEffortReset', () => {
  const codex = { type: 'codex' } as HeterogeneousProviderConfig;

  it('resets an effort picked in the blank composer that the new model cannot serve', () => {
    // The pick never reached a topic, so a reader that stops at the topic/agent
    // levels sees nothing to reset and the topic is born with a level its model
    // cannot run.
    expect(
      resolveComposerEffortReset({ composerEffort: 'ultra', provider: codex, value: 'gpt-5.4' }),
    ).toBe('default');
  });

  it('keeps an effort picked in the blank composer that the new model still serves', () => {
    expect(
      resolveComposerEffortReset({ composerEffort: 'max', provider: codex, value: 'gpt-6-astra' }),
    ).toBeUndefined();
  });

  it('resets from the topic pin when the composer holds no pick', () => {
    expect(
      resolveComposerEffortReset({
        provider: codex,
        topicPin: { effort: 'ultra', model: 'gpt-5.5', provider: 'codex' },
        value: 'gpt-5.4',
      }),
    ).toBe('default');
  });

  it('never resets for a harness whose levels do not depend on the model', () => {
    expect(
      resolveComposerEffortReset({
        composerEffort: 'high',
        provider: { type: 'claude-code' } as HeterogeneousProviderConfig,
        value: 'haiku',
      }),
    ).toBeUndefined();
  });

  it('never resets for a legacy agent with no heterogeneous provider', () => {
    expect(resolveComposerEffortReset({ value: 'gpt-4' })).toBeUndefined();
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
