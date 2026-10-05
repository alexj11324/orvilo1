import type { ProviderBinding } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { collectPrimeModelRoutes, resolveComposerModelDispatch } from './useComposerModelSource';

const binding = (overrides: {
  enabled?: boolean;
  model?: string;
  runtime?: string;
  target?: string;
}) =>
  ({
    enabled: overrides.enabled ?? true,
    model: overrides.model,
    selection: { runtime: overrides.runtime ?? 'orvilo', target: overrides.target ?? 'sandbox' },
  }) as unknown as ProviderBinding;

describe('collectPrimeModelRoutes', () => {
  it('keeps only enabled embedded-eligible orvilo bindings, in order', () => {
    expect(
      collectPrimeModelRoutes([
        binding({ model: 'claude-sonnet-5' }),
        binding({ model: 'claude-opus-5' }),
        binding({ enabled: false, model: 'gpt-5.6' }),
        binding({ model: 'x', target: 'device' }),
        binding({ model: 'y', runtime: 'other' }),
        binding({ model: undefined }),
      ]),
    ).toEqual(['claude-sonnet-5', 'claude-opus-5']);
  });

  it('dedupes two bindings that resolve to the same route', () => {
    expect(
      collectPrimeModelRoutes([
        binding({ model: 'claude-opus-5' }),
        binding({ model: 'claude-opus-5' }),
      ]),
    ).toEqual(['claude-opus-5']);
  });
});

describe('resolveComposerModelDispatch', () => {
  const base = {
    canDisplayModel: true,
    canSelectModel: true,
    hasHeterogeneousProvider: true,
    hasModelDimension: true,
  };

  it('renders nothing when the trigger must stay hidden', () => {
    expect(resolveComposerModelDispatch({ ...base, canDisplayModel: false })).toBe('hidden');
  });

  it('keeps the inert chip when the caller may not select, whatever the agent exposes', () => {
    expect(resolveComposerModelDispatch({ ...base, canSelectModel: false })).toBe('locked');
    expect(
      resolveComposerModelDispatch({
        ...base,
        canSelectModel: false,
        hasModelDimension: false,
      }),
    ).toBe('locked');
  });

  it('keeps the inert chip for a harness with no model dimension', () => {
    expect(resolveComposerModelDispatch({ ...base, hasModelDimension: false })).toBe('unsupported');
  });

  it('opens the shared panel for a harness that can switch models', () => {
    expect(resolveComposerModelDispatch(base)).toBe('panel');
  });

  it('opens the panel for a legacy agent with no heterogeneous provider', () => {
    expect(
      resolveComposerModelDispatch({
        ...base,
        hasHeterogeneousProvider: false,
        hasModelDimension: false,
      }),
    ).toBe('panel');
  });
});
