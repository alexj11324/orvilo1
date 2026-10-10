'use client';

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
import { useActiveNavKey } from '@/features/NavPanel/useActiveNavKey';

import { NavMain } from './NavMain';
import { NotificationsPopover } from './NotificationsPopover';
import { SettingsSignOut } from './SettingsSignOut';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export function AppSidebar() {
  const activeNavKey = useActiveNavKey();
  // Settings surfaces carry no shell header — their nav panel starts with a
  // back row instead, and the account menu that lives in the switcher is out of
  // reach there, so a one-row footer keeps sign-out available.
  const hideSwitcherHeader = activeNavKey === 'settings';

  return (
    <>
      {/* Collapsing hides the whole column (Linear-style); no icon rail remains. */}
      <Sidebar collapsible="offcanvas" variant="inset">
        {!hideSwitcherHeader && (
          <SidebarHeader className="flex flex-row items-center justify-between">
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
