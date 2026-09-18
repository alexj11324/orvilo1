import { AGENT_CHAT_URL } from '@orvilo/const';
import { describe, expect, it } from 'vitest';

import { resolvePreservedAgentUrl } from './usePreservedAgentUrl';

describe('resolvePreservedAgentUrl', () => {
  it('keeps an agent-scoped subview when switching agents', () => {
    expect(resolvePreservedAgentUrl('/agent/agt_a/profile', 'agt_b')).toBe('/agent/agt_b/profile');
    expect(resolvePreservedAgentUrl('/agent/agt_a/channel', 'agt_b')).toBe('/agent/agt_b/channel');
  });

  it('drops topic and task ids that belong to the previous agent', () => {
    expect(resolvePreservedAgentUrl('/agent/agt_a/topic/tpc_1', 'agt_b')).toBe(
      AGENT_CHAT_URL('agt_b', false),
    );
  });
});
