'use client';

import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import { isDesktop } from '@/const/version';
import { isMacOS } from '@/utils/platform';

import { Logo } from './Logo';
import { NavMain } from './NavMain';
import { NavWorkspace } from './NavWorkspace';
import { NotificationsPopover } from './NotificationsPopover';
import { SearchForm } from './SearchForm';

function SidebarRailToggle() {
  const { t } = useTranslation('common');
  const { state, toggleSidebar } = useSidebar();
  const isExpanded = state === 'expanded';

  return (
    <button
      data-shell9-rail
      aria-label={t(isExpanded ? 'reuiShell9.collapseSidebar' : 'reuiShell9.expandSidebar')}
      type="button"
      className={cn(
        'group/rail fixed top-1/2 z-30 hidden h-12 w-4 -translate-y-1/2 cursor-pointer items-center pl-2 outline-none md:flex',
        'transition-[left] duration-200 ease-linear motion-reduce:transition-none',
      )}
      style={{
        left: isExpanded ? 'calc(var(--sidebar-width) - 16px)' : 'var(--sidebar-width-icon)',
      }}
      onClick={toggleSidebar}
    >
      <span className="flex flex-col items-center">
        <span
          aria-hidden="true"
          className={cn(
            'bg-foreground/40 block h-2 w-0.5',
            'rounded-t-full',
            'origin-bottom transition-all duration-100 ease-linear',
            isExpanded
              ? 'group-hover/rail:bg-foreground/60 group-hover/rail:rotate-40'
              : 'group-hover/rail:bg-foreground/60 group-hover/rail:-rotate-40',
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            'bg-foreground/40 block h-2 w-0.5',
            'rounded-b-full',
            'origin-top transition-all duration-100 ease-linear',
            isExpanded
              ? 'group-hover/rail:bg-foreground/60 group-hover/rail:-rotate-40'
              : 'group-hover/rail:bg-foreground/60 group-hover/rail:rotate-40',
          )}
        />
      </span>
      <span
        className={cn(
          'border-border bg-foreground text-background absolute left-full -ml-2 border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-xs shadow-black/5',
          'rounded-md',
          'pointer-events-none transition-all duration-200 ease-out',
          '-translate-x-0.5 opacity-0',
          'group-hover/rail:translate-x-0 group-hover/rail:opacity-100',
        )}
      >
        {t(isExpanded ? 'reuiShell9.collapse' : 'reuiShell9.expand')}
      </span>
    </button>
  );
}

export function AppSidebar() {
  return (
    <>
      <Sidebar
        className={isDesktop && isMacOS() ? undefined : 'dark'}
        collapsible="icon"
        variant="inset"
      >
        <SidebarHeader className="flex flex-row items-center justify-between in-data-[state=collapsed]:flex-col in-data-[state=collapsed]:items-start in-data-[state=collapsed]:justify-center">
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
      <SidebarRailToggle />
    </>
  );
}
