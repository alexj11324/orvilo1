import type {
  OrviloGroupChatConfig,
  OrviloGroupFullConfig,
  OrviloGroupMetaConfig,
} from '@orvilo/types';

export const DEFAULT_CHAT_GROUP_CHAT_CONFIG: OrviloGroupChatConfig = {
  allowDM: true,
  openingMessage: '',
  openingQuestions: [],
  revealDM: false,
  systemPrompt: '',
};

export const DEFAULT_CHAT_GROUP_META_CONFIG: OrviloGroupMetaConfig = {
  description: '',
  title: '',
};

export const DEFAULT_CHAT_GROUP_CONFIG: OrviloGroupFullConfig = {
  chat: DEFAULT_CHAT_GROUP_CHAT_CONFIG,
  meta: DEFAULT_CHAT_GROUP_META_CONFIG,
};
