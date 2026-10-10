'use client';

import { type FC, memo } from 'react';
import { Outlet, useMatch } from 'react-router';

import NavHeader from '@/features/NavHeader';
import { getSettingsContentWidth } from '@/features/Setting/settingsWidth';
import { useCategory } from '@/features/Settings/hooks/useCategory';
import SideBar from '@/features/Settings/Layout/SideBar';
import { RouteSkeletonChromeProvider } from '@/spa/router/routeSkeletonChrome';
import { WorkspaceSettingsTabs } from '@/types/workspaceSettings';

import Container from './Container';

const COMPACT_HEADER_TABS = new Set<string>([
  WorkspaceSettingsTabs.Billing,
  WorkspaceSettingsTabs.Budget,
  WorkspaceSettingsTabs.Creds,
  WorkspaceSettingsTabs.Credits,
  WorkspaceSettingsTabs.Devices,
  WorkspaceSettingsTabs.General,
  WorkspaceSettingsTabs.Integrations,
  WorkspaceSettingsTabs.Members,
  WorkspaceSettingsTabs.Plans,
  WorkspaceSettingsTabs.Stats,
  WorkspaceSettingsTabs.Usage,
]);

/**
 * Bare workspace settings shell — sidebar + outlet, no content padding.
 * The sidebar is the one settings sidebar: the workspace pages are a group in
 * it, not a second navigation.
 */
const WorkspaceSettingsLayout: FC = () => {
  return (
    <>
      <SideBar />
      <RouteSkeletonChromeProvider>
        <Outlet />
      </RouteSkeletonChromeProvider>
    </>
  );
};

/**
 * Standard workspace settings content layout. Compact-header tabs use the
 * shared navigation header above a centered, max-width content container;
 * other tabs keep the existing content-only wrapper.
 */
const WorkspaceSettingsContentLayout: FC = memo(() => {
  const categories = useCategory();
  const match = useMatch('/:workspaceSlug/settings/:tab/*');
  const activeTab = match?.params.tab;
  // The header repeats the label of the row that opened the page. Rows are
  // matched by URL: a row's key is its personal tab id, which can differ from
  // the workspace segment (`stats` vs `statistics`).
  const title = activeTab
    ? categories
        .flatMap((category) => category.items)
        .find((item) => item.href?.endsWith(`/settings/${activeTab}`))?.label
    : undefined;

  const content = (
    <Container
      paddingBlock={'24px 128px'}
      paddingInline={24}
      width={getSettingsContentWidth(activeTab)}
    >
      <Outlet />
    </Container>
  );

  if (!activeTab || !COMPACT_HEADER_TABS.has(activeTab)) return content;

  return (
    <>
      <NavHeader styles={{ center: { alignItems: 'center' } }}>
        {title && <span style={{ fontWeight: 500 }}>{title}</span>}
      </NavHeader>
      {content}
    </>
  );
});

WorkspaceSettingsContentLayout.displayName = 'WorkspaceSettingsContentLayout';

export { WorkspaceSettingsContentLayout };

export default WorkspaceSettingsLayout;
