import { DEFAULT_PREFERENCE } from '@orvilo/const';

import { type UserState } from '@/store/user/initialState';

export const labPreferSelectors = {
  enableAgentGraphConfig: (s: UserState): boolean =>
    s.preference.lab?.enableAgentGraphConfig ??
    DEFAULT_PREFERENCE.lab?.enableAgentGraphConfig ??
    false,
  enableArtifactDeployment: (s: UserState): boolean =>
    s.preference.lab?.enableArtifactDeployment ?? false,
  enableDesktopSplitView: (s: UserState): boolean =>
    s.preference.lab?.enableDesktopSplitView ?? false,
  enableHeteroSessionImport: (s: UserState): boolean =>
    s.preference.lab?.enableHeteroSessionImport ?? false,
  enableImessage: (s: UserState): boolean => s.preference.lab?.enableImessage ?? false,
  enableInputMarkdown: (s: UserState): boolean =>
    s.preference.lab?.enableInputMarkdown ?? DEFAULT_PREFERENCE.lab?.enableInputMarkdown ?? true,
  enableMessageTextSelectionActions: (s: UserState): boolean =>
    s.preference.lab?.enableMessageTextSelectionActions ??
    DEFAULT_PREFERENCE.lab?.enableMessageTextSelectionActions ??
    false,
  enableSelfLearning: (s: UserState): boolean => s.preference.lab?.enableSelfLearning ?? false,
  enableProjects: (s: UserState): boolean => s.preference.lab?.enableProjects ?? false,
  enableTaskVerify: (s: UserState): boolean => s.preference.lab?.enableTaskVerify ?? false,
  enableTopicAcceptance: (s: UserState): boolean =>
    s.preference.lab?.enableTopicAcceptance ?? false,
};
