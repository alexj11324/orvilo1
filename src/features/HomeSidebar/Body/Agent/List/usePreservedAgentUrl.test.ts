import { AGENT_CHAT_URL } from '@orvilo/const';
import { describe, expect, it } from 'vitest';

import { resolvePreservedAgentUrl } from './usePreservedAgentUrl';

describe('resolvePreservedAgentUrl', () => {
  it('lands on the agent chat when switching from a legacy profile view', () => {
    // `/agent/:id/profile` redirects to Settings → Agents; it is no longer a
    // work view to preserve across agent switches.
    expect(resolvePreservedAgentUrl('/agent/agt_a/profile', 'agt_b')).toBe(
      AGENT_CHAT_URL('agt_b', false),
    );
  });

  it('drops topic and task ids that belong to the previous agent', () => {
    expect(resolvePreservedAgentUrl('/agent/agt_a/topic/tpc_1', 'agt_b')).toBe(
      AGENT_CHAT_URL('agt_b', false),
    );
  });
});
