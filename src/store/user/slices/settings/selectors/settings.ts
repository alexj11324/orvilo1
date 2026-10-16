import {
  DEFAULT_AGENT,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_AGENT_META,
  DEFAULT_HOTKEY_CONFIG,
  DEFAULT_MEMORY_SETTINGS,
  DEFAULT_SYSTEM_AGENT_CONFIG,
} from '@orvilo/const';
import { HOTKEYS_REGISTRATION } from '@orvilo/const/hotkeys';
import {
  type GlobalLLMProviderKey,
  type HotkeyId,
  type ProviderConfig,
  type UserModelProviderConfig,
  type UserSettings,
} from '@orvilo/types';

import { type UserStore } from '@/store/user';
import { merge } from '@/utils/merge';

export const currentSettings = (s: UserStore): UserSettings => merge(s.defaultSettings, s.settings);

export const currentLLMSettings = (s: UserStore): UserModelProviderConfig =>
  currentSettings(s).languageModel || {};

export const getProviderConfigById = (provider: string) => (s: UserStore) =>
  currentLLMSettings(s)[provider as GlobalLLMProviderKey] as ProviderConfig | undefined;

const currentMemorySettings = (s: UserStore) =>
  merge(DEFAULT_MEMORY_SETTINGS, currentSettings(s).memory);

const memoryEnabled = (s: UserStore) => currentMemorySettings(s).enabled !== false;

const defaultAgent = (s: UserStore) => merge(DEFAULT_AGENT, currentSettings(s).defaultAgent);
const defaultAgentConfig = (s: UserStore) => merge(DEFAULT_AGENT_CONFIG, defaultAgent(s).config);

const defaultAgentMeta = (s: UserStore) => merge(DEFAULT_AGENT_META, defaultAgent(s).meta);

const exportSettings = currentSettings;

const currentSystemAgent = (s: UserStore) =>
  merge(DEFAULT_SYSTEM_AGENT_CONFIG, currentSettings(s).systemAgent);

const NON_EDITABLE_HOTKEY_IDS = new Set(
  HOTKEYS_REGISTRATION.filter((item) => item.nonEditable).map((item) => item.id),
);

// Non-editable bindings cannot be changed or cleared in Settings, so a stale
// persisted override (e.g. from before a chord was reactivated) must not win.
const getHotkeyById = (id: HotkeyId) => (s: UserStore) =>
  NON_EDITABLE_HOTKEY_IDS.has(id)
    ? DEFAULT_HOTKEY_CONFIG[id]
    : merge(DEFAULT_HOTKEY_CONFIG, currentSettings(s).hotkey)[id];

export const settingsSelectors = {
  currentMemorySettings,
  currentSettings,
  currentSystemAgent,
  defaultAgent,
  defaultAgentConfig,
  defaultAgentMeta,
  exportSettings,
  getHotkeyById,
  memoryEnabled,
  providerConfig: getProviderConfigById,
};
