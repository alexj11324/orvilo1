import type { ChatTopicMetadata, TopicExecutionConfig } from '@orvilo/types';

interface PermissionTopicStore {
  activeAgentId?: string | null;
  activeTopicId?: string | null;
  createTopic: (agentId: string) => Promise<string | undefined>;
  switchTopic: (topicId: string) => Promise<void>;
  updateTopicMetadata: (topicId: string, metadata: Partial<ChatTopicMetadata>) => Promise<void>;
}

/** Capture the conversation before topic creation yields; chat choices never edit Agent defaults. */
export const persistPermissionChoice = async (
  getStore: () => PermissionTopicStore,
  params: {
    agentId: string;
    getCurrentComposerAgentId: () => string;
    executionConfig: TopicExecutionConfig;
    permission: { configId: string; provider: string; value: string };
    topicId?: string | null;
  },
) => {
  const { agentId, executionConfig, getCurrentComposerAgentId, permission, topicId } = params;
  const store = getStore();
  if (!topicId && (getCurrentComposerAgentId() !== agentId || store.activeTopicId)) return;
  const destination = topicId ?? (await store.createTopic(agentId));
  if (!destination) return;
  await getStore().updateTopicMetadata(destination, {
    executionConfig: { ...executionConfig, permission },
  });
  if (!topicId && getCurrentComposerAgentId() === agentId && !getStore().activeTopicId) {
    await getStore().switchTopic(destination);
  }
};
