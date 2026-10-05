import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentStore } from '@/store/agent';
import { useUserStore } from '@/store/user';

import { useAgentTopicGroupMode } from './useAgentTopicGroupMode';

const updateAgentChatConfig = vi.fn();
const updatePreference = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useUserStore.setState({ preference: { topicGroupMode: 'byTime' }, updatePreference });
  useAgentStore.setState({ updateAgentChatConfig });
});

describe('useAgentTopicGroupMode', () => {
  it('reads the mode from the global preference', () => {
    const { result } = renderHook(() => useAgentTopicGroupMode());

    expect(result.current.topicGroupMode).toBe('byTime');
  });

  it('writes the global preference and never the agent config', async () => {
    const { result } = renderHook(() => useAgentTopicGroupMode());

    await act(async () => {
      await result.current.updateTopicGroupMode('byProject');
    });

    expect(updatePreference).toHaveBeenCalledWith({ topicGroupMode: 'byProject' });
    // The sidebar list spans every agent's conversations, so remembering the mode
    // per agent is both wrong for the list and a persistent write to an agent from
    // chat (docs/development/chat-agent-model-ia.md §5.2 / §5.5).
    expect(updateAgentChatConfig).not.toHaveBeenCalled();
  });
});
