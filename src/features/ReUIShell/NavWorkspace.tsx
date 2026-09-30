'use client';

import { cn } from 'cn';
import {
  BookOpenIcon,
  CheckIcon,
  LogInIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PaletteIcon,
  SunIcon,
  UserIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useSwitchWorkspace } from '@/business/client/hooks/useSwitchWorkspace';
import { useWorkspaces } from '@/business/client/hooks/useWorkspaces';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
  useSidebar,
} from '@/components/ui/sidebar';
import { DOCUMENTS_REFER_URL } from '@/const/url';
import { renderSidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useMenu } from '@/features/User/UserPanel/useMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useSignOut } from '@/hooks/useSignOut';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { useUserStore } from '@/store/user';
import { authSelectors, userProfileSelectors } from '@/store/user/selectors';

const THEMES = [
  { icon: SunIcon, labelKey: 'settingCommon.themeMode.light', value: 'light' },
  { icon: MoonIcon, labelKey: 'settingCommon.themeMode.dark', value: 'dark' },
  { icon: MonitorIcon, labelKey: 'settingCommon.themeMode.auto', value: 'system' },
] as const;

function ThemeSegmentedToggle() {
  const { t } = useTranslation('setting');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (theme ?? 'system') : 'system';

  return (
    <div
      aria-label={t('settingCommon.themeMode.title')}
      className="inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5"
      role="radiogroup"
    >
      {THEMES.map(({ value, labelKey, icon: ThemeIcon }) => {
        const isActive = currentTheme === value;
        return (
          <Button
            aria-checked={isActive}
            aria-label={t(labelKey)}
            key={value}
            role="radio"
            size="icon-xs"
            type="button"
            variant="ghost"
            className={cn(
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTheme(value)}
          >
            <ThemeIcon aria-hidden className="size-3.5" />
          </Button>
        );
      })}
    </div>
  );
}

interface WorkspaceOption {
  avatar?: string | null;
  id: string | null;
  name: string;
}

const isImageAvatar = (avatar?: string | null) =>
  Boolean(avatar && (/^(?:data:|https?:|\/)/.test(avatar) || avatar.startsWith('blob:')));

function WorkspaceAvatar({
  workspace,
  className,
}: {
  className?: string;
  workspace: WorkspaceOption;
}) {
  return (
    <Avatar className={cn('shrink-0', className)}>
      {isImageAvatar(workspace.avatar) && (
        <AvatarImage alt={workspace.name} src={workspace.avatar ?? undefined} />
      )}
      <AvatarFallback className="border border-border bg-background text-sm font-medium text-foreground">
        {workspace.avatar && !isImageAvatar(workspace.avatar)
          ? workspace.avatar
          : workspace.name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function WorkspaceItem({
  workspace,
  isActive,
  onSelect,
}: {
  isActive: boolean;
  onSelect: (id: string | null) => void;
  workspace: WorkspaceOption;
}) {
  return (
    <DropdownMenuItem onClick={() => onSelect(workspace.id)}>
      <WorkspaceAvatar className="size-5!" workspace={workspace} />
      <span className="flex-1 truncate text-sm font-medium">{workspace.name}</span>
      {isActive && <CheckIcon aria-hidden className="ml-auto size-3.5 shrink-0 opacity-60" />}
    </DropdownMenuItem>
  );
}

export function NavWorkspace() {
  const { t } = useTranslation(['common', 'setting', 'auth']);
  const { isMobile } = useSidebar();
  const navigate = useWorkspaceAwareNavigate();
  const signOut = useSignOut();
  const userAvatar = useUserAvatar();
  const { mainItems } = useMenu();
  const workspaces = useWorkspaces();
  const activeWorkspaceId = useActiveWorkspaceId();
  const { switchToPersonal, switchWorkspace } = useSwitchWorkspace();
  const [displayName, isSignedIn, openLogin] = useUserStore((state) => [
    userProfileSelectors.displayUserName(state),
    authSelectors.isLoginWithAuth(state),
    state.openLogin,
  ]);
  const personalWorkspace: WorkspaceOption = {
    avatar: userAvatar,
    id: null,
    name: t('workspaceSwitcher.personal'),
  };
  const workspaceOptions: WorkspaceOption[] = [personalWorkspace, ...workspaces];
  const activeWorkspace =
    workspaceOptions.find((workspace) => workspace.id === activeWorkspaceId) ?? personalWorkspace;
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleWorkspaceSelect = (id: string | null) => {
    if (id) void switchWorkspace(id);
    else void switchToPersonal();
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                aria-label={t('reuiShell9.openWorkspaceMenu')}
                className="h-8"
                size="lg"
              />
            }
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 in-data-[state=collapsed]:justify-center">
              <Avatar className="size-7 shrink-0 rounded-md after:rounded-md in-data-[state=collapsed]:size-6!">
                {isImageAvatar(userAvatar) && (
                  <AvatarImage alt={displayName} className="rounded-md" src={userAvatar} />
                )}
                <AvatarFallback className="rounded-md text-[10px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col in-data-[state=collapsed]:hidden">
                <span className="truncate text-xs font-medium text-sidebar-foreground">
                  {displayName}
                </span>
                <span className="inline-flex items-center gap-1">
                  <WorkspaceAvatar className="size-3!" workspace={activeWorkspace} />
                  <span className="truncate text-[10px] text-[var(--sidebar-muted)]">
                    {activeWorkspace.name}
                  </span>
                </span>
              </div>
            </div>
            <MoreHorizontalIcon
              aria-hidden
              className="mr-1 ml-auto size-4 shrink-0 opacity-50 in-data-[state=collapsed]:hidden"
            />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-60"
            side={isMobile ? 'top' : 'right'}
            sideOffset={8}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t('reuiShell9.organizations')}
              </DropdownMenuLabel>
              {workspaceOptions.map((workspace) => (
                <WorkspaceItem
                  isActive={activeWorkspaceId === workspace.id}
                  key={workspace.id ?? 'personal'}
                  workspace={workspace}
                  onSelect={handleWorkspaceSelect}
                />
              ))}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t('reuiShell9.account')}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate('/settings/profile')}>
                <UserIcon aria-hidden />
                {t('userPanel.profile')}
              </DropdownMenuItem>
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
              {renderSidebarMenuItems(mainItems ?? [])}
              <DropdownMenuItem
                className="cursor-default focus:bg-transparent!"
                closeOnClick={false}
              >
                <PaletteIcon aria-hidden />
                {t('setting:settingCommon.themeMode.title')}
                <div className="ml-auto">
                  <ThemeSegmentedToggle />
                </div>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => (isSignedIn ? void signOut() : openLogin())}>
                {isSignedIn ? <LogOutIcon aria-hidden /> : <LogInIcon aria-hidden />}
                {isSignedIn ? t('auth:signout') : t('auth:login')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
