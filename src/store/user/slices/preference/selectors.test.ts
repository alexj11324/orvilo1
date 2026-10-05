import { describe, expect, it } from 'vitest';

import { type UserStore } from '@/store/user';

import { initialPreferenceState } from './initialState';
import { labPreferSelectors, preferenceSelectors } from './selectors';

describe('preferenceSelectors', () => {
  let store: UserStore;

  beforeEach(() => {
    store = {
      ...initialPreferenceState,
    } as unknown as UserStore;
  });

  describe('useCmdEnterToSend', () => {
    it('should return the value of useCmdEnterToSend preference', () => {
      store.preference.useCmdEnterToSend = true;
      expect(preferenceSelectors.useCmdEnterToSend(store)).toBe(true);

      store.preference.useCmdEnterToSend = false;
      expect(preferenceSelectors.useCmdEnterToSend(store)).toBe(false);
    });

    it('should return false if useCmdEnterToSend preference is undefined', () => {
      store.preference.useCmdEnterToSend = undefined;
      expect(preferenceSelectors.useCmdEnterToSend(store)).toBe(false);
    });
  });

  describe('hideSyncAlert', () => {
    it('should return the value of hideSyncAlert preference', () => {
      store.preference.hideSyncAlert = true;
      expect(preferenceSelectors.hideSyncAlert(store)).toBe(true);

      store.preference.hideSyncAlert = false;
      expect(preferenceSelectors.hideSyncAlert(store)).toBe(false);

      store.preference.hideSyncAlert = undefined;
      expect(preferenceSelectors.hideSyncAlert(store)).toBeUndefined();
    });
  });

  describe('showInCollaboration', () => {
    it('defaults to visible when the stored preference is missing', () => {
      store.preference.showInCollaboration = undefined;

      expect(preferenceSelectors.showInCollaboration(store)).toBe(true);
    });

    it('returns the configured visibility', () => {
      store.preference.showInCollaboration = false;
      expect(preferenceSelectors.showInCollaboration(store)).toBe(false);

      store.preference.showInCollaboration = true;
      expect(preferenceSelectors.showInCollaboration(store)).toBe(true);
    });
  });

  describe('hideSettingsMoveGuide', () => {
    it('should return the value of moveSettingsToAvatar guide preference', () => {
      store.preference.guide = { moveSettingsToAvatar: true };
      expect(preferenceSelectors.hideSettingsMoveGuide(store)).toBe(true);

      store.preference.guide = { moveSettingsToAvatar: false };
      expect(preferenceSelectors.hideSettingsMoveGuide(store)).toBe(false);
    });

    it('should return undefined if guide preference is undefined', () => {
      store.preference.guide = undefined;
      expect(preferenceSelectors.hideSettingsMoveGuide(store)).toBeUndefined();
    });
  });

  describe('isPreferenceInit', () => {
    it('should return the value of isPreferenceInit state', () => {
      store.isUserStateInit = true;
      expect(preferenceSelectors.isPreferenceInit(store)).toBe(true);

      store.isUserStateInit = false;
      expect(preferenceSelectors.isPreferenceInit(store)).toBe(false);
    });
  });

  describe('terminalFontFamily', () => {
    it('returns the configured font family without surrounding whitespace', () => {
      store.preference.terminalFontFamily = '  JetBrains Mono  ';

      expect(preferenceSelectors.terminalFontFamily(store)).toBe('JetBrains Mono');
    });

    it('falls back when the configured font family is empty', () => {
      store.preference.terminalFontFamily = '   ';

      expect(preferenceSelectors.terminalFontFamily(store)).toBeUndefined();
    });
  });

  describe('labPreferSelectors', () => {
    const labFlags = [
      'enableAgentGraphConfig',
      'enableArtifactDeployment',
      'enableDesktopSplitView',
      'enableHeteroSessionImport',
      'enableInputMarkdown',
      'enableMessageTextSelectionActions',
      'enableProjects',
      'enableSelfLearning',
      'enableTaskVerify',
      'enableTopicAcceptance',
    ] as const;

    it('turns every lab experiment on when the preference is unset', () => {
      store.preference.lab = undefined;

      for (const flag of labFlags) {
        expect(labPreferSelectors[flag](store)).toBe(true);
      }
    });

    it('keeps an explicit lab opt-out off and leaves the other experiments on', () => {
      store.preference.lab = {
        enableDesktopSplitView: false,
        enableProjects: false,
      };

      expect(labPreferSelectors.enableDesktopSplitView(store)).toBe(false);
      expect(labPreferSelectors.enableProjects(store)).toBe(false);
      expect(labPreferSelectors.enableInputMarkdown(store)).toBe(true);
      expect(labPreferSelectors.enableMessageTextSelectionActions(store)).toBe(true);
    });
  });
});
