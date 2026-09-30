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

/** Settings owns its categories; all other routes retain Orvilo's global navigation. */
export function NavMain() {
  const activeNavKey = useActiveNavKey();
  const isSettings = activeNavKey === 'settings' || activeNavKey === 'workspace-settings';
  const getContent = () =>
    isSettings ? getNavPanelRegistrySnapshot().get(activeNavKey)?.node : undefined;
  const content = useSyncExternalStore(subscribeNavPanelRegistry, getContent, getContent);

  return isSettings ? (
    (content ?? <NavSideBarSkeleton {...NAV_SKELETON_SHAPES[activeNavKey]} />)
  ) : (
    <Body />
  );
}
