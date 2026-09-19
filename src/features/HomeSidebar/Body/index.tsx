'use client';

import type { MenuProps } from '@lobehub/ui';
import { DropdownMenu, Flexbox, Icon } from '@lobehub/ui';
import { AccordionRoot, ActionIcon, Text } from '@lobehub/ui/base-ui';
import { EyeOffIcon, MoreHorizontalIcon, SlidersHorizontalIcon } from 'lucide-react';
import type { Key, ReactElement } from 'react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import NavItem from '@/features/NavPanel/components/NavItem';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import type { NavItem as NavItemType } from '@/hooks/useNavLayout';
import { useNavLayout } from '@/hooks/useNavLayout';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { useSearchParams } from '@/libs/router/navigation';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { SIDEBAR_SPACER_ID } from '@/store/global/selectors/systemStatus';
import { useUserStore } from '@/store/user';
import { isModifierClick } from '@/utils/navigation';

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

const ACCORDION_KEYS = new Set<string>([GroupKey.Workspace, GroupKey.Favorites, GroupKey.Teams]);

/** Core links can never be hidden — the fixed IA keeps them always mounted. */
const CORE_KEYS = new Set<string>(['inbox', 'my-work', 'reviews', 'agent']);

/** Keys rendered in the header — must be excluded from the body to avoid duplicates
 * when migrating users whose persisted sidebarItems still include them. */
const HEADER_KEYS = new Set<string>(['home', 'search']);

const accordionComponents: Record<string, (key: string) => ReactElement> = {
  [GroupKey.Favorites]: (key) => <WorkFavorites itemKey={key} key={key} />,
  [GroupKey.Teams]: (key) => <TeamsSection itemKey={key} key={key} />,
  [GroupKey.Workspace]: (key) => <WorkspaceSection itemKey={key} key={key} />,
};

/** Exported for TeamsSection — each expanded `team:<id>` accordion shares
 * the same persisted `sidebarExpandedKeys` bucket. */
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
  const [searchParams] = useSearchParams();
  const navigate = useWorkspaceAwareNavigate();
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
    (key: string): MenuProps['items'] => {
      const items: NativeContextMenuItem[] = [
        // Core destinations are part of the fixed IA — no hide affordance.
        ...(CORE_KEYS.has(key)
          ? []
          : [
              {
                icon: <Icon icon={EyeOffIcon} />,
                key: 'hideSection' as const,
                label: t('navPanel.hideSection'),
                onClick: () => hideSection(key),
                sfSymbol: 'eye.slash' as const,
              },
              { type: 'divider' as const },
            ]),
        {
          icon: <Icon icon={SlidersHorizontalIcon} />,
          key: 'customizeSidebar',
          label: t('navPanel.customizeSidebar'),
          onClick: () => openCustomizeSidebarModal(),
          sfSymbol: 'gearshape',
        },
      ];
      return items as MenuProps['items'];
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
      // Your teams is a workspace concept — personal mode has no teams to list.
      if (k === GroupKey.Teams && !activeWorkspaceId) return false;
      return CORE_KEYS.has(k) || k === SIDEBAR_SPACER_ID || !hiddenSections.includes(k);
    },
    [hiddenSections, activeWorkspaceId],
  );

  const visibleKeys = useMemo(
    () => sidebarItems.filter((k) => !HEADER_KEYS.has(k) && isVisible(k)),
    [sidebarItems, isVisible],
  );

  const renderNavLink = useCallback(
    (key: string) => {
      const navItem = navLinkItems.get(key);
      if (!navItem || navItem.hidden) return null;
      // Reviews lives under /my-work?tab=review — resolve active against the
      // query so the two entries never light up together.
      const onReviewTab = tab === 'my-work' && searchParams.get('tab') === 'review';
      const active =
        key === 'reviews'
          ? onReviewTab
          : key === 'my-work'
            ? tab === 'my-work' && !onReviewTab
            : key === 'agent'
              ? tab === 'agent' || tab === 'agents'
              : tab === key;
      return (
        <WorkspaceLink
          key={key}
          to={navItem.url!}
          onClick={(e) => {
            if (isModifierClick(e)) return;
            e.preventDefault();
            navigate(navItem.url!);
          }}
        >
          <NavItem
            active={active}
            contextMenuItems={getContextMenuItems(key)}
            icon={navItem.icon}
            title={navItem.title}
            actions={
              <DropdownMenu items={getContextMenuItems(key)}>
                <ActionIcon icon={MoreHorizontalIcon} size={'small'} style={{ flex: 'none' }} />
              </DropdownMenu>
            }
            extra={
              key === 'inbox' && inboxUnreadCount > 0 ? (
                <Text fontSize={12} type={'secondary'}>
                  {inboxUnreadCount}
                </Text>
              ) : undefined
            }
          />
        </WorkspaceLink>
      );
    },
    [navLinkItems, tab, searchParams, getContextMenuItems, navigate, inboxUnreadCount],
  );

  const handleAccordionExpandedChange = useCallback(
    (accordionKeys: string[], expandedKeys: Key[]) => {
      updateSystemStatus({
        sidebarExpandedKeys: mergeSidebarExpandedKeys(
          sidebarExpandedKeys,
          accordionKeys,
          expandedKeys,
        ),
      });
    },
    [sidebarExpandedKeys, updateSystemStatus],
  );

  // Render the flat list in `sidebarItems` order: group consecutive accordion
  // items into an Accordion, interleave non-accordion keys as nav links, and
  // emit a flex spacer wherever the spacer sentinel appears.
  const content = useMemo(() => {
    const elements: ReactElement[] = [];
    let accGroup: { element: ReactElement; key: string }[] = [];

    const flushAccordion = () => {
      if (accGroup.length > 0) {
        const accordionKeys = accGroup.map((item) => item.key);

        elements.push(
          <AccordionRoot
            indicatorPlacement="inline"
            key={`acc-${elements.length}`}
            style={{ gap: 8 }}
            value={sidebarExpandedKeys}
            onValueChange={(keys) => handleAccordionExpandedChange(accordionKeys, keys as string[])}
          >
            {accGroup.map((item) => item.element)}
          </AccordionRoot>,
        );
        accGroup = [];
      }
    };

    for (const key of visibleKeys) {
      if (key === SIDEBAR_SPACER_ID) {
        flushAccordion();
        elements.push(
          <div
            aria-hidden
            data-sidebar-bottom-spacer
            key={`spacer-${elements.length}`}
            style={{ flex: '1 1 0', minHeight: 0 }}
          />,
        );
      } else if (ACCORDION_KEYS.has(key)) {
        const comp = accordionComponents[key]?.(key);
        if (comp) accGroup.push({ element: comp, key });
      } else {
        flushAccordion();
        const link = renderNavLink(key);
        if (link) elements.push(link);
      }
    }
    flushAccordion();

    return elements;
  }, [visibleKeys, renderNavLink, sidebarExpandedKeys, handleAccordionExpandedChange]);

  return (
    <Flexbox flex={1} gap={1} paddingInline={4} style={{ minHeight: '100%' }}>
      {content}
    </Flexbox>
  );
});

export default Body;
