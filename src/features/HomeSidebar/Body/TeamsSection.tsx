'use client';

import type { MenuProps } from '@lobehub/ui';
import { ContextMenuTrigger, Flexbox, Icon } from '@lobehub/ui';
import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionRoot,
  accordionStyles,
  AccordionTrigger,
  ActionIcon,
  Text,
} from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import {
  ArrowRight,
  EyeOffIcon,
  FolderKanbanIcon,
  House,
  InboxIcon,
  Layers,
  ListChecksIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { memo, type MouseEvent, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import NavItem from '@/features/NavPanel/components/NavItem';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { usePathname, useSearchParams } from '@/libs/router/navigation';
import { lambdaClient } from '@/libs/trpc/client';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { openCustomizeSidebarModal } from './CustomizeSidebarModal';
import { mergeSidebarExpandedKeys } from './index';

const styles = createStaticStyles(({ css }) => ({
  teamGlyph: css`
    flex: none;

    width: 16px;
    height: 16px;
    border-radius: 4px;

    font-size: 9px;
    font-weight: 600;
    line-height: 16px;
    color: ${cssVar.colorBgLayout};
    text-align: center;

    background: ${cssVar.colorTextTertiary};
  `,
  teamHeader: css`
    display: flex;
    align-items: center;
  `,
  teamLink: css`
    flex: 1;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  `,
  teamTrigger: css`
    flex: none;
    padding: 2px;
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

const teamAccordionKey = (teamId: string) => `team:${teamId}`;

interface TeamsSectionProps {
  itemKey: string;
}

/**
 * "Your teams" group of the fixed IA. Each readable team is an expandable row
 * (Linear's Your teams): the chevron toggles the sub-navigation, the name
 * deep-links to the team's home tab.
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
  const sidebarExpandedKeys = useGlobalStore(
    systemStatusSelectors.sidebarExpandedKeys(activeWorkspaceId),
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
  const expandedTeams = useMemo(
    () => teamKeys.filter((key) => sidebarExpandedKeys.includes(key)),
    [sidebarExpandedKeys, teamKeys],
  );

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

  const handleTeamsExpandedChange = useCallback(
    (keys: unknown) => {
      updateSystemStatus({
        sidebarExpandedKeys: mergeSidebarExpandedKeys(
          sidebarExpandedKeys,
          teamKeys,
          (keys as (string | number)[]).map(String),
        ),
      });
    },
    [sidebarExpandedKeys, teamKeys, updateSystemStatus],
  );

  const activeTeamTab = useCallback(
    (teamId: string) => {
      const base = pathname.replace(/\/+$/, '');
      if (!base.endsWith(`/teams/${teamId}`)) return null;
      return searchParams.get('tab') ?? 'home';
    },
    [pathname, searchParams],
  );

  if (!activeWorkspaceId) return null;

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
          value={expandedTeams}
          onValueChange={handleTeamsExpandedChange}
        >
          {teams.map((team) => {
            const activeTab = activeTeamTab(team.id);
            return (
              <AccordionItem key={team.id} value={teamAccordionKey(team.id)}>
                <AccordionHeader className={styles.teamHeader}>
                  <AccordionTrigger
                    aria-label={t('navPanel.yourTeams')}
                    className={styles.teamTrigger}
                  />
                  <WorkspaceLink className={styles.teamLink} to={`/teams/${team.id}`}>
                    <NavItem
                      active={tab === 'teams' && activeTab === 'home'}
                      icon={undefined}
                      title={team.name}
                      slots={{
                        titlePrefix: (
                          <span aria-hidden className={styles.teamGlyph}>
                            {(team.key || team.name).slice(0, 1).toUpperCase()}
                          </span>
                        ),
                      }}
                    />
                  </WorkspaceLink>
                </AccordionHeader>
                <AccordionPanel>
                  <Flexbox gap={1} paddingBlock={1} style={{ paddingInlineStart: 20 }}>
                    {TEAM_SUB_ITEMS.filter(
                      (sub) =>
                        sub.key !== 'triage' || team.orchestrationPolicy?.triageEnabled !== false,
                    ).map((sub) => (
                      <WorkspaceLink
                        key={sub.key}
                        to={
                          sub.tab === 'home'
                            ? `/teams/${team.id}`
                            : `/teams/${team.id}?tab=${sub.tab}`
                        }
                      >
                        <NavItem
                          active={activeTab === sub.tab}
                          icon={sub.icon}
                          title={t(sub.titleKey)}
                        />
                      </WorkspaceLink>
                    ))}
                  </Flexbox>
                </AccordionPanel>
              </AccordionItem>
            );
          })}
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
