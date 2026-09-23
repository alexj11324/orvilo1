'use client';

import type { MenuProps } from '@lobehub/ui';
import { ContextMenuTrigger, DropdownMenu, Flexbox, Icon } from '@lobehub/ui';
import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Text,
} from '@lobehub/ui/base-ui';
import type { LucideIcon } from 'lucide-react';
import {
  AlarmClock,
  BotIcon,
  EyeOffIcon,
  Layers,
  LayoutList,
  LibraryBigIcon,
  MoreHorizontalIcon,
  Settings2,
  SlidersHorizontalIcon,
  Users,
} from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import NavItem from '@/features/NavPanel/components/NavItem';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { openCustomizeSidebarModal } from './CustomizeSidebarModal';

interface WorkspaceSectionProps {
  itemKey: string;
}

/** Workspace section of the fixed IA: Projects / Views / More. */
const WorkspaceSection = memo<WorkspaceSectionProps>(({ itemKey }) => {
  const { t } = useTranslation('common');
  const tab = useActiveTabKey();
  const navigate = useWorkspaceAwareNavigate();
  const activeWorkspaceId = useActiveWorkspaceId();
  const hiddenSections = useGlobalStore(
    systemStatusSelectors.hiddenSidebarSections(activeWorkspaceId),
  );
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

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

  const moreMenu = useMemo(
    () =>
      [
        // Linear's More menu opens with a non-interactive "Showing all items"
        // group header over Members / Teams / Customize sidebar.
        {
          children: [
            {
              icon: <Icon icon={Users} />,
              key: 'members',
              label: t('navPanel.members'),
              onClick: () => navigate('/members'),
            },
            {
              icon: <Icon icon={Layers} />,
              key: 'teams',
              label: t('tab.teams'),
              onClick: () => navigate('/teams'),
            },
            {
              icon: <Icon icon={SlidersHorizontalIcon} />,
              key: 'customizeSidebar',
              label: t('navPanel.customizeSidebar'),
              onClick: () => openCustomizeSidebarModal(),
            },
          ],
          key: 'showingAllItems',
          label: t('navPanel.showingAllItems'),
          type: 'group' as const,
        },
        { type: 'divider' as const },
        {
          icon: <Icon icon={BotIcon} />,
          key: 'agents',
          label: t('agentViewAll.title'),
          onClick: () => navigate('/agents'),
        },
        {
          icon: <Icon icon={AlarmClock} />,
          key: 'automations',
          label: t('tab.automations'),
          onClick: () => navigate('/automations'),
        },
        {
          icon: <Icon icon={LibraryBigIcon} />,
          key: 'resource',
          label: t('tab.resource'),
          onClick: () => navigate('/resource'),
        },
        {
          icon: <Icon icon={Settings2} />,
          key: 'workspaceSettings',
          label: t('navPanel.workspaceSettings'),
          onClick: () => navigate('/settings'),
        },
      ] as MenuProps['items'],
    [navigate, t],
  );

  const row = useCallback(
    (key: string, icon: LucideIcon, title: string, url: string) => (
      <WorkspaceLink key={key} to={url}>
        <NavItem active={tab === key} icon={icon} title={title} />
      </WorkspaceLink>
    ),
    [tab],
  );

  return (
    <AccordionItem value={itemKey}>
      <ContextMenuTrigger items={contextMenu}>
        <AccordionHeader>
          <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
            <Text ellipsis fontSize={12} type={'secondary'} weight={500}>
              {t('navPanel.workspace')}
            </Text>
          </AccordionTrigger>
        </AccordionHeader>
      </ContextMenuTrigger>
      <AccordionPanel>
        <Flexbox gap={1} paddingBlock={1}>
          {row('project', PROJECT_ENTITY_ICON, t('navPanel.projects'), '/projects')}
          {row('views', LayoutList, t('tab.views'), '/views')}
          {/* Linear renders "More" as a row — it opens a menu headed by
              "Showing all items" (Members / Teams / Customize sidebar),
              then the retired surfaces (Automations / Resource / workspace
              settings) behind a divider. */}
          <DropdownMenu items={moreMenu}>
            <div>
              <NavItem icon={MoreHorizontalIcon} title={t('navPanel.more')} />
            </div>
          </DropdownMenu>
        </Flexbox>
      </AccordionPanel>
    </AccordionItem>
  );
});

export default WorkspaceSection;
