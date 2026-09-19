'use client';

import { Button } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import NotFound from '@/components/404';
import AsyncError from '@/components/AsyncError';

import TaskDetailSections from './TaskDetailSections';
import TaskDetailSkeleton from './TaskDetailSkeleton';
import { type ActiveTaskDetailState, useActiveTaskDetail } from './useActiveTaskDetail';

export interface IssueContentProps {
  /**
   * Pre-resolved detail state when the host already ran `useActiveTaskDetail`
   * (the full page keeps its own early returns). When omitted, the component
   * owns the wiring itself — which is what lets a split pane mount it without
   * embedding a whole page.
   */
  detail?: ActiveTaskDetailState;
  taskId: string;
}

const IssueContentOwned = memo<Omit<IssueContentProps, 'detail'>>(({ taskId }) => {
  const detail = useActiveTaskDetail(taskId);
  return <IssueContentBody detail={detail} />;
});

IssueContentOwned.displayName = 'IssueContentOwned';

const IssueContentBody = memo<Required<Pick<IssueContentProps, 'detail'>>>(({ detail }) => {
  const { t } = useTranslation('chat');
  const { isInitialLoading, isNotFound, error, onRetry } = detail;

  if (error) {
    return <AsyncError error={error} variant={'page'} onRetry={onRetry} />;
  }

  if (isNotFound) {
    return (
      <NotFound
        desc={t('taskDetail.notFound.desc')}
        title={t('taskDetail.notFound.title')}
        extra={
          <Link to={'/tasks'}>
            <Button type={'primary'}>{t('taskDetail.notFound.backToTasks')}</Button>
          </Link>
        }
      />
    );
  }

  return isInitialLoading ? <TaskDetailSkeleton chrome={'body'} /> : <TaskDetailSections />;
});

IssueContentBody.displayName = 'IssueContentBody';

/**
 * A single issue's content — properties panel, body, activity and comments —
 * mountable by any work surface that already provides the chrome (header,
 * scroll host). The `/task/[tid]` page delegates to this inside its document
 * frame; the inbox detail pane mounts it inside the split frame. The split
 * pane must NOT wrap it in another scroll host level of its own — mount it
 * directly in the pane's scroll owner.
 */
const IssueContent = memo<IssueContentProps>(({ detail, taskId }) =>
  detail ? <IssueContentBody detail={detail} /> : <IssueContentOwned taskId={taskId} />,
);

IssueContent.displayName = 'IssueContent';

export default IssueContent;
