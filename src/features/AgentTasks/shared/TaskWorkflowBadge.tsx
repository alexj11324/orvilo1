'use client';

import { Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { Tag, Text } from '@lobehub/ui/base-ui';
import type { TaskWorkflowCategory } from '@orvilo/types';
import { cssVar } from 'antd-style';
import type { LucideIcon } from 'lucide-react';
import { Circle, CircleCheck, CircleDashed, CircleDot, CircleX, Eye, Loader2 } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

const CATEGORY_META: Record<TaskWorkflowCategory, { color: string; icon: LucideIcon }> = {
  backlog: { color: cssVar.colorTextTertiary, icon: Circle },
  canceled: { color: cssVar.colorTextTertiary, icon: CircleX },
  done: { color: cssVar.colorSuccess, icon: CircleCheck },
  in_progress: { color: cssVar.colorInfo, icon: Loader2 },
  in_review: { color: cssVar.colorWarning, icon: Eye },
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
