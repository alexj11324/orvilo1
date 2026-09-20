import { HETEROGENEOUS_AGENT_CONFIGS, listLocalAgentTypes } from '@orvilo/heterogeneous-agents';
import { describe, expect, it } from 'vitest';

import { listHeterogeneousCliBinaryTypes } from '../binaries/cliAgentBinaries';

describe('heterogeneous agent registry consistency', () => {
  it('keeps every executable registry aligned with the descriptor catalog', () => {
    const descriptorTypes = HETEROGENEOUS_AGENT_CONFIGS.map(({ type }) => type).toSorted();

    expect(listLocalAgentTypes().toSorted()).toEqual(descriptorTypes);
    expect(listHeterogeneousCliBinaryTypes().toSorted()).toEqual(descriptorTypes);
  });
});
