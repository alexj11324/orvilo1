import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatStore } from '@/store/chat';

import { selectEffortForConversation } from './selectEffort';

const updateTopicHeteroEffort = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useChatStore.setState({
    activeTopicId: undefined,
    composerHeteroEffort: undefined,
    updateTopicHeteroEffort,
  });
});

describe('selectEffortForConversation', () => {
  it('pins the effort to the active topic instead of the agent row', async () => {
    useChatStore.setState({ activeTopicId: 'tpc_1' });

    await selectEffortForConversation('high');

    expect(updateTopicHeteroEffort).toHaveBeenCalledWith('tpc_1', 'high');
    expect(useChatStore.getState().composerHeteroEffort).toBeUndefined();
  });

  it('holds the pick as a pending value on a blank conversation', async () => {
    await selectEffortForConversation('high');

    expect(updateTopicHeteroEffort).not.toHaveBeenCalled();
    expect(useChatStore.getState().composerHeteroEffort).toBe('high');
  });
});
