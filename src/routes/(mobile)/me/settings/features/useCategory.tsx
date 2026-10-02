import { McpIcon } from '@lobehub/ui/icons';
import {
  Bot,
  Brain,
  BrainCircuit,
  ChartColumnBigIcon,
  Coins,
  CreditCard,
  Database,
  EllipsisIcon,
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
import { isSettingsTabOffered } from '@/config/routes/settings';
import { useSettingsCapabilityContext } from '@/features/Settings/hooks/useSettingsCapability';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { SettingsTabs } from '@/store/global/initialState';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

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
  /**
   * Explicit destination for rows that don't map to a `/settings/<tab>` page —
   * e.g. the Agents row opens the `/agents` management surface.
   */
  to?: string;
}

export interface CategoryGroup {
  items: CategoryItem[];
  key: SettingsGroupKey;
  title: string;
}

export const useCategory = (): CategoryGroup[] => {
  const navigate = useWorkspaceAwareNavigate();
  const { t } = useTranslation(['setting', 'auth', 'subscription', 'common']);
  const capabilityContext = useSettingsCapabilityContext();
  const { showProvider } = useServerConfigStore(featureFlagsSelectors);

  return useMemo(() => {
    // The mobile list is a deliberately narrower subset of the personal
    // sidebar, but it never decides availability on its own: both read the
    // settings capability registry, so `/settings/<tab>` cannot open a page
    // this list withholds.
    const offered = (tab: SettingsTabs) => isSettingsTabOffered(tab, capabilityContext);
    const navigateTo = (key: SettingsTabs) =>
      navigate(key === SettingsTabs.Provider ? '/settings/provider/all' : `/settings/${key}`);

    const makeItem = ({ to, ...item }: Omit<CategoryItem, 'onClick'>): CategoryItem => ({
      ...item,
      to,
      onClick: () => (to ? navigate(to) : navigateTo(item.key)),
    });

    const account: CategoryItem[] = [
      makeItem({ icon: UserCircle, key: SettingsTabs.Profile, label: t('auth:profile.title') }),
      makeItem({
        icon: PaletteIcon,
        key: SettingsTabs.Appearance,
        label: t('setting:tab.appearance'),
      }),
    ];

    const usageAndCost: CategoryItem[] = [
      // Stats is the ungated head of this group on every deployment — same as
      // desktop: what it reports is usage and spend regardless of who reads it.
      makeItem({
        icon: ChartColumnBigIcon,
        key: SettingsTabs.Stats,
        label: t('auth:tab.stats'),
      }),
      ...(offered(SettingsTabs.Plans)
        ? [
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
            // No Referral entry: that settings page was an empty shell and has
            // been retired, so a row here would open a not-found. It used to be
            // listed unconditionally inside the Plans gate, which is how it
            // outlived the page on mobile.
          ]
        : []),
    ];

    const agent: CategoryItem[] = [
      // Provider settings should not depend on Advanced tools: new users may need
      // non-Orvilo providers, and desktop users often bring their own API keys.
      showProvider &&
        makeItem({ icon: Brain, key: SettingsTabs.Provider, label: t('setting:tab.provider') }),
      makeItem({
        icon: Sparkles,
        key: SettingsTabs.ServiceModel,
        label: t('setting:tab.serviceModel'),
      }),
      makeItem({ icon: BrainCircuit, key: SettingsTabs.Memory, label: t('setting:tab.memory') }),
      // Agent profile/model/tools configuration lives here in settings, never
      // on the 会话 tab — `/agents` is the management surface.
      makeItem({
        icon: Bot,
        key: SettingsTabs.Agent,
        label: t('common:agentViewAll.title'),
        to: '/agents',
      }),
    ].filter((item): item is CategoryItem => Boolean(item));

    const tools: CategoryItem[] = [
      makeItem({ icon: TagIcon, key: SettingsTabs.Labels, label: t('setting:tab.labels') }),
      makeItem({ icon: McpIcon, key: SettingsTabs.Connector, label: t('setting:tab.connector') }),
    ].filter((item): item is CategoryItem => Boolean(item));

    // The API Key entry used to appear twice — once here under dev mode and once
    // under `showApiKeyManage` — so a user who met both gates saw two rows for
    // one page.
    const security: CategoryItem[] = [
      makeItem({ icon: KeyRound, key: SettingsTabs.Creds, label: t('setting:tab.creds') }),
      offered(SettingsTabs.APIKey) &&
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
      offered(SettingsTabs.About) &&
        makeItem({ icon: Info, key: SettingsTabs.About, label: t('setting:tab.about') }),
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
  }, [t, capabilityContext, navigate, showProvider]);
};
