import { describe, expect, it, vi } from 'vitest';

import { snapshotAgentReasoning } from './snapshotAgentModel';

const agentMap: Record<string, any> = {};

vi.mock('@/store/agent', () => ({ getAgentStoreState: () => ({ agentMap }) }));

const seedAgent = (id: string, config: Record<string, any>) => {
  agentMap[id] = config;
  return id;
};

describe('snapshotAgentReasoning', () => {
  it('returns nothing without an agent', async () => {
    expect(await snapshotAgentReasoning(undefined)).toBeUndefined();
  });

  it("pins a heterogeneous agent's effort, and nothing when it has none", async () => {
    const withEffort = seedAgent('hetero-effort', {
      agencyConfig: { heterogeneousProvider: { effort: 'high', type: 'claude-code' } },
    });
    const without = seedAgent('hetero-plain', {
      agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
    });

    expect(await snapshotAgentReasoning(withEffort)).toEqual({ heteroEffort: 'high' });
    expect(await snapshotAgentReasoning(without)).toBeUndefined();
  });

  it('pins nothing for API models — the user-level reasoning config is retired', async () => {
    const id = seedAgent('plain', { model: 'gpt-4o', provider: 'openai' });
    const reasoning = seedAgent('reasoning', { model: 'gpt-5.5', provider: 'openai' });

    expect(await snapshotAgentReasoning(id)).toBeUndefined();
    expect(await snapshotAgentReasoning(reasoning)).toBeUndefined();
  });
});
