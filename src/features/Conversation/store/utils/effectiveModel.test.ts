import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useAgentStore } from '@/store/agent';
import { useChatStore } from '@/store/chat';
import { useUserStore } from '@/store/user';

import {
  getEffectiveConversationModel,
  getEffectiveConversationModelConfig,
  useEffectiveConversationModelConfig,
} from './effectiveModel';

const AGENT_ID = 'agt_test';
const TOPIC_ID = 'tpc_test';

const initialAgentState = useAgentStore.getState();
const initialChatState = useChatStore.getState();
const initialUserState = useUserStore.getState();

afterEach(() => {
  useAgentStore.setState(initialAgentState, true);
  useChatStore.setState(initialChatState, true);
  useUserStore.setState(initialUserState, true);
});

describe('saved conversation Agent model', () => {
  it('ignores stale topic and member model choices', () => {
    useAgentStore.setState({
      agentMap: { [AGENT_ID]: { chatConfig: {}, model: 'saved-model', provider: 'openai' } },
    } as any);
    useChatStore.setState({
      topicDataMap: {
        [`agent_${AGENT_ID}`]: {
          items: [{ id: TOPIC_ID, model: 'stale-topic', provider: 'anthropic' }],
        },
      },
    } as any);
    useUserStore.setState({
      workspaceUserPreference: {
        agentModelOverrides: { [AGENT_ID]: { model: 'stale-member', provider: 'google' } },
      },
    } as any);
    expect(getEffectiveConversationModel({ agentId: AGENT_ID, topicId: TOPIC_ID })).toBe(
      'saved-model',
    );
    expect(getEffectiveConversationModelConfig({ agentId: AGENT_ID, topicId: TOPIC_ID })).toEqual({
      model: 'saved-model',
      provider: 'openai',
    });
  });
  it('reacts to Agent changes and prefers a selected sub-Agent', () => {
    useAgentStore.setState({
      agentMap: {
        [AGENT_ID]: { chatConfig: {}, model: 'parent', provider: 'openai' },
        child: { chatConfig: {}, model: 'child', provider: 'google' },
      },
    } as any);
    const { result, rerender } = renderHook(
      ({ subAgentId }) => useEffectiveConversationModelConfig({ agentId: AGENT_ID, subAgentId }),
      { initialProps: { subAgentId: undefined as string | undefined } },
    );
    expect(result.current.model).toBe('parent');
    rerender({ subAgentId: 'child' });
    expect(result.current).toEqual({ model: 'child', provider: 'google' });
    act(() =>
      useAgentStore.setState({
        agentMap: {
          ...useAgentStore.getState().agentMap,
          child: { chatConfig: {}, model: 'updated-child', provider: 'google' },
        },
      } as any),
    );
    expect(result.current.model).toBe('updated-child');
  });
});
