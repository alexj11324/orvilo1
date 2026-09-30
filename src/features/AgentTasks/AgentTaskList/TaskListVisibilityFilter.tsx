'use client';

import { ActionIcon } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { useTaskStore } from '@/store/task';
import { taskListSelectors } from '@/store/task/selectors';
import type { TaskListVisibilityFilter as Filter } from '@/store/task/slices/list/initialState';

import { renderMenuCheck } from '../features/menuExtra';
import { TASK_VISIBILITY_ICONS } from '../features/taskVisibilityLabel';

const FILTER_OPTIONS: Array<{ key: Filter; labelKey: string }> = [
  {
    key: 'private',
    labelKey: 'createTask.visibility.private',
  },
  {
    key: 'workspace',
    labelKey: 'createTask.visibility.workspace',
  },
  {
    key: 'all',
    labelKey: 'taskList.visibility.all',
  },
];

/**
 * Tasks page top-level visibility chip — narrows the (already ownership-
 * filtered) list to private / workspace-shared / all. Personal-mode users
 * don't see the chip; visibility filtering is meaningless without other
 * workspace members.
 */
const TaskListVisibilityFilter = memo(() => {
  const { t } = useTranslation('chat');
  const activeWorkspaceId = useActiveWorkspaceId();
  const visibility = useTaskStore(taskListSelectors.listVisibility);
  const setListVisibility = useTaskStore((s) => s.setListVisibility);
  const [open, setOpen] = useState(false);

  const currentOption = FILTER_OPTIONS.find((opt) => opt.key === visibility) ?? FILTER_OPTIONS[0];
  const CurrentIcon = TASK_VISIBILITY_ICONS[currentOption.key];

  if (!activeWorkspaceId) return null;

  const currentLabel = t(currentOption.labelKey as never);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <ActionIcon
            icon={CurrentIcon}
            size={DESKTOP_HEADER_ICON_SMALL_SIZE}
            style={{ borderRadius: 9999 }}
            title={`${t('taskList.visibility.label', { defaultValue: 'Visibility' })}: ${currentLabel}`}
          />
        }
      />
      <DropdownMenuContent align={'end'} className="min-w-40">
        {FILTER_OPTIONS.map((option) => {
          const OptionIcon = TASK_VISIBILITY_ICONS[option.key];
          return (
            <DropdownMenuItem
              key={option.key}
              onClick={(e) => {
                e.stopPropagation();
                setListVisibility(option.key);
              }}
            >
              <OptionIcon color={cssVar.colorTextSecondary} size={16} />
              <span className="flex-1">{t(option.labelKey as never)}</span>
              {renderMenuCheck(option.key === visibility)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

TaskListVisibilityFilter.displayName = 'TaskListVisibilityFilter';

export default TaskListVisibilityFilter;
