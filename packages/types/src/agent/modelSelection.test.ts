import { describe, expect, it } from 'vitest';

import { resolveAgentModelConfig } from './modelSelection';

describe('saved Agent model', () => {
  it('uses the saved model and provider', () => {
    expect(resolveAgentModelConfig({ model: 'saved', provider: 'provider' })).toEqual({
      model: 'saved',
      provider: 'provider',
    });
  });
  it('retains the internal sub-agent override without introducing member preferences', () => {
    expect(
      resolveAgentModelConfig({ model: 'saved', provider: 'provider' }, { model: 'subagent' }),
    ).toEqual({ model: 'subagent', provider: 'provider' });
  });
});
