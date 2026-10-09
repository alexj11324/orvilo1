import { McpIcon } from '@lobehub/ui/icons';
import { isDesktop } from '@orvilo/const';
import {
  BellIcon,
  BotMessageSquareIcon,
  Brain,
  BrainCircuit,
  Building2,
  ChartColumnBigIcon,
  Coins,
  CreditCard,
  Database,
  EllipsisIcon,
  EthernetPort,
  GitBranchIcon,
  HandCoins,
  Import,
  Info,
  KeyboardIcon,
  KeyIcon,
  KeyRound,
  Map,
  MonitorSmartphoneIcon,
  PaletteIcon,
  Sparkles,
  TerminalSquare,
  User,
  Users,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import Avatar from '@/components/Avatar';
import { isSettingsTabOffered } from '@/config/routes/settings';
import { usePermission } from '@/hooks/usePermission';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';
import { SettingsTabs } from '@/store/global/initialState';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/slices/auth/selectors';
import { WorkspaceSettingsTabs } from '@/types/workspaceSettings';

import { useSettingsCapabilityContext } from './useSettingsCapability';

export enum SettingsGroupKey {
  Account = 'account',
  Agent = 'agent',
  Channels = 'channels',
  Data = 'data',
  Developer = 'developer',
  Security = 'security',
  ThisDevice = 'thisDevice',
  Tools = 'tools',
  UsageAndCost = 'usageAndCost',
  Workspace = 'workspace',
}

/**
 * Rows that exist only under `/:workspaceSlug/settings/*`. They have no
 * `SettingsTabs` member because no personal page answers for them.
 */
export type WorkspaceOnlySettingsTab =
  | WorkspaceSettingsTabs.Budget
  | WorkspaceSettingsTabs.General
  | WorkspaceSettingsTabs.Imports
  | WorkspaceSettingsTabs.Members;

export type SettingsNavKey = SettingsTabs | WorkspaceOnlySettingsTab;

export interface CategoryItem {
  /**
   * Override the navigation URL. When omitted, Body derives the URL from `key`.
   * Rows whose page reads or writes the workspace carry the workspace URL here.
   */
  href?: string;
  icon: any;
  key: SettingsNavKey;
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
  const { t: tSubscription } = useTranslation('subscription');
  const { showProvider } = useServerConfigStore(featureFlagsSelectors);
  const [avatar, username] = useUserStore((s) => [
    userProfileSelectors.userAvatar(s),
    userProfileSelectors.nickName(s),
  ]);
  const remoteServerUrl = useElectronStore(electronSyncSelectors.remoteServerUrl);
  const capabilityContext = useSettingsCapabilityContext();
  const slug = useActiveWorkspaceSlug();
  const { allowed: canManageWorkspace } = usePermission('manage_settings');
  const { allowed: canViewBilling } = usePermission('view_billing');
  // API keys act as the member who issued them, so the row follows the gate the
  // server enforces: `API_KEY_*` is granted from Member up, never to Viewer.
  const { allowed: canCreateContent } = usePermission('create_content');

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
    // One row per capability. A page that reads or writes the workspace lives at
    // `/:slug/settings/<tab>`; the row points there, and without a workspace it
    // falls back to the personal page of the same name.
    const inWorkspace = (tab: string) => (slug ? `/${slug}/settings/${tab}` : undefined);

    return [
      // Capability groups (S70). The sidebar used to be ordered by audience —
      // personal / subscription / developer — which put a capability's settings in
      // two different places depending on who it was for. Grouping by what the
      // settings operate on keeps a capability's configuration together.
      //
      // There is one settings sidebar. The pages a workspace shares sit in their
      // own group below; every other group follows the person or the install.

      // 账户与外观 — settings that follow the user everywhere.
      {
        items: [
          {
            icon: avatarUrl ? <Avatar avatar={avatarUrl} shape={'square'} size={16} /> : User,
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

      // 工作区 — what the whole workspace shares. Only rendered inside one.
      {
        items: slug
          ? ([
              {
                href: inWorkspace(WorkspaceSettingsTabs.General),
                icon: Building2,
                key: WorkspaceSettingsTabs.General,
                label: t('workspaceSetting.tab.general'),
              },
              {
                href: inWorkspace(WorkspaceSettingsTabs.Members),
                icon: Users,
                key: WorkspaceSettingsTabs.Members,
                label: t('workspaceSetting.tab.members'),
              },
              // Importing is workspace data management, an admin task.
              canManageWorkspace && {
                href: inWorkspace(WorkspaceSettingsTabs.Imports),
                icon: Import,
                key: WorkspaceSettingsTabs.Imports,
                label: t('workspaceSetting.tab.imports'),
              },
            ].filter(Boolean) as CategoryItem[])
          : [],
        key: SettingsGroupKey.Workspace,
        title: t('workspaceSetting.group.workspace'),
      },

      // 执行环境与 Agent — the agent plus the runtime it executes in.
      {
        items: [
          // Per-agent configuration home (General / Runtime / Model / Tools &
          // Permissions / Environment / Advanced) — exiled from the work
          // surface so the agent page stays an instant workbench.
          offered(SettingsTabs.Agents) && {
            icon: BotMessageSquareIcon,
            key: SettingsTabs.Agents,
            label: t('tab.agents'),
          },
          offered(SettingsTabs.Orchestrator) && {
            icon: GitBranchIcon,
            key: SettingsTabs.Orchestrator,
            label: t('tab.orchestrator'),
          },
          // Provider settings should not depend on Advanced tools: new users may need
          // non-LobeHub providers, and desktop users often bring their own API keys.
          showProvider && {
            icon: Brain,
            key: SettingsTabs.Provider,
            label: t('tab.provider'),
          },
          {
            icon: Sparkles,
            key: SettingsTabs.ServiceModel,
            label: t('tab.serviceModel'),
          },
          {
            icon: BrainCircuit,
            key: SettingsTabs.Memory,
            label: t('tab.memory'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Agent,
        title: t('group.aiConfig'),
      },

      // 工具与连接器 — the platform's own skill marketplace was retired, so the
      // group no longer carries a Skill row. Connector stays.
      {
        items: [
          {
            icon: McpIcon,
            key: SettingsTabs.Connector,
            label: t('tab.connector'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Tools,
        title: t('group.tools'),
      },

      // 此应用·此设备 — host-scoped pages (this install's proxy, OS-level
      // permissions). Registry scope 'host'; offered() already resolves the
      // isDesktop gate, so an empty group can be dropped without a platform
      // check here.
      {
        items: [
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
        key: SettingsGroupKey.ThisDevice,
        title: t('group.thisDevice'),
      },

      // 用量与成本 — the quota / cost / billing / audit surface S70 says to keep.
      // Statistics sit here rather than in a "personal" bucket: what they report is
      // usage and spend, which is the same capability regardless of who reads it.
      {
        items: [
          {
            // The workspace page is the same statistics plus the by-member split.
            href: inWorkspace(WorkspaceSettingsTabs.Stats),
            icon: ChartColumnBigIcon,
            key: SettingsTabs.Stats,
            label: tAuth('tab.stats'),
          },
          offered(SettingsTabs.Usage) && {
            href: inWorkspace(WorkspaceSettingsTabs.Usage),
            icon: ChartColumnBigIcon,
            key: SettingsTabs.Usage,
            label: t('tab.usage'),
          },
          offered(SettingsTabs.Plans) && {
            href: inWorkspace(WorkspaceSettingsTabs.Plans),
            icon: Map,
            key: SettingsTabs.Plans,
            label: tSubscription('tab.plans'),
          },
          // Credits / Budget / Billing are readable by Admin-or-higher inside a
          // workspace; the pages keep the money-moving controls behind the
          // narrower subscription gate.
          offered(SettingsTabs.Credits) &&
            (!slug || canViewBilling) && {
              href: inWorkspace(WorkspaceSettingsTabs.Credits),
              icon: Coins,
              key: SettingsTabs.Credits,
              label: tSubscription('tab.credits'),
            },
          // Spend governance (budget pools + member caps) only exists per workspace.
          offered(SettingsTabs.Billing) &&
            !!slug &&
            canViewBilling && {
              href: inWorkspace(WorkspaceSettingsTabs.Budget),
              icon: HandCoins,
              key: WorkspaceSettingsTabs.Budget,
              label: tSubscription('tab.budget'),
            },
          offered(SettingsTabs.Billing) &&
            (!slug || canViewBilling) && {
              href: inWorkspace(WorkspaceSettingsTabs.Billing),
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
            // The workspace page carries both the personal and the shared credentials.
            href: inWorkspace(WorkspaceSettingsTabs.Creds),
            icon: KeyRound,
            key: SettingsTabs.Creds,
            label: t('tab.creds'),
          },
          offered(SettingsTabs.APIKey) &&
            canCreateContent && {
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
            // The workspace page carries both the shared pool and the private devices.
            href: inWorkspace(WorkspaceSettingsTabs.Devices),
            icon: MonitorSmartphoneIcon,
            key: SettingsTabs.Devices,
            label: t('tab.devices'),
          },
        ].filter(Boolean) as CategoryItem[],
        key: SettingsGroupKey.Data,
        title: t('group.data'),
      },

      // 开发者 — app-level settings that operate on the install rather than on any
      // capability: update channel, diagnostics, version info. The plan
      // names no group for these, and fitting them elsewhere would mislabel them.
      {
        items: [
          {
            icon: EllipsisIcon,
            key: SettingsTabs.Advanced,
            label: t('tab.advanced'),
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
    ].filter((group) => group.items.length > 0);
  }, [
    t,
    tAuth,
    tSubscription,
    capabilityContext,
    avatarUrl,
    username,
    showProvider,
    slug,
    canManageWorkspace,
    canViewBilling,
    canCreateContent,
  ]);

  return categoryGroups;
};
