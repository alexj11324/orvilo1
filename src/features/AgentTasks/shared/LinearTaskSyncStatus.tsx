'use client';

import type { LinearIssueLinkSyncState } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { CircleCheck, CircleDashed, CircleMinus, CircleX, TriangleAlert } from 'lucide-react';
import { createContext, createElement, memo, type PropsWithChildren, use, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { Badge as Tag } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';
import { useTaskStore } from '@/store/task';
import { taskListSelectors } from '@/store/task/selectors';

import { getIssueLinkUrl, type LinearIssueLinkView } from './linearSyncViewModel';

const STATE_META: Record<
  LinearIssueLinkSyncState,
  { color: string; icon: typeof CircleCheck; labelKey: string }
> = {
  conflict: {
    color: cssVar.colorWarning,
    icon: TriangleAlert,
    labelKey: 'taskDetail.linearSync.state.conflict',
  },
  outcome_unknown: {
    color: cssVar.colorError,
    icon: CircleX,
    labelKey: 'taskDetail.linearSync.state.outcomeUnknown',
  },
  pending: {
    color: cssVar.colorWarning,
    icon: CircleDashed,
    labelKey: 'taskDetail.linearSync.state.pending',
  },
  removed: {
    color: cssVar.colorTextTertiary,
    icon: CircleMinus,
    labelKey: 'taskDetail.linearSync.state.removed',
  },
  synced: {
    color: cssVar.colorSuccess,
    icon: CircleCheck,
    labelKey: 'taskDetail.linearSync.state.synced',
  },
  unlinked: {
    color: cssVar.colorTextTertiary,
    icon: CircleMinus,
    labelKey: 'taskDetail.linearSync.state.unlinked',
  },
};

type LinearTaskSyncContextValue = {
  getIssueLink: (taskId?: string | null) => LinearIssueLinkView | undefined;
};

const LinearTaskSyncContext = createContext<LinearTaskSyncContextValue | null>(null);

const LINEAR_ISSUE_LINK_TASK_ID_CAP = 100;

type LinearTaskSyncProviderProps = PropsWithChildren<{
  /** Explicitly scope a host such as a paginated collection or task detail. */
  taskIds?: readonly string[];
}>;

export const LinearTaskSyncProvider = ({
  children,
  taskIds: explicitTaskIds,
}: LinearTaskSyncProviderProps) => {
  const workspaceId = useActiveWorkspaceId();
  const taskList = useTaskStore(taskListSelectors.taskList);
  const taskGroups = useTaskStore(taskListSelectors.taskGroups);
  const taskIds = useMemo(() => {
    if (explicitTaskIds) {
      return [...new Set(explicitTaskIds.filter(Boolean))].slice(0, LINEAR_ISSUE_LINK_TASK_ID_CAP);
    }

    return [
      ...new Set([
        ...taskList.map((task) => task.id),
        ...taskGroups.flatMap((group) => group.tasks.map((task) => task.id)),
      ]),
    ].slice(0, LINEAR_ISSUE_LINK_TASK_ID_CAP);
  }, [explicitTaskIds, taskGroups, taskList]);
  const taskIdsKey = taskIds.join(',');
  const { data } = useClientDataSWR(
    workspaceId && taskIds.length > 0
      ? `linear-sync/issue-links/${workspaceId}/${taskIdsKey}`
      : null,
    async () => {
      const response = await lambdaClient.linearSync.issueLinks.query({ taskIds });
      return (response?.data ?? []) as LinearIssueLinkView[];
    },
    { dedupingInterval: 30_000, refreshInterval: 30_000 },
  );

  const linksByTaskId = useMemo(
    () => new Map((data ?? []).map((link) => [link.taskId, link as LinearIssueLinkView])),
    [data],
  );
  const value = useMemo<LinearTaskSyncContextValue>(
    () => ({ getIssueLink: (taskId) => (taskId ? linksByTaskId.get(taskId) : undefined) }),
    [linksByTaskId],
  );

  return <LinearTaskSyncContext value={value}>{children}</LinearTaskSyncContext>;
};

export const useLinearTaskIssueLink = (taskId?: string | null) => {
  const context = use(LinearTaskSyncContext);
  return context?.getIssueLink(taskId);
};

type LinearTaskSyncStatusProps = {
  taskId?: string | null;
};

const LinearTaskSyncStatus = memo<LinearTaskSyncStatusProps>(({ taskId }) => {
  const { t } = useTranslation('chat');
  const link = useLinearTaskIssueLink(taskId);

  if (!link) return null;

  const meta = STATE_META[link.syncState] ?? STATE_META.pending;
  const issueUrl = getIssueLinkUrl(link);
  const conflictFields = link.conflict?.fields.join(', ');
  const tooltip = (
    <div className="flex flex-col gap-1" style={{ maxWidth: 320 }}>
      <div className="text-[12px] text-muted-foreground">
        {t('taskDetail.linearSync.source')}: {link.linearIdentifier}
      </div>
      <div className="text-[12px] text-muted-foreground">{t(meta.labelKey as never)}</div>
      {conflictFields && (
        <div className="text-[12px] text-warning" style={{ wordBreak: 'break-word' }}>
          {t('taskDetail.linearSync.conflictFields', { fields: conflictFields })}
        </div>
      )}
      {issueUrl && (
        <div className="text-[12px] text-info">{t('taskDetail.linearSync.openIssue')}</div>
      )}
    </div>
  );

  // Clickable external link — mark it so peek-mode row click capture
  // (My issues) lets it through instead of selecting the row.
  const tag = (
    <Tag
      data-row-interactive={issueUrl ? true : undefined}
      size="sm"
      style={{ cursor: issueUrl ? 'pointer' : undefined, flexShrink: 0 }}
      onClick={
        issueUrl
          ? (event) => {
              event.stopPropagation();
              window.open(issueUrl, '_blank', 'noopener,noreferrer');
            }
          : undefined
      }
    >
      {createElement(meta.icon, { color: meta.color, size: 12 })}
      {link.linearIdentifier} · {t(meta.labelKey as never)}
    </Tag>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex">{tag}</span>} />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

LinearTaskSyncStatus.displayName = 'LinearTaskSyncStatus';

export default LinearTaskSyncStatus;
