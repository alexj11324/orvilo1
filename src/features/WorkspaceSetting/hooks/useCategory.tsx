import { Avatar } from '@lobehub/ui/base-ui';
import { isDesktop } from '@orvilo/const';
import {
  BellIcon,
  Blocks,
  Building2,
  ChartColumnBigIcon,
  Coins,
  CreditCard,
  Database,
  EllipsisIcon,
  FlaskConical,
  HandCoins,
  Info,
  KeyboardIcon,
  KeyIcon,
  KeyRound,
  Link2,
  Map,
  MonitorSmartphoneIcon,
  PaletteIcon,
  ScrollText,
  TagIcon,
  Users,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { usePermission } from '@/hooks/usePermission';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';
import {
  featureFlagsSelectors,
  serverConfigSelectors,
  useServerConfigStore,
} from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import { WorkspaceSettingsTabs } from '@/types/workspaceSettings';

export enum WorkspaceSettingsGroupKey {
  Account = 'account',
  Admin = 'admin',
  Agent = 'agent',
  Developer = 'developer',
  General = 'general',
  Subscription = 'subscription',
  System = 'system',
}

export interface WorkspaceSettingCategoryItem {
  icon: any;
  key: WorkspaceSettingsTabs;
  label: string;
}

export interface WorkspaceSettingCategoryGroup {
  items: WorkspaceSettingCategoryItem[];
  key: WorkspaceSettingsGroupKey;
  title: string;
}

export const useWorkspaceSettingCategory = (): WorkspaceSettingCategoryGroup[] => {
  const { t } = useTranslation('setting');
  const { t: tAuth } = useTranslation('auth');
  const { t: tLabs } = useTranslation('labs');
  const { t: tSubscription } = useTranslation('subscription');
  const { allowed: canManageWorkspace } = usePermission('manage_settings');
  const { allowed: canViewBilling } = usePermission('view_billing');
  // API keys act as the member who issued them, so the tab follows the same
  // member-level gate the server enforces: `API_KEY_*` is granted from Member
  // up, never to Viewer. Without this the tab leads to a list request that
  // immediately 403s.
  const { allowed: canCreateContent } = usePermission('create_content');
  const { hideDocs } = useServerConfigStore(featureFlagsSelectors);
  const enableBusinessFeatures = useServerConfigStore(serverConfigSelectors.enableBusinessFeatures);
  const [avatar, username] = useUserStore((s) => [
    userProfileSelectors.userAvatar(s),
    userProfileSelectors.nickName(s),
  ]);
  const remoteServerUrl = useElectronStore(electronSyncSelectors.remoteServerUrl);

  const avatarUrl = useMemo(() => {
    if (!avatar) return undefined;
    if (isDesktop && avatar.startsWith('/') && remoteServerUrl) {
      return remoteServerUrl + avatar;
    }
    return avatar;
  }, [avatar, remoteServerUrl]);

  return useMemo(
    () =>
      [
        // Account-level settings (profile / appearance / hotkeys)
        // follow the user, not the workspace. They are mirrored here so members
        // can reach them without leaving the workspace; the pages are the
        // personal ones.
        // Leads the sidebar so the user's own identity stays on top, like the
        // personal settings sidebar.
        {
          items: [
            {
              icon: avatarUrl ? (
                <Avatar avatar={avatarUrl} shape={'square'} size={26} />
              ) : undefined,
              key: WorkspaceSettingsTabs.Profile,
              label: username || tAuth('tab.profile'),
            },
            {
              icon: PaletteIcon,
              key: WorkspaceSettingsTabs.Appearance,
              label: t('tab.appearance'),
            },
            {
              icon: KeyboardIcon,
              key: WorkspaceSettingsTabs.Hotkey,
              label: t('tab.hotkey'),
            },
          ],
          key: WorkspaceSettingsGroupKey.Account,
          title: t('group.profile'),
        },
        {
          items: [
            {
              icon: Building2,
              key: WorkspaceSettingsTabs.General,
              label: t('workspaceSetting.tab.general'),
            },
            {
              icon: Users,
              key: WorkspaceSettingsTabs.Members,
              label: t('workspaceSetting.tab.members'),
            },
            {
              icon: MonitorSmartphoneIcon,
              key: WorkspaceSettingsTabs.Devices,
              label: t('tab.devices'),
            },
            {
              icon: BellIcon,
              key: WorkspaceSettingsTabs.Notification,
              label: t('tab.notification'),
            },
            {
              icon: ChartColumnBigIcon,
              key: WorkspaceSettingsTabs.Stats,
              label: tAuth('tab.stats'),
            },
          ],
          key: WorkspaceSettingsGroupKey.General,
          title: t('workspaceSetting.group.workspace'),
        },
        // The business settings pages only exist on deployments that ship the
        // business overlay — the route slots stay registered as its injection
        // points, but the nav must not offer them where the flag is off.
        enableBusinessFeatures && {
          items: [
            {
              icon: Map,
              key: WorkspaceSettingsTabs.Plans,
              label: tSubscription('tab.plans'),
            },
            {
              icon: ChartColumnBigIcon,
              key: WorkspaceSettingsTabs.Usage,
              label: t('tab.usage'),
            },
            // Credits / Billing are readable by Admin-or-higher; the pages
            // themselves keep the money-moving controls (top-up, payment
            // methods, plan changes) behind the narrower subscription gate.
            canViewBilling && {
              icon: Coins,
              key: WorkspaceSettingsTabs.Credits,
              label: tSubscription('tab.credits'),
            },
            // Spend governance (budget pools + member caps) — admin task,
            // same visibility gate as the other money pages.
            canViewBilling && {
              icon: HandCoins,
              key: WorkspaceSettingsTabs.Budget,
              label: tSubscription('tab.budget'),
            },
            canViewBilling && {
              icon: CreditCard,
              key: WorkspaceSettingsTabs.Billing,
              label: tSubscription('tab.billing'),
            },
          ].filter(Boolean) as WorkspaceSettingCategoryItem[],
          key: WorkspaceSettingsGroupKey.Subscription,
          title: t('group.subscription'),
        },
        {
          items: [
            // The workspace skill settings page was retired with the platform's
            // skill marketplace; the route survives only as a redirect to this
            // settings root (see `WORKSPACE_SETTINGS_ALIASES`).
            // Label registry is readable by everyone; the page itself keeps
            // management actions behind the admin gate (disabled, not hidden).
            {
              icon: TagIcon,
              key: WorkspaceSettingsTabs.Labels,
              label: t('workspaceSetting.tab.labels'),
            },
            {
              icon: Blocks,
              key: WorkspaceSettingsTabs.Connector,
              label: t('workspaceSetting.tab.connector'),
            },
            {
              icon: Link2,
              key: WorkspaceSettingsTabs.Linear,
              label: t('workspaceSetting.tab.linear'),
            },
            {
              icon: KeyRound,
              key: WorkspaceSettingsTabs.Creds,
              label: t('tab.creds'),
            },
          ].filter(Boolean) as WorkspaceSettingCategoryItem[],
          key: WorkspaceSettingsGroupKey.Agent,
          title: t('workspaceSetting.group.agent'),
        },
        // The Admin group is available to Admin and Owner.
        canManageWorkspace && {
          items: [
            {
              icon: Database,
              key: WorkspaceSettingsTabs.Storage,
              label: t('tab.storage'),
            },
            {
              icon: ScrollText,
              key: WorkspaceSettingsTabs.AuditLog,
              label: t('workspaceSetting.tab.auditLog'),
            },
          ].filter(Boolean) as WorkspaceSettingCategoryItem[],
          key: WorkspaceSettingsGroupKey.Admin,
          title: t('workspaceSetting.group.admin'),
        },
        // System group: Storage stays in Admin because it is workspace-scoped
        // there; About is informational and visible to every role.
        !hideDocs && {
          items: [
            {
              icon: Info,
              key: WorkspaceSettingsTabs.About,
              label: t('tab.about'),
            },
          ],
          key: WorkspaceSettingsGroupKey.System,
          title: t('group.system'),
        },
        // Developer group sits last, mirroring the personal sidebar: Advanced
        // and Labs are user preferences (always shown), API Key keeps its gate.
        {
          items: [
            {
              icon: EllipsisIcon,
              key: WorkspaceSettingsTabs.Advanced,
              label: t('tab.advanced'),
            },
            canCreateContent && {
              icon: KeyIcon,
              key: WorkspaceSettingsTabs.APIKey,
              label: tAuth('tab.apikey'),
            },
            {
              icon: FlaskConical,
              key: WorkspaceSettingsTabs.Labs,
              label: tLabs('title'),
            },
          ].filter(Boolean) as WorkspaceSettingCategoryItem[],
          key: WorkspaceSettingsGroupKey.Developer,
          title: t('group.developer'),
        },
      ].filter(Boolean) as WorkspaceSettingCategoryGroup[],
    [
      t,
      tAuth,
      tLabs,
      tSubscription,
      canManageWorkspace,
      canViewBilling,
      canCreateContent,
      enableBusinessFeatures,
      hideDocs,
      avatarUrl,
      username,
    ],
  );
};
