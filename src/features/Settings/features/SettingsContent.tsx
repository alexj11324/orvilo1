'use client';

import { Text } from '@lobehub/ui/base-ui';
import { Fragment, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import NotFound from '@/components/404';
import { isSettingsTabAvailable, resolveSettingsCapability } from '@/config/routes/settings';
import NavHeader from '@/features/NavHeader';
import SettingContainer from '@/features/Setting/SettingContainer';
import { useSettingsAnchorScroll } from '@/features/SettingsSearch/anchor';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { SettingsTabs } from '@/store/global/initialState';

import { useSettingsCapabilityContext } from '../hooks/useSettingsCapability';
import { ManageMemoryButton } from '../memory/features/ManageMemoryButton';
import { componentMap } from './componentMap';

const COMPACT_HEADER_TABS = [
  SettingsTabs.About,
  SettingsTabs.APIKey,
  SettingsTabs.Appearance,
  SettingsTabs.Billing,
  SettingsTabs.Credits,
  SettingsTabs.Devices,
  SettingsTabs.Hotkey,
  SettingsTabs.Labels,
  SettingsTabs.Labs,
  SettingsTabs.Memory,
  SettingsTabs.Messenger,
  SettingsTabs.Notification,
  SettingsTabs.Plans,
  SettingsTabs.Profile,
  SettingsTabs.Stats,
  SettingsTabs.Storage,
] as const;

/** Tabs whose pages own their internal layout and must not be wrapped. */
const FULL_WIDTH_TABS: readonly string[] = [
  SettingsTabs.Connector,
  SettingsTabs.Creds,
  SettingsTabs.Usage,
];

interface SettingsContentProps {
  activeTab?: string;
  mobile?: boolean;
}

const SettingsContent = ({ mobile, activeTab }: SettingsContentProps) => {
  const { t } = useTranslation(['auth', 'labs', 'setting', 'subscription']);
  const navigate = useWorkspaceAwareNavigate();
  const capabilityContext = useSettingsCapabilityContext();
  const { enableBusinessFeatures } = capabilityContext;

  const compactHeaderTitles: Partial<Record<SettingsTabs, string>> = {
    [SettingsTabs.About]: t('setting:tab.about'),
    [SettingsTabs.APIKey]: t('setting:tab.apikey'),
    [SettingsTabs.Appearance]: t('setting:tab.appearance'),
    [SettingsTabs.Billing]: t('subscription:tab.billing'),
    [SettingsTabs.Credits]: t('subscription:tab.credits'),
    [SettingsTabs.Devices]: t('setting:devices.title'),
    [SettingsTabs.Hotkey]: t('setting:tab.hotkey'),
    [SettingsTabs.Labels]: t('setting:tab.labels'),
    // Labs has no `setting:tab.*` entry — the nav label comes from the labs namespace.
    [SettingsTabs.Labs]: t('labs:title'),
    [SettingsTabs.Memory]: t('setting:tab.memory'),
    [SettingsTabs.Messenger]: t('setting:tab.messenger'),
    [SettingsTabs.Notification]: t('setting:tab.notification'),
    [SettingsTabs.Plans]: t('subscription:tab.plans'),
    [SettingsTabs.Profile]: t('auth:profile.title'),
    [SettingsTabs.Stats]: t('auth:tab.stats'),
    [SettingsTabs.Storage]: t('setting:tab.storage'),
  };

  useSettingsAnchorScroll();

  // Retirement is handled here, apart from the render path below: a withdrawn
  // tab that names a live equivalent moves there, and one that names none
  // (`llm`) stays a dead end. `escape: true` keeps the user in personal context
  // even when a workspace happens to be active.
  const redirectTo = activeTab
    ? resolveSettingsCapability(activeTab, capabilityContext).redirectTo
    : undefined;

  useEffect(() => {
    if (redirectTo) {
      navigate(`/settings/${redirectTo}`, { escape: true, replace: true });
    }
  }, [navigate, redirectTo]);

  const renderComponent = (tab: string) => {
    const Component = componentMap[tab as keyof typeof componentMap];
    // A tab the registry calls `enabled` without a component is a wiring bug,
    // not a page — say so instead of rendering an empty pane.
    if (!Component) return <NotFound />;

    const componentProps: { mobile?: boolean; showSettingHeader?: boolean } = {};
    if (COMPACT_HEADER_TABS.includes(tab as (typeof COMPACT_HEADER_TABS)[number])) {
      componentProps.showSettingHeader = false;
    }
    if (
      [
        SettingsTabs.About,
        SettingsTabs.Profile,
        SettingsTabs.Stats,
        SettingsTabs.Usage,
        SettingsTabs.Creds,
        SettingsTabs.Security,
        ...(enableBusinessFeatures
          ? [SettingsTabs.Plans, SettingsTabs.Credits, SettingsTabs.Billing]
          : []),
      ].includes(tab as any)
    ) {
      componentProps.mobile = mobile;
    }

    return <Component {...componentProps} />;
  };

  if (redirectTo) return null;

  if (activeTab && !isSettingsTabAvailable(activeTab, capabilityContext)) {
    // Unknown ids, withdrawn surfaces, and tabs whose gate is closed in this
    // deployment all answer the same way. Substituting `appearance` here is what
    // used to let `/settings/llm` (or a typo) open a page it does not own —
    // mounting that page's component and firing its queries on the way.
    return <NotFound />;
  }

  if (mobile) {
    return activeTab ? renderComponent(activeTab) : renderComponent(SettingsTabs.Profile);
  }

  if (!activeTab) return null;

  const content = renderComponent(activeTab);
  if (FULL_WIDTH_TABS.includes(activeTab)) return <Fragment key={activeTab}>{content}</Fragment>;

  const compactHeaderTitle = compactHeaderTitles[activeTab as SettingsTabs];
  const compactHeaderExtra = activeTab === SettingsTabs.Memory ? <ManageMemoryButton /> : undefined;

  return (
    <Fragment key={activeTab}>
      <NavHeader
        right={compactHeaderExtra}
        styles={compactHeaderTitle ? { center: { alignItems: 'center' } } : undefined}
      >
        {compactHeaderTitle && <Text weight={500}>{compactHeaderTitle}</Text>}
      </NavHeader>
      <SettingContainer maxWidth={1024} paddingBlock={'24px 128px'} paddingInline={24}>
        {content}
      </SettingContainer>
    </Fragment>
  );
};

export default SettingsContent;
