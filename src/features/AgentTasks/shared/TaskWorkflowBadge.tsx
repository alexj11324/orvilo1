'use client';

import { Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { Tag, Text } from '@lobehub/ui/base-ui';
import type { TaskWorkflowCategory } from '@orvilo/types';
import { cssVar } from 'antd-style';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { type StatusVisual, WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';

interface TaskWorkflowBadgeProps {
  executionStatus: string;
  workflowCategory?: TaskWorkflowCategory;
  workflowStateId?: string | null;
}

/**
 * The workflow state as a bare status glyph — what a task row or board card
 * draws in its one status slot (Linear shows a single status mark per row).
 * `undefined` when the task carries no provider workflow state, so the caller
 * falls back to the execution-status glyph.
 */
export const useTaskWorkflowGlyph = ({
  executionStatus,
  workflowCategory,
  workflowStateId,
}: TaskWorkflowBadgeProps): (StatusVisual & { label: ReactNode }) | undefined => {
  const { t } = useTranslation('chat');
  if (!workflowStateId || !workflowCategory) return undefined;

  const categoryLabel = t(`taskDetail.workflow.category.${workflowCategory}` as never);
  const deliveryPending = workflowCategory === 'done' && executionStatus !== 'completed';

  return {
    ...WORKFLOW_CATEGORY_VISUALS[workflowCategory],
    label: (
      <Flexbox gap={4} style={{ maxWidth: 320 }}>
        <Text fontSize={12} type={'secondary'}>
          {t('taskDetail.workflow.businessStatus')}: {categoryLabel}
        </Text>
        <Text fontSize={12} style={{ fontFamily: cssVar.fontFamilyCode }} type={'secondary'}>
          {workflowStateId}
        </Text>
        {deliveryPending && (
          <Text fontSize={12} type={'warning'}>
            {t('taskDetail.workflow.deliveryPendingHelp')}
          </Text>
        )}
      </Flexbox>
    ),
  };
};

/**
 * Provider business state as a labelled pill — for property panels, where the
 * state is a field value rather than a row's status mark.
 */
const TaskWorkflowBadge = memo<TaskWorkflowBadgeProps>((props) => {
  const { t } = useTranslation('chat');
  const glyph = useTaskWorkflowGlyph(props);
  const { executionStatus, workflowCategory } = props;
  if (!glyph || !workflowCategory) return null;

  const categoryLabel = t(`taskDetail.workflow.category.${workflowCategory}` as never);
  const label =
    workflowCategory === 'done' && executionStatus !== 'completed'
      ? t('taskDetail.workflow.doneDeliveryPending', { state: categoryLabel })
      : categoryLabel;

  return (
    <Tooltip title={glyph.label}>
      <Tag
        data-task-workflow-state={workflowCategory}
        icon={<Icon color={glyph.color} icon={glyph.icon} size={12} />}
        size={'small'}
        style={{ flexShrink: 0 }}
      >
        {label}
      </Tag>
    </Tooltip>
  );
});

TaskWorkflowBadge.displayName = 'TaskWorkflowBadge';

export default TaskWorkflowBadge;
