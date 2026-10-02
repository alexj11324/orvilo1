import { describe, expect, it } from 'vitest';

import { agentTierRank, nextAgentTier, requiredAgentTierForPriority } from './agentTier';

describe('agentTierRank', () => {
  it('orders the bands low < mid < high', () => {
    expect(agentTierRank('low')).toBeLessThan(agentTierRank('mid'));
    expect(agentTierRank('mid')).toBeLessThan(agentTierRank('high'));
  });
});

describe('nextAgentTier', () => {
  it('climbs one band at a time and stops at the top', () => {
    expect(nextAgentTier('low')).toBe('mid');
    expect(nextAgentTier('mid')).toBe('high');
    expect(nextAgentTier('high')).toBeUndefined();
  });
});

describe('requiredAgentTierForPriority', () => {
  it('maps Linear-style priority integers onto capability bands', () => {
    // 1 = urgent, 2 = high → the strong band
    expect(requiredAgentTierForPriority(1)).toBe('high');
    expect(requiredAgentTierForPriority(2)).toBe('high');
    // 3 = normal → the middle band
    expect(requiredAgentTierForPriority(3)).toBe('mid');
    // 4 = low, 0 = none, unset → the cheap band
    expect(requiredAgentTierForPriority(4)).toBe('low');
    expect(requiredAgentTierForPriority(0)).toBe('low');
    expect(requiredAgentTierForPriority(null)).toBe('low');
    expect(requiredAgentTierForPriority(undefined)).toBe('low');
  });
});
