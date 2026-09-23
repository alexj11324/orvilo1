'use client';

import { Center, Empty, Flexbox, Icon } from '@lobehub/ui';
import { Button, TabsIndicator, TabsList, TabsRoot, TabsTab, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, useResponsive } from 'antd-style';
import dayjs from 'dayjs';
import { ChevronDownIcon, GitPullRequestIcon, PlugIcon, SquarePenIcon } from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { WorkSurface, WorkSurfaceSplit } from '@/features/WorkSurface';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { pullRequestKeys, workAttentionKeys } from '@/libs/swr/keys';
import { pullRequestService } from '@/services/pullRequest';
import { workAttentionService } from '@/services/workAttention';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { mergeWorkQueryGroups } from '../MyWork/workQueryPaging';
import WorkQueryResults from '../MyWork/WorkQueryResults';
import ReviewPullRequestPage from './ReviewPullRequestPage';
import {
  REVIEW_QUEUE_GROUP_LABEL_KEYS,
  reviewQueueGroups,
  type ReviewQueueItem,
} from './reviewQueueGroups';
import {
  reviewsDetailPath,
  reviewsIsNarrow,
  reviewsListPath,
  reviewsSurface,
  type ReviewsTab,
  reviewsTabDestination,
} from './reviewsSurface';

const resolveTab = (value: string | null): ReviewsTab =>
  value === 'created' ? 'created' : 'for-me';

const styles = createStaticStyles(({ css }) => ({
  chevron: css`
    flex: none;
    color: ${cssVar.colorTextTertiary};
    transition: transform ${cssVar.motionDurationFast};
  `,
  chevronCollapsed: css`
    transform: rotate(-90deg);
  `,
  detailEmpty: css`
    height: 100%;
    color: ${cssVar.colorTextTertiary};
  `,
  detailOverlay: css`
    position: absolute;
    z-index: 3;
    inset: 0;

    overflow: hidden;

    background: ${cssVar.colorBgLayout};
  `,
  draftIcon: css`
    flex: none;
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
  queueHeading: css`
    cursor: pointer;
    user-select: none;

    position: sticky;
    z-index: 1;
    inset-block-start: 88px;

    display: flex;
    gap: 6px;
    align-items: center;

    width: 100%;
    padding-block: 6px;
    padding-inline: 12px;
    border: none;
    border-radius: ${cssVar.borderRadiusLG};

    color: ${cssVar.colorTextSecondary};
    text-align: start;

    background: ${cssVar.colorFillQuaternary};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  row: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;

    min-height: 40px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadiusLG};

    color: inherit;
    text-decoration: none;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }

    &[data-active='true'] {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: -2px;
    }
  `,
  stage: css`
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
  `,
  list: css`
    display: flex;
    flex-direction: column;
    min-height: 100%;
  `,
  listBody: css`
    flex: 1;
    min-height: 0;
    padding-block-end: 8px;
  `,
  listChrome: css`
    position: sticky;
    z-index: 2;
    inset-block-start: 0;
    background: ${cssVar.colorBgLayout};
  `,
  tabs: css`
    flex: none;
    padding-block: 8px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

const PullRequestRow = memo<{
  active: boolean;
  detailPath: string;
  item: ReviewQueueItem;
  returnTo: string;
}>(({ active, detailPath, item, returnTo }) => {
  const { t } = useTranslation('common');
  const navigate = useWorkspaceAwareNavigate();
  return (
    <Flexbox
      horizontal
      align={'center'}
      className={styles.row}
      data-active={active}
      role={'link'}
      tabIndex={0}
      title={`${item.repository}#${item.number}${item.author ? ` · ${item.author}` : ''}`}
      onClick={() => navigate(detailPath, { state: { returnTo } })}
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate(detailPath, { state: { returnTo } });
      }}
    >
      <Icon className={styles.prIcon} icon={GitPullRequestIcon} size={14} />
      <Flexbox flex={1} style={{ minWidth: 0 }}>
        <Text ellipsis fontSize={13} weight={500}>
          {item.title}
        </Text>
      </Flexbox>
      {item.isDraft ? (
        <Icon
          className={styles.draftIcon}
          icon={SquarePenIcon}
          size={14}
          title={t('reviews.state.draft')}
        />
      ) : null}
      {item.reviewDecision === 'APPROVED' ? (
        <Tag color={'green'}>{t('reviews.decision.approved')}</Tag>
      ) : null}
      {item.reviewDecision === 'CHANGES_REQUESTED' ? (
        <Tag color={'red'}>{t('reviews.decision.changesRequested')}</Tag>
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
 * Sticky, collapsible queue group header — the same disclosure pattern as
 * `WorkQueryStatusGroup` (chevron + aria-expanded), minus the status glyph.
 * Reference review groups carry no count; `count` exists only for our extra
 * `In-product approvals` section so its header reports the same aggregate
 * its inner status groups display per bucket. No memo: children are fresh
 * JSX each render, so a memo wrapper would never hit.
 */
const QueueGroup = ({
  children,
  count,
  label,
}: {
  children: ReactNode;
  count?: number;
  label: string;
}) => {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <Flexbox gap={4}>
      <button
        aria-expanded={!collapsed}
        className={styles.queueHeading}
        type={'button'}
        onClick={() => setCollapsed((current) => !current)}
      >
        <ChevronDownIcon
          className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}
          size={14}
        />
        <Text fontSize={12} weight={500}>
          {label}
        </Text>
        {typeof count === 'number' ? (
          <Text fontSize={12} type={'secondary'}>
            {count}
          </Text>
        ) : null}
      </button>
      {collapsed ? null : children}
    </Flexbox>
  );
};

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
  const { reviewId: rawReviewId } = useParams<{ reviewId?: string }>();
  const selectedId = rawReviewId ? decodeURIComponent(rawReviewId) : null;
  const [searchParams] = useSearchParams();
  const tab = resolveTab(searchParams.get('tab'));
  const responsive = useResponsive();
  const isNarrow = reviewsIsNarrow(responsive.lg);
  const surface = reviewsSurface(isNarrow, Boolean(selectedId));
  const listPath = reviewsListPath(tab);

  const queue = useClientDataSWR(
    pullRequestKeys.queue(workspaceId, tab),
    () => pullRequestService.queue(tab),
    { revalidateOnFocus: false },
  );
  const notConnected = isTrpcErrorCode(queue.error, 'PRECONDITION_FAILED');
  const pullRequests: ReviewQueueItem[] = useMemo(() => queue.data?.data.items ?? [], [queue.data]);
  const queueTotal = queue.data?.data.total ?? null;
  const [queueTail, setQueueTail] = useState<ReviewQueueItem[]>([]);
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
  const queueViewer = queue.data?.data.viewer ?? null;
  const queueGroups = useMemo(
    () => reviewQueueGroups(allPullRequests, { tab, viewer: queueViewer }),
    [allPullRequests, queueViewer, tab],
  );
  const loadMoreQueue = useCallback(async () => {
    if (!queueEndCursor) return;
    setQueueLoadingMore(true);
    try {
      const next = await pullRequestService.queue(tab, queueEndCursor);
      setQueueTail((current) => [
        ...current,
        ...((next?.data?.items as ReviewQueueItem[] | undefined) ?? []),
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

  const writeTab = (next: ReviewsTab) => navigate(reviewsTabDestination(next), { replace: true });

  const tasks = data?.data.tasks ?? [];
  const externalReviews = data?.data.externalReviews ?? [];
  const taskReviewError = error;
  // Aggregate of the whole in-product block (task query total + non-task
  // external approvals) so the collapsible header matches the per-bucket
  // counts its inner status groups already show.
  const inProductCount = data
    ? (data.data.total ?? tasks.length) + externalReviews.length
    : undefined;

  const listPane = (
    <div className={styles.list}>
      <div className={styles.listChrome}>
        <NavHeader
          left={
            <Text fontSize={13} style={{ paddingInlineStart: 4 }} weight={500}>
              {t('tab.reviews')}
            </Text>
          }
        />
        <div className={styles.tabs}>
          <TabsRoot value={tab} onValueChange={(value) => writeTab(value as ReviewsTab)}>
            <TabsList>
              <TabsIndicator />
              {tabs.map((item) => (
                <TabsTab key={item.key} style={{ fontSize: 12, height: 28 }} value={item.key}>
                  {item.label}
                </TabsTab>
              ))}
            </TabsList>
          </TabsRoot>
        </div>
      </div>
      <div className={styles.listBody}>
        <Flexbox gap={16}>
          {queue.isLoading || notConnected || queue.error || allPullRequests.length === 0 ? (
            /* A single fallback group keeps the header visible — and
               collapsible — over loading / disconnected / error / empty
               queue states. */
            <QueueGroup
              label={t(tab === 'created' ? 'reviews.state.open' : 'reviews.pullRequests')}
            >
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
              ) : (
                <Empty description={t('reviews.queueEmpty')} icon={GitPullRequestIcon} />
              )}
            </QueueGroup>
          ) : (
            <Flexbox gap={4}>
              <Flexbox gap={8}>
                {queueGroups.map((group) => (
                  <QueueGroup
                    key={group.key}
                    label={String(t(REVIEW_QUEUE_GROUP_LABEL_KEYS[group.key] as never))}
                  >
                    <Flexbox>
                      {group.items.map((item) => (
                        <PullRequestRow
                          active={selectedId === item.id}
                          detailPath={reviewsDetailPath(item.id, tab)}
                          item={item}
                          key={item.id}
                          returnTo={listPath}
                        />
                      ))}
                    </Flexbox>
                  </QueueGroup>
                ))}
              </Flexbox>
              {/* A partial queue is never presented as complete — the tail
                  counts stay visible and pages load on demand. */}
              {queueHasMore || queueTail.length > 0 ? (
                <Flexbox horizontal align={'center'} justify={'space-between'} paddingInline={12}>
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

          <QueueGroup count={inProductCount} label={t('reviews.inProductReviews')}>
            {taskReviewError && tasks.length === 0 && externalReviews.length === 0 ? (
              <AsyncError
                error={taskReviewError}
                variant={'block'}
                onRetry={() => void refresh()}
              />
            ) : (
              <WorkQueryResults
                emptyLabel={t('myWork.externalReviewsEmpty')}
                externalReviews={externalReviews.length > 0 ? externalReviews : undefined}
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
          </QueueGroup>
        </Flexbox>
      </div>
    </div>
  );

  const detailPane = selectedId ? (
    <ReviewPullRequestPage embedded showBack={surface === 'detail'} />
  ) : queue.isLoading ? (
    <SkeletonList padding={24} rows={5} />
  ) : notConnected ? (
    <Center className={styles.detailEmpty} gap={8} padding={24}>
      <Empty description={t('reviews.connectGitHub')} icon={PlugIcon} />
      <Button onClick={() => navigate('/settings/connector')}>
        {t('reviews.connectGitHubAction')}
      </Button>
    </Center>
  ) : queue.error ? (
    <Center className={styles.detailEmpty} padding={24}>
      <AsyncError error={queue.error} variant={'block'} onRetry={() => void refresh()} />
    </Center>
  ) : (
    <Center className={styles.detailEmpty} gap={8}>
      <Icon icon={GitPullRequestIcon} size={44} />
      <Text fontSize={13} type={'secondary'}>
        {queueTotal ?? allPullRequests.length}
      </Text>
      <Text fontSize={13} type={'secondary'}>
        {t('reviews.pullRequests')}
      </Text>
    </Center>
  );

  return (
    <WorkSurface>
      <div className={styles.stage}>
        <WorkSurfaceSplit
          detail={surface === 'split' ? detailPane : undefined}
          detailLabel={selectedId ?? t('reviews.pullRequests')}
          list={listPane}
          listLabel={t('tab.reviews')}
          listWidth={482}
        />
        {surface === 'detail' ? (
          <div aria-label={selectedId ?? undefined} className={styles.detailOverlay}>
            {detailPane}
          </div>
        ) : null}
      </div>
    </WorkSurface>
  );
});

ReviewsPage.displayName = 'ReviewsPage';

export default ReviewsPage;
