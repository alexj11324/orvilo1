'use client';

import type { TaskWorkflowCategory } from '@orvilo/types';
import { cssVar } from 'antd-style';
import type { ReactNode } from 'react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { type StatusVisual, WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { Badge as Tag } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TaskWorkflowBadgeProps {
  executionStatus: string;
  workflowCategory?: TaskWorkflowCategory;
  workflowStateId?: string | null;
}

/**
 * The Issue Status as a bare workflow glyph — what a task row or board card
 * draws in its one status slot (Linear shows a single status mark per row).
 * `workflowCategory` is the canonical Issue Status: every categorized task
 * renders its category mark, linked or not. `undefined` only when the task
 * has no category at all.
 */
export const useTaskWorkflowGlyph = ({
  executionStatus,
  workflowCategory,
  workflowStateId,
}: TaskWorkflowBadgeProps): (StatusVisual & { label: ReactNode }) | undefined => {
  const { t } = useTranslation('chat');
  if (!workflowCategory) return undefined;

  const categoryLabel = t(`taskDetail.workflow.category.${workflowCategory}` as never);
  const deliveryPending = workflowCategory === 'done' && executionStatus !== 'completed';

  return {
    ...WORKFLOW_CATEGORY_VISUALS[workflowCategory],
    label: (
      <div className="flex flex-col gap-1" style={{ maxWidth: 320 }}>
        <div className="text-xs text-muted-foreground">
          {t('taskDetail.workflow.businessStatus')}: {categoryLabel}
        </div>
        {workflowStateId && (
          <div
            className="text-xs text-muted-foreground"
            style={{ fontFamily: cssVar.fontFamilyCode }}
          >
            {workflowStateId}
          </div>
        )}
        {deliveryPending && (
          <div className="text-xs text-warning">{t('taskDetail.workflow.deliveryPendingHelp')}</div>
        )}
      </div>
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Tag data-task-workflow-state={workflowCategory} size="sm" style={{ flexShrink: 0 }}>
                {createElement(glyph.icon, { color: glyph.color, size: 12 })}
                {label}
              </Tag>
            </span>
          }
        />
        <TooltipContent>{glyph.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

TaskWorkflowBadge.displayName = 'TaskWorkflowBadge';

export default TaskWorkflowBadge;
