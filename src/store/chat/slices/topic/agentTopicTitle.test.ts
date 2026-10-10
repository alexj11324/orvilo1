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

  describe('persisted title source', () => {
    it('stores `user` before the title on a manual rename', async () => {
      seedTopic('p1', 'Old');
      const order: string[] = [];
      vi.mocked(topicService.updateTopicMetadata).mockImplementation(async () => {
        order.push('metadata');
        return undefined as never;
      });
      vi.mocked(topicService.updateTopic).mockImplementation(async () => {
        order.push('title');
        return undefined as never;
      });

      await useChatStore.getState().updateTopicTitle('p1', 'Mine');

      expect(topicService.updateTopicMetadata).toHaveBeenCalledWith('p1', { titleSource: 'user' });
      expect(order).toEqual(['metadata', 'title']);
      expect(useChatStore.getState().topicDetailMap.p1.metadata?.titleSource).toBe('user');
    });

    // Regression: the marker write is awaited before the title write. A user
    // rename that started during that wait used to be overwritten when the
    // older agent write resumed.
    it('lets a user rename that starts during the agent marker write keep the title', async () => {
      seedTopic('p-race', sliceTopicTitle(messages));
      let releaseAgentMarker = () => {};
      vi.mocked(topicService.updateTopicMetadata).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseAgentMarker = () => resolve(undefined as never);
          }),
      );

      const agentWrite = useChatStore
        .getState()
        .applyAgentTopicTitle('p-race', 'Agent title', messages);
      await Promise.resolve();
      await useChatStore.getState().updateTopicTitle('p-race', 'Renamed by me');
      releaseAgentMarker();
      await agentWrite;

      expect(titleOf('p-race')).toBe('Renamed by me');
    });

    it('stores `agent` with the agent title and keeps other metadata keys', async () => {
      seedTopic('p2', sliceTopicTitle(messages), { metadata: { heteroSessionId: 'hs-1' } });

      await useChatStore.getState().applyAgentTopicTitle('p2', 'Agent title', messages);

      // Only the delta is sent; the server merges it into the stored metadata.
      expect(topicService.updateTopicMetadata).toHaveBeenCalledWith('p2', { titleSource: 'agent' });
      expect(useChatStore.getState().topicDetailMap.p2.metadata).toMatchObject({
        heteroSessionId: 'hs-1',
        titleSource: 'agent',
      });
    });

    it('does not write the marker again when it is already stored', async () => {
      seedTopic('p3', 'Earlier', { metadata: { titleSource: 'agent' } });

      await useChatStore.getState().applyAgentTopicTitle('p3', 'Later', messages);

      expect(topicService.updateTopicMetadata).not.toHaveBeenCalled();
      expect(titleOf('p3')).toBe('Later');
    });

    it('retries the marker once, then fails a user rename instead of leaving it unprotected', async () => {
      seedTopic('p5', 'Old');
      vi.mocked(topicService.updateTopicMetadata).mockRejectedValueOnce(new Error('offline'));
      await useChatStore.getState().updateTopicTitle('p5', 'Mine');
      expect(topicService.updateTopicMetadata).toHaveBeenCalledTimes(2);
      expect(titleOf('p5')).toBe('Mine');

      seedTopic('p6', 'Old');
      vi.mocked(topicService.updateTopicMetadata).mockClear();
      vi.mocked(topicService.updateTopicMetadata).mockRejectedValue(new Error('offline'));
      vi.mocked(topicService.updateTopic).mockClear();

      await expect(useChatStore.getState().updateTopicTitle('p6', 'Mine')).rejects.toThrow(
        'offline',
      );

      expect(topicService.updateTopic).not.toHaveBeenCalled();
      vi.mocked(topicService.updateTopicMetadata).mockReset();
    });

    it('still saves an agent title when persisting the marker fails', async () => {
      seedTopic('p7', sliceTopicTitle(messages));
      vi.mocked(topicService.updateTopicMetadata).mockRejectedValue(new Error('offline'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await useChatStore.getState().applyAgentTopicTitle('p7', 'Agent title', messages);

      expect(topicService.updateTopic).toHaveBeenCalledWith('p7', { title: 'Agent title' });
      vi.mocked(topicService.updateTopicMetadata).mockReset();
    });
  });

  describe('automatic titling never clobbers an agent or user title', () => {
    const generateSpy = () =>
      vi.spyOn(aiChatService, 'generateJSON').mockResolvedValue({
        data: { title: 'Model title' },
        tracingId: 't',
      } as any);

    it('keeps an agent title received mid-turn when the run-completion summary runs', async () => {
      seedTopic('s1', sliceTopicTitle(messages));
      const generate = generateSpy();
      await useChatStore.getState().applyAgentTopicTitle('s1', 'Agent title', messages);

      await useChatStore.getState().summaryTopicTitle('s1', messages);

      expect(titleOf('s1')).toBe('Agent title');
      expect(generate).not.toHaveBeenCalled();
    });

    it('keeps a user rename, for a built-in agent with a model too', async () => {
      seedTopic('s2', 'Old', { agentId: 'builtin' });
      const generate = generateSpy();
      await useChatStore.getState().updateTopicTitle('s2', 'Mine');

      await useChatStore.getState().summaryTopicTitle('s2', messages);

      expect(titleOf('s2')).toBe('Mine');
      expect(generate).not.toHaveBeenCalled();
    });

    it('honours a stored marker after a reload', async () => {
      seedTopic('s3', 'Stored name', { metadata: { titleSource: 'user' } });
      const generate = generateSpy();

      await useChatStore.getState().summaryTopicTitle('s3', messages);

      expect(titleOf('s3')).toBe('Stored name');
      expect(generate).not.toHaveBeenCalled();
    });

    it('still titles an untouched topic, and an explicit forced rename overrides', async () => {
      seedTopic('s4', '');
      await useChatStore.getState().summaryTopicTitle('s4', messages);
      expect(titleOf('s4')).toBe(sliceTopicTitle(messages));

      seedTopic('s5', 'Mine', { metadata: { titleSource: 'user' } });
      await useChatStore.getState().summaryTopicTitle('s5', messages, { force: true });
      expect(titleOf('s5')).toBe(sliceTopicTitle(messages));
    });

    it('applyAutoTopicTitle (dev slice path) marks `auto` and respects protection', async () => {
      seedTopic('s6', '');
      await useChatStore.getState().applyAutoTopicTitle('s6', 'Sliced');
      expect(titleOf('s6')).toBe('Sliced');

      await useChatStore.getState().applyAgentTopicTitle('s6', 'Agent', messages);
      await useChatStore.getState().applyAutoTopicTitle('s6', 'Sliced again');
      expect(titleOf('s6')).toBe('Agent');
    });
  });
});
