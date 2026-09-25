'use client';

import { Center, Empty, Flexbox, Icon } from '@lobehub/ui';
import { Button, TabsIndicator, TabsList, TabsRoot, TabsTab, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { GitPullRequestIcon, PlugIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { pullRequestKeys, workAttentionKeys } from '@/libs/swr/keys';
import { pullRequestService } from '@/services/pullRequest';
import { workAttentionService } from '@/services/workAttention';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { mergeWorkQueryGroups } from '../MyWork/workQueryPaging';
import WorkQueryResults from '../MyWork/WorkQueryResults';

type ReviewTab = 'created' | 'for-me';

const resolveTab = (value: string | null): ReviewTab =>
  value === 'created' ? 'created' : 'for-me';

const styles = createStaticStyles(({ css }) => ({
  identifier: css`
    flex: none;
    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  meta: css`
    flex: none;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  prIcon: css`
    flex: none;
    color: ${cssVar.colorSuccess};
  `,
  row: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 7px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadiusLG};

    color: inherit;
    text-decoration: none;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
}));

type QueueItem = {
  additions: number;
  author: string | null;
  authorAvatar: string | null;
  changedFiles: number;
  deletions: number;
  id: string;
  isDraft: boolean;
  number: number;
  repository: string;
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  title: string;
  updatedAt: string | null;
  url: string;
};

const PullRequestRow = memo<{ item: QueueItem }>(({ item }) => {
  const { t } = useTranslation('common');
  const navigate = useWorkspaceAwareNavigate();
  const location = useLocation();
  // Carry the list URL so the detail page's Back returns to this exact
  // workspace + tab instead of dropping context.
  const returnTo = `${location.pathname}${location.search}`;
  return (
    <Flexbox
      horizontal
      align={'center'}
      className={styles.row}
      role={'link'}
      tabIndex={0}
      onClick={() => navigate(`/reviews/${encodeURIComponent(item.id)}`, { state: { returnTo } })}
      onKeyDown={(event) => {
        if (event.key === 'Enter')
          navigate(`/reviews/${encodeURIComponent(item.id)}`, { state: { returnTo } });
      }}
    >
      <Icon className={styles.prIcon} icon={GitPullRequestIcon} size={16} />
      <Text className={styles.identifier}>
        {item.repository}#{item.number}
      </Text>
      <Flexbox flex={1} style={{ minWidth: 0 }}>
        <Text ellipsis weight={500}>
          {item.title}
        </Text>
      </Flexbox>
      {item.reviewDecision === 'APPROVED' ? (
        <Tag color={'green'}>{t('reviews.decision.approved')}</Tag>
      ) : null}
      {item.reviewDecision === 'CHANGES_REQUESTED' ? (
        <Tag color={'red'}>{t('reviews.decision.changesRequested')}</Tag>
      ) : null}
      <Text className={styles.meta}>
        +{item.additions} −{item.deletions}
      </Text>
      {item.author ? (
        <Flexbox horizontal align={'center'} flex={'none'} gap={6}>
          <Avatar avatar={item.authorAvatar ?? undefined} name={item.author} size={20} />
          <Text className={styles.meta}>{item.author}</Text>
        </Flexbox>
      ) : null}
      {item.updatedAt ? (
        <Text className={styles.meta} title={dayjs(item.updatedAt).format('YYYY-MM-DD HH:mm')}>
          {dayjs(item.updatedAt).fromNow()}
        </Text>
      ) : null}
    </Flexbox>
  );
});

PullRequestRow.displayName = 'PullRequestRow';

/**
 * `/reviews` — the real PR review workspace (F02). The GitHub queue is the
 * primary surface: For-me = PRs with a pending review request, Created = my
 * open PRs. In-product task approvals stay in a separate section so approval
 * requests never mix into the PR list.
 */
const ReviewsPage = memo(() => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveTab(searchParams.get('tab'));

  const queue = useClientDataSWR(
    pullRequestKeys.queue(workspaceId, tab),
    () => pullRequestService.queue(tab),
    { revalidateOnFocus: false },
  );
  const notConnected = isTrpcErrorCode(queue.error, 'PRECONDITION_FAILED');
  const pullRequests: QueueItem[] = useMemo(() => queue.data?.data.items ?? [], [queue.data]);
  const queueTotal = queue.data?.data.total ?? null;
  const [queueTail, setQueueTail] = useState<QueueItem[]>([]);
  const [queueLoadingMore, setQueueLoadingMore] = useState(false);
  // Cursor for the NEXT page — advanced by every load-more response; falls
  // back to the first page's cursor before any tail has been fetched.
  const [queuePaging, setQueuePaging] = useState<{
    endCursor: string | null;
    hasMore: boolean;
  } | null>(null);
  const queueHasMore = queuePaging?.hasMore ?? queue.data?.data.hasMore ?? false;
  const queueEndCursor = queuePaging?.endCursor ?? queue.data?.data.endCursor ?? null;
  useEffect(() => {
    setQueueTail([]);
    setQueuePaging(null);
  }, [tab, workspaceId]);
  const allPullRequests = useMemo(() => [...pullRequests, ...queueTail], [pullRequests, queueTail]);
  const loadMoreQueue = useCallback(async () => {
    if (!queueEndCursor) return;
    setQueueLoadingMore(true);
    try {
      const next = await pullRequestService.queue(tab, queueEndCursor);
      setQueueTail((current) => [
        ...current,
        ...((next?.data?.items as QueueItem[] | undefined) ?? []),
      ]);
      setQueuePaging({
        endCursor: next?.data?.endCursor ?? null,
        hasMore: next?.data?.hasMore ?? false,
      });
    } catch (loadError) {
      console.error('[reviews:queueMore]', loadError);
    } finally {
      setQueueLoadingMore(false);
    }
  }, [queueEndCursor, tab]);

  const { data, error, isLoading } = useClientDataSWR(
    workAttentionKeys.reviews(workspaceId, tab),
    () => workAttentionService.reviews({ tab }),
  );
  const firstGroups = data?.data.groups ?? [];
  const queryHash = data?.data.queryHash;
  const [groupTail, setGroupTail] = useState<typeof firstGroups>([]);
  useEffect(() => {
    setGroupTail([]);
  }, [queryHash, tab, workspaceId]);
  const groups = mergeWorkQueryGroups(firstGroups, groupTail);

  const refresh = useCallback(async () => {
    setGroupTail([]);
    await Promise.all([
      mutate(workAttentionKeys.reviews(workspaceId, tab)),
      mutate(pullRequestKeys.queue(workspaceId, tab)),
    ]);
  }, [tab, workspaceId]);

  const loadMoreGroup = useCallback(
    async (groupKey: string) => {
      const column = groups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      if (!last || !queryHash) return;
      const next = await workAttentionService.reviews({
        afterId: last.id,
        groupKey,
        queryHash,
        tab,
      });
      setGroupTail((current) => mergeWorkQueryGroups(current, next.data.groups ?? []));
    },
    [groups, queryHash, tab],
  );

  const tabs = useMemo(
    () => [
      { key: 'for-me' as const, label: t('myWork.reviewsForMe') },
      { key: 'created' as const, label: t('myWork.reviewsCreated') },
    ],
    [t],
  );

  const writeTab = (next: ReviewTab) =>
    setSearchParams(next === 'for-me' ? {} : { tab: next }, { replace: true });

  const tasks = data?.data.tasks ?? [];
  const externalReviews = data?.data.externalReviews ?? [];
  const taskReviewError = error;

  return (
    <WorkSurface>
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('tab.reviews')}
          </Text>
        }
      />
      <WorkSurfaceCollection
        toolbar={
          <WorkSurfaceToolbar>
            <TabsRoot value={tab} onValueChange={(value) => writeTab(value as ReviewTab)}>
              <TabsList>
                <TabsIndicator />
                {tabs.map((item) => (
                  <TabsTab key={item.key} value={item.key}>
                    {item.label}
                  </TabsTab>
                ))}
              </TabsList>
            </TabsRoot>
          </WorkSurfaceToolbar>
        }
      >
        <Flexbox gap={16}>
          <Flexbox gap={4}>
            <Text type={'secondary'} weight={500}>
              {t('reviews.pullRequests')}
            </Text>
            {queue.isLoading ? (
              <SkeletonList />
            ) : notConnected ? (
              <Center gap={8} padding={24}>
                <Empty description={t('reviews.connectGitHub')} icon={PlugIcon} />
                <Button onClick={() => navigate('/settings/connector')}>
                  {t('reviews.connectGitHubAction')}
                </Button>
              </Center>
            ) : queue.error ? (
              <AsyncError error={queue.error} variant={'block'} onRetry={() => void refresh()} />
            ) : allPullRequests.length === 0 ? (
              <Empty description={t('reviews.queueEmpty')} icon={GitPullRequestIcon} />
            ) : (
              <Flexbox gap={4}>
                <Flexbox>
                  {allPullRequests.map((item) => (
                    <PullRequestRow item={item} key={item.id} />
                  ))}
                </Flexbox>
                {/* A partial queue is never presented as complete — the tail
                  counts stay visible and pages load on demand. */}
                {queueHasMore || queueTail.length > 0 ? (
                  <Flexbox horizontal align={'center'} justify={'space-between'} paddingInline={8}>
                    <Text fontSize={12} type={'secondary'}>
                      {t('reviews.loadedCount', {
                        loaded: allPullRequests.length,
                        total: queueTotal ?? '…',
                      })}
                    </Text>
                    {queueHasMore ? (
                      <Button
                        loading={queueLoadingMore}
                        size={'small'}
                        type={'text'}
                        onClick={() => void loadMoreQueue()}
                      >
                        {t('myWork.loadMore')}
                      </Button>
                    ) : null}
                  </Flexbox>
                ) : null}
              </Flexbox>
            )}
          </Flexbox>

          <Flexbox gap={4}>
            <Text type={'secondary'} weight={500}>
              {t('reviews.inProductReviews')}
            </Text>
            {taskReviewError && tasks.length === 0 && externalReviews.length === 0 ? (
              <AsyncError
                error={taskReviewError}
                variant={'block'}
                onRetry={() => void refresh()}
              />
            ) : (
              <WorkQueryResults
                emptyLabel={t('myWork.externalReviewsEmpty')}
                externalReviews={externalReviews}
                groupBy={data?.data.groupBy}
                groups={groups}
                layout={'list'}
                loadMoreLabel={t('myWork.loadMore')}
                loading={isLoading}
                loadingLabel={t('myWork.loading')}
                tasks={tasks}
                total={data?.data.total}
                onLoadMoreGroup={(key) => void loadMoreGroup(key)}
              />
            )}
          </Flexbox>
        </Flexbox>
      </WorkSurfaceCollection>
    </WorkSurface>
  );
});

ReviewsPage.displayName = 'ReviewsPage';

export default ReviewsPage;
