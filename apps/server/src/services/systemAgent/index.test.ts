// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';

import { SystemAgentService } from './index';

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  topicFindById: vi.fn(),
}));

vi.mock('@/database/models/user', () => ({
  UserModel: class {
    getUserSettings = async () => ({});

    static getInfoForAIGeneration = async () => ({ responseLanguage: 'en-US' });
  },
}));
vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn(function () {
    return { findById: mocks.topicFindById };
  }),
}));
vi.mock('@/server/services/aiGeneration', () => ({
  AiGenerationService: vi.fn(function () {
    return { generateObject: mocks.generateObject };
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('SystemAgentService.generateTopicTitle', () => {
  it('retains the requested topic identity across calls and binds the judgment to the topic agent', async () => {
    mocks.generateObject.mockResolvedValue({ title: ' Generated title ' });
    mocks.topicFindById.mockResolvedValue({ agentId: 'topic-agent-1' });
    const service = new SystemAgentService({} as OrviloDatabase, 'user-1');

    for (const topicId of ['topic-a', 'topic-b', 'topic-a']) {
      expect(
        await service.generateTopicTitle({
          lastAssistantContent: 'Here is the answer.',
          topicId,
          userPrompt: 'A question',
        }),
      ).toBe('Generated title');
      expect(mocks.topicFindById).toHaveBeenLastCalledWith(topicId);
      expect(mocks.generateObject).toHaveBeenLastCalledWith(
        expect.objectContaining({ schema: expect.objectContaining({ name: 'topic_title' }) }),
        {
          judgment: {
            binding: { agentId: 'topic-agent-1' },
            purpose: 'topic.title',
          },
          kind: 'judgment',
          metadata: { topicId, trigger: 'topic' },
          tracing: {
            promptVersion: expect.any(String),
            scenario: 'topic_title',
            schemaName: 'topic_title',
            topicId,
          },
        },
      );
    }
  });
});
