'use client';

import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { createStaticStyles, cssVar, cx, useResponsive } from 'antd-style';
import { cn } from 'cn';
import { ChevronDownIcon, GitPullRequestIcon, PlugIcon, SquarePenIcon } from 'lucide-react';
import { memo, type ReactNode, useCallback, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { Badge as Tag } from '@/components/reui/badge';
import SimpleEmpty from '@/components/SimpleEmpty';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { WorkSurface, WorkSurfaceSplit } from '@/features/WorkSurface';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { pullRequestKeys, workAttentionKeys } from '@/libs/swr/keys';
import { pullRequestService } from '@/services/pullRequest';
import { workAttentionService } from '@/services/workAttention';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { mergeWorkQueryGroups, mergeWorkQueryPage } from '../MyWork/workQueryPaging';
import WorkQueryResults from '../MyWork/WorkQueryResults';
import ConnectGitHubButton from './ConnectGitHubButton';
import ReviewPullRequestPage from './ReviewPullRequestPage';
import {
  inProductReviewsCount,
  REVIEW_QUEUE_GROUP_LABEL_KEYS,
  reviewQueueGroups,
  type ReviewQueueItem,
} from './reviewQueueGroups';
import { reviewRelativeTime } from './reviewRelativeTime';
import {
  reviewsDetailPath,
  reviewsIsNarrow,
  reviewsListPath,
  reviewsSurface,
  type ReviewsTab,
  reviewsTabDestination,
} from './reviewsSurface';
import { useScopedTailPager } from './scopedTailPager';

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

    background: ${cssVar.colorBgContainer};
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
    background: ${cssVar.colorBgContainer};
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
  return (
    <WorkspaceLink
      className={styles.row}
      data-active={active}
      state={{ returnTo }}
      title={`${item.repository}#${item.number}${item.author ? ` · ${item.author}` : ''}`}
      to={detailPath}
    >
      <span className={cx('anticon', styles.prIcon)} role="img">
        <GitPullRequestIcon fill={'transparent'} height={14} size={14} width={14} />
      </span>
      <div className="flex flex-col flex-1" style={{ minWidth: 0 }}>
        <div className="truncate block text-[13px] font-medium">{item.title}</div>
      </div>
      {item.isDraft ? (
        <span
          aria-label={t('reviews.state.draft')}
          className={cx('anticon', styles.draftIcon)}
          role="img"
          title={t('reviews.state.draft')}
        >
          <SquarePenIcon fill={'transparent'} height={14} size={14} width={14} />
        </span>
      ) : null}
      {item.reviewDecision === 'APPROVED' ? (
        <Tag variant="success-light">{t('reviews.decision.approved')}</Tag>
      ) : null}
      {item.reviewDecision === 'CHANGES_REQUESTED' ? (
        <Tag variant="destructive-light">{t('reviews.decision.changesRequested')}</Tag>
      ) : null}
      {item.updatedAt ? (
        <div className={cn(styles.meta)} title={formatAbsoluteDateTime(item.updatedAt)}>
          {reviewRelativeTime(item.updatedAt)}
        </div>
      ) : null}
    </WorkspaceLink>
  );
});

PullRequestRow.displayName = 'PullRequestRow';

/**
 * Sticky, collapsible queue group header — the same disclosure pattern as
 * `WorkQueryStatusGroup` (chevron + aria-expanded) and `ProjectSidePanel`
 * (`aria-controls` + a `hidden` region so the controlled element stays
 * addressable while folded). Reference review groups carry no count; `count`
 * exists only for our extra `In-product approvals` section so its header
 * reports the same aggregate its inner status groups display per bucket.
 * Controlled: the page owns collapse state keyed by group so a tab switch
 * (which swaps the whole queue branch) or a fallback↔populated swap does
 * not reset it. No memo: children are fresh JSX each render, so a memo
 * wrapper would never hit.
 */
const QueueGroup = ({
  children,
  collapsed,
  count,
  label,
  onToggle,
}: {
  children: ReactNode;
  collapsed: boolean;
  count?: number;
  label: string;
  onToggle: () => void;
}) => {
  const regionId = useId();
  return (
    <div className="flex flex-col" style={{ gap: collapsed ? 0 : 4 }}>
      <button
        aria-controls={regionId}
        aria-expanded={!collapsed}
        className={styles.queueHeading}
        type={'button'}
        onClick={onToggle}
      >
        <ChevronDownIcon
          className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}
          size={14}
        />
        <div className="text-[12px] font-medium">{label}</div>
        {typeof count === 'number' ? (
          <div className="text-[12px] text-muted-foreground">{count}</div>
        ) : null}
      </button>
      <div hidden={collapsed} id={regionId}>
        {children}
      </div>
    </div>
  );
};

/**
 * `/reviews` — the real PR review workspace (F02). The GitHub queue is the
 * primary surface: For-me = PRs authored by me or awaiting my review,
 * Created = my open PRs. In-product task approvals stay in a separate
 * section so approval requests never mix into the PR list.
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
  // Identity of the queue query: a late tail response from a previous tab or
  // workspace can never write back — the scope key binds first page, tail,
  // cursor, errors and pending state to one query.
  const queueScope = useMemo(
    () => JSON.stringify([workspaceId ?? 'personal', tab]),
    [tab, workspaceId],
  );
  const queuePager = useScopedTailPager<ReviewQueueItem>(queueScope, mergeWorkQueryPage);
  const queueTail = queuePager.tailFor(queueScope);
  const queueHasMore = queueTail?.hasMore ?? queue.data?.data.hasMore ?? false;
  const allPullRequests = useMemo(
    () => mergeWorkQueryPage(pullRequests, queueTail?.items ?? []),
    [pullRequests, queueTail],
  );
  const queueViewer = queue.data?.data.viewer ?? null;
  const queueGroups = useMemo(
    () => reviewQueueGroups(allPullRequests, { tab, viewer: queueViewer }),
    [allPullRequests, queueViewer, tab],
  );
  // Errors surface through the pager — an inline retry under the footer —
  // so a failed page never dies as a console-only silent stop.
  const loadMoreQueue = useCallback(() => {
    const cursor = queueTail?.nextCursor ?? queue.data?.data.endCursor;
    if (!cursor) return;
    void queuePager.loadMore(queueScope, 'queue', async () => {
      const next = await pullRequestService.queue(tab, cursor);
      return {
        hasMore: next?.data?.hasMore ?? false,
        items: (next?.data?.items as ReviewQueueItem[] | undefined) ?? [],
        nextCursor: next?.data?.endCursor ?? null,
      };
    });
  }, [queue.data, queuePager, queueScope, queueTail, tab]);

  const { data, error, isLoading } = useClientDataSWR(
    workAttentionKeys.reviews(workspaceId, tab),
    () => workAttentionService.reviews({ tab }),
  );
  const firstGroups = data?.data.groups ?? [];
  const queryHash = data?.data.queryHash;
  // Group tail identity carries the query hash too — a refetched snapshot
  // rebinds the pager, so a stale tail or per-group cursor can never merge
  // into a newer snapshot.
  const groupScope = useMemo(
    () => JSON.stringify([workspaceId ?? 'personal', tab, queryHash ?? 'pending']),
    [queryHash, tab, workspaceId],
  );
  const groupPager = useScopedTailPager<(typeof firstGroups)[number]>(
    groupScope,
    mergeWorkQueryGroups,
  );
  const groups = mergeWorkQueryGroups(firstGroups, groupPager.tailFor(groupScope)?.items ?? []);
  const loadMoreGroupErrors = useMemo(() => {
    const errors: Record<string, unknown> = {};
    for (const group of groups) {
      const error = groupPager.errorFor(group.key);
      if (error !== undefined) errors[group.key] = error;
    }
    return errors;
  }, [groupPager, groups]);

  const refresh = useCallback(async () => {
    // Bump both generations before the refetch: an in-flight tail request
    // from the stale snapshot resolves into a dropped write and its cursor
    // is never reused.
    queuePager.reset();
    groupPager.reset();
    await Promise.all([
      mutate(workAttentionKeys.reviews(workspaceId, tab)),
      mutate(pullRequestKeys.queue(workspaceId, tab)),
    ]);
  }, [groupPager, queuePager, tab, workspaceId]);

  const loadMoreGroup = useCallback(
    (groupKey: string) => {
      const column = groups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      if (!last || !queryHash) return;
      void groupPager.loadMore(groupScope, groupKey, async () => {
        const next = await workAttentionService.reviews({
          afterId: last.id,
          groupKey,
          queryHash,
          tab,
        });
        return { hasMore: false, items: next.data.groups ?? [], nextCursor: null };
      });
    },
    [groupPager, groupScope, groups, queryHash, tab],
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
  // Aggregate of the whole in-product block so the collapsible header
  // matches the per-bucket counts its inner status groups already show —
  // the merged-groups sum is the fallback when the contract drops `total`,
  // so tail-loaded buckets still count.
  const inProductCount = inProductReviewsCount({
    externalCount: externalReviews.length,
    groups,
    loaded: Boolean(data),
    loadedTaskCount: tasks.length,
    total: data?.data.total,
  });
  // Group collapse is owned here, keyed by group key: a tab switch swaps the
  // whole queue branch (fallback ↔ populated groups), and mounted-local
  // state would reset with it.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const toggleQueueGroup = useCallback((key: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const listPane = (
    <div className={styles.list}>
      <div className={styles.listChrome}>
        <NavHeader
          left={
            <div className="text-[13px] font-medium" style={{ paddingInlineStart: 4 }}>
              {t('tab.reviews')}
            </div>
          }
        />
        <div className={styles.tabs}>
          <Tabs value={tab} onValueChange={(value) => writeTab(value as ReviewsTab)}>
            <TabsList>
              {tabs.map((item) => (
                <TabsTrigger key={item.key} value={item.key}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>
      <div className={styles.listBody}>
        <div className="flex flex-col gap-4">
          {queue.isLoading || notConnected || queue.error || allPullRequests.length === 0 ? (
            /* A single fallback group keeps the header visible — and
               collapsible — over loading / disconnected / error / empty
               queue states. Its key matches the bucket it stands in for, so
               folding `Pull requests` while empty stays folded once filled. */
            <QueueGroup
              collapsed={collapsedGroups.has(tab === 'created' ? 'open' : 'pull-requests')}
              label={t(tab === 'created' ? 'reviews.state.open' : 'reviews.pullRequests')}
              onToggle={() => toggleQueueGroup(tab === 'created' ? 'open' : 'pull-requests')}
            >
              {queue.isLoading ? (
                <SkeletonList />
              ) : notConnected ? (
                <div className="flex flex-col items-center justify-center gap-2 p-6">
                  <SimpleEmpty description={t('reviews.connectGitHub')} icon={PlugIcon} />
                  <ConnectGitHubButton onConnected={refresh} />
                </div>
              ) : queue.error ? (
                <AsyncError error={queue.error} variant={'block'} onRetry={() => void refresh()} />
              ) : (
                <SimpleEmpty
                  icon={GitPullRequestIcon}
                  description={t(
                    tab === 'created' ? 'reviews.queueEmptyCreated' : 'reviews.queueEmpty',
                  )}
                />
              )}
            </QueueGroup>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex flex-col gap-2">
                {queueGroups.map((group) => (
                  <QueueGroup
                    collapsed={collapsedGroups.has(group.key)}
                    key={group.key}
                    label={t(REVIEW_QUEUE_GROUP_LABEL_KEYS[group.key])}
                    count={
                      group.key === 'ready-to-merge' && !queueHasMore
                        ? group.items.length
                        : undefined
                    }
                    onToggle={() => toggleQueueGroup(group.key)}
                  >
                    <div className="flex flex-col">
                      {group.items.map((item) => (
                        <PullRequestRow
                          active={selectedId === item.id}
                          detailPath={reviewsDetailPath(item.id, tab)}
                          item={item}
                          key={item.id}
                          returnTo={listPath}
                        />
                      ))}
                    </div>
                  </QueueGroup>
                ))}
              </div>
              {/* A partial queue is never presented as complete — the tail
                  counts stay visible and pages load on demand. */}
              {queuePager.errorFor('queue') ? (
                <AsyncError
                  error={queuePager.errorFor('queue')}
                  variant={'inline'}
                  onRetry={loadMoreQueue}
                />
              ) : null}
              {queueHasMore || (queueTail?.items.length ?? 0) > 0 ? (
                <div className="flex flex-row items-center justify-between px-3">
                  <div className="text-[12px] text-muted-foreground">
                    {t('reviews.loadedCount', {
                      loaded: allPullRequests.length,
                      total: queueTotal ?? '…',
                    })}
                  </div>
                  {queueHasMore ? (
                    <Button
                      loading={queuePager.isLoading('queue')}
                      size="sm"
                      variant="ghost"
                      onClick={loadMoreQueue}
                    >
                      {t('myWork.loadMore')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <QueueGroup
            collapsed={collapsedGroups.has('in-product')}
            count={inProductCount}
            label={t('reviews.inProductReviews')}
            onToggle={() => toggleQueueGroup('in-product')}
          >
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
                loadMoreGroupErrors={loadMoreGroupErrors}
                loadMoreLabel={t('myWork.loadMore')}
                loading={isLoading}
                loadingLabel={t('myWork.loading')}
                tasks={tasks}
                total={data?.data.total}
                onLoadMoreGroup={loadMoreGroup}
                onRetryLoadMoreGroup={loadMoreGroup}
              />
            )}
          </QueueGroup>
        </div>
      </div>
    </div>
  );

  const detailPane = selectedId ? (
    <ReviewPullRequestPage embedded showBack={surface === 'detail'} />
  ) : queue.isLoading ? (
    <SkeletonList rows={5} style={{ padding: 24 }} />
  ) : notConnected ? (
    <div className={cx('flex flex-col items-center justify-center gap-2 p-6', styles.detailEmpty)}>
      <SimpleEmpty description={t('reviews.connectGitHub')} icon={PlugIcon} />
      <ConnectGitHubButton onConnected={refresh} />
    </div>
  ) : queue.error ? (
    <div className={cx('flex flex-col items-center justify-center p-6', styles.detailEmpty)}>
      <AsyncError error={queue.error} variant={'block'} onRetry={() => void refresh()} />
    </div>
  ) : (
    /* Reference shows a single `N reviews` line under the illustration —
       the queue total for the active tab is the closest count we own. */
    <div className={cx('flex flex-col items-center justify-center gap-2', styles.detailEmpty)}>
      <span className="anticon" role="img">
        <GitPullRequestIcon fill={'transparent'} height={44} size={44} width={44} />
      </span>
      <div className="text-[13px] text-muted-foreground">
        {t('reviews.detailEmpty', { count: queueTotal ?? allPullRequests.length })}
      </div>
    </div>
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
