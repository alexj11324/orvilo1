import { describe, expect, it } from 'vitest';

import { isBuiltinAgentAvailable } from './availability';

describe('builtin Agent availability', () => {
  it.each(['inbox', 'page-agent', 'agent-builder'])('pauses %s', (slug) => {
    expect(isBuiltinAgentAvailable(slug)).toBe(false);
  });

  it.each([undefined, null, 'configured-agent', 'orvilo', 'prime', 'group-supervisor'])(
    'preserves configured Agents and shared group execution: %s',
    (slug) => expect(isBuiltinAgentAvailable(slug)).toBe(true),
  );
});
