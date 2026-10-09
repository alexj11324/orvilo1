'use client';

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
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarNavItem from '@/features/NavPanel/components/SidebarNavItem';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import type { NativeContextMenuItem } from '@/libs/contextMenu/types';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { openCustomizeSidebarModal } from './CustomizeSidebarModal';
import SectionHeader from './SectionHeader';

interface WorkspaceSectionProps {
  itemKey: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

/** Workspace section of the fixed IA: Projects / Views / More. */
const WorkspaceSection = memo<WorkspaceSectionProps>(({ itemKey, open = true, onOpenChange }) => {
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
    return items as SidebarMenuItems;
  }, [t, hiddenSections, itemKey, updateSystemStatus]);

  const moreMenu = useMemo(
    () =>
      [
        // Linear's More menu opens with a non-interactive "Showing all items"
        // group header over Members / Teams / Customize sidebar.
        {
          children: [
            {
              icon: <Users />,
              key: 'members',
              label: t('navPanel.members'),
              onClick: () => navigate('/members'),
            },
            {
              icon: <Layers />,
              key: 'teams',
              label: t('tab.teams'),
              onClick: () => navigate('/teams'),
            },
            {
              icon: <SlidersHorizontalIcon />,
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
          icon: <BotIcon />,
          key: 'agents',
          label: t('agentViewAll.title'),
          onClick: () => navigate('/agents'),
        },
        {
          icon: <AlarmClock />,
          key: 'automations',
          label: t('tab.automations'),
          onClick: () => navigate('/automations'),
        },
        {
          icon: <LibraryBigIcon />,
          key: 'resource',
          label: t('tab.resource'),
          onClick: () => navigate('/resource'),
        },
        {
          icon: <Settings2 />,
          key: 'workspaceSettings',
          label: t('navPanel.workspaceSettings'),
          onClick: () => navigate('/settings'),
        },
      ] as SidebarMenuItems,
    [navigate, t],
  );

  const row = useCallback(
    (key: string, icon: LucideIcon, title: string, url: string) => (
      <SidebarNavItem
        active={tab === key}
        icon={icon}
        key={key}
        render={<WorkspaceLink to={url} />}
        title={title}
      />
    ),
    [tab],
  );

  return (
    <Collapsible
      open={open}
      render={<SidebarGroup className="group/section group-data-[collapsible=icon]:hidden" />}
      onOpenChange={(next) => onOpenChange?.(next)}
    >
      <SectionHeader
        contextMenu={contextMenu}
        moreLabel={t('navPanel.more')}
        moreMenu={contextMenu}
      >
        {t('navPanel.workspace')}
      </SectionHeader>
      <CollapsibleContent render={<SidebarGroupContent />}>
        <SidebarMenu className="gap-0.25">
          {row('project', PROJECT_ENTITY_ICON, t('navPanel.projects'), '/projects')}
          {row('views', LayoutList, t('tab.views'), '/views')}
          {/* Linear renders "More" as a row — it opens a menu headed by
              "Showing all items" (Members / Teams / Customize sidebar),
              then the retired surfaces (Automations / Resource / workspace
              settings) behind a divider. */}
          <SidebarMenuItem>
            <SidebarDropdownMenu items={moreMenu}>
              <SidebarMenuButton tooltip={t('navPanel.more')}>
                <MoreHorizontalIcon />
                <span>{t('navPanel.more')}</span>
              </SidebarMenuButton>
            </SidebarDropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </CollapsibleContent>
    </Collapsible>
  );
});

export default WorkspaceSection;
