import { describe, expect, it } from 'vitest';

import { validEffortFor } from './agentOptions';

describe('creation effort after changing model', () => {
  it('clears a Codex effort level unsupported by the new model', () => {
    expect(validEffortFor('codex', 'gpt-6-astra', 'max')).toBe('max');
    expect(validEffortFor('codex', 'gpt-5.4-mini', 'max')).toBe('default');
  });
  it('keeps supported effort and clears it for an effort-less Agent', () => {
    expect(validEffortFor('codex', 'gpt-5.4-mini', 'high')).toBe('high');
    expect(validEffortFor('opencode', 'any-model', 'high')).toBe('default');
  });
});
