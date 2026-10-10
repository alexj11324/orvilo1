'use client';

import { ChevronsUpDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { isDesktop } from '@/const/version';
import { isMacOS } from '@/utils/platform';

import { WorkspaceAvatar } from './WorkspaceAvatar';
import { WorkspaceMenuContent } from './WorkspaceMenuContent';

export function WorkspaceSwitcher({ children }: { children?: ReactNode }) {
  const { t } = useTranslation(['setting', 'common']);
  const { state } = useSidebar();
  const activeWorkspace = useActiveWorkspace();

  return (
    <>
      <SidebarMenu className="min-w-0 flex-1">
        <SidebarMenuItem>
          <DropdownMenu>
            <SidebarMenuButton
              aria-label={activeWorkspace?.name ?? t('common:reuiShell9.openWorkspaceMenu')}
              className="h-9 px-1.5 data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              render={<DropdownMenuTrigger />}
              size="lg"
              tooltip={activeWorkspace?.name}
            >
              {activeWorkspace ? (
                <>
                  <WorkspaceAvatar className="size-6" workspace={activeWorkspace} />
                  <span className="flex-1 truncate text-sm font-medium text-sidebar-foreground">
                    {activeWorkspace.name}
                  </span>
                </>
              ) : (
                <>
                  <Skeleton className="size-6 shrink-0 rounded-md" />
                  <Skeleton className="h-4 min-w-0 flex-1" />
                </>
              )}
              <ChevronsUpDownIcon
                aria-hidden
                className="ml-auto shrink-0 text-muted-foreground"
                data-sidebar-affordance=""
              />
            </SidebarMenuButton>
            <WorkspaceMenuContent />
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      {children}
      {state === 'expanded' && !(isDesktop && isMacOS()) && (
        <SidebarTrigger aria-label={t('common:reuiShell9.collapseSidebar')} />
      )}
    </>
  );
}
