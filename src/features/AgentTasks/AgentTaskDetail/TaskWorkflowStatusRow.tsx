'use client';

import { Block, type DropdownItem, DropdownMenu, Icon, Tooltip } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { TaskStatus, TaskWorkflowCategory } from '@orvilo/types';
import { CheckIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { useTaskStore } from '@/store/task';

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
    const visual = WORKFLOW_CATEGORY_VISUALS[category];

    const items = useMemo<DropdownItem[]>(
      () =>
        WORKFLOW_STATUS_CHOICES.map((choice) => {
          const choiceVisual = WORKFLOW_CATEGORY_VISUALS[choice];
          return {
            extra: choice === category ? <Icon icon={CheckIcon} size={14} /> : undefined,
            icon: <Icon color={choiceVisual.color} icon={choiceVisual.icon} size={16} />,
            key: choice,
            label: t(`taskDetail.workflow.category.${choice}` as never),
            onClick: () => {
              if (choice !== category) void updateTask(taskId, { workflowCategory: choice });
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
          <Text weight={500}>{t(`taskDetail.workflow.category.${category}` as never)}</Text>
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
