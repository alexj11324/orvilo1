'use client';

import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useSwitchWorkspace } from '@/business/client/hooks/useSwitchWorkspace';
import { useWorkspaces } from '@/business/client/hooks/useWorkspaces';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { isDesktop } from '@/const/version';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { isMacOS } from '@/utils/platform';

import { WorkspaceAvatar } from './WorkspaceAvatar';

export function WorkspaceSwitcher({ children }: { children?: ReactNode }) {
  const { t } = useTranslation(['setting', 'common']);
  const { state } = useSidebar();
  const navigate = useWorkspaceAwareNavigate();
  const workspaces = useWorkspaces();
  const activeWorkspaceId = useActiveWorkspaceId();
  const activeWorkspace = useActiveWorkspace();
  const { switchWorkspace } = useSwitchWorkspace();

  return (
    <>
      <SidebarMenu className="min-w-0 flex-1">
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  aria-label={t('common:reuiShell9.openWorkspaceMenu')}
                  className="h-9 px-1.5"
                  size="lg"
                />
              }
            >
              {activeWorkspace ? (
                <>
                  <WorkspaceAvatar className="size-6 rounded-md" workspace={activeWorkspace} />
                  <span className="flex-1 truncate text-sm font-medium text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                    {activeWorkspace.name}
                  </span>
                </>
              ) : (
                <>
                  <Skeleton className="size-6 shrink-0 rounded-md" />
                  <Skeleton className="h-4 min-w-0 flex-1 group-data-[collapsible=icon]:hidden" />
                </>
              )}
              <ChevronsUpDownIcon
                aria-hidden
                className="ml-auto size-4 shrink-0 opacity-50 group-data-[collapsible=icon]:hidden"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56" side="bottom" sideOffset={4}>
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {t('common:workspaceSwitcher.label')}
                </DropdownMenuLabel>
                {workspaces.map((workspace) => (
                  <DropdownMenuItem
                    key={workspace.id}
                    onClick={() => void switchWorkspace(workspace.id)}
                  >
                    <WorkspaceAvatar className="size-5! rounded" workspace={workspace} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{workspace.name}</span>
                      {typeof workspace.memberCount === 'number' && (
                        <span className="truncate text-xs text-muted-foreground">
                          {t('workspaceSetting.switcher.memberCount', {
                            count: workspace.memberCount,
                          })}
                        </span>
                      )}
                    </span>
                    {workspace.id === activeWorkspaceId && (
                      <CheckIcon aria-hidden className="ml-auto size-3.5 shrink-0 opacity-60" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => navigate('/onboarding', { escape: true })}>
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-border border-dashed">
                    <PlusIcon aria-hidden className="size-3.5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">
                      {t('workspaceSetting.switcher.newWorkspace')}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {t('workspaceSetting.switcher.newWorkspaceDesc')}
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
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
