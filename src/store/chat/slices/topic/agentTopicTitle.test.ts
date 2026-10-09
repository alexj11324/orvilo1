import type { UIChatMessage } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LOADING_FLAT } from '@/const/message';
import { aiChatService } from '@/services/aiChat';
import { topicService } from '@/services/topic';
import { type ChatTopic } from '@/types/topic';

import { useChatStore } from '../../store';
import { sliceTopicTitle } from './topicTitle';

vi.mock('@/services/topic', () => ({
  topicService: { updateTopic: vi.fn(), updateTopicMetadata: vi.fn() },
}));

vi.mock('i18next', () => ({ t: vi.fn((key: string) => key) }));

const FIRST_MESSAGE = 'Please fix the login redirect loop on the settings page';
const messages = [{ content: FIRST_MESSAGE, id: 'm1', role: 'user' }] as UIChatMessage[];

const seedTopic = (id: string, title: string, extra: Partial<ChatTopic> = {}) => {
  useChatStore.setState({
    refreshTopic: vi.fn().mockResolvedValue(undefined),
    topicDataMap: {},
    topicDetailMap: { [id]: { id, title, ...extra } as ChatTopic },
  });
};

const titleOf = (id: string) => useChatStore.getState().topicDetailMap[id]?.title;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyAgentTopicTitle', () => {
  it('replaces the first-message slice placeholder with the agent title', async () => {
    seedTopic('t1', sliceTopicTitle(messages));
    const generateSpy = vi.spyOn(aiChatService, 'generateJSON');

    await useChatStore.getState().applyAgentTopicTitle('t1', 'Fix login redirect loop', messages);

    expect(topicService.updateTopic).toHaveBeenCalledWith('t1', {
      title: 'Fix login redirect loop',
    });
    expect(titleOf('t1')).toBe('Fix login redirect loop');
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('replaces the loading and default placeholders', async () => {
    seedTopic('t2', LOADING_FLAT);
    await useChatStore.getState().applyAgentTopicTitle('t2', 'Agent title');
    expect(titleOf('t2')).toBe('Agent title');

    seedTopic('t3', 'defaultTitle');
    await useChatStore.getState().applyAgentTopicTitle('t3', 'Agent title');
    expect(titleOf('t3')).toBe('Agent title');
  });

  it('replaces an earlier agent title', async () => {
    seedTopic('t4', sliceTopicTitle(messages));

    await useChatStore.getState().applyAgentTopicTitle('t4', 'First agent title', messages);
    await useChatStore.getState().applyAgentTopicTitle('t4', 'Better agent title', messages);

    expect(titleOf('t4')).toBe('Better agent title');
  });

  it('does not replace a title the user renamed by hand', async () => {
    seedTopic('t5', sliceTopicTitle(messages));

    await useChatStore.getState().updateTopicTitle('t5', 'My own name');
    vi.mocked(topicService.updateTopic).mockClear();
    await useChatStore.getState().applyAgentTopicTitle('t5', 'Agent title', messages);

    expect(topicService.updateTopic).not.toHaveBeenCalled();
    expect(titleOf('t5')).toBe('My own name');
  });

  it('keeps a user rename even after an agent title had been applied', async () => {
    seedTopic('t6', sliceTopicTitle(messages));

    await useChatStore.getState().applyAgentTopicTitle('t6', 'Agent title', messages);
    await useChatStore.getState().updateTopicTitle('t6', 'Renamed by me');
    await useChatStore.getState().applyAgentTopicTitle('t6', 'Agent title v2', messages);

    expect(titleOf('t6')).toBe('Renamed by me');
  });

  it('protects an unrecognised existing title when no source was recorded (after a reload)', async () => {
    seedTopic('t7', 'Something typed last week');

    await useChatStore.getState().applyAgentTopicTitle('t7', 'Agent title', messages);

    expect(topicService.updateTopic).not.toHaveBeenCalled();
  });

  it('honours a persisted title source when the server returns one', async () => {
    seedTopic('t8', 'Earlier agent title', { metadata: { titleSource: 'agent' } });
    await useChatStore.getState().applyAgentTopicTitle('t8', 'Newer agent title', messages);
    expect(titleOf('t8')).toBe('Newer agent title');

    seedTopic('t9', sliceTopicTitle(messages), { metadata: { titleSource: 'user' } });
    await useChatStore.getState().applyAgentTopicTitle('t9', 'Agent title', messages);
    expect(titleOf('t9')).toBe(sliceTopicTitle(messages));
  });

  it('ignores a blank title and an unknown topic', async () => {
    seedTopic('t10', sliceTopicTitle(messages));

    await useChatStore.getState().applyAgentTopicTitle('t10', '   ', messages);
    await useChatStore.getState().applyAgentTopicTitle('missing', 'Agent title', messages);

    expect(topicService.updateTopic).not.toHaveBeenCalled();
  });

  it('does not write again when the title is unchanged', async () => {
    seedTopic('t11', sliceTopicTitle(messages));

    await useChatStore.getState().applyAgentTopicTitle('t11', 'Same title', messages);
    vi.mocked(topicService.updateTopic).mockClear();
    await useChatStore.getState().applyAgentTopicTitle('t11', 'Same title', messages);

    expect(topicService.updateTopic).not.toHaveBeenCalled();
  });
});
