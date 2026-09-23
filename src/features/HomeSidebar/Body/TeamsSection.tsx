'use client';

import type { MenuProps } from '@lobehub/ui';
import { ContextMenuTrigger, DropdownMenu, Flexbox, Icon } from '@lobehub/ui';
import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionRoot,
  accordionStyles,
  AccordionTrigger,
  ActionIcon,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import { createStaticStyles, cx } from 'antd-style';
import {
  ArrowRight,
  EyeOffIcon,
  FolderKanbanIcon,
  House,
  InboxIcon,
  Layers,
  ListChecksIcon,
  MoreHorizontalIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { memo, type MouseEvent, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import NavItem from '@/features/NavPanel/components/NavItem';
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

const styles = createStaticStyles(({ css }) => ({
  teamHeader: css`
    margin-inline: 8px;
  `,
  teamTrigger: css`
    height: 28px;
    padding-block: 0;
    padding-inline: 4px;
  `,
  teamName: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

/** Linear's per-team sub-navigation. Every entry lands on a real surface of
 * the team page — the `tab` query selects which section renders. */
const TEAM_SUB_ITEMS = [
  { icon: House, key: 'home', tab: 'home', titleKey: 'teams.subNav.home' },
  { icon: InboxIcon, key: 'triage', tab: 'triage', titleKey: 'teams.subNav.triage' },
  { icon: ListChecksIcon, key: 'issues', tab: 'issues', titleKey: 'teams.subNav.issues' },
  { icon: FolderKanbanIcon, key: 'projects', tab: 'projects', titleKey: 'teams.subNav.projects' },
  { icon: Layers, key: 'views', tab: 'views', titleKey: 'teams.subNav.views' },
] as const;

interface TeamsSectionProps {
  itemKey: string;
}

/** Row of `team.teams` as consumed by the sidebar (joined flag included). */
type SidebarTeam = NonNullable<
  Awaited<ReturnType<typeof lambdaClient.team.teams.query>>['data']
>[number];

interface TeamItemProps {
  /** Tab of the team page currently shown — `null` when the user is elsewhere. */
  activeTab: string | null;
  team: SidebarTeam;
}

/**
 * One expandable team row inside "Your teams". Linear shows a team-menu icon
 * on the row — every entry offered here is backed by a real surface: pin/unpin
 * goes through the favorites API (the pinned team then renders under
 * Favorites), copy link writes the workspace-aware team URL.
 */
const TeamItem = memo<TeamItemProps>(({ team, activeTab }) => {
  const { t } = useTranslation('common');
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
        icon: <Icon icon={entry.icon} size={14} />,
        key: entry.key,
        label: t(entry.labelKey),
        onClick: entry.key === 'favorite' ? () => void toggle() : () => void copyLink(),
      })),
    [copyLink, pinned, t, toggle],
  );

  return (
    <AccordionItem value={teamAccordionKey(team.id)}>
      <AccordionHeader className={styles.teamHeader}>
        <AccordionTrigger className={styles.teamTrigger}>
          <TeamIdentity
            color={team.color}
            id={team.id}
            letter={(team.key || team.name).slice(0, 1)}
          />
          <span className={styles.teamName}>{team.name}</span>
        </AccordionTrigger>
        <Flexbox
          horizontal
          align="center"
          gap={2}
          className={cx(
            'accordion-action',
            accordionStyles.action,
            accordionStyles.actionBorderless,
          )}
        >
          <DropdownMenu items={menu}>
            <ActionIcon icon={MoreHorizontalIcon} size={'small'} title={t('teams.menu')} />
          </DropdownMenu>
        </Flexbox>
      </AccordionHeader>
      <AccordionPanel>
        <Flexbox gap={1} paddingBlock={1} style={{ paddingInlineStart: 20 }}>
          {TEAM_SUB_ITEMS.filter(
            (sub) => sub.key !== 'triage' || team.orchestrationPolicy?.triageEnabled !== false,
          ).map((sub) => (
            <WorkspaceLink
              key={sub.key}
              to={sub.tab === 'home' ? `/teams/${team.id}` : `/teams/${team.id}?tab=${sub.tab}`}
            >
              <NavItem active={activeTab === sub.tab} icon={sub.icon} title={t(sub.titleKey)} />
            </WorkspaceLink>
          ))}
        </Flexbox>
      </AccordionPanel>
    </AccordionItem>
  );
});

TeamItem.displayName = 'TeamItem';

/**
 * "Your teams" group of the fixed IA. Each readable team is an expandable row
 * (Linear's Your teams): the whole team row toggles its sub-navigation and
 * its Home child navigates to the team page. The sub-navigation starts OPEN — the only
 * state worth persisting is the team the user folded away.
 */
const TeamsSection = memo<TeamsSectionProps>(({ itemKey }) => {
  const { t } = useTranslation('common');
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
        icon: <Icon icon={EyeOffIcon} />,
        key: 'hideSection',
        label: t('navPanel.hideSection'),
        onClick: () => updateSystemStatus({ hiddenSidebarSections: [...hiddenSections, itemKey] }),
        sfSymbol: 'eye.slash',
      },
      { type: 'divider' as const },
      {
        icon: <Icon icon={SlidersHorizontalIcon} />,
        key: 'customizeSidebar',
        label: t('navPanel.customizeSidebar'),
        onClick: () => openCustomizeSidebarModal(),
        sfSymbol: 'gearshape',
      },
    ];
    return items as MenuProps['items'];
  }, [t, hiddenSections, itemKey, updateSystemStatus]);

  const handleViewAll = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      navigate('/teams');
    },
    [navigate],
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
    <AccordionItem value={itemKey}>
      <ContextMenuTrigger items={contextMenu}>
        <AccordionHeader>
          <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
            <Text ellipsis fontSize={12} type={'secondary'} weight={500}>
              {t('navPanel.yourTeams')}
            </Text>
          </AccordionTrigger>
          <Flexbox
            horizontal
            align="center"
            gap={2}
            className={cx(
              'accordion-action',
              accordionStyles.action,
              accordionStyles.actionBorderless,
            )}
          >
            <ActionIcon
              icon={ArrowRight}
              size={'small'}
              title={t('navPanel.viewAllTeams')}
              onClick={handleViewAll}
            />
          </Flexbox>
        </AccordionHeader>
      </ContextMenuTrigger>
      <AccordionPanel>
        <AccordionRoot
          indicatorPlacement="start"
          style={{ gap: 1 }}
          value={expandedTeamKeys}
          onValueChange={setExpandedTeamKeys}
        >
          {teams.map((team) => (
            <TeamItem activeTab={activeTeamTab(team.id)} key={team.id} team={team} />
          ))}
        </AccordionRoot>
        {teams.length === 0 && (
          <WorkspaceLink to="/teams">
            <NavItem active={tab === 'teams'} icon={Layers} title={t('tab.teams')} />
          </WorkspaceLink>
        )}
      </AccordionPanel>
    </AccordionItem>
  );
});

export default TeamsSection;
