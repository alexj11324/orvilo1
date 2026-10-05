import { describe, expect, it } from 'vitest';

import { getHeterogeneousComposerLeftActions } from '../HeterogeneousChatInput';
import { agentComposerRightActions } from './index';

describe('agent composer action order', () => {
  it('offers the existing tool selector for native MCP runtimes without a model picker', () => {
    expect(getHeterogeneousComposerLeftActions('opencode')).toEqual(['tools']);
    expect(getHeterogeneousComposerLeftActions('codex')).toEqual(['tools']);
    expect(getHeterogeneousComposerLeftActions('pi')).toEqual([]);
    expect(getHeterogeneousComposerLeftActions('orvilo')).toEqual([]);
    expect(getHeterogeneousComposerLeftActions(undefined)).toEqual([]);
  });
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
