'use client';

import type { MenuProps } from '@lobehub/ui';
import { ContextMenuTrigger, Flexbox, Icon } from '@lobehub/ui';
import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  accordionStyles,
  AccordionTrigger,
  ActionIcon,
  Text,
} from '@lobehub/ui/base-ui';
import { cx } from 'antd-style';
import { ArrowRight, EyeOffIcon, SlidersHorizontalIcon, UsersIcon } from 'lucide-react';
import { memo, type MouseEvent, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import NavItem from '@/features/NavPanel/components/NavItem';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { lambdaClient } from '@/libs/trpc/client';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { openCustomizeSidebarModal } from './CustomizeSidebarModal';

interface TeamsSectionProps {
  itemKey: string;
}

/**
 * "Your teams" group of the fixed IA. Renders the teams the caller can read;
 * each row deep-links into the team detail surface. Sub-navigation per team
 * (home / issues / projects / views) lands with the team sub-pages workstream —
 * until then a flat row keeps every entry a real destination.
 */
const TeamsSection = memo<TeamsSectionProps>(({ itemKey }) => {
  const { t } = useTranslation('common');
  const tab = useActiveTabKey();
  const navigate = useWorkspaceAwareNavigate();
  const activeWorkspaceId = useActiveWorkspaceId();
  const hiddenSections = useGlobalStore(
    systemStatusSelectors.hiddenSidebarSections(activeWorkspaceId),
  );
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  const { data } = useSWR('sidebar-teams', () => lambdaClient.team.teams.query(), {
    revalidateOnFocus: false,
  });
  const teams = data?.data ?? [];

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
        <Flexbox gap={1} paddingBlock={1}>
          {teams.map((team) => (
            <WorkspaceLink key={team.id} to={`/teams/${team.id}`}>
              <NavItem icon={UsersIcon} title={team.name} />
            </WorkspaceLink>
          ))}
          {teams.length === 0 && (
            <WorkspaceLink to="/teams">
              <NavItem active={tab === 'teams'} icon={UsersIcon} title={t('tab.teams')} />
            </WorkspaceLink>
          )}
        </Flexbox>
      </AccordionPanel>
    </AccordionItem>
  );
});

export default TeamsSection;
