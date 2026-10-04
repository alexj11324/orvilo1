import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatStore } from '@/store/chat';

import { selectAgentForConversation } from './selectAgent';
import { selectModelForConversation } from './selectModel';

const updateTopicHeteroPin = vi.fn();
const updateTopicModel = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useChatStore.setState({
    activeTopicId: undefined,
    composerHeteroEffort: undefined,
    composerModelSelection: undefined,
    updateTopicHeteroPin,
    updateTopicModel,
  });
});

describe('selectModelForConversation', () => {
  it('pins the model to the active topic instead of the agent row', async () => {
    useChatStore.setState({ activeTopicId: 'tpc_1' });

    await selectModelForConversation({ model: 'gpt-5.6', provider: 'orvilo' });

    expect(updateTopicModel).toHaveBeenCalledWith('tpc_1', {
      model: 'gpt-5.6',
      provider: 'orvilo',
    });
    expect(useChatStore.getState().composerModelSelection).toBeUndefined();
  });

  it('holds the pick as a pending value on a blank conversation', async () => {
    await selectModelForConversation({ model: 'gpt-5.6', provider: 'orvilo' });

    expect(updateTopicModel).not.toHaveBeenCalled();
    expect(useChatStore.getState().composerModelSelection).toEqual({
      model: 'gpt-5.6',
      provider: 'orvilo',
    });
  });

  it('resets the effort in the same topic write when the new model cannot serve it', async () => {
    useChatStore.setState({ activeTopicId: 'tpc_1' });

    await selectModelForConversation(
      { model: 'gpt-5.6', provider: 'codex' },
      { effort: 'default' },
    );

    // One write for model + effort: a topic must never keep a model with an
    // effort the new model cannot run (spec §5.2).
    expect(updateTopicHeteroPin).toHaveBeenCalledWith('tpc_1', {
      effort: 'default',
      model: 'gpt-5.6',
      provider: 'codex',
    });
    expect(updateTopicModel).not.toHaveBeenCalled();
  });

  it('carries the reset effort into the blank-composer pending values', async () => {
    await selectModelForConversation(
      { model: 'gpt-5.6', provider: 'codex' },
      { effort: 'default' },
    );

    expect(useChatStore.getState().composerHeteroEffort).toBe('default');
    expect(useChatStore.getState().composerModelSelection).toEqual({
      model: 'gpt-5.6',
      provider: 'codex',
    });
  });
});

describe('composer agent change', () => {
  it('drops the pending model and effort, which belonged to the previous agent', () => {
    useChatStore.setState({
      composerHeteroEffort: 'high',
      composerModelSelection: { model: 'gpt-5.6', provider: 'orvilo' },
    });

    selectAgentForConversation('agt_cursor');

    expect(useChatStore.getState().composerModelSelection).toBeUndefined();
    expect(useChatStore.getState().composerHeteroEffort).toBeUndefined();
  });
});
