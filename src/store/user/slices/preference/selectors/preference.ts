import { DEFAULT_PREFERENCE } from '@orvilo/const';

import { type UserStore } from '@/store/user';

const useCmdEnterToSend = (s: UserStore): boolean => s.preference.useCmdEnterToSend || false;
const defaultOpenInApp = (s: UserStore): string | undefined => s.preference.defaultOpenInApp;
const topicGroupMode = (s: UserStore) =>
  s.preference.topicGroupMode || DEFAULT_PREFERENCE.topicGroupMode!;
const topicSortBy = (s: UserStore) => s.preference.topicSortBy || DEFAULT_PREFERENCE.topicSortBy!;
const topicIncludeCompleted = (s: UserStore): boolean =>
  s.preference.topicIncludeCompleted ?? false;

const hideSyncAlert = (s: UserStore) => s.preference.hideSyncAlert;
const showInCollaboration = (s: UserStore): boolean =>
  s.preference.showInCollaboration ?? DEFAULT_PREFERENCE.showInCollaboration ?? true;

const hideSettingsMoveGuide = (s: UserStore) => s.preference.guide?.moveSettingsToAvatar;

const showUploadFileInKnowledgeBaseTip = (s: UserStore) =>
  s.preference.guide?.uploadFileInKnowledgeBase;

const shouldTriggerFileInKnowledgeBaseTip = (s: UserStore) =>
  !(typeof s.preference.guide?.moveSettingsToAvatar === 'boolean');

const isPreferenceInit = (s: UserStore) => s.isUserStateInit;
const fontFamily = (s: UserStore): string | undefined =>
  s.preference.fontFamily?.trim() || undefined;
const terminalFontFamily = (s: UserStore): string | undefined =>
  s.preference.terminalFontFamily?.trim() || undefined;

export const preferenceSelectors = {
  defaultOpenInApp,
  fontFamily,
  hideSettingsMoveGuide,
  hideSyncAlert,
  isPreferenceInit,
  shouldTriggerFileInKnowledgeBaseTip,
  showInCollaboration,
  showUploadFileInKnowledgeBaseTip,
  terminalFontFamily,
  topicGroupMode,
  topicIncludeCompleted,
  topicSortBy,
  useCmdEnterToSend,
};
