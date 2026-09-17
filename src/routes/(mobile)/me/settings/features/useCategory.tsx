import { SkillsIcon } from '@lobehub/ui/icons';
import {
  AppWindowIcon,
  Blocks,
  Brain,
  BrainCircuit,
  ChartColumnBigIcon,
  Coins,
  CreditCard,
  Database,
  EllipsisIcon,
  Gift,
  Info,
  KeyIcon,
  KeyRound,
  Map,
  PaletteIcon,
  Sparkles,
  TagIcon,
  UserCircle,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { type CellProps } from '@/components/Cell';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { SettingsTabs } from '@/store/global/initialState';
import {
  featureFlagsSelectors,
  serverConfigSelectors,
  useServerConfigStore,
} from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/selectors';
import { userGeneralSettingsSelectors } from '@/store/user/slices/settings/selectors';

export enum SettingsGroupKey {
  Account = 'account',
  Agent = 'agent',
  Data = 'data',
  Developer = 'developer',
  Security = 'security',
  Tools = 'tools',
  UsageAndCost = 'usageAndCost',
}

export interface CategoryItem extends Omit<CellProps, 'type'> {
  key: SettingsTabs;
}

export interface CategoryGroup {
  items: CategoryItem[];
  key: SettingsGroupKey;
  title: string;
}

export const useCategory = (): CategoryGroup[] => {
  const navigate = useWorkspaceAwareNavigate();
  const { t } = useTranslation(['setting', 'auth', 'subscription']);
  const { hideDocs, showApiKeyManage, showProvider } = useServerConfigStore(featureFlagsSelectors);
  const enableBusinessFeatures = useServerConfigStore(serverConfigSelectors.enableBusinessFeatures);
  const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);
  const enableOAuthApps = useUserStore(labPreferSelectors.enableOAuthApps);

  return useMemo(() => {
    const navigateTo = (key: SettingsTabs) =>
      navigate(key === SettingsTabs.Provider ? '/settings/provider/all' : `/settings/${key}`);

    const makeItem = (item: Omit<CategoryItem, 'onClick'>): CategoryItem => ({
      ...item,
      onClick: () => navigateTo(item.key),
    });

    const account: CategoryItem[] = [
      makeItem({ icon: UserCircle, key: SettingsTabs.Profile, label: t('auth:profile.title') }),
      makeItem({
        icon: PaletteIcon,
        key: SettingsTabs.Appearance,
        label: t('setting:tab.appearance'),
      }),
    ];

    const usageAndCost: CategoryItem[] = enableBusinessFeatures
      ? [
          makeItem({
            icon: ChartColumnBigIcon,
            key: SettingsTabs.Stats,
            label: t('auth:tab.stats'),
          }),
          makeItem({ icon: Map, key: SettingsTabs.Plans, label: t('subscription:tab.plans') }),
          makeItem({
            icon: ChartColumnBigIcon,
            key: SettingsTabs.Usage,
            label: t('setting:tab.usage'),
          }),
          makeItem({
            icon: Coins,
            key: SettingsTabs.Credits,
            label: t('subscription:tab.credits'),
          }),
          makeItem({
            icon: CreditCard,
            key: SettingsTabs.Billing,
            label: t('subscription:tab.billing'),
          }),
          makeItem({
            icon: Gift,
            key: SettingsTabs.Referral,
            label: t('subscription:tab.referral'),
          }),
        ]
      : [];

    const agent: CategoryItem[] = [
      // Provider settings should not depend on Advanced tools: new users may need
      // non-LobeHub providers, and desktop users often bring their own API keys.
      showProvider &&
        makeItem({ icon: Brain, key: SettingsTabs.Provider, label: t('setting:tab.provider') }),
      makeItem({
        icon: Sparkles,
        key: SettingsTabs.ServiceModel,
        label: t('setting:tab.serviceModel'),
      }),
      makeItem({ icon: BrainCircuit, key: SettingsTabs.Memory, label: t('setting:tab.memory') }),
    ].filter((item): item is CategoryItem => Boolean(item));

    const tools: CategoryItem[] = [
      makeItem({ icon: SkillsIcon, key: SettingsTabs.Skill, label: t('setting:tab.skill') }),
      makeItem({ icon: TagIcon, key: SettingsTabs.Labels, label: t('setting:tab.labels') }),
      makeItem({ icon: Blocks, key: SettingsTabs.Connector, label: t('setting:tab.connector') }),
      enableOAuthApps &&
        makeItem({
          icon: AppWindowIcon,
          key: SettingsTabs.OAuthApps,
          label: t('auth:tab.oauthApps'),
        }),
    ].filter((item): item is CategoryItem => Boolean(item));

    // The API Key entry used to appear twice — once here under dev mode and once
    // under `showApiKeyManage` — so a user who met both gates saw two rows for
    // one page.
    const security: CategoryItem[] = [
      makeItem({ icon: KeyRound, key: SettingsTabs.Creds, label: t('setting:tab.creds') }),
      (showApiKeyManage || isDevMode) &&
        makeItem({ icon: KeyIcon, key: SettingsTabs.APIKey, label: t('auth:tab.apikey') }),
    ].filter((item): item is CategoryItem => Boolean(item));

    const data: CategoryItem[] = [
      makeItem({ icon: Database, key: SettingsTabs.Storage, label: t('setting:tab.storage') }),
    ].filter((item): item is CategoryItem => Boolean(item));

    // App-level settings that operate on the install rather than on a capability.
    const developer: CategoryItem[] = [
      makeItem({
        icon: EllipsisIcon,
        key: SettingsTabs.Advanced,
        label: t('setting:tab.advanced'),
      }),
      !hideDocs && makeItem({ icon: Info, key: SettingsTabs.About, label: t('setting:tab.about') }),
    ].filter((item): item is CategoryItem => Boolean(item));

    return [
      { items: account, key: SettingsGroupKey.Account, title: t('setting:group.profile') },
      {
        items: usageAndCost,
        key: SettingsGroupKey.UsageAndCost,
        title: t('setting:group.usageAndCost'),
      },
      { items: agent, key: SettingsGroupKey.Agent, title: t('setting:group.aiConfig') },
      { items: tools, key: SettingsGroupKey.Tools, title: t('setting:group.tools') },
      { items: security, key: SettingsGroupKey.Security, title: t('setting:group.security') },
      { items: data, key: SettingsGroupKey.Data, title: t('setting:group.data') },
      {
        items: developer,
        key: SettingsGroupKey.Developer,
        title: t('setting:group.developer'),
      },
    ].filter((group) => group.items.length > 0);
  }, [
    t,
    enableBusinessFeatures,
    hideDocs,
    showApiKeyManage,
    showProvider,
    isDevMode,
    enableOAuthApps,
    navigate,
  ]);
};
