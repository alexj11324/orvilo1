'use client';

import type { MenuProps } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import {
  EyeOffIcon,
  House,
  InboxIcon,
  Layers,
  ListChecksIcon,
  MoreHorizontalIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';
import SidebarCollapseIcon from '@/features/NavPanel/components/SidebarCollapseIcon';
import SidebarContextMenu from '@/features/NavPanel/components/SidebarContextMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarNavItem from '@/features/NavPanel/components/SidebarNavItem';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import TeamIdentity from '@/features/WorkTeams/TeamIdentity';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { usePathname, useSearchParams } from '@/libs/router/navigation';
import { lambdaClient } from '@/libs/trpc/client';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { teamAccordionKey, useTeamSubNav } from '../hooks/useTeamSubNav';
import { openCustomizeSidebarModal } from './CustomizeSidebarModal';
import { buildTeamMenuEntries } from './teamMenu';
import { useWorkFavoriteToggle } from './useWorkFavoriteToggle';

/** Linear's per-team sub-navigation. Every entry lands on a real surface of
 * the team page — the `tab` query selects which section renders. */
const TEAM_SUB_ITEMS = [
  { icon: House, key: 'home', tab: 'home', titleKey: 'teams.subNav.home' },
  { icon: InboxIcon, key: 'triage', tab: 'triage', titleKey: 'teams.subNav.triage' },
  { icon: ListChecksIcon, key: 'issues', tab: 'issues', titleKey: 'teams.subNav.issues' },
  {
    icon: PROJECT_ENTITY_ICON,
    key: 'projects',
    tab: 'projects',
    titleKey: 'teams.subNav.projects',
  },
  { icon: Layers, key: 'views', tab: 'views', titleKey: 'teams.subNav.views' },
] as const;

interface TeamsSectionProps {
  itemKey: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

/** Row of `team.teams` as consumed by the sidebar (joined flag included). */
type SidebarTeam = NonNullable<
  Awaited<ReturnType<typeof lambdaClient.team.teams.query>>['data']
>[number];

interface TeamItemProps {
  /** Tab of the team page currently shown — `null` when the user is elsewhere. */
  activeTab: string | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  team: SidebarTeam;
}

/**
 * One expandable team row inside "Your teams". Linear shows a team-menu icon
 * on the row — every entry offered here is backed by a real surface: pin/unpin
 * goes through the favorites API (the pinned team then renders under
 * Favorites), copy link writes the workspace-aware team URL.
 */
const TeamItem = memo<TeamItemProps>(({ team, activeTab, open, onOpenChange }) => {
  const { t } = useTranslation('common');
  const { state: sidebarState } = useSidebar();
  const workspaceSlug = useActiveWorkspaceSlug();
  const appOrigin = useAppOrigin();
  const { pinned, toggle } = useWorkFavoriteToggle('team', team.id);

  const copyLink = useCallback(async () => {
    try {
      const href = buildWorkspaceAwarePath(`/teams/${team.id}`, workspaceSlug);
      await navigator.clipboard.writeText(`${appOrigin}${href}`);
      toast.success(t('savedViews.linkCopied'));
    } catch {
      toast.error(t('savedViews.linkCopyFailed'));
    }
  }, [appOrigin, t, team.id, workspaceSlug]);

  const menu = useMemo<MenuProps['items']>(
    () =>
      buildTeamMenuEntries(pinned).map((entry) => ({
        icon: <entry.icon size={14} />,
        key: entry.key,
        label: t(entry.labelKey),
        onClick: entry.key === 'favorite' ? () => void toggle() : () => void copyLink(),
      })),
    [copyLink, pinned, t, toggle],
  );
  const subItems = TEAM_SUB_ITEMS.filter(
    (sub) => sub.key !== 'triage' || team.orchestrationPolicy?.triageEnabled !== false,
  );
  const pathFor = (subTab: string) =>
    subTab === 'home' ? `/teams/${team.id}` : `/teams/${team.id}?tab=${subTab}`;

  return sidebarState === 'collapsed' ? (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<SidebarMenuButton aria-label={team.name} tooltip={team.name} />}
        >
          <TeamIdentity
            color={team.color}
            id={team.id}
            letter={(team.key || team.name).slice(0, 1)}
          />
          <span>{team.name}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48" side="right" sideOffset={8}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>{team.name}</DropdownMenuLabel>
            {subItems.map((sub) => (
              <DropdownMenuItem
                key={sub.key}
                render={<WorkspaceLink style={{ color: 'inherit' }} to={pathFor(sub.tab)} />}
              >
                {t(sub.titleKey)}
              </DropdownMenuItem>
            ))}
            {buildTeamMenuEntries(pinned).map((entry) => (
              <DropdownMenuItem
                key={entry.key}
                onClick={entry.key === 'favorite' ? () => void toggle() : () => void copyLink()}
              >
                <entry.icon aria-hidden="true" />
                {t(entry.labelKey)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  ) : (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-controls={`team-subnav-${team.id}`}
        aria-expanded={open}
        className="gap-1.5"
        tooltip={team.name}
        onClick={() => onOpenChange(!open)}
      >
        <TeamIdentity
          color={team.color}
          id={team.id}
          letter={(team.key || team.name).slice(0, 1)}
        />
        <span className="truncate">{team.name}</span>
        <SidebarCollapseIcon open={open} />
      </SidebarMenuButton>
      <SidebarDropdownMenu items={menu}>
        <SidebarMenuAction showOnHover aria-label={t('teams.menu')}>
          <MoreHorizontalIcon />
        </SidebarMenuAction>
      </SidebarDropdownMenu>
      {open && (
        <SidebarMenuSub id={`team-subnav-${team.id}`}>
          {subItems.map((sub) => (
            <SidebarMenuSubItem key={sub.key}>
              <SidebarMenuSubButton
                isActive={activeTab === sub.tab}
                render={<WorkspaceLink style={{ color: 'inherit' }} to={pathFor(sub.tab)} />}
              >
                <sub.icon aria-hidden="true" />
                <span>{t(sub.titleKey)}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
});

TeamItem.displayName = 'TeamItem';

/**
 * "Your teams" group of the fixed IA. Each readable team is an expandable row
 * (Linear's Your teams): the whole team row toggles its sub-navigation and
 * its Home child navigates to the team page. The sub-navigation starts OPEN — the only
 * state worth persisting is the team the user folded away.
 */
const TeamsSection = memo<TeamsSectionProps>(({ itemKey, open = true, onOpenChange }) => {
  const { t } = useTranslation('common');
  const { state: sidebarState } = useSidebar();
  const tab = useActiveTabKey();
  const pathname = usePathname();
  const [searchParams] = useSearchParams();
  const navigate = useWorkspaceAwareNavigate();
  const activeWorkspaceId = useActiveWorkspaceId();
  const hiddenSections = useGlobalStore(
    systemStatusSelectors.hiddenSidebarSections(activeWorkspaceId),
  );
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  const userId = useUserStore(userProfileSelectors.userId);

  const { data } = useSWR(
    activeWorkspaceId && userId ? ['sidebar-teams', userId, activeWorkspaceId] : null,
    () => lambdaClient.team.teams.query(),
    {
      revalidateOnFocus: false,
    },
  );
  // "Your teams" lists JOINED teams only — readable-but-unjoined public
  // teams stay discoverable on /teams (the directory surface), not here.
  const teams = useMemo(() => (data?.data ?? []).filter((team) => team.joined === true), [data]);
  const teamKeys = useMemo(() => teams.map((team) => teamAccordionKey(team.id)), [teams]);
  const { expandedTeamKeys, setExpandedTeamKeys } = useTeamSubNav(teamKeys);

  const contextMenu = useMemo(() => {
    const items: NativeContextMenuItem[] = [
      {
        icon: <EyeOffIcon />,
        key: 'hideSection',
        label: t('navPanel.hideSection'),
        onClick: () => updateSystemStatus({ hiddenSidebarSections: [...hiddenSections, itemKey] }),
        sfSymbol: 'eye.slash',
      },
      { type: 'divider' as const },
      {
        icon: <SlidersHorizontalIcon />,
        key: 'customizeSidebar',
        label: t('navPanel.customizeSidebar'),
        onClick: () => openCustomizeSidebarModal(),
        sfSymbol: 'gearshape',
      },
    ];
    return items as MenuProps['items'];
  }, [t, hiddenSections, itemKey, updateSystemStatus]);

  const sectionMenu = useMemo<MenuProps['items']>(
    () => [
      {
        icon: <Layers />,
        key: 'viewAllTeams',
        label: t('navPanel.viewAllTeams'),
        onClick: () => navigate('/teams'),
      },
      { type: 'divider' },
      ...(contextMenu ?? []),
    ],
    [contextMenu, navigate, t],
  );

  const activeTeamTab = useCallback(
    (teamId: string) => {
      const base = pathname.replace(/\/+$/, '');
      if (!base.endsWith(`/teams/${teamId}`)) return null;
      return searchParams.get('tab') ?? 'home';
    },
    [pathname, searchParams],
  );

  // No personal mode: the section shell always renders — before the default
  // workspace has been provisioned (activeWorkspaceId still null) it shows
  // the single "Teams" row that deep-links to /teams.
  return (
    <SidebarGroup className="group/section">
      <SidebarContextMenu items={contextMenu}>
        <SidebarGroupLabel
          className="focus-visible:ring-sidebar-ring w-full cursor-pointer gap-0.5 whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none group-data-[collapsible=icon]:hidden"
          render={
            <button
              aria-controls={`sidebar-section-${itemKey}`}
              aria-expanded={open}
              onClick={() => onOpenChange?.(!open)}
            />
          }
        >
          {t('navPanel.yourTeams')}
          <SidebarCollapseIcon open={open} />
        </SidebarGroupLabel>
      </SidebarContextMenu>
      <SidebarDropdownMenu items={sectionMenu}>
        <SidebarGroupAction
          aria-label={t('navPanel.more')}
          className="opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100"
        >
          <MoreHorizontalIcon />
        </SidebarGroupAction>
      </SidebarDropdownMenu>
      {(open || sidebarState === 'collapsed') && (
        <SidebarGroupContent id={`sidebar-section-${itemKey}`}>
          <SidebarMenu className="gap-0.25">
            {teams.map((team) => {
              const key = teamAccordionKey(team.id);
              return (
                <TeamItem
                  activeTab={activeTeamTab(team.id)}
                  key={team.id}
                  open={expandedTeamKeys.includes(key)}
                  team={team}
                  onOpenChange={(next) =>
                    setExpandedTeamKeys(
                      next
                        ? [...expandedTeamKeys, key]
                        : expandedTeamKeys.filter((expanded) => expanded !== key),
                    )
                  }
                />
              );
            })}
            {teams.length === 0 && (
              <SidebarNavItem
                active={tab === 'teams'}
                icon={Layers}
                render={<WorkspaceLink to="/teams" />}
                title={t('tab.teams')}
              />
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
});

export default TeamsSection;
