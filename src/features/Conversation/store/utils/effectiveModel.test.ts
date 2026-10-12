import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useAgentStore } from '@/store/agent';
import { useChatStore } from '@/store/chat';
import { useUserStore } from '@/store/user';

import {
  getEffectiveConversationModelConfig,
  useEffectiveConversationModelConfig,
} from './effectiveModel';

const agentState = useAgentStore.getState();
const chatState = useChatStore.getState();
const userState = useUserStore.getState();
afterEach(() => {
  useAgentStore.setState(agentState, true);
  useChatStore.setState(chatState, true);
  useUserStore.setState(userState, true);
});

const seed = () => {
  useAgentStore.setState({
    agentMap: {
      selected: { model: 'saved', provider: 'saved-provider', chatConfig: {} },
      other: { model: 'other', provider: 'other-provider', chatConfig: {} },
    },
  } as any);
  useChatStore.setState({
    topicDataMap: {
      agent_selected: {
        items: [{ id: 'topic', model: 'old-topic', provider: 'old-topic-provider' }],
      },
    },
  } as any);
  useUserStore.setState({
    workspaceUserPreference: {
      agentModelOverrides: { selected: { model: 'old-member', provider: 'old-member-provider' } },
    },
  } as any);
};

describe('conversation uses the selected Agent model', () => {
  it('ignores obsolete topic and member selections', () => {
    seed();
    expect(getEffectiveConversationModelConfig({ agentId: 'selected', topicId: 'topic' })).toEqual({
      model: 'saved',
      provider: 'saved-provider',
    });
    expect(getEffectiveConversationModelConfig({ agentId: 'other', topicId: 'topic' })).toEqual({
      model: 'other',
      provider: 'other-provider',
    });
  });
  it('updates when the saved model changes', () => {
    seed();
    const { result } = renderHook(() =>
      useEffectiveConversationModelConfig({ agentId: 'selected', topicId: 'topic' }),
    );
    act(() =>
      useAgentStore.setState({
        agentMap: { selected: { model: 'new-saved', provider: 'new-provider', chatConfig: {} } },
      } as any),
    );
    expect(result.current).toEqual({ model: 'new-saved', provider: 'new-provider' });
  });
});
