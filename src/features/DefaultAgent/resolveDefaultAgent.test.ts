import { describe, expect, it } from 'vitest';

import { resolveDefaultAgent } from './resolveDefaultAgent';

const codex = { heterogeneousType: 'codex', id: 'agt_codex', type: 'agent' };
const claude = { heterogeneousType: 'claude-code', id: 'agt_claude', type: 'agent' };
const prime = { heterogeneousType: 'orvilo', id: 'agt_prime', type: 'agent' };
const legacy = { heterogeneousType: null, id: 'agt_legacy', type: 'agent' };
const group = { id: 'grp_1', type: 'group' };

describe('resolveDefaultAgent', () => {
  it('prefers the saved default over the Orchestrator', () => {
    expect(
      resolveDefaultAgent({
        agents: [codex, claude],
        builtinOffered: false,
        defaultAgentId: claude.id,
        orchestratorAgentId: codex.id,
      }),
    ).toEqual({ agentId: claude.id, source: 'default' });
  });

  it('falls back to the Orchestrator when no default is saved', () => {
    expect(
      resolveDefaultAgent({
        agents: [codex, claude],
        builtinOffered: false,
        orchestratorAgentId: claude.id,
      }),
    ).toEqual({ agentId: claude.id, source: 'orchestrator' });
  });

  it('falls back to the first listed Agent when neither pointer is saved', () => {
    expect(resolveDefaultAgent({ agents: [group, codex, claude], builtinOffered: false })).toEqual({
      agentId: codex.id,
      source: 'first',
    });
  });

  it('skips a saved default that was deleted', () => {
    expect(
      resolveDefaultAgent({ agents: [codex], builtinOffered: false, defaultAgentId: 'agt_gone' }),
    ).toEqual({ agentId: codex.id, source: 'first' });
  });

  // A built-in or pre-harness Agent saved as the default must not be opened
  // while the built-in harness is withheld: it cannot run.
  it('skips built-in and unstamped Agents while the built-in harness is withheld', () => {
    expect(
      resolveDefaultAgent({
        agents: [prime, legacy, codex],
        builtinOffered: false,
        defaultAgentId: prime.id,
        orchestratorAgentId: legacy.id,
      }),
    ).toEqual({ agentId: codex.id, source: 'first' });
  });

  it('honours a built-in default once the built-in harness is offered', () => {
    expect(
      resolveDefaultAgent({
        agents: [prime, codex],
        builtinOffered: true,
        defaultAgentId: prime.id,
      }),
    ).toEqual({ agentId: prime.id, source: 'default' });
  });

  it('resolves nothing when no offered Agent exists', () => {
    expect(resolveDefaultAgent({ agents: [prime, group], builtinOffered: false })).toBeUndefined();
  });
});
