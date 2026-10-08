'use client';

import { EyeOffIcon, MoreHorizontalIcon, SlidersHorizontalIcon } from 'lucide-react';
import type { Key, ReactElement } from 'react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuAction,
} from '@/components/ui/sidebar';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarNavItem from '@/features/NavPanel/components/SidebarNavItem';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import type { NavItem as NavItemType } from '@/hooks/useNavLayout';
import { useNavLayout } from '@/hooks/useNavLayout';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { SIDEBAR_SPACER_ID } from '@/store/global/selectors/systemStatus';
import { useUserStore } from '@/store/user';

import { useInboxUnreadCount } from '../Header/components/useInboxUnreadCount';
import { openCustomizeSidebarModal } from './CustomizeSidebarModal';
import TeamsSection from './TeamsSection';
import { useSyncWorkspaceSidebarPreference } from './useSyncWorkspaceSidebarPreference';
import WorkFavorites from './WorkFavorites';
import WorkspaceSection from './WorkspaceSection';

export enum GroupKey {
  Agent = 'agent',
  Favorites = 'favorites',
  Teams = 'teams',
  Workspace = 'workspace',
}

const SECTION_KEYS = new Set<string>([GroupKey.Workspace, GroupKey.Favorites, GroupKey.Teams]);

/** Core entries can never be hidden — the fixed IA keeps them always mounted. */
const CORE_KEYS = new Set<string>(['tasks', 'inbox', 'my-work', 'agent', 'group']);

/** Keys rendered in the header — must be excluded from the body to avoid duplicates
 * when migrating users whose persisted sidebarItems still include them. */
const HEADER_KEYS = new Set<string>(['home', 'search']);

/** Rewrite the group keys of `sidebarExpandedKeys` to exactly the accordions the
 * user left open. Keys outside `accordionKeys` pass through untouched — the
 * team sub-accordions keep their own bucket (`sidebarCollapsedKeys`, which
 * defaults to open) instead of sharing this one. */
export const mergeSidebarExpandedKeys = (
  currentKeys: string[],
  accordionKeys: string[],
  expandedKeys: Key[],
): string[] => {
  const nextExpandedKeys = new Set(expandedKeys.map(String));
  const accordionKeySet = new Set(accordionKeys);
  const nextKeys = currentKeys.filter((key) => !accordionKeySet.has(key));

  for (const key of accordionKeys) {
    if (nextExpandedKeys.has(key)) nextKeys.push(key);
  }

  return nextKeys;
};

const Body = memo(() => {
  const { t } = useTranslation('common');
  const tab = useActiveTabKey();
  const { topNavItems, bottomMenuItems } = useNavLayout();
  const activeWorkspaceId = useActiveWorkspaceId();
  // The section layout syncs per-member via the workspace user preference, so
  // load it alongside the sidebar.
  const useFetchWorkspaceUserPreference = useUserStore((s) => s.useFetchWorkspaceUserPreference);
  useFetchWorkspaceUserPreference();
  useSyncWorkspaceSidebarPreference(activeWorkspaceId);
  const sidebarItems = useGlobalStore(systemStatusSelectors.sidebarItems(activeWorkspaceId));
  const sidebarExpandedKeys = useGlobalStore(
    systemStatusSelectors.sidebarExpandedKeys(activeWorkspaceId),
  );
  const hiddenSections = useGlobalStore(
    systemStatusSelectors.hiddenSidebarSections(activeWorkspaceId),
  );
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const { unreadCount: inboxUnreadCount } = useInboxUnreadCount();

  const hideSection = useCallback(
    (key: string) => {
      updateSystemStatus({ hiddenSidebarSections: [...hiddenSections, key] });
    },
    [hiddenSections, updateSystemStatus],
  );

  const getContextMenuItems = useCallback(
    (key: string): SidebarMenuItems => {
      const items: NativeContextMenuItem[] = [
        // Core destinations are part of the fixed IA — no hide affordance.
        ...(CORE_KEYS.has(key)
          ? []
          : [
              {
                icon: <EyeOffIcon />,
                key: 'hideSection' as const,
                label: t('navPanel.hideSection'),
                onClick: () => hideSection(key),
                sfSymbol: 'eye.slash' as const,
              },
              { type: 'divider' as const },
            ]),
        {
          icon: <SlidersHorizontalIcon />,
          key: 'customizeSidebar',
          label: t('navPanel.customizeSidebar'),
          onClick: () => openCustomizeSidebarModal(),
          sfSymbol: 'gearshape',
        },
      ];
      return items as SidebarMenuItems;
    },
    [t, hideSection],
  );

  // Build a map of nav link items by key
  const navLinkItems = useMemo(() => {
    const map = new Map<string, NavItemType>();
    for (const item of topNavItems) map.set(item.key, item);
    for (const item of bottomMenuItems) map.set(item.key, item);
    return map;
  }, [topNavItems, bottomMenuItems]);

  // Items that must always be visible regardless of hiddenSections
  const isVisible = useCallback(
    (k: string) => {
      return CORE_KEYS.has(k) || k === SIDEBAR_SPACER_ID || !hiddenSections.includes(k);
    },
    [hiddenSections],
  );

  const visibleKeys = useMemo(
    () => sidebarItems.filter((k) => !HEADER_KEYS.has(k) && isVisible(k)),
    [sidebarItems, isVisible],
  );

  const renderNavLink = useCallback(
    (key: string) => {
      const navItem = navLinkItems.get(key);
      if (!navItem || navItem.hidden) return null;
      // The My issues key keeps resolving the legacy `/my-work` segment so the
      // entry stays lit while the route redirect runs; Reviews is its own page.
      const active =
        key === 'my-work'
          ? tab === 'my-issues' || tab === 'my-work'
          : key === 'agent'
            ? tab === 'agent' || tab === 'agents'
            : tab === key;
      return (
        <SidebarNavItem
          active={active}
          contextMenuItems={getContextMenuItems(key)}
          extra={key === 'inbox' ? inboxUnreadCount || undefined : undefined}
          icon={navItem.icon}
          key={key}
          render={<WorkspaceLink to={navItem.url!} />}
          title={navItem.title}
          actions={
            <SidebarDropdownMenu items={getContextMenuItems(key)}>
              <SidebarMenuAction showOnHover aria-label={t('navPanel.more')}>
                <MoreHorizontalIcon />
              </SidebarMenuAction>
            </SidebarDropdownMenu>
          }
        />
      );
    },
    [navLinkItems, tab, getContextMenuItems, inboxUnreadCount, t],
  );

  const handleSectionExpandedChange = useCallback(
    (key: string, open: boolean) => {
      updateSystemStatus({
        sidebarExpandedKeys: mergeSidebarExpandedKeys(
          sidebarExpandedKeys,
          [key],
          open ? [key] : [],
        ),
      });
    },
    [sidebarExpandedKeys, updateSystemStatus],
  );

  // Preserve the user's saved order while rendering Shell 9 groups and menus.
  const content = useMemo(() => {
    const elements: ReactElement[] = [];
    let rows: ReactElement[] = [];
    const flushRows = () => {
      if (!rows.length) return;
      elements.push(
        <SidebarGroup key={`nav-${elements.length}`}>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.25">{rows}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>,
      );
      rows = [];
    };

    for (const key of visibleKeys) {
      if (key === SIDEBAR_SPACER_ID) {
        flushRows();
        elements.push(
          <div
            aria-hidden
            data-sidebar-bottom-spacer
            key={`spacer-${elements.length}`}
            style={{ flex: '1 1 0', minHeight: 0 }}
          />,
        );
      } else if (SECTION_KEYS.has(key)) {
        flushRows();
        const open = sidebarExpandedKeys.includes(key);
        const onOpenChange = (next: boolean) => handleSectionExpandedChange(key, next);
        if (key === GroupKey.Workspace)
          elements.push(
            <WorkspaceSection itemKey={key} key={key} open={open} onOpenChange={onOpenChange} />,
          );
        if (key === GroupKey.Favorites)
          elements.push(
            <WorkFavorites itemKey={key} key={key} open={open} onOpenChange={onOpenChange} />,
          );
        if (key === GroupKey.Teams)
          elements.push(
            <TeamsSection itemKey={key} key={key} open={open} onOpenChange={onOpenChange} />,
          );
      } else {
        const link = renderNavLink(key);
        if (link) rows.push(link);
      }
    }
    flushRows();

    return elements;
  }, [visibleKeys, renderNavLink, sidebarExpandedKeys, handleSectionExpandedChange]);

  return (
    <div className="flex min-h-full flex-col" data-testid="sidebar-body">
      {content}
    </div>
  );
});

export default Body;
