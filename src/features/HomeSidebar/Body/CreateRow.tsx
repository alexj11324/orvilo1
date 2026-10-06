'use client';

import { LayersIcon, PlusIcon, SquarePenIcon, TargetIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { createGoalModal } from '@/features/AgentGoals/CreateGoalModal';
import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import { useCreateMenuItems } from '@/features/HomeSidebar/hooks';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { openCreateProjectModal } from '@/features/Projects/CreateProjectModal';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import NewViewModal from '@/features/SavedViews/NewViewModal';

const CreateRow = memo(() => {
  const { t } = useTranslation(['common', 'project']);
  const { createTopLevelMenuItems } = useCreateMenuItems();
  const [creatingView, setCreatingView] = useState(false);

  const items = useMemo<SidebarMenuItems>(
    () => [
      ...createTopLevelMenuItems(),
      {
        icon: <SquarePenIcon />,
        key: 'task',
        label: t('navPanel.newTask'),
        onClick: () => createTaskModal(),
      },
      {
        icon: <TargetIcon />,
        key: 'goal',
        label: t('navPanel.newGoal'),
        onClick: () => createGoalModal(),
      },
      {
        icon: <PROJECT_ENTITY_ICON />,
        key: 'project',
        label: t('project:create.action'),
        onClick: () => openCreateProjectModal(),
      },
      {
        icon: <LayersIcon />,
        key: 'view',
        label: t('savedViews.newView'),
        onClick: () => setCreatingView(true),
      },
    ],
    [t, createTopLevelMenuItems],
  );

  return (
    <>
      <SidebarMenuItem>
        <SidebarDropdownMenu items={items}>
          <SidebarMenuButton aria-label={t('navPanel.create')} tooltip={t('navPanel.create')}>
            <PlusIcon />
          </SidebarMenuButton>
        </SidebarDropdownMenu>
      </SidebarMenuItem>
      <NewViewModal open={creatingView} onClose={() => setCreatingView(false)} />
    </>
  );
});

CreateRow.displayName = 'CreateRow';

export default CreateRow;
