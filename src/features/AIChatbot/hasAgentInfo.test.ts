import { describe, expect, it } from 'vitest';

import { hasAgentInfo } from './hasAgentInfo';

describe('hasAgentInfo', () => {
  it('has nothing to show for an Agent with only a name', () => {
    expect(hasAgentInfo({})).toBe(false);
    expect(hasAgentInfo({ description: '', systemRole: '' })).toBe(false);
  });

  it('shows an Agent that has a description or instructions', () => {
    expect(hasAgentInfo({ description: 'Builds things' })).toBe(true);
    expect(hasAgentInfo({ systemRole: 'You build things.' })).toBe(true);
  });
});
