import { existsSync } from 'node:fs';
import path from 'node:path';

import { HOTKEYS_REGISTRATION } from '@orvilo/const/hotkeys';
import { describe, expect, it } from 'vitest';

import auth from '@/locales/default/auth';
import hotkey from '@/locales/default/hotkey';
import setting from '@/locales/default/setting';
import { settingsSelectors } from '@/store/user/slices/settings/selectors/settings';
import { type UserStore } from '@/store/user/store';

import { getHotkeyConflicts } from './hotkey/features/visibleHotkeys';

const settingsRoot = __dirname;

describe('retired chat-era personal settings', () => {
  it('no longer registers the add-user-message hotkey or its copy', () => {
    expect(HOTKEYS_REGISTRATION.map((item) => item.id as string)).not.toContain('addUserMessage');
    expect(Object.keys(hotkey).filter((key) => key.startsWith('addUserMessage.'))).toEqual([]);
  });

  it('keeps a title for every registered hotkey (titles are keyed by hotkey id)', () => {
    for (const item of HOTKEYS_REGISTRATION) {
      expect(hotkey).toHaveProperty([`${item.id}.title`]);
    }
  });

  it('tolerates an old stored binding for the removed hotkey', () => {
    const stored = { addUserMessage: 'alt+enter', commandPalette: 'mod+p' };
    const state = { settings: { hotkey: stored } } as unknown as UserStore;

    expect(settingsSelectors.getHotkeyById('commandPalette')(state)).toBe('mod+p');
    expect(settingsSelectors.getHotkeyById('createTask')(state)).toBe('c');
    expect(getHotkeyConflicts(stored, 'createTask', HOTKEYS_REGISTRATION)).toEqual(['mod+p']);
  });

  it('removes the chat-era Stats header block and its copy', () => {
    expect(existsSync(path.resolve(settingsRoot, 'stats/features/overview'))).toBe(false);
    expect(existsSync(path.resolve(settingsRoot, 'stats/features/visualization'))).toBe(false);
    const authKeys = Object.keys(auth);
    expect(authKeys.filter((key) => key.startsWith('heatmaps.'))).toEqual([]);
    expect(authKeys.filter((key) => key.startsWith('stats.'))).toEqual([]);
  });

  it('no longer offers legacy chat-format data import in Storage', () => {
    expect(Object.keys(setting).filter((key) => key.startsWith('storage.actions.import.'))).toEqual(
      [],
    );
  });
});

describe('truthful labels', () => {
  it('retitles the hotkey that opens agent settings', () => {
    expect(hotkey['openChatSettings.title']).toBe('Open agent settings');
  });

  it('describes the quick composer by what it opens', () => {
    expect(hotkey['desktop.quickComposer.title']).not.toBe('Quick Composer');
    expect(hotkey['desktop.quickComposer.desc']).toContain('overlay');
  });

  it('says the message-only appearance settings apply to messages', () => {
    expect(setting['settingAppearance.contextMenuMode.desc']).toContain('messages');
    expect(setting['settingChatAppearance.fontSize.title']).toBe('Message font size');
  });

  it('names what each API key scope group contains', () => {
    expect(auth['apikey.scopes.groups.agent']).toBe('Agents, Issues & projects');
    expect(auth['apikey.scopes.groups.chat']).toBe('Conversations & topics');
    expect(auth['apikey.scopes.groups.knowledge']).toBe('Documents & knowledge');
  });

  it('describes OpenCode in the CLI agent detector', () => {
    expect(setting).toHaveProperty(['settingSystemTools.tools.opencode.desc']);
  });
});
