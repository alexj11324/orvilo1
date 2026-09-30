'use client';

import type { MenuProps } from '@lobehub/ui';
import { LayersIcon, PlusIcon, SquarePenIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { openCreateProjectModal } from '@/features/Projects/CreateProjectModal';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import NewViewModal from '@/features/SavedViews/NewViewModal';

/**
 * Linear's standalone `+` row: opens the quick-create menu. Every action maps
 * to a real product surface — create-task modal, saved-view modal, and the
 * project create modal. There is no "new draft" entry on purpose: an issue
 * draft domain does not exist yet (v5/F38), so no fake entry is rendered.
 */
const CreateRow = memo(() => {
  const { t } = useTranslation(['common', 'project']);
  const [creatingView, setCreatingView] = useState(false);

  const items = useMemo<MenuProps['items']>(
    () => [
      {
        icon: <SquarePenIcon />,
        key: 'task',
        label: t('navPanel.newTask'),
        onClick: () => createTaskModal(),
      },
      {
        icon: <LayersIcon />,
        key: 'view',
        label: t('savedViews.newView'),
        onClick: () => setCreatingView(true),
      },
      {
        icon: <PROJECT_ENTITY_ICON />,
        key: 'project',
        label: t('project:create.action'),
        onClick: () => openCreateProjectModal(),
      },
    ],
    [t],
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
