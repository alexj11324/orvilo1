import { Avatar } from '@lobehub/ui/base-ui';
import { McpIcon } from '@lobehub/ui/icons';
import { isDesktop } from '@orvilo/const';
import {
  BellIcon,
  BrainCircuit,
  ChartColumnBigIcon,
  Coins,
  CreditCard,
  Database,
  EllipsisIcon,
  EthernetPort,
  FlaskConical,
  Info,
  KeyboardIcon,
  KeyIcon,
  KeyRound,
  Map,
  MonitorSmartphoneIcon,
  PaletteIcon,
  TagIcon,
  TerminalSquare,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { isSettingsTabOffered } from '@/config/routes/settings';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';
import { SettingsTabs } from '@/store/global/initialState';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/slices/auth/selectors';

import { useSettingsCapabilityContext } from './useSettingsCapability';

export enum SettingsGroupKey {
  Account = 'account',
  Agent = 'agent',
  Channels = 'channels',
  Data = 'data',
  Developer = 'developer',
  Security = 'security',
  Tools = 'tools',
  UsageAndCost = 'usageAndCost',
}

export interface CategoryItem {
  /** Override the navigation URL. When omitted, Body derives the URL from `key`. */
  href?: string;
  icon: any;
  key: SettingsTabs;
  label: string;
}

export interface CategoryGroup {
  items: CategoryItem[];
  key: SettingsGroupKey;
  title: string;
}

export const useCategory = () => {
  const { t } = useTranslation('setting');
  const { t: tAuth } = useTranslation('auth');
  const { t: tLabs } = useTranslation('labs');
  const { t: tSubscription } = useTranslation('subscription');
  const [avatar, username] = useUserStore((s) => [
    userProfileSelectors.userAvatar(s),
    userProfileSelectors.nickName(s),
  ]);
  const remoteServerUrl = useElectronStore(electronSyncSelectors.remoteServerUrl);
  const capabilityContext = useSettingsCapabilityContext();

  const avatarUrl = useMemo(() => {
    if (!avatar) return undefined;
    if (isDesktop && avatar.startsWith('/') && remoteServerUrl) {
      return remoteServerUrl + avatar;
    }
    return avatar;
  }, [avatar, remoteServerUrl]);
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    // Which rows exist is decided by the settings capability registry, not here.
    // The page renderer asks the same registry, so a row the sidebar withholds
    // can no longer be opened by typing its URL — and `settings.test.ts` pins the
    // other direction, that a row offered here always renders.
    const offered = (tab: SettingsTabs) => isSettingsTabOffered(tab, capabilityContext);

    return [
      // Capability groups (S70). The sidebar used to be ordered by audience —
      // personal / subscription / developer — which put a capability's settings in
      // two different places depending on who it was for. Grouping by what the
      // settings operate on keeps a capability's configuration together.
      //
      // The workspace sidebar is deliberately not mirroring this: it already has a
      // Workspace group (with Members) and an Admin group (with the audit log),
      // which is the same vocabulary, and its shape is asserted by its own tests.

      // 账户与外观 — settings that follow the user everywhere.
      {
        items: [
          {
            icon: avatarUrl ? <Avatar avatar={avatarUrl} shape={'square'} size={26} /> : undefined,
            key: SettingsTabs.Profile,
            label: username || tAuth('tab.profile'),
          },
          {
            icon: PaletteIcon,
            key: SettingsTabs.Appearance,
            label: t('tab.appearance'),
          },
          offered(SettingsTabs.Hotkey) && {
            icon: KeyboardIcon,
            key: SettingsTabs.Hotkey,
            label: t('tab.hotkey'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Account,
        title: t('group.profile'),
      },

      {
        items: [
          offered(SettingsTabs.Notification) && {
            icon: BellIcon,
            key: SettingsTabs.Notification,
            label: t('tab.notification'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Channels,
        title: t('group.channels'),
      },

      // 执行环境与 Agent — the agent plus the runtime it executes in.
      {
        items: [
          {
            icon: BrainCircuit,
            key: SettingsTabs.Memory,
            label: t('tab.memory'),
          },
          offered(SettingsTabs.Proxy) && {
            icon: EthernetPort,
            key: SettingsTabs.Proxy,
            label: t('tab.proxy'),
          },
          offered(SettingsTabs.SystemTools) && {
            icon: TerminalSquare,
            key: SettingsTabs.SystemTools,
            label: t('tab.systemTools'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Agent,
        title: t('group.aiConfig'),
      },

      // 工具与连接器 — the platform's own skill marketplace was retired, so the
      // group no longer carries a Skill row. Connector and Labels stay.
      {
        items: [
          {
            icon: McpIcon,
            key: SettingsTabs.Connector,
            label: t('tab.connector'),
          },
          {
            icon: TagIcon,
            key: SettingsTabs.Labels,
            label: t('tab.labels'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Tools,
        title: t('group.tools'),
      },

      // 用量与成本 — the quota / cost / billing / audit surface S70 says to keep.
      // Statistics sit here rather than in a "personal" bucket: what they report is
      // usage and spend, which is the same capability regardless of who reads it.
      {
        items: [
          {
            icon: ChartColumnBigIcon,
            key: SettingsTabs.Stats,
            label: tAuth('tab.stats'),
          },
          offered(SettingsTabs.Usage) && {
            icon: ChartColumnBigIcon,
            key: SettingsTabs.Usage,
            label: t('tab.usage'),
          },
          offered(SettingsTabs.Plans) && {
            icon: Map,
            key: SettingsTabs.Plans,
            label: tSubscription('tab.plans'),
          },
          offered(SettingsTabs.Credits) && {
            icon: Coins,
            key: SettingsTabs.Credits,
            label: tSubscription('tab.credits'),
          },
          offered(SettingsTabs.Billing) && {
            icon: CreditCard,
            key: SettingsTabs.Billing,
            label: tSubscription('tab.billing'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.UsageAndCost,
        title: t('group.usageAndCost'),
      },

      // 安全、权限与审计. The API Key entry used to be listed twice — once under
      // `showApiKeyManage` and once under dev mode — so a user who met both gates
      // saw two rows pointing at the same page.
      {
        items: [
          {
            icon: KeyRound,
            key: SettingsTabs.Creds,
            label: t('tab.creds'),
          },
          offered(SettingsTabs.APIKey) && {
            icon: KeyIcon,
            key: SettingsTabs.APIKey,
            label: tAuth('tab.apikey'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Security,
        title: t('group.security'),
      },

      // 数据管理 — where this install keeps its data, and the devices it syncs to.
      {
        items: [
          {
            icon: Database,
            key: SettingsTabs.Storage,
            label: t('tab.storage'),
          },
          {
            icon: MonitorSmartphoneIcon,
            key: SettingsTabs.Devices,
            label: t('tab.devices'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Data,
        title: t('group.data'),
      },

      // 开发者 — app-level settings that operate on the install rather than on any
      // capability: update channel, diagnostics, lab flags, version info. The plan
      // names no group for these, and fitting them elsewhere would mislabel them.
      {
        items: [
          {
            icon: EllipsisIcon,
            key: SettingsTabs.Advanced,
            label: t('tab.advanced'),
          },
          {
            icon: FlaskConical,
            key: SettingsTabs.Labs,
            label: tLabs('title'),
          },
          offered(SettingsTabs.About) && {
            icon: Info,
            key: SettingsTabs.About,
            label: t('tab.about'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Developer,
        title: t('group.developer'),
      },
    ];
  }, [t, tAuth, tLabs, tSubscription, capabilityContext, avatarUrl, username]);

  return categoryGroups;
};
