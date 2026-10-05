import { type LucideIcon } from 'lucide-react';
import {
  Brain,
  ChartColumnBigIcon,
  Coins,
  CreditCard,
  EthernetPort,
  Info,
  KeyboardIcon,
  KeyIcon,
  Map,
  Palette as PaletteIcon,
  PieChart,
  UserCircle,
} from 'lucide-react';

import { isSettingsTabAvailable, type SettingsCapabilityContext } from '@/config/routes/settings';
import { SettingsTabs } from '@/store/global/initialState';

import { type ContextType, type MenuContext } from '../types';

export interface ContextCommand {
  icon: LucideIcon;
  keywords: string[];
  keywordsKey?: string;
  label: string;
  labelKey?: string;
  labelNamespace?: 'setting' | 'auth' | 'subscription';
  path: string;
  /**
   * The settings tab this command opens. When set, the command is offered only
   * while `SETTINGS_CAPABILITIES` serves that tab for the current context —
   * the palette follows the same gate as the page itself instead of keeping a
   * second copy of each platform/deployment rule.
   */
  settingsTab?: SettingsTabs;
  subPath: string;
}

const BUSINESS_SETTINGS_COMMANDS: ContextCommand[] = [
  {
    icon: Map,
    keywords: ['subscription', 'plan', 'upgrade', 'pricing'],
    keywordsKey: 'cmdk.keywords.plans',
    label: 'Subscription Plans',
    labelKey: 'tab.plans',
    labelNamespace: 'subscription',
    path: '/settings/plans',
    settingsTab: SettingsTabs.Plans,
    subPath: 'plans',
  },
  {
    icon: Coins,
    keywords: ['credits', 'balance', 'credit', 'money'],
    keywordsKey: 'cmdk.keywords.credits',
    label: 'Credits',
    labelKey: 'tab.credits',
    labelNamespace: 'subscription',
    path: '/settings/credits',
    settingsTab: SettingsTabs.Credits,
    subPath: 'credits',
  },
  {
    icon: PieChart,
    keywords: ['usage', 'statistics', 'consumption', 'quota'],
    keywordsKey: 'cmdk.keywords.usage',
    label: 'Usage',
    labelKey: 'tab.usage',
    labelNamespace: 'subscription',
    path: '/settings/usage',
    settingsTab: SettingsTabs.Usage,
    subPath: 'usage',
  },
  {
    icon: CreditCard,
    keywords: ['billing', 'payment', 'invoice', 'transaction'],
    keywordsKey: 'cmdk.keywords.billing',
    label: 'Billing',
    labelKey: 'tab.billing',
    labelNamespace: 'subscription',
    path: '/settings/billing',
    settingsTab: SettingsTabs.Billing,
    subPath: 'billing',
  },
  // There is deliberately no Referral entry here. That settings page was an
  // empty shell and has been retired, so its URL now resolves to a not-found;
  // a palette entry would advertise a destination the product no longer has.
  // (Written without the URL on purpose — the retirement gate in
  // `retiredSettingsSurfaces.test.ts` scans this file for it as text.)
];

/**
 * Map of context types to their core (non-business) commands.
 * Business commands are appended at runtime via {@link buildContextCommands}.
 */
export const CONTEXT_COMMANDS: Record<ContextType, ContextCommand[]> = {
  agent: [],
  group: [],
  resource: [],
  settings: [
    {
      icon: UserCircle,
      keywords: ['profile', 'user', 'account', 'personal'],
      keywordsKey: 'cmdk.keywords.profile',
      label: 'Profile',
      labelKey: 'tab.profile',
      labelNamespace: 'auth',
      path: '/settings/profile',
      subPath: 'profile',
    },
    {
      icon: PaletteIcon,
      keywords: ['common', 'appearance', 'theme', 'display'],
      keywordsKey: 'cmdk.keywords.appearance',
      label: 'Appearance',
      labelKey: 'tab.common',
      labelNamespace: 'setting',
      // `common` is a retired alias of `appearance`; deep-link the live tab
      // rather than riding the registry's compatibility redirect.
      path: '/settings/appearance',
      settingsTab: SettingsTabs.Appearance,
      subPath: 'appearance',
    },
    {
      icon: Brain,
      keywords: ['provider', 'llm', 'model', 'ai'],
      keywordsKey: 'cmdk.keywords.provider',
      label: 'Model Provider',
      labelKey: 'tab.provider',
      labelNamespace: 'setting',
      path: '/settings/provider',
      settingsTab: SettingsTabs.Provider,
      subPath: 'provider',
    },
    {
      icon: KeyboardIcon,
      keywords: ['hotkey', 'shortcut', 'keyboard'],
      keywordsKey: 'cmdk.keywords.hotkey',
      label: 'Hotkeys',
      labelKey: 'tab.hotkey',
      labelNamespace: 'setting',
      path: '/settings/hotkey',
      settingsTab: SettingsTabs.Hotkey,
      subPath: 'hotkey',
    },
    {
      icon: EthernetPort,
      keywords: ['proxy', 'network', 'connection'],
      keywordsKey: 'cmdk.keywords.proxy',
      label: 'Proxy',
      labelKey: 'tab.proxy',
      labelNamespace: 'setting' as const,
      path: '/settings/proxy',
      // Host-scoped: the registry's isDesktop gate answers for the palette too.
      settingsTab: SettingsTabs.Proxy,
      subPath: 'proxy',
    },
    {
      icon: ChartColumnBigIcon,
      keywords: ['stats', 'statistics', 'analytics'],
      keywordsKey: 'cmdk.keywords.stats',
      label: 'Statistics',
      labelKey: 'tab.stats',
      labelNamespace: 'auth',
      path: '/settings/stats',
      settingsTab: SettingsTabs.Stats,
      subPath: 'stats',
    },
    {
      icon: KeyIcon,
      keywords: ['apikey', 'api', 'key', 'token', 'signed'],
      keywordsKey: 'cmdk.keywords.apikey',
      label: 'API Keys',
      labelKey: 'tab.apikey',
      labelNamespace: 'auth',
      // Signed Orvilo TRPC keys (`/settings/apikey`). Not model-provider
      // credentials — `/settings/provider` stays retired.
      path: '/settings/apikey',
      settingsTab: SettingsTabs.APIKey,
      subPath: 'apikey',
    },
    {
      icon: Info,
      keywords: ['about', 'version', 'info'],
      keywordsKey: 'cmdk.keywords.about',
      label: 'About',
      labelKey: 'tab.about',
      labelNamespace: 'setting',
      path: '/settings/about',
      settingsTab: SettingsTabs.About,
      subPath: 'about',
    },
  ],
};

interface BuildContextCommandsOptions {
  /** The same context object the settings renderer resolves against. */
  capabilityContext: SettingsCapabilityContext;
}

/**
 * Build the full command map. Every settings entry tagged with `settingsTab`
 * passes through `SETTINGS_CAPABILITIES` — business surfaces are therefore
 * offered exactly when the registry serves the page, host surfaces exactly
 * when the host gate is open, and retired/unknown tabs never advertise.
 */
export const buildContextCommands = ({
  capabilityContext,
}: BuildContextCommandsOptions): Record<ContextType, ContextCommand[]> => ({
  ...CONTEXT_COMMANDS,
  settings: [...CONTEXT_COMMANDS.settings, ...BUSINESS_SETTINGS_COMMANDS].filter(
    (command) =>
      command.settingsTab === undefined ||
      isSettingsTabAvailable(command.settingsTab, capabilityContext),
  ),
});

/**
 * Get context-specific commands based on context type and current sub-path
 * Filters out the current page from the list
 */
export const getContextCommands = (
  contextType: MenuContext,
  currentSubPath: string | undefined,
  options: BuildContextCommandsOptions,
): ContextCommand[] => {
  const commands = buildContextCommands(options)[contextType as ContextType] || [];

  // Filter out the current page
  return commands.filter((cmd) => cmd.subPath !== currentSubPath);
};
