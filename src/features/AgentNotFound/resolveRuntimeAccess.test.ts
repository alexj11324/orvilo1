import { describe, expect, it, vi } from 'vitest';

vi.mock('@/store/serverConfig', () => ({
  featureFlagsSelectors: vi.fn(),
  useServerConfigStore: vi.fn(),
}));

const { resolveRuntimeAccess } = await import('./resolveRuntimeAccess');

const base = { builtinOffered: false, isBuiltinAgent: false, ready: true };

describe('resolveRuntimeAccess', () => {
  it('opens an ACP agent', () => {
    expect(resolveRuntimeAccess({ ...base, listed: { heterogeneousType: 'codex' } })).toEqual({
      kind: 'open',
    });
  });

  it('withholds a built-in or pre-harness agent opened by URL', () => {
    expect(resolveRuntimeAccess({ ...base, listed: { heterogeneousType: 'orvilo' } }).kind).toBe(
      'withheld',
    );
    expect(resolveRuntimeAccess({ ...base, listed: { heterogeneousType: null } }).kind).toBe(
      'withheld',
    );
  });

  // The conversation must not mount for a moment before the lists that decide
  // whether the agent is withheld have loaded.
  it('stays pending while the lists are still loading', () => {
    expect(
      resolveRuntimeAccess({ ...base, listed: { heterogeneousType: 'codex' }, ready: false }),
    ).toEqual({ kind: 'pending' });
  });

  it('forwards a built-in route to the default Agent', () => {
    expect(
      resolveRuntimeAccess({ ...base, defaultAgentId: 'agt_codex', isBuiltinAgent: true }),
    ).toEqual({ agentId: 'agt_codex', kind: 'forward' });
  });

  it('withholds a built-in route when there is no Agent to forward to', () => {
    expect(resolveRuntimeAccess({ ...base, isBuiltinAgent: true })).toEqual({ kind: 'withheld' });
  });

  // An agent missing from the list cannot be judged, so it is left to the
  // not-found guard rather than blanked here.
  it('opens an agent that is not listed', () => {
    expect(resolveRuntimeAccess(base)).toEqual({ kind: 'open' });
  });

  it('never interferes once the built-in harness is offered', () => {
    expect(
      resolveRuntimeAccess({ ...base, builtinOffered: true, isBuiltinAgent: true, ready: false }),
    ).toEqual({ kind: 'open' });
  });
});
