'use client';

import { Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { Tag, Text } from '@lobehub/ui/base-ui';
import type { TaskWorkflowCategory } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { CircleHelp, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { type StatusVisual, WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { normalizeAsyncError } from '@/libs/swr/normalizeError';

import { useTeamWorkflowCatalog } from './useTeamWorkflowCatalog';

interface TaskWorkflowBadgeProps {
  executionStatus: string;
  teamId?: string | null;
  workflowCategory?: TaskWorkflowCategory;
  workflowStateId?: string | null;
  workflowStateRefId?: string | null;
}

interface TaskWorkflowGlyph extends StatusVisual {
  category?: TaskWorkflowCategory;
  label: ReactNode;
  name: string;
}

/**
 * The workflow state as a bare status glyph — what a task row or board card
 * draws in its one status slot (Linear shows a single status mark per row).
 * `undefined` when the task carries no concrete workflow state, so the caller
 * falls back to the execution-status glyph for legacy personal tasks.
 */
export const useTaskWorkflowGlyph = ({
  executionStatus,
  teamId,
  workflowCategory,
  workflowStateRefId,
  workflowStateId,
}: TaskWorkflowBadgeProps): TaskWorkflowGlyph | undefined => {
  const { t } = useTranslation('chat');
  const { error, states } = useTeamWorkflowCatalog(
    teamId,
    Boolean(workflowStateRefId || workflowStateId),
  );
  if (!workflowStateRefId && !workflowStateId) return undefined;

  const unresolved = (kind: 'loading' | 'unknown'): TaskWorkflowGlyph => {
    const name = t(
      kind === 'loading' ? 'taskDetail.workflow.loadingState' : 'taskDetail.workflow.unknownState',
    );
    return {
      color: cssVar.colorTextQuaternary,
      icon: kind === 'loading' ? LoaderCircle : CircleHelp,
      label: name,
      name,
    };
  };

  let category = workflowCategory;
  let name: string;
  let color: string | undefined;

  if (teamId) {
    const { code, status } = normalizeAsyncError(error);
    if (
      code === 'NOT_FOUND' ||
      code === 'FORBIDDEN' ||
      code === 'UNAUTHORIZED' ||
      status === 401 ||
      status === 403 ||
      status === 404
    ) {
      return unresolved('unknown');
    }
    if (!states) return unresolved(error ? 'unknown' : 'loading');
    const state = states.find(
      (item) =>
        item.teamId === teamId &&
        (workflowStateRefId
          ? item.id === workflowStateRefId
          : item.remoteStateId === workflowStateId),
    );
    if (!state || (workflowCategory && state.category !== workflowCategory)) {
      return unresolved('unknown');
    }
    category = state.category;
    name = state.name;
    color = state.color ?? undefined;
  } else {
    if (workflowStateRefId) return unresolved('unknown');
    if (!workflowCategory) return unresolved('unknown');
    name = t(`taskDetail.workflow.category.${workflowCategory}` as never);
  }

  if (!category) return unresolved('unknown');
  const deliveryPending = category === 'done' && executionStatus !== 'completed';

  return {
    ...WORKFLOW_CATEGORY_VISUALS[category],
    category,
    color: color ?? WORKFLOW_CATEGORY_VISUALS[category].color,
    label: (
      <Flexbox gap={4} style={{ maxWidth: 320 }}>
        <Text fontSize={12} type={'secondary'}>
          {t('taskDetail.workflow.businessStatus')}: {name}
        </Text>
        {deliveryPending && (
          <Text fontSize={12} type={'warning'}>
            {t('taskDetail.workflow.deliveryPendingHelp')}
          </Text>
        )}
      </Flexbox>
    ),
    name,
  };
};

/**
 * Business state as a labelled pill — for property panels, where the
 * state is a field value rather than a row's status mark.
 */
const TaskWorkflowBadge = memo<TaskWorkflowBadgeProps>((props) => {
  const { t } = useTranslation('chat');
  const glyph = useTaskWorkflowGlyph(props);
  const { executionStatus } = props;
  if (!glyph) return null;

  const label =
    glyph.category === 'done' && executionStatus !== 'completed'
      ? t('taskDetail.workflow.doneDeliveryPending', { state: glyph.name })
      : glyph.name;

  return (
    <Tooltip title={glyph.label}>
      <Tag
        data-task-workflow-state={glyph.category ?? 'unknown'}
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

/** Pure status mark for rows whose execution fallback is owned by the caller. */
export const TaskWorkflowIcon = ({
  fallback,
  size = 16,
  ...props
}: TaskWorkflowBadgeProps & { fallback?: ReactNode; size?: number }) => {
  const glyph = useTaskWorkflowGlyph(props);
  if (!glyph) return fallback;
  return (
    <Tooltip title={glyph.label}>
      <Icon color={glyph.color} icon={glyph.icon} size={size} />
    </Tooltip>
  );
};

export default TaskWorkflowBadge;
