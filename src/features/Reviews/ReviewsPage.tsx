'use client';

import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { cn } from 'cn';
import { ChevronDownIcon, GitPullRequestIcon, PlugIcon, SquarePenIcon } from 'lucide-react';
import {
  memo,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
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
import nativeStyles from './Reviews.module.css';
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

const styles = {
  chevron:
    'flex-none size-4 text-muted-foreground transition-transform duration-(--orvilo-motion-fast) ease-[ease]',
  chevronCollapsed: '-rotate-90',
  detailEmpty: 'h-full text-muted-foreground',
  detailOverlay: 'absolute z-3 inset-0 overflow-hidden bg-card',
  draftIcon: 'flex-none text-muted-foreground',
  meta: 'flex-none text-xs leading-5 text-muted-foreground',
  prIcon: 'flex-none text-success-text',
  queueHeading:
    'sticky z-1 inset-bs-(--reviews-chrome-height) w-full justify-start gap-1.5 px-3 py-1 border-0 rounded-(--radius-button) font-normal text-muted-foreground bg-fill-quaternary hover:bg-muted aria-expanded:bg-fill-quaternary aria-expanded:hover:bg-muted duration-(--orvilo-motion-fast)',
  row: nativeStyles.row,
  stage: 'relative flex flex-1 min-h-0',
  list: `flex flex-col min-h-full ${nativeStyles.queueList}`,
  listBody: 'flex-1 min-h-0 pbe-2',
  listChrome: 'sticky z-2 inset-bs-0 bg-card',
  tabs: 'flex-none py-2 px-3 border-be border-divider',
} as const;

// This page consumes only Grid.useBreakpoint's lg. The current AppTheme does
// not override screenLG; installed antd publishes exactly min-width992.
// Keep SSR/hydration lg=undefined rather than turning the server into narrow.
const REVIEWS_LARGE_QUERY = '(min-width: 992px)';
const subscribeReviewsLarge = (notify: () => void) => {
  const media = window.matchMedia(REVIEWS_LARGE_QUERY);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const readReviewsLarge = () =>
  typeof window === 'undefined' ? undefined : window.matchMedia(REVIEWS_LARGE_QUERY).matches;
const readReviewsLargeOnServer = () => undefined;

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
      <span className={cn('anticon', styles.prIcon)} role="img">
        <GitPullRequestIcon
          className="size-4"
          fill={'transparent'}
          height={16}
          size={16}
          width={16}
        />
      </span>
      <div className="flex min-w-0 flex-col flex-1">
        <div className="truncate block text-sm leading-5.5 font-medium">{item.title}</div>
      </div>
      {item.isDraft ? (
        <span
          aria-label={t('reviews.state.draft')}
          className={cn('anticon', styles.draftIcon)}
          role="img"
          title={t('reviews.state.draft')}
        >
          <SquarePenIcon className="size-4" fill={'transparent'} height={16} size={16} width={16} />
        </span>
      ) : null}
      {item.reviewDecision === 'APPROVED' ? (
        <Tag className="rounded-(--radius-chip) text-xs leading-5" variant="success-light">
          {t('reviews.decision.approved')}
        </Tag>
      ) : null}
      {item.reviewDecision === 'CHANGES_REQUESTED' ? (
        <Tag className="rounded-(--radius-chip) text-xs leading-5" variant="destructive-light">
          {t('reviews.decision.changesRequested')}
        </Tag>
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
    <div className={cn('flex flex-col', collapsed ? 'gap-0' : 'gap-1')}>
      <Button
        aria-controls={regionId}
        aria-expanded={!collapsed}
        className={styles.queueHeading}
        size="compact"
        type={'button'}
        variant="ghost"
        onClick={onToggle}
      >
        <ChevronDownIcon
          className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}
          size={16}
        />
        <span className="text-sm leading-5.5 font-medium">{label}</span>
        {typeof count === 'number' ? (
          <span className="text-xs leading-5 text-muted-foreground">{count}</span>
        ) : null}
      </Button>
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
  const large = useSyncExternalStore(
    subscribeReviewsLarge,
    readReviewsLarge,
    readReviewsLargeOnServer,
  );
  const isNarrow = reviewsIsNarrow(large);
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
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
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
          left={<div className="ps-1 text-sm leading-5.5 font-medium">{t('tab.reviews')}</div>}
        />
        <div className={styles.tabs}>
          <Tabs value={tab} onValueChange={(value) => writeTab(value as ReviewsTab)}>
            <TabsList className="rounded-(--radius-button)">
              {tabs.map((item) => (
                <TabsTrigger className="rounded-(--radius-button)" key={item.key} value={item.key}>
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
                  <div className="text-xs leading-5 text-muted-foreground">
                    {t('reviews.loadedCount', {
                      loaded: allPullRequests.length,
                      total: queueTotal ?? '…',
                    })}
                  </div>
                  {queueHasMore ? (
                    <Button
                      loading={queuePager.isLoading('queue')}
                      size="normal"
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
    <div className={cn('flex flex-col items-center justify-center gap-2 p-6', styles.detailEmpty)}>
      <SimpleEmpty description={t('reviews.connectGitHub')} icon={PlugIcon} />
      <ConnectGitHubButton onConnected={refresh} />
    </div>
  ) : queue.error ? (
    <div className={cn('flex flex-col items-center justify-center p-6', styles.detailEmpty)}>
      <AsyncError error={queue.error} variant={'block'} onRetry={() => void refresh()} />
    </div>
  ) : (
    /* Reference shows a single `N reviews` line under the illustration —
       the queue total for the active tab is the closest count we own. */
    <div className={cn('flex flex-col items-center justify-center gap-2', styles.detailEmpty)}>
      <span className="anticon" role="img">
        <GitPullRequestIcon fill={'transparent'} height={44} size={44} width={44} />
      </span>
      <div className="text-sm leading-5.5 text-muted-foreground">
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
