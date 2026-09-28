import type { UserPreference } from '@orvilo/types';

export const CURRENT_ONBOARDING_VERSION = 2;

export const DEFAULT_PREFERENCE: UserPreference = {
  guide: {
    moveSettingsToAvatar: true,
    topic: true,
  },
  lab: {
    enableAgentGraphConfig: false,
    enableInputMarkdown: true,
    enableMessageTextSelectionActions: false,
    enableOAuthApps: false,
  },
  showInCollaboration: true,
  topicGroupMode: 'byTime',
  topicIncludeCompleted: false,
  topicSortBy: 'updatedAt',
  useCmdEnterToSend: false,
};
