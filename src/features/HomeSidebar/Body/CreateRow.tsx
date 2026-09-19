'use client';

import type { MenuProps } from '@lobehub/ui';
import { DropdownMenu, Icon } from '@lobehub/ui';
import { FolderKanbanIcon, LayersIcon, PlusIcon, SquarePenIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import NavItem from '@/features/NavPanel/components/NavItem';
import { openCreateProjectModal } from '@/features/Projects/CreateProjectModal';
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
        icon: <Icon icon={SquarePenIcon} />,
        key: 'task',
        label: t('navPanel.newTask'),
        onClick: () => createTaskModal(),
      },
      {
        icon: <Icon icon={LayersIcon} />,
        key: 'view',
        label: t('savedViews.newView'),
        onClick: () => setCreatingView(true),
      },
      {
        icon: <Icon icon={FolderKanbanIcon} />,
        key: 'project',
        label: t('project:create.action'),
        onClick: () => openCreateProjectModal(),
      },
    ],
    [t],
  );

  return (
    <>
      <DropdownMenu items={items}>
        <div>
          <NavItem aria-label={t('navPanel.create')} icon={PlusIcon} title={null} />
        </div>
      </DropdownMenu>
      <NewViewModal open={creatingView} onClose={() => setCreatingView(false)} />
    </>
  );
});

CreateRow.displayName = 'CreateRow';

export default CreateRow;
