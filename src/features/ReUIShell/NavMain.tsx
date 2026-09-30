'use client';

import { Fragment, useSyncExternalStore } from 'react';

import { useSidebar } from '@/components/ui/sidebar';
import Body from '@/features/HomeSidebar/Body';
import {
  DEFAULT_NAV_SKELETON_SHAPE,
  NAV_SKELETON_SHAPES,
  NavSideBarSkeleton,
} from '@/features/NavPanel/components/SideBarSkeleton';
import {
  getNavPanelRegistrySnapshot,
  subscribeNavPanelRegistry,
} from '@/features/NavPanel/registry';
import { useActiveNavKey } from '@/features/NavPanel/useActiveNavKey';
import { SearchForm } from '@/features/ReUIShell/SearchForm';

// Keys that own a route panel — their portals register only after the lazy
// route chunk mounts, so a pending state must render the skeleton rather than
// flashing the global navigation first.
const PANEL_KEYS = new Set([
  'agent',
  'agent-docs',
  'group',
  'memory',
  'resource',
  'resourceLibrary',
  'settings',
  'workspace-settings',
]);

/**
 * Single-column nav, Linear-style: when the active route registered its own
 * panel (agent topics, memory, group, resource, settings…), that panel fills
 * the sidebar column; routes without a panel keep the global navigation.
 */
export function NavMain() {
  const activeNavKey = useActiveNavKey();
  const { state, isMobile } = useSidebar();
  const getContent = () => getNavPanelRegistrySnapshot().get(activeNavKey)?.node;
  const content = useSyncExternalStore(subscribeNavPanelRegistry, getContent, getContent);

  // Settings owns an icon-aware search/category rail and must stay mounted to
  // preserve its query. Other full-column panels use global navigation when
  // collapsed. Mobile drawers always have room for the full route panel.
  const collapsed = !isMobile && state === 'collapsed';
  const showRoutePanel = !collapsed || activeNavKey === 'settings';

  // Keyed by navKey: unkeyed reuse would let one panel's component state bleed
  // into the next panel when their trees share a component type.
  if (content && showRoutePanel) return <Fragment key={activeNavKey}>{content}</Fragment>;

  if (showRoutePanel && PANEL_KEYS.has(activeNavKey)) {
    return (
      <NavSideBarSkeleton {...(NAV_SKELETON_SHAPES[activeNavKey] ?? DEFAULT_NAV_SKELETON_SHAPE)} />
    );
  }

  return (
    <>
      <div className="py-2">
        <SearchForm />
      </div>
      <Body />
    </>
  );
}
