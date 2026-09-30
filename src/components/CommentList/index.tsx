'use client';

import { Button } from '@lobehub/ui/base-ui';
import { MessageSquare } from 'lucide-react';
import { memo, useCallback, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';

import { ArticleSkeleton } from '@/components/Skeleton';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { type SkillCommentItem, type SkillCommentListResponse } from '@/types/discover';

import CommentItem from './CommentItem';

export interface CommentListProps {
  fetchMore: (params: {
    order?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    sort?: 'createdAt' | 'upvotes';
  }) => Promise<SkillCommentListResponse>;
  initialData?: SkillCommentListResponse;
}

const CommentList = memo<CommentListProps>(({ initialData, fetchMore }) => {
  const { t } = useTranslation('discover');
  const { t: tc } = useTranslation('common');
  const [items, setItems] = useState<SkillCommentItem[]>(initialData?.items ?? []);
  const [currentPage, setCurrentPage] = useState(initialData?.currentPage ?? 1);
  const [totalPages, setTotalPages] = useState(initialData?.totalPages ?? 1);
  const [totalCount, setTotalCount] = useState(initialData?.totalCount ?? 0);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleLoadMore = useCallback(() => {
    const nextPage = currentPage + 1;
    startTransition(async () => {
      // Keep failures inside the transition: preserve loaded comments and
      // turn the button into a retry instead of surfacing to an error boundary
      try {
        const res = await fetchMore({ order: 'desc', page: nextPage, sort: 'createdAt' });
        setItems((prev) => [...prev, ...res.items]);
        setCurrentPage(res.currentPage);
        setTotalPages(res.totalPages);
        setTotalCount(res.totalCount);
        setLoadMoreFailed(false);
      } catch {
        setLoadMoreFailed(true);
      }
    });
  }, [currentPage, fetchMore]);

  let content;
  if (totalCount === 0 && !isPending) {
    content = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant={'icon'}>
            <MessageSquare />
          </EmptyMedia>
          <EmptyDescription>{t('skills.details.comments.noComments')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <>
        <div className={'flex flex-col gap-6'}>
          {isPending && items.length === 0 ? (
            <div className={'flex flex-col gap-6'}>
              {Array.from({ length: 3 }).map((_, i) => (
                <ArticleSkeleton key={i} rows={2} title={120} />
              ))}
            </div>
          ) : (
            items.map((item) => <CommentItem item={item} key={item.id} />)
          )}
        </div>
        {currentPage < totalPages && (
          <Button block loading={isPending} onClick={handleLoadMore}>
            {loadMoreFailed ? tc('retry') : t('skills.details.comments.loadMore')}
          </Button>
        )}
      </>
    );
  }

  return <div className={'flex flex-col gap-6'}>{content}</div>;
});

export default CommentList;
