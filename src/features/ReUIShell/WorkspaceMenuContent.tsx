'use client';

import {
  BookOpenIcon,
  CheckIcon,
  LogInIcon,
  LogOutIcon,
  PaletteIcon,
  PlusIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useSwitchWorkspace } from '@/business/client/hooks/useSwitchWorkspace';
import { useWorkspaces } from '@/business/client/hooks/useWorkspaces';
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { DOCUMENTS_REFER_URL } from '@/const/url';
import { renderSidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useMenu } from '@/features/User/UserPanel/useMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useSignOut } from '@/hooks/useSignOut';
import { useUserStore } from '@/store/user';
import { authSelectors, userProfileSelectors } from '@/store/user/selectors';

import { ThemeSegmentedToggle } from './ThemeSegmentedToggle';
import { groupUserMenuItems } from './userMenuGroups';
import { WorkspaceAvatar } from './WorkspaceAvatar';

/**
 * The single account/workspace menu of the sidebar header. Groups, top to bottom, in
 * Linear's order: workspace (settings, members, switch, create) | personal (account,
 * theme, data) | help | sign out.
 */
export function WorkspaceMenuContent() {
  const { t } = useTranslation(['common', 'setting', 'auth']);
  const navigate = useWorkspaceAwareNavigate();
  const signOut = useSignOut();
  const { mainItems } = useMenu();
  const workspaces = useWorkspaces();
  const activeWorkspaceId = useActiveWorkspaceId();
  const { switchWorkspace } = useSwitchWorkspace();
  const [displayName, isSignedIn, openLogin] = useUserStore((state) => [
    userProfileSelectors.displayUserName(state),
    authSelectors.isLoginWithAuth(state),
    state.openLogin,
  ]);
  const groups = groupUserMenuItems(mainItems);

  return (
    <DropdownMenuContent align="start" className="min-w-60" side="bottom" sideOffset={4}>
      {(groups.workspace.length > 0 || activeWorkspaceId) && (
        <>
          <DropdownMenuGroup>
            {renderSidebarMenuItems(groups.workspace)}
            {activeWorkspaceId && (
              <DropdownMenuItem onClick={() => navigate('/settings/members')}>
                <UsersIcon aria-hidden />
                {t('navPanel.members')}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </>
      )}

      <DropdownMenuGroup>
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t('common:workspaceSwitcher.label')}
        </DropdownMenuLabel>
        {workspaces.map((workspace) => (
          <DropdownMenuItem key={workspace.id} onClick={() => void switchWorkspace(workspace.id)}>
            <WorkspaceAvatar className="size-5!" workspace={workspace} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{workspace.name}</span>
              {typeof workspace.memberCount === 'number' && (
                <span className="truncate text-xs text-muted-foreground">
                  {t('workspaceSetting.switcher.memberCount', {
                    count: workspace.memberCount,
                    ns: 'setting',
                  })}
                </span>
              )}
            </span>
            {workspace.id === activeWorkspaceId && (
              <CheckIcon aria-hidden className="ml-auto size-3.5 shrink-0 opacity-60" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => navigate('/onboarding', { escape: true })}>
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-dashed border-border">
            <PlusIcon aria-hidden className="size-3.5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm">
              {t('workspaceSetting.switcher.newWorkspace', { ns: 'setting' })}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {t('workspaceSetting.switcher.newWorkspaceDesc', { ns: 'setting' })}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {displayName}
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => navigate('/settings/profile', { escape: true })}>
          <UserIcon aria-hidden />
          {t('userPanel.profile')}
        </DropdownMenuItem>
        {renderSidebarMenuItems(groups.personal)}
        <DropdownMenuItem className="cursor-default focus:bg-transparent!" closeOnClick={false}>
          <PaletteIcon aria-hidden />
          {t('setting:settingCommon.themeMode.title')}
          <div className="ml-auto">
            <ThemeSegmentedToggle />
          </div>
        </DropdownMenuItem>
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuItem
          render={
            <a
              className="text-inherit"
              href={DOCUMENTS_REFER_URL}
              rel="noopener noreferrer"
              target="_blank"
            />
          }
        >
          <BookOpenIcon aria-hidden />
          {t('userPanel.docs')}
        </DropdownMenuItem>
        {renderSidebarMenuItems(groups.help)}
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

      <DropdownMenuGroup>
        <DropdownMenuItem onClick={() => (isSignedIn ? void signOut() : openLogin())}>
          {isSignedIn ? <LogOutIcon aria-hidden /> : <LogInIcon aria-hidden />}
          {isSignedIn ? t('auth:signout') : t('auth:login')}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}
