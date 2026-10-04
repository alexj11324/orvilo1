import { describe, expect, it } from 'vitest';

import { agentComposerRightActions } from './index';

describe('agent composer action order', () => {
  it('offers the agent selector', () => {
    expect(agentComposerRightActions).toContain('agent');
  });

  it('offers no model or effort chip', () => {
    // The composer picks the agent; the model and the reasoning effort are the
    // agent's own configuration, so they must not come back as per-conversation
    // chips beside the agent selector.
    expect(agentComposerRightActions).not.toContain('model');
    expect(agentComposerRightActions).not.toContain('heteroEffort');
  });

  it('keeps the send-area actions', () => {
    expect(agentComposerRightActions).toContain('voiceMessage');
    expect(agentComposerRightActions).toContain('contextWindow');
  });
});
