'use client';

import { useTranslation } from 'react-i18next';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { isDesktop } from '@/const/version';
import { isMacOS } from '@/utils/platform';

import { Logo } from './Logo';
import { NavMain } from './NavMain';
import { NavWorkspace } from './NavWorkspace';
import { NotificationsPopover } from './NotificationsPopover';
import { SearchForm } from './SearchForm';

export function AppSidebar() {
  const { t } = useTranslation('common');
  const { state } = useSidebar();

  return (
    <>
      <Sidebar
        className={isDesktop && isMacOS() ? undefined : 'dark'}
        collapsible="icon"
        variant="inset"
      >
        <SidebarHeader className="flex flex-row items-center justify-between in-data-[state=collapsed]:flex-col in-data-[state=collapsed]:items-start in-data-[state=collapsed]:justify-center">
          {!(isDesktop && isMacOS()) && (
            <SidebarTrigger
              aria-label={t(
                state === 'expanded' ? 'reuiShell9.collapseSidebar' : 'reuiShell9.expandSidebar',
              )}
            />
          )}
          <div className="inline-flex min-h-10 items-center gap-2 px-0.5 transition-all duration-200 ease-linear">
            <Logo />
            <span className="text-sm font-medium text-sidebar-foreground in-data-[state=collapsed]:hidden">
              Orvilo
            </span>
          </div>
          <div className="inline-flex items-center gap-0.5 in-data-[state=collapsed]:flex-col">
            <NotificationsPopover />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="py-2">
            <SearchForm />
          </div>
          <NavMain />
        </SidebarContent>
        <SidebarFooter className="pb-2">
          <NavWorkspace />
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
