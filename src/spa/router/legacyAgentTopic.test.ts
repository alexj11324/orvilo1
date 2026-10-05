import { describe, expect, it } from 'vitest';

import { legacyAgentTopicTarget } from './legacyAgentTopic';

describe('legacyAgentTopicTarget', () => {
  it('resolves a legacy agent topic link to the canonical /chat URL', () => {
    expect(legacyAgentTopicTarget({ topicId: 'tpc_1' })).toBe('/chat/tpc_1');
  });

  it('preserves the query string and hash of the original deep link', () => {
    expect(
      legacyAgentTopicTarget({
        topicId: 'tpc_1',
        search: '?thread=thr_9&page=2',
        hash: '#anchor',
      }),
    ).toBe('/chat/tpc_1?thread=thr_9&page=2#anchor');
  });

  it('keeps the workspace slug prefix when a workspace is active', () => {
    expect(
      legacyAgentTopicTarget({
        topicId: 'tpc_1',
        workspaceSlug: 'team',
        search: '?thread=thr_9',
      }),
    ).toBe('/team/chat/tpc_1?thread=thr_9');
  });
});
