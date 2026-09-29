'use client';

import { Block, type DropdownItem, DropdownMenu, Icon, Tooltip } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { TaskStatus, TaskWorkflowCategory } from '@orvilo/types';
import { CheckIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  COLUMN_I18N_KEYS,
  COLUMN_STATUS_VISUAL,
  KANBAN_WORKFLOW_COLUMN_KEY,
} from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import { useTaskStore } from '@/store/task';

import { RAIL_VALUE_FONT_SIZE } from './railText';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import { WORKFLOW_STATUS_CHOICES } from './taskStatusRow';

interface TaskWorkflowStatusRowProps {
  category: TaskWorkflowCategory;
  disabled?: boolean;
  /** Orvilo's execution lifecycle — kept off the rail, named in the tooltip. */
  executionStatus?: TaskStatus;
  taskId: string;
}

/**
 * Linear's Status row: the workflow state's glyph and name, and a picker over
 * the board's columns. It writes `workflowCategory` through `updateTask`, the
 * same path a board drop takes (optimistic, rolled back with a retry toast).
 */
const TaskWorkflowStatusRow = memo<TaskWorkflowStatusRowProps>(
  ({ category, disabled, executionStatus, taskId }) => {
    const { t } = useTranslation('chat');
    const updateTask = useTaskStore((s) => s.updateTask);
    // The row reads the column the task buckets into on the board, so the
    // closed row, the open menu and the column headers never disagree.
    const columnKey = KANBAN_WORKFLOW_COLUMN_KEY[category];
    const visual = COLUMN_STATUS_VISUAL[columnKey];

    const items = useMemo<DropdownItem[]>(
      () =>
        WORKFLOW_STATUS_CHOICES.map((choice) => {
          const choiceVisual = COLUMN_STATUS_VISUAL[choice.columnKey];
          return {
            extra: choice.category === category ? <Icon icon={CheckIcon} size={14} /> : undefined,
            icon: <Icon color={choiceVisual.color} icon={choiceVisual.icon} size={16} />,
            key: choice.category,
            label: t(COLUMN_I18N_KEYS[choice.columnKey] as never),
            onClick: () => {
              if (choice.category !== category)
                void updateTask(taskId, { workflowCategory: choice.category });
            },
          };
        }),
      [category, t, taskId, updateTask],
    );

    const row = (
      <Tooltip
        title={
          executionStatus
            ? `${t('taskDetail.executionStatus')} · ${t(`taskDetail.status.${executionStatus}` as never)}`
            : undefined
        }
      >
        <Block
          horizontal
          align="center"
          className={styles.propertyItem}
          clickable={!disabled}
          data-task-workflow-state={category}
          gap={8}
          variant={'borderless'}
        >
          <Icon color={visual.color} icon={visual.icon} size={16} />
          <Text fontSize={RAIL_VALUE_FONT_SIZE} weight={500}>
            {t(COLUMN_I18N_KEYS[columnKey] as never)}
          </Text>
        </Block>
      </Tooltip>
    );

    // Picker outside, tooltip inside — the same nesting as the rail's
    // reviewer row, so each trigger owns its own element.
    return disabled ? (
      row
    ) : (
      <DropdownMenu items={items} placement={'bottomLeft'}>
        {row}
      </DropdownMenu>
    );
  },
);

TaskWorkflowStatusRow.displayName = 'TaskWorkflowStatusRow';

export default TaskWorkflowStatusRow;
