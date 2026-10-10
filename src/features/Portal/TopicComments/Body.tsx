import { cn } from 'cn';
import { MessageCircle } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import SurfaceSkeleton from '@/components/Skeleton/Surface';
import { Button } from '@/components/ui/button';
import { useTopicCommentThreads } from '@/features/TopicComment/hooks';
import { mutate } from '@/libs/swr';
import { topicCommentKeys } from '@/libs/swr/keys';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

import SimpleEmpty from '../SimpleEmpty';
import CommentCard from './CommentCard';
import Composer from './Composer';
import { styles } from './styles';
import { useTopicCommentEvents } from './useTopicCommentEvents';

const Body = memo(() => {
  const { t } = useTranslation('chat');
  const view = useChatStore(chatPortalSelectors.topicCommentsView);
  const openThread = useChatStore((s) => s.openTopicCommentThread);
  const {
    error,
    hasMore,
    isInitialError,
    isLoadingInitial,
    isLoadingMore,
    isRetrying,
    items,
    loadMore,
    pendingCommentIds,
    reload,
  } = useTopicCommentThreads(view?.topicId, view?.messageId);
  const topicId = view?.topicId;
  const refresh = useCallback(
    () =>
      topicId
        ? Promise.all([reload(), mutate(topicCommentKeys.summary(topicId))]).then(() => undefined)
        : Promise.resolve(),
    [reload, topicId],
  );
  useTopicCommentEvents(topicId, refresh);

  if (!view) return null;
  if (isInitialError) {
    return (
      <div className={cn('flex flex-col', styles.body)}>
        <AsyncError error={error} variant={'page'} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', styles.body)}>
      <div className={cn('flex flex-col', styles.list)}>
        {isLoadingInitial ? (
          <SurfaceSkeleton header={false} variant={'list'} />
        ) : items.length === 0 ? (
          <div className={cn('flex flex-col items-center justify-center', styles.empty)}>
            <SimpleEmpty description={t('topicComment.empty')} icon={MessageCircle} />
          </div>
        ) : (
          items.map(({ replyCount, root }) => {
            const pending = pendingCommentIds.has(root.id);
            return (
              <CommentCard
                comment={root}
                key={root.id}
                pending={pending}
                replyCount={replyCount}
                onMutated={() => void reload()}
                onOpenThread={
                  pending ? undefined : () => openThread(view.topicId, root.id, root, replyCount)
                }
              />
            );
          })
        )}
        {error ? (
          <AsyncError
            error={error}
            retrying={isRetrying}
            variant={'inline'}
            onRetry={() => void reload()}
          />
        ) : (
          hasMore && (
            <div className="flex flex-col items-center justify-center py-3">
              <Button loading={isLoadingMore} variant="ghost" onClick={() => void loadMore()}>
                {t('topicComment.loadMore')}
              </Button>
            </div>
          )
        )}
      </div>
      <Composer messageId={view.messageId} topicId={view.topicId} onCreated={() => void reload()} />
    </div>
  );
});

export default Body;
