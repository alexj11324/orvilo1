'use client';

import { Fragment, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import NotFound from '@/components/404';
import {
  isSettingsTabAvailable,
  resolveSettingsCapability,
  resolveWorkspaceSettingsUrl,
} from '@/config/routes/settings';
import NavHeader from '@/features/NavHeader';
import SettingContainer from '@/features/Setting/SettingContainer';
import { getSettingsContentWidth } from '@/features/Setting/settingsWidth';
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
  SettingsTabs.Memory,
  SettingsTabs.Notification,
  SettingsTabs.Orchestrator,
  SettingsTabs.Plans,
  SettingsTabs.Profile,
  SettingsTabs.Referral,
  SettingsTabs.ServiceModel,
  SettingsTabs.Stats,
  SettingsTabs.Storage,
] as const;

/**
 * Opted-out pages must supply their own container: use SettingContainer for a
 * centered lane, or retain a dedicated container for a multi-pane surface.
 */
const FULL_WIDTH_TABS: readonly string[] = [
  // Agents hosts the full per-agent config surface (index list + the exiled
  // profile page) — it owns its layout end to end.
  SettingsTabs.Agents,
  SettingsTabs.Provider,
  SettingsTabs.Connector,
  SettingsTabs.Creds,
  SettingsTabs.Usage,
];

interface SettingsContentProps {
  activeTab?: string;
  mobile?: boolean;
}

const SettingsContent = ({ mobile, activeTab }: SettingsContentProps) => {
  const { t } = useTranslation(['auth', 'setting', 'subscription']);
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
    [SettingsTabs.Memory]: t('setting:tab.memory'),
    [SettingsTabs.Notification]: t('setting:tab.notification'),
    [SettingsTabs.Orchestrator]: t('setting:tab.orchestrator'),
    [SettingsTabs.Plans]: t('subscription:tab.plans'),
    [SettingsTabs.Profile]: t('auth:profile.title'),
    [SettingsTabs.Referral]: t('subscription:tab.referral'),
    [SettingsTabs.ServiceModel]: t('setting:tab.serviceModel'),
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

  const slug = useActiveWorkspaceSlug();
  // Devices, statistics and credentials have one page per workspace; the
  // personal URL only renders when there is no workspace to own it.
  const workspaceUrl = resolveWorkspaceSettingsUrl(activeTab, slug);

  useEffect(() => {
    if (workspaceUrl) navigate(workspaceUrl, { escape: true, replace: true });
  }, [navigate, workspaceUrl]);

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
        SettingsTabs.ServiceModel,
        SettingsTabs.Provider,
        SettingsTabs.Profile,
        SettingsTabs.Stats,
        SettingsTabs.Usage,
        SettingsTabs.Creds,
        ...(enableBusinessFeatures
          ? [SettingsTabs.Plans, SettingsTabs.Credits, SettingsTabs.Billing]
          : []),
      ].includes(tab as any)
    ) {
      componentProps.mobile = mobile;
    }

    return <Component {...componentProps} />;
  };

  if (redirectTo || workspaceUrl) return null;

  if (activeTab && !isSettingsTabAvailable(activeTab, capabilityContext)) {
    // Unknown ids, withdrawn surfaces, and tabs whose gate is closed in this
    // deployment all answer the same way. Substituting `appearance` here is what
    // used to let `/settings/llm` (or a typo) open a page it does not own —
    // mounting that page's component and firing its queries on the way.
    return <NotFound />;
  }

  if (mobile) {
    const tab = activeTab ?? SettingsTabs.Profile;
    const content = renderComponent(tab);
    if (FULL_WIDTH_TABS.includes(tab)) return content;
    return (
      <SettingContainer
        className="h-auto shrink-0"
        style={{ overflow: 'visible' }}
        width={getSettingsContentWidth(tab)}
      >
        {content}
      </SettingContainer>
    );
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
        {compactHeaderTitle && <span style={{ fontWeight: 500 }}>{compactHeaderTitle}</span>}
      </NavHeader>
      <SettingContainer
        paddingBlock={'24px 128px'}
        paddingInline={24}
        width={getSettingsContentWidth(activeTab)}
      >
        {content}
      </SettingContainer>
    </Fragment>
  );
};

export default SettingsContent;
