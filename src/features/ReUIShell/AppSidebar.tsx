'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import { useActiveNavKey } from '@/features/NavPanel/useActiveNavKey';

import { NavMain } from './NavMain';
import { NotificationsPopover } from './NotificationsPopover';
import { SettingsSignOut } from './SettingsSignOut';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

const SETTINGS_NAV_KEYS = new Set(['settings', 'workspace-settings']);

export function AppSidebar() {
  const { isMobile, state } = useSidebar();
  const activeNavKey = useActiveNavKey();
  // Settings surfaces carry no shell header — their nav panel starts with a
  // back row instead, and the account menu that lives in the switcher is out of
  // reach there, so a one-row footer keeps sign-out available. The collapsed icon
  // rail renders global navigation, so it keeps the switcher header on every surface.
  const hideSwitcherHeader =
    SETTINGS_NAV_KEYS.has(activeNavKey) && (isMobile || state !== 'collapsed');

  return (
    <>
      <Sidebar collapsible="icon" variant="inset">
        {!hideSwitcherHeader && (
          <SidebarHeader className="flex flex-row items-center justify-between in-data-[state=collapsed]:flex-col in-data-[state=collapsed]:items-start in-data-[state=collapsed]:justify-center">
            <WorkspaceSwitcher>
              <NotificationsPopover />
            </WorkspaceSwitcher>
          </SidebarHeader>
        )}
        <SidebarContent>
          <NavMain />
        </SidebarContent>
        {hideSwitcherHeader && (
          <SidebarFooter className="pb-2">
            <SettingsSignOut />
          </SidebarFooter>
        )}
      </Sidebar>
    </>
  );
}
