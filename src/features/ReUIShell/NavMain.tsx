'use client';

import { useSyncExternalStore } from 'react';

import Body from '@/features/HomeSidebar/Body';
import {
  NAV_SKELETON_SHAPES,
  NavSideBarSkeleton,
} from '@/features/NavPanel/components/SideBarSkeleton';
import {
  getNavPanelRegistrySnapshot,
  subscribeNavPanelRegistry,
} from '@/features/NavPanel/registry';
import { useActiveNavKey } from '@/features/NavPanel/useActiveNavKey';
import { SearchForm } from '@/features/ReUIShell/SearchForm';

/**
 * Single-column nav, Linear-style: when the active route registered its own
 * panel (agent topics, memory, group, resource, settings…), that panel fills
 * the sidebar column; routes without a panel keep the global navigation.
 */
export function NavMain() {
  const activeNavKey = useActiveNavKey();
  const getContent = () => getNavPanelRegistrySnapshot().get(activeNavKey)?.node;
  const content = useSyncExternalStore(subscribeNavPanelRegistry, getContent, getContent);

  if (content) return content;

  const isSettings = activeNavKey === 'settings' || activeNavKey === 'workspace-settings';
  if (isSettings) return <NavSideBarSkeleton {...NAV_SKELETON_SHAPES[activeNavKey]} />;

  return (
    <>
      <div className="py-2">
        <SearchForm />
      </div>
      <Body />
    </>
  );
}
