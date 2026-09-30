import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import NotFound from '@/components/404';
import AsyncError from '@/components/AsyncError';
import {
  TaskDetailScope,
  TaskDetailSections,
  TaskDetailSkeleton,
  TopicChatDrawer,
  useActiveTaskDetail,
} from '@/features/AgentTasks';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

const Body = memo(() => {
  const { t } = useTranslation('chat');
  const taskId = useChatStore(chatPortalSelectors.taskDetailId);
  // Same data wiring as the full /task/[tid] page — claims the shared
  // `activeTaskId` slot for global consumers and polls the detail fetch;
  // section reads bind to `taskId` through TaskDetailScope instead.
  const { isInitialLoading, isNotFound, error, onRetry } = useActiveTaskDetail(taskId);

  if (!taskId) return null;

  // A transient fetch failure keeps the URL and offers Reload — distinct from a
  // resolved not-found (deleted task), which is a terminal 404.
  if (error) {
    return (
      <div className="flex flex-col flex-1 h-[100%]" style={{ minHeight: 0, overflowY: 'auto' }}>
        <AsyncError error={error} variant={'page'} onRetry={onRetry} />
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="flex flex-col flex-1 h-[100%]" style={{ minHeight: 0, overflowY: 'auto' }}>
        <NotFound desc={t('taskDetail.notFound.desc')} title={t('taskDetail.notFound.title')} />
      </div>
    );
  }

  return (
    <TaskDetailScope taskId={taskId}>
      <div
        className="flex flex-col flex-1 h-[100%] px-4"
        style={{ minHeight: 0, overflowY: 'auto' }}
      >
        {isInitialLoading ? <TaskDetailSkeleton chrome={'body'} /> : <TaskDetailSections />}
        <TopicChatDrawer />
      </div>
    </TaskDetailScope>
  );
});

export default Body;
