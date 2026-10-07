'use client';

import type { TaskAttentionReason, TaskWorkflowCategory } from '@orvilo/types';
import type { ReactNode } from 'react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { getIssueStatusVisual, type StatusVisual } from '@/components/ExecutionStatus';
import { Badge as Tag } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TaskWorkflowBadgeProps {
  attentionReason?: TaskAttentionReason;
  executionStatus: string;
  workflowCategory?: TaskWorkflowCategory;
  workflowStateId?: string | null;
}

/** The board's displayed Issue state, including its derived attention lane. */
export const useTaskWorkflowGlyph = ({
  attentionReason,
  workflowCategory,
}: TaskWorkflowBadgeProps): StatusVisual & { label: ReactNode } => {
  const { t } = useTranslation('chat');
  return {
    ...getIssueStatusVisual({ attentionReason, workflowCategory }),
    label: t(
      attentionReason === 'needs_input'
        ? 'taskList.attention.needsInput'
        : (`taskDetail.workflow.category.${workflowCategory ?? 'backlog'}` as never),
    ),
  };
};

/**
 * Provider business state as a labelled pill — for property panels, where the
 * state is a field value rather than a row's status mark.
 */
const TaskWorkflowBadge = memo<TaskWorkflowBadgeProps>((props) => {
  const glyph = useTaskWorkflowGlyph(props);
  const displayState =
    props.attentionReason === 'needs_input' ? 'needs_input' : (props.workflowCategory ?? 'backlog');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Tag data-task-workflow-state={displayState} size="sm" style={{ flexShrink: 0 }}>
                {createElement(glyph.icon, { color: glyph.color, size: 12 })}
                {glyph.label}
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
