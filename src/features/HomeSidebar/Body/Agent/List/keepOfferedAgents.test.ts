import { describe, expect, it, vi } from 'vitest';

vi.mock('@/store/serverConfig', () => ({
  featureFlagsSelectors: vi.fn(),
  useServerConfigStore: vi.fn(),
}));

const { keepOfferedAgents } = await import('./useAgentList');

const rows = [
  { heterogeneousType: 'codex', id: 'agt_codex', type: 'agent' },
  { heterogeneousType: 'orvilo', id: 'agt_prime', type: 'agent' },
  { heterogeneousType: null, id: 'agt_legacy', type: 'agent' },
  { id: 'agt_unstamped', type: 'agent' },
  { id: 'grp_chat', type: 'group' },
];
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('keepOfferedAgents', () => {
  it('hides paused builtin identities while preserving configured Prime and groups', () => {
    const paused = ['inbox', 'page-agent', 'agent-builder'].map((slug) => ({
      id: slug,
      slug,
      type: 'agent',
    }));
    const configured = { heterogeneousType: 'orvilo', id: 'agt_configured', type: 'agent' };
    const group = { id: 'group', type: 'group' };
    expect(keepOfferedAgents([...paused, configured, group], true)).toEqual([configured, group]);
  });

  it('keeps every row while the built-in harness is offered', () => {
    expect(keepOfferedAgents(rows, true)).toEqual(rows);
  });

  // An unstamped agent predates harness selection and runs on the built-in
  // runtime, so it goes with the agents stamped as built-in. Chat groups carry
  // no runtime stamp either and must survive.
  it('drops built-in and unstamped agents but keeps chat groups when withheld', () => {
    expect(ids(keepOfferedAgents(rows, false))).toEqual(['agt_codex', 'grp_chat']);
  });
});
