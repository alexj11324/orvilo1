'use client';

import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import NotFound from '@/components/404';
import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';

import { TaskDetailScope } from './TaskDetailScope';
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
  /**
   * Replaces the default "Issue not found" page (whose only exit is the task
   * list) when the host has its own way out, e.g. the inbox pane.
   */
  notFound?: ReactNode;
  taskId: string;
}

const IssueContentOwned = memo<Omit<IssueContentProps, 'detail'>>(({ notFound, taskId }) => {
  const detail = useActiveTaskDetail(taskId);
  return <IssueContentBody detail={detail} notFound={notFound} />;
});

IssueContentOwned.displayName = 'IssueContentOwned';

const IssueContentBody = memo<
  Required<Pick<IssueContentProps, 'detail'>> & Pick<IssueContentProps, 'notFound'>
>(({ detail, notFound }) => {
  const { t } = useTranslation('chat');
  const { isInitialLoading, isNotFound, error, onRetry } = detail;

  if (error) {
    return <AsyncError error={error} variant={'page'} onRetry={onRetry} />;
  }

  if (isNotFound) {
    if (notFound) return notFound;
    return (
      <NotFound
        desc={t('taskDetail.notFound.desc')}
        title={t('taskDetail.notFound.title')}
        extra={
          <Link to={'/tasks'}>
            <Button variant="default">{t('taskDetail.notFound.backToTasks')}</Button>
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
const IssueContent = memo<IssueContentProps>(({ detail, notFound, taskId }) => (
  <TaskDetailScope taskId={taskId}>
    {detail ? (
      <IssueContentBody detail={detail} notFound={notFound} />
    ) : (
      <IssueContentOwned notFound={notFound} taskId={taskId} />
    )}
  </TaskDetailScope>
));

IssueContent.displayName = 'IssueContent';

export default IssueContent;
