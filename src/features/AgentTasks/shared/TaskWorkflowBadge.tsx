'use client';

import { Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { Tag, Text } from '@lobehub/ui/base-ui';
import type { TaskWorkflowCategory } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { CircleDashed, CircleDot } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  EXECUTION_STATUS_VISUALS,
  type ExecutionStatusVisual,
  TASK_STATUS_VISUALS,
} from '@/components/ExecutionStatus';

/**
 * One glyph per business workflow category, taken from the canonical status
 * visuals rather than restated here.
 *
 * This map used to invent its own seven, and the reason is worth keeping: it
 * was not carelessness, it read the wrong convention. `Loader2` + `colorInfo`
 * (a spinner) is this repo's **run-in-progress** visual — `RunIntegrationTag`'s
 * `merging` and `RunVerifyTag`'s `running` both use it with `spin: true`, and
 * they are right to, because they describe a run that is executing right now.
 * This badge is a *workflow classification*; its own docstring calls it
 * "displayed separately from execution and delivery". So borrowing that
 * spinner drew a run-in-progress glyph for a business state, and put a blue
 * turn on the card while the column header above it drew the canonical amber
 * circle dot for the same task. `in_review` made the same mistake with `Eye`
 * against the canonical `Clock`.
 *
 * Two entries have no canonical counterpart and are deliberately local. Both
 * say so, rather than looking like an oversight:
 *   * `triage` — the canonical maps have no triage; this repo's `TaskStatus`
 *     and Cordy's issue categories do not contain one either.
 *   * `todo` — glyph and colour both stay local. Cordy tints its todo
 *     `sky-500`, a literal Tailwind palette step with no semantic token here;
 *     minting a token for one literal would break the rule that status colour
 *     comes from `cssVar`. Recorded as a known divergence.
 */
const CATEGORY_META: Record<TaskWorkflowCategory, ExecutionStatusVisual> = {
  backlog: EXECUTION_STATUS_VISUALS.backlog,
  canceled: EXECUTION_STATUS_VISUALS.canceled,
  done: EXECUTION_STATUS_VISUALS.completed,
  in_progress: EXECUTION_STATUS_VISUALS.running,
  // The canonical map names this state `paused` and files it under "Pending
  // review" - the same visual `TASK_STATUS_VISUALS.paused` gives a task whose
  // delivery is awaiting a human.
  in_review: TASK_STATUS_VISUALS.paused,
  todo: { color: cssVar.colorTextSecondary, icon: CircleDot },
  triage: { color: cssVar.colorTextTertiary, icon: CircleDashed },
};

interface TaskWorkflowBadgeProps {
  executionStatus: string;
  workflowCategory?: TaskWorkflowCategory;
  workflowStateId?: string | null;
}

/** Provider business state, displayed separately from execution and delivery. */
const TaskWorkflowBadge = memo<TaskWorkflowBadgeProps>(
  ({ executionStatus, workflowCategory, workflowStateId }) => {
    const { t } = useTranslation('chat');
    if (!workflowStateId || !workflowCategory) return null;

    const meta = CATEGORY_META[workflowCategory];
    const categoryLabel = t(`taskDetail.workflow.category.${workflowCategory}` as never);
    const deliveryPending = workflowCategory === 'done' && executionStatus !== 'completed';
    const label = deliveryPending
      ? t('taskDetail.workflow.doneDeliveryPending', { state: categoryLabel })
      : categoryLabel;

    return (
      <Tooltip
        title={
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
        }
      >
        <Tag
          data-task-workflow-state={workflowCategory}
          icon={<Icon color={meta.color} icon={meta.icon} size={12} />}
          size={'small'}
          style={{ flexShrink: 0 }}
        >
          {label}
        </Tag>
      </Tooltip>
    );
  },
);

TaskWorkflowBadge.displayName = 'TaskWorkflowBadge';

export default TaskWorkflowBadge;
