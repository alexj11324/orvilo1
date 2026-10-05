import { DEFAULT_PREFERENCE } from '@orvilo/const';

import { type UserState } from '@/store/user/initialState';
import { type UserLab } from '@/types/user';

/** Unset lab flags follow DEFAULT_PREFERENCE. An explicit false stays off. */
const labEnabled =
  (flag: keyof UserLab) =>
  (state: UserState): boolean =>
    state.preference.lab?.[flag] ?? DEFAULT_PREFERENCE.lab?.[flag] ?? true;

export const labPreferSelectors = {
  enableAgentGraphConfig: labEnabled('enableAgentGraphConfig'),
  enableArtifactDeployment: labEnabled('enableArtifactDeployment'),
  enableDesktopSplitView: labEnabled('enableDesktopSplitView'),
  enableHeteroSessionImport: labEnabled('enableHeteroSessionImport'),
  enableInputMarkdown: labEnabled('enableInputMarkdown'),
  enableMessageTextSelectionActions: labEnabled('enableMessageTextSelectionActions'),
  enableSelfLearning: labEnabled('enableSelfLearning'),
  enableProjects: labEnabled('enableProjects'),
  enableTaskVerify: labEnabled('enableTaskVerify'),
  enableTopicAcceptance: labEnabled('enableTopicAcceptance'),
};
