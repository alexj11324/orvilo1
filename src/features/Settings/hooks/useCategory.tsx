import { Avatar } from '@lobehub/ui/base-ui';
import { SkillsIcon } from '@lobehub/ui/icons';
import { isDesktop } from '@orvilo/const';
import {
  AppWindowIcon,
  BellIcon,
  Blocks,
  BrainCircuit,
  ChartColumnBigIcon,
  Coins,
  CreditCard,
  Database,
  EllipsisIcon,
  EthernetPort,
  FlaskConical,
  Gift,
  Info,
  KeyboardIcon,
  KeyIcon,
  KeyRound,
  Map,
  MessageCircleIcon,
  MonitorSmartphoneIcon,
  PaletteIcon,
  TagIcon,
  TerminalSquare,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';
import { SettingsTabs } from '@/store/global/initialState';
import {
  featureFlagsSelectors,
  serverConfigSelectors,
  useServerConfigStore,
} from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/selectors';
import { userProfileSelectors } from '@/store/user/slices/auth/selectors';
import { userGeneralSettingsSelectors } from '@/store/user/slices/settings/selectors';

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
  const mobile = useServerConfigStore((s) => s.isMobile);
  const { hideDocs, showApiKeyManage } = useServerConfigStore(featureFlagsSelectors);
  const [avatar, username] = useUserStore((s) => [
    userProfileSelectors.userAvatar(s),
    userProfileSelectors.nickName(s),
  ]);
  const remoteServerUrl = useElectronStore(electronSyncSelectors.remoteServerUrl);
  const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);
  const enableOAuthApps = useUserStore(labPreferSelectors.enableOAuthApps);

  const avatarUrl = useMemo(() => {
    if (!avatar) return undefined;
    if (isDesktop && avatar.startsWith('/') && remoteServerUrl) {
      return remoteServerUrl + avatar;
    }
    return avatar;
  }, [avatar, remoteServerUrl]);
  const enableBusinessFeatures = useServerConfigStore(serverConfigSelectors.enableBusinessFeatures);
  const categoryGroups = useMemo<CategoryGroup[]>(
    () => [
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
          !mobile && {
            icon: KeyboardIcon,
            key: SettingsTabs.Hotkey,
            label: t('tab.hotkey'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Account,
        title: t('group.profile'),
      },

      // 通知与渠道 — the user's own channels. Messenger bindings and notifications
      // share a group for navigability only; each keeps its own token owner, scope
      // and server-side permission, which S70 asks not to merge.
      {
        items: [
          {
            icon: MessageCircleIcon,
            key: SettingsTabs.Messenger,
            label: t('tab.messenger'),
          },
          (enableBusinessFeatures || isDesktop) && {
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
          isDesktop && {
            icon: EthernetPort,
            key: SettingsTabs.Proxy,
            label: t('tab.proxy'),
          },
          isDesktop && {
            icon: TerminalSquare,
            key: SettingsTabs.SystemTools,
            label: t('tab.systemTools'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Agent,
        title: t('group.aiConfig'),
      },

      // 工具、技能与连接器
      {
        items: [
          {
            icon: SkillsIcon,
            key: SettingsTabs.Skill,
            label: t('tab.skill'),
          },
          {
            icon: Blocks,
            key: SettingsTabs.Connector,
            label: t('tab.connector'),
          },
          {
            icon: TagIcon,
            key: SettingsTabs.Labels,
            label: t('tab.labels'),
          },
          enableOAuthApps && {
            icon: AppWindowIcon,
            key: SettingsTabs.OAuthApps,
            label: tAuth('tab.oauthApps'),
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
          enableBusinessFeatures && {
            icon: ChartColumnBigIcon,
            key: SettingsTabs.Usage,
            label: t('tab.usage'),
          },
          enableBusinessFeatures && {
            icon: Map,
            key: SettingsTabs.Plans,
            label: tSubscription('tab.plans'),
          },
          enableBusinessFeatures && {
            icon: Coins,
            key: SettingsTabs.Credits,
            label: tSubscription('tab.credits'),
          },
          enableBusinessFeatures && {
            icon: CreditCard,
            key: SettingsTabs.Billing,
            label: tSubscription('tab.billing'),
          },
          enableBusinessFeatures && {
            icon: Gift,
            key: SettingsTabs.Referral,
            label: tSubscription('tab.referral'),
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
          (showApiKeyManage || isDevMode) && {
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
          !hideDocs && {
            icon: Info,
            key: SettingsTabs.About,
            label: t('tab.about'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Developer,
        title: t('group.developer'),
      },
    ],
    [
      t,
      tAuth,
      tLabs,
      tSubscription,
      enableBusinessFeatures,
      hideDocs,
      mobile,
      showApiKeyManage,
      isDevMode,
      enableOAuthApps,
      avatarUrl,
      username,
    ],
  );

  return categoryGroups;
};
