import { describe, expect, it } from 'vitest';

import { resolveAgentRuntimeType } from './agentRuntimeIdentity';

describe('persisted agent runtime identity', () => {
  it.each([
    [{ agencyConfig: { heterogeneousProvider: { command: 'codex' } } }, 'codex'],
    [{ agencyConfig: { heterogeneousProvider: { command: 'claude' } } }, 'claude-code'],
    [{ model: 'codex' }, 'codex'],
    [
      {
        agencyConfig: { heterogeneousProvider: { command: 'codex', type: 'orvilo' } },
        model: 'codex',
      },
      'orvilo',
    ],
    [{ model: 'gpt-4o' }, 'orvilo'],
  ] as const)('uses the persisted read migration for %j', (config, type) => {
    expect(resolveAgentRuntimeType(config)).toBe(type);
  });
});
