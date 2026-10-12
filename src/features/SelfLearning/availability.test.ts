import { describe, expect, it } from 'vitest';

import { isSelfEvolvingPath } from './availability';

describe('isSelfEvolvingPath', () => {
  it('matches the self-evolving pages and their legacy path', () => {
    expect(isSelfEvolvingPath('/agent/agt_1/self-evolving')).toBe(true);
    expect(isSelfEvolvingPath('/ws-a/agent/agt_1/self-evolving/new')).toBe(true);
    expect(isSelfEvolvingPath('/agent/agt_1/self-evolving/dom_1/rules/les_1')).toBe(true);
    expect(isSelfEvolvingPath('/agent/agt_1/self-learning/dom_1')).toBe(true);
  });

  it('leaves the rest of the agent routes alone', () => {
    expect(isSelfEvolvingPath('/agent/agt_1')).toBe(false);
    expect(isSelfEvolvingPath('/agent/agt_1/profile')).toBe(false);
    expect(isSelfEvolvingPath('/agent/agt_1/self-evolving-notes')).toBe(false);
    expect(isSelfEvolvingPath('/agent/self-evolving')).toBe(false);
  });
});
