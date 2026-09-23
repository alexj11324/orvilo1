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
import { useTaskCreateDrafts } from '@/features/TaskDrafts/taskCreateDrafts';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import type { NavItem as NavItemType } from '@/hooks/useNavLayout';
import { useNavLayout } from '@/hooks/useNavLayout';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { useClientDataSWR } from '@/libs/swr';
import { pullRequestKeys } from '@/libs/swr/keys';
import { pullRequestService } from '@/services/pullRequest';
import { taskDraftKeys, taskDraftService } from '@/services/taskDraft';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { SIDEBAR_SPACER_ID } from '@/store/global/selectors/systemStatus';
import { useUserStore } from '@/store/user';
import { isModifierClick } from '@/utils/navigation';

import { useInboxUnreadCount } from '../Header/components/useInboxUnreadCount';
import CreateRow from './CreateRow';
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

/** Core entries can never be hidden — the fixed IA keeps them always mounted.
 * `create` is the standalone quick-create row (Linear's `+`). */
const CORE_KEYS = new Set<string>(['inbox', 'my-work', 'reviews', 'agent', 'drafts', 'create']);

/** Keys rendered in the header — must be excluded from the body to avoid duplicates
 * when migrating users whose persisted sidebarItems still include them. */
const HEADER_KEYS = new Set<string>(['home', 'search']);

const accordionComponents: Record<string, (key: string) => ReactElement> = {
  [GroupKey.Favorites]: (key) => <WorkFavorites itemKey={key} key={key} />,
  [GroupKey.Teams]: (key) => <TeamsSection itemKey={key} key={key} />,
  [GroupKey.Workspace]: (key) => <WorkspaceSection itemKey={key} key={key} />,
};

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

  // Reviews badge = the pending for-me review count (Linear shows a count on
  // the Reviews row). Same SWR key as ReviewsPage, so it's one shared fetch;
  // a failed queue (GitHub not connected) just renders no badge.
  const reviewsQueue = useClientDataSWR(
    pullRequestKeys.queue(activeWorkspaceId, 'for-me'),
    () => pullRequestService.queue('for-me'),
    { revalidateOnFocus: false },
  );
  const reviewsPendingCount = reviewsQueue.data?.data.items?.length ?? 0;
  // Drafts badge = server-side comment drafts + local issue drafts (Linear
  // counts both kinds on the Drafts nav item).
  const commentDraftCount =
    useClientDataSWR(
      taskDraftKeys.count(activeWorkspaceId),
      () => taskDraftService.count(activeWorkspaceId),
      {
        revalidateOnFocus: true,
      },
    ).data?.data ?? 0;
  const issueDraftCount = useTaskCreateDrafts(activeWorkspaceId).length;
  const draftCount = commentDraftCount + issueDraftCount;

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
              ) : key === 'reviews' && reviewsPendingCount > 0 ? (
                <Text fontSize={12} type={'secondary'}>
                  {reviewsPendingCount}
                </Text>
              ) : key === 'drafts' && draftCount > 0 ? (
                <Text fontSize={12} type={'secondary'}>
                  {draftCount}
                </Text>
              ) : undefined
            }
          />
        </WorkspaceLink>
      );
    },
    [
      navLinkItems,
      tab,
      getContextMenuItems,
      navigate,
      inboxUnreadCount,
      reviewsPendingCount,
      draftCount,
    ],
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
      } else if (key === 'create') {
        flushAccordion();
        elements.push(<CreateRow key={key} />);
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
