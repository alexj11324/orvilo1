import { describe, expect, it } from 'vitest';

import { resolveOfferedAgentId } from './resolveOfferedAgentId';

const codex = { heterogeneousType: 'codex', id: 'agt_codex', type: 'agent' };
const prime = { heterogeneousType: 'orvilo', id: 'agt_prime', type: 'agent' };
const legacy = { heterogeneousType: null, id: 'agt_legacy', type: 'agent' };

describe('resolveOfferedAgentId', () => {
  it('keeps any Agent while the built-in harness is offered', () => {
    expect(
      resolveOfferedAgentId({
        agentId: 'agt_inbox',
        agents: [codex],
        builtinOffered: true,
        defaultAgentId: codex.id,
      }),
    ).toBe('agt_inbox');
  });

  it('keeps a listed Agent on an offered runtime', () => {
    expect(
      resolveOfferedAgentId({
        agentId: codex.id,
        agents: [codex, prime],
        builtinOffered: false,
        defaultAgentId: 'agt_other',
      }),
    ).toBe(codex.id);
  });

  // The last Agent a message was sent to is remembered across the flag flip.
  it.each([
    ['a built-in runtime', prime.id],
    ['no runtime stamp', legacy.id],
    ['the unlisted inbox Agent', 'agt_inbox'],
  ])('hands an Agent with %s over to the default Agent', (_label, agentId) => {
    expect(
      resolveOfferedAgentId({
        agentId,
        agents: [codex, prime, legacy],
        builtinOffered: false,
        defaultAgentId: codex.id,
      }),
    ).toBe(codex.id);
  });

  it('names no Agent when the remembered one is withheld and there is no default', () => {
    expect(
      resolveOfferedAgentId({ agentId: prime.id, agents: [prime], builtinOffered: false }),
    ).toBeUndefined();
  });

  it('names the default Agent when none is remembered', () => {
    expect(
      resolveOfferedAgentId({ agents: [codex], builtinOffered: false, defaultAgentId: codex.id }),
    ).toBe(codex.id);
    expect(
      resolveOfferedAgentId({ agents: [codex], builtinOffered: true, defaultAgentId: codex.id }),
    ).toBeUndefined();
  });
});
