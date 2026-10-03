import type { UserPreference } from '@orvilo/types';

export const CURRENT_ONBOARDING_VERSION = 2;

export const DEFAULT_PREFERENCE: UserPreference = {
  guide: {
    moveSettingsToAvatar: true,
    topic: true,
  },
  lab: {
    enableAgentGraphConfig: true,
    enableArtifactDeployment: true,
    enableDesktopSplitView: true,
    enableHeteroSessionImport: true,
    enableInputMarkdown: true,
    enableMessageTextSelectionActions: true,
    // Retired from Labs. A stored true must not bring the OAuth app console back.
    enableOAuthApps: false,
    enableProjects: true,
    enableSelfLearning: true,
    enableTaskVerify: true,
    enableTopicAcceptance: true,
  },
  showInCollaboration: true,
  topicGroupMode: 'byTime',
  topicIncludeCompleted: false,
  topicSortBy: 'updatedAt',
  useCmdEnterToSend: false,
};
