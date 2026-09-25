'use client';

import { Center, Empty, Flexbox, Icon, Markdown } from '@lobehub/ui';
import { Button, Segmented, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  CircleDashedIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  MessageSquarePlusIcon,
  PlugIcon,
  XCircleIcon,
} from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { WorkSurface, WorkSurfaceReview } from '@/features/WorkSurface';
import { usePagedLoadMore } from '@/hooks/usePagedLoadMore';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { pullRequestKeys } from '@/libs/swr/keys';
import { pullRequestService, type ReviewPageCollection } from '@/services/pullRequest';
import { isTrpcErrorCode } from '@/utils/trpcError';

import CollectionFooter from './CollectionFooter';
import ConnectGitHubButton from './ConnectGitHubButton';
import ReviewChecksPanel from './ReviewChecksPanel';
import ReviewFileCard from './ReviewFileCard';
import { reviewOperationId } from './reviewOperationId';
import ReviewOverview from './ReviewOverview';
import {
  applyReviewPagerPage,
  emptyReviewPager,
  reviewPagerKey,
  type ReviewPagerPage,
  reviewPagerScope,
} from './reviewPager';
import {
  isReviewStale,
  reviewStaleKey,
  reviewStaleState,
  updateReviewStaleState,
} from './reviewStaleState';
import ReviewSubmitPanel from './ReviewSubmitPanel';
import ReviewThreadCard from './ReviewThreadCard';
import type { PullRequestDetail, ReviewThread, WriteOutcome } from './types';
import { useReviewComposer } from './useReviewComposer';

const styles = createStaticStyles(({ css }) => ({
  detailBody: css`
    width: 100%;
    min-width: 0;
  `,
  headerCounter: css`
    @media (width <= 768px) {
      display: none;
    }
  `,
  headerCrumb: css`
    @media (width <= 768px) {
      display: none;
    }
  `,
  headerTitle: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  diffBody: css`
    width: 100%;
    max-width: 1500px;
    margin-inline: auto;
    padding-block: 16px 48px;
    padding-inline: 24px;

    @media (width <= 768px) {
      padding-inline: 8px;
    }
  `,
  modeBar: css`
    display: flex;
    flex: none;
    gap: 8px;
    align-items: center;

    min-height: 44px;
    padding-inline: 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  modeButton: css`
    cursor: pointer;

    min-height: 28px;
    padding-inline: 10px;
    border: 1px solid transparent;
    border-radius: 999px;

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &[aria-selected='true'] {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
    }
  `,
  reviewComposer: css`
    padding-block: 16px 0;
    padding-inline: 24px;
  `,
  reviewCard: css`
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  sectionTitle: css`
    padding-inline-start: 4px;
  `,
  staleBanner: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    padding-block: 8px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorWarningBorder};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorWarningBg};
  `,
}));

const reviewStateVisual = (state: string | null) => {
  switch (state) {
    case 'APPROVED': {
      return {
        color: cssVar.colorSuccess,
        icon: CheckCircle2Icon,
        labelKey: 'reviews.state.approved',
      };
    }
    case 'CHANGES_REQUESTED': {
      return {
        color: cssVar.colorError,
        icon: XCircleIcon,
        labelKey: 'reviews.state.changesRequested',
      };
    }
    case 'DISMISSED': {
      return {
        color: cssVar.colorTextTertiary,
        icon: CircleDashedIcon,
        labelKey: 'reviews.state.dismissed',
      };
    }
    default: {
      return {
        color: cssVar.colorTextSecondary,
        icon: MessageSquarePlusIcon,
        labelKey: 'reviews.state.commented',
      };
    }
  }
};

/** Server write-contract errors arrive as CONFLICT/FORBIDDEN with a `CODE:` prefix. */
const writeErrorCode = (error: unknown): string | null => {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  const match = /^([A-Z_]+):/.exec(message);
  return match?.[1] ?? null;
};

/**
 * `/reviews/:reviewId` — Overview and Diff share a real GitHub snapshot.
 * The review composer is revealed on demand. Every write is pinned to `snapshotId` +
 * `observedHeadSha`; drift and stale pages gate the write instead of landing
 * on a head the reviewer never saw.
 */
interface ReviewPullRequestPageProps {
  /** Mount inside the Reviews master-detail shell instead of owning the page root. */
  embedded?: boolean;
  /** Narrow detail overlays need an explicit route back to the preserved list. */
  showBack?: boolean;
}

const ReviewPullRequestPage = memo((props: ReviewPullRequestPageProps) => {
  const { embedded = false, showBack = true } = props;
  const { t } = useTranslation('common');
  const { reviewId: rawId } = useParams<{ reviewId: string }>();
  const reviewId = rawId ? decodeURIComponent(rawId) : '';
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const location = useLocation();
  // The queue passes its exact URL; fall back to the workspace-aware list.
  const returnTo =
    (location.state as { returnTo?: string } | null)?.returnTo ?? `/reviews${location.search}`;

  const { data, error, isLoading } = useClientDataSWR(
    reviewId ? pullRequestKeys.detail(workspaceId, reviewId) : null,
    () => pullRequestService.detail(reviewId),
  );
  const pullRequest = data?.data as PullRequestDetail | undefined;
  const notConnected = isTrpcErrorCode(error, 'PRECONDITION_FAILED');

  const staleKey = reviewStaleKey(workspaceId, reviewId);
  const [staleState, setStaleState] = useState(() => reviewStaleState(staleKey, false));
  const stale = isReviewStale(staleState, staleKey);
  // Async work started under review A retains A's key. If it settles after the
  // user selects B, that result only changes A's stale flag, not B's write gate.
  const setStale = useCallback(
    (next: boolean) => setStaleState((current) => updateReviewStaleState(current, staleKey, next)),
    [staleKey],
  );
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('unified');
  const [detailViewState, setDetailViewState] = useState<{
    id: string;
    view: 'overview' | 'diff';
  }>({ id: reviewId, view: 'overview' });
  const activeView = detailViewState.id === reviewId ? detailViewState.view : 'overview';

  // On-demand collection tails + cursors, bound to the exact snapshot they
  // were fetched against (workspace · PR · snapshotId · head · viewer). When
  // that generation moves on the whole pager is reset — a stale tail can
  // never append under a new snapshot, and an in-flight response that lands
  // after the reset is dropped instead of written back.
  const pagerKey = reviewPagerKey(
    reviewPagerScope(workspaceId, reviewId, pullRequest) ?? {
      headSha: null,
      pullRequestId: reviewId,
      snapshotId: '',
      viewerLogin: null,
      workspaceId,
    },
  );
  // Synchronous generation reset — tails/cursors from the previous snapshot
  // are cleared in the same render that first observes the new identity.
  const [pager, setPager] = useState(() => emptyReviewPager(pagerKey));
  const filesMore = usePagedLoadMore();
  const conversationMore = usePagedLoadMore();
  if (pager.key !== pagerKey) {
    setPager(emptyReviewPager(pagerKey));
    filesMore.resetLoadMoreError();
    conversationMore.resetLoadMoreError();
  }
  const activePager = pager.key === pagerKey ? pager : emptyReviewPager(pagerKey);
  const pagerKeyRef = useRef(pagerKey);
  pagerKeyRef.current = pagerKey;

  const refresh = useCallback(async () => {
    await mutate(pullRequestKeys.detail(workspaceId, reviewId));
    await mutate(pullRequestKeys.queue(workspaceId, 'for-me'));
    await mutate(pullRequestKeys.queue(workspaceId, 'created'));
    // Writes stay disabled until a complete, consistent new snapshot is in
    // the cache — only then is the stale flag lifted.
    setStale(false);
  }, [reviewId, setStale, workspaceId]);

  const loadMore = useCallback(
    async (collection: ReviewPageCollection, cursor: string, threadId?: string) => {
      // The generation this request belongs to — captured now so a response
      // that lands after a refresh/drift is dropped rather than written back.
      const generation = pagerKeyRef.current;
      const headSha = pullRequest?.headSha;
      if (!generation || !headSha) return;
      const response = await pullRequestService.page({
        collection,
        cursor,
        expectedHeadSha: headSha,
        id: reviewId,
        threadId,
      });
      const page = response?.data as ReviewPagerPage | undefined;
      if (!page) return;
      if (page.stale) {
        if (pagerKeyRef.current === generation) setStale(true);
        return;
      }
      setPager((current) => applyReviewPagerPage(current, generation, page));
    },
    [pullRequest?.headSha, reviewId, setStale],
  );

  /** Handle a write failure — conflict codes refresh, others toast. */
  const onWriteError = useCallback(
    (writeError: unknown, fallbackKey: string) => {
      console.error('[reviews:write]', writeError);
      const code = writeErrorCode(writeError);
      if (code === 'HEAD_DRIFTED' || code === 'STALE_SNAPSHOT') {
        setStale(true);
        toast.error(t('reviews.headDrifted'));
        void refresh();
        return;
      }
      if (code === 'PENDING_REVIEW_CONFLICT' || code === 'OPERATION_CONFLICT') {
        toast.error(t('reviews.sessionConflict'));
        void refresh();
        return;
      }
      if (code === 'PERMISSION_DENIED' || isTrpcErrorCode(writeError, 'FORBIDDEN')) {
        toast.error(t('reviews.writeForbidden'));
        return;
      }
      toast.error(t(fallbackKey as never));
    },
    [refresh, setStale, t],
  );

  /**
   * A write whose response was lost — the operation may already be posted on
   * GitHub. Refresh to reconcile (the detail snapshot re-reads remote state),
   * surface the recoverable state, and keep the caller's draft. Retrying the
   * same intent reuses the same operationId, so the server dedupes or
   * reconciles instead of dispatching a duplicate.
   */
  const reportUnknownOutcome = useCallback((): WriteOutcome => {
    toast.error(t('reviews.outcomeUnknown'));
    void refresh();
    return 'unknown';
  }, [refresh, t]);

  // Intent-derived operationIds: the same logical write (same workspace, PR,
  // head, session, action and payload) produces the same id across retries
  // and refreshes; any changed field is a new intent and gets a new id.
  const submit = useCallback(
    async (
      event: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES',
      body: string,
    ): Promise<WriteOutcome> => {
      if (!reviewId || !pullRequest?.headSha) return 'failed';
      try {
        const result = await pullRequestService.submitReview({
          body: body || undefined,
          event,
          id: reviewId,
          observedHeadSha: pullRequest.headSha,
          operationId: reviewOperationId({
            action: 'submitReview',
            body,
            event,
            headSha: pullRequest.headSha,
            pullRequestId: reviewId,
            reviewSessionId: pullRequest.reviewSession.pendingReviewId,
            snapshotId: pullRequest.snapshotId,
            viewerLogin: pullRequest.viewerLogin,
            workspaceId,
          }),
          // Adopting a pending draft is explicit: the banner above the form
          // tells the reviewer the draft will be published.
          reviewSessionId: pullRequest.reviewSession.pendingReviewId ?? undefined,
          snapshotId: pullRequest.snapshotId,
        });
        const receipt = result?.data;
        // A null/empty receipt is never a success — don't clear the draft.
        if (!receipt || (!receipt.data?.id && !receipt.data?.databaseId)) {
          toast.error(t('reviews.submitFailed'));
          return 'failed';
        }
        toast.success(t('reviews.submitted'));
        await refresh();
        return 'applied';
      } catch (submitError) {
        if (writeErrorCode(submitError) === 'OUTCOME_UNKNOWN') return reportUnknownOutcome();
        onWriteError(submitError, 'reviews.submitFailed');
        return 'failed';
      }
    },
    [onWriteError, pullRequest, refresh, reportUnknownOutcome, reviewId, t, workspaceId],
  );
  const composer = useReviewComposer(reviewId, submit, refresh);

  const replyToThread = useCallback(
    async (threadId: string, body: string): Promise<WriteOutcome> => {
      if (!pullRequest?.headSha) return 'failed';
      try {
        const result = await pullRequestService.replyThread({
          body,
          id: reviewId,
          observedHeadSha: pullRequest.headSha,
          operationId: reviewOperationId({
            action: 'replyToThread',
            body,
            headSha: pullRequest.headSha,
            pullRequestId: reviewId,
            snapshotId: pullRequest.snapshotId,
            threadId,
            viewerLogin: pullRequest.viewerLogin,
            workspaceId,
          }),
          snapshotId: pullRequest.snapshotId,
          threadId,
        });
        if (!result?.data?.data?.comment?.id && !result?.data?.data?.comment?.databaseId) {
          toast.error(t('reviews.replyFailed'));
          return 'failed';
        }
        await refresh();
        return 'applied';
      } catch (replyError) {
        if (writeErrorCode(replyError) === 'OUTCOME_UNKNOWN') return reportUnknownOutcome();
        onWriteError(replyError, 'reviews.replyFailed');
        return 'failed';
      }
    },
    [onWriteError, pullRequest, refresh, reportUnknownOutcome, reviewId, t, workspaceId],
  );

  const addFileComment = useCallback(
    async (params: {
      body: string;
      line: number;
      path: string;
      side: 'LEFT' | 'RIGHT';
    }): Promise<WriteOutcome> => {
      if (!pullRequest?.headSha) return 'failed';
      try {
        const result = await pullRequestService.addFileComment({
          ...params,
          id: reviewId,
          observedHeadSha: pullRequest.headSha,
          operationId: reviewOperationId({
            action: 'addFileComment',
            body: params.body,
            headSha: pullRequest.headSha,
            line: params.line,
            path: params.path,
            pullRequestId: reviewId,
            side: params.side,
            snapshotId: pullRequest.snapshotId,
            viewerLogin: pullRequest.viewerLogin,
            workspaceId,
          }),
          snapshotId: pullRequest.snapshotId,
        });
        if (!result?.data?.data?.thread?.id) {
          toast.error(t('reviews.commentFailed'));
          return 'failed';
        }
        await refresh();
        return 'applied';
      } catch (commentError) {
        if (writeErrorCode(commentError) === 'OUTCOME_UNKNOWN') return reportUnknownOutcome();
        onWriteError(commentError, 'reviews.commentFailed');
        return 'failed';
      }
    },
    [onWriteError, pullRequest, refresh, reportUnknownOutcome, reviewId, t, workspaceId],
  );

  const allFiles = useMemo(
    () => [...(pullRequest?.files.items ?? []), ...activePager.files],
    [pullRequest?.files.items, activePager.files],
  );
  const allThreads = useMemo(
    () =>
      [...(pullRequest?.threads.items ?? []), ...activePager.threads].map((thread) => {
        const meta = activePager.meta[`comments:${thread.id}`];
        return {
          ...thread,
          comments: {
            ...thread.comments,
            endCursor: meta ? meta.endCursor : thread.comments.endCursor,
            hasMore: meta ? meta.hasMore : thread.comments.hasMore,
            items: [...thread.comments.items, ...(activePager.comments[thread.id] ?? [])],
            total: meta?.total ?? thread.comments.total,
          },
        };
      }),
    [pullRequest?.threads.items, activePager],
  );
  const allReviews = useMemo(
    () => [...(pullRequest?.reviews.items ?? []), ...activePager.reviews],
    [pullRequest?.reviews.items, activePager.reviews],
  );
  const allChecks = useMemo(
    () => [...(pullRequest?.checks.items ?? []), ...activePager.checks],
    [pullRequest?.checks.items, activePager.checks],
  );

  const writeDisabled = stale || !pullRequest?.headSha || !pullRequest.reviewWritesEnabled;

  const scrollToFile = (filename: string) => {
    document
      .getElementById(`file-${encodeURIComponent(filename)}`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const openFile = (filename: string) => {
    setDetailViewState({ id: reviewId, view: 'diff' });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => scrollToFile(filename)));
  };

  // Threads that anchor on a specific file render under that file's diff;
  // unattached threads go to the conversation section.
  const threadsByFile = useMemo(() => {
    const map = new Map<string, ReviewThread[]>();
    for (const thread of allThreads) {
      if (!thread.path) continue;
      const list = map.get(thread.path) ?? [];
      list.push(thread);
      map.set(thread.path, list);
    }
    return map;
  }, [allThreads]);
  const unattachedThreads = allThreads.filter((thread) => !thread.path);

  const canSubmitReview = Boolean(
    pullRequest?.reviewWritesEnabled &&
    pullRequest.viewerLogin &&
    pullRequest.viewerLogin.toLowerCase() !== pullRequest.author?.toLowerCase(),
  );

  return (
    <WorkSurface>
      <NavHeader
        styles={{ left: { flex: 1, minWidth: 0 }, right: { flex: 'none' } }}
        left={
          <Flexbox horizontal align={'center'} gap={8} style={{ flex: 1, minWidth: 0 }}>
            {!embedded || showBack ? (
              <Button
                aria-label={t('reviews.backToPullRequests')}
                icon={<Icon icon={ChevronLeftIcon} />}
                size={'small'}
                type={'text'}
                onClick={() => navigate(returnTo)}
              />
            ) : null}
            <Text className={styles.headerCrumb} fontSize={12} type={'secondary'}>
              {t('tab.reviews')}
            </Text>
            <Text className={styles.headerCrumb} fontSize={12} type={'secondary'}>
              ›
            </Text>
            <Icon color={cssVar.colorSuccess} icon={GitPullRequestIcon} size={14} />
            <Text ellipsis className={styles.headerTitle} fontSize={13} weight={500}>
              {pullRequest?.title ?? t('tab.reviews')}
            </Text>
          </Flexbox>
        }
        right={
          pullRequest ? (
            <Flexbox horizontal align={'center'} gap={8}>
              <Text
                className={styles.headerCounter}
                fontSize={12}
                style={{ color: cssVar.colorSuccess }}
              >
                +{pullRequest.additions}
              </Text>
              <Text
                className={styles.headerCounter}
                fontSize={12}
                style={{ color: cssVar.colorError }}
              >
                −{pullRequest.deletions}
              </Text>
              <Button
                aria-label={t('reviews.openInGitHub')}
                icon={<Icon icon={ExternalLinkIcon} />}
                size={'small'}
                title={t('reviews.openInGitHub')}
                type={'text'}
                onClick={() => window.open(pullRequest.url, '_blank', 'noopener,noreferrer')}
              />
            </Flexbox>
          ) : undefined
        }
      />
      <div className={styles.modeBar}>
        <button
          aria-selected={activeView === 'overview'}
          className={styles.modeButton}
          role={'tab'}
          type={'button'}
          onClick={() => setDetailViewState({ id: reviewId, view: 'overview' })}
        >
          {t('reviews.overview')}
        </button>
        <button
          aria-selected={activeView === 'diff'}
          className={styles.modeButton}
          role={'tab'}
          type={'button'}
          onClick={() => setDetailViewState({ id: reviewId, view: 'diff' })}
        >
          {t('reviews.diff')}
        </button>
        <Flexbox flex={1} />
        {pullRequest && canSubmitReview ? (
          <Button
            aria-expanded={composer.open}
            disabled={writeDisabled}
            size={'small'}
            type={'primary'}
            onClick={() => composer.setOpen(!composer.open)}
          >
            {t('reviews.submitReviewTitle')}
          </Button>
        ) : pullRequest ? (
          <Button
            size={'small'}
            type={'primary'}
            onClick={() => window.open(pullRequest.url, '_blank', 'noopener,noreferrer')}
          >
            {t('reviews.openInGitHub')}
          </Button>
        ) : null}
      </div>
      <WorkSurfaceReview>
        <div className={styles.detailBody}>
          {isLoading ? (
            <SkeletonList padding={8} rows={5} />
          ) : notConnected ? (
            <Center gap={8} padding={24}>
              <Empty description={t('reviews.connectGitHub')} icon={PlugIcon} />
              <ConnectGitHubButton onConnected={refresh} />
            </Center>
          ) : error ? (
            <AsyncError error={error} variant={'block'} onRetry={() => void refresh()} />
          ) : pullRequest ? (
            <>
              {stale ? (
                <Flexbox className={styles.staleBanner} role={'alert'}>
                  <Text fontSize={13}>{t('reviews.staleBanner')}</Text>
                  <Button size={'small'} onClick={() => void refresh()}>
                    {t('reviews.staleAction')}
                  </Button>
                </Flexbox>
              ) : null}
              {canSubmitReview ? (
                <div className={styles.reviewComposer} hidden={!composer.open}>
                  <ReviewSubmitPanel
                    composer={composer}
                    disabled={writeDisabled}
                    pendingReviewId={pullRequest.reviewSession.pendingReviewId}
                    stale={stale}
                  />
                </div>
              ) : null}
              {activeView === 'overview' ? (
                <ReviewOverview
                  files={allFiles}
                  hasMoreFiles={activePager.meta.files?.hasMore ?? pullRequest.files.hasMore}
                  pullRequest={pullRequest}
                  onFileSelect={openFile}
                  onViewMoreFiles={() => setDetailViewState({ id: reviewId, view: 'diff' })}
                >
                  {unattachedThreads.length + allReviews.length > 0 ? (
                    <Flexbox gap={8} style={{ marginBlockStart: 32 }}>
                      <Text className={styles.sectionTitle} type={'secondary'} weight={500}>
                        {t('reviews.conversation')}
                      </Text>
                      {allReviews.map((review, index) => {
                        const visual = reviewStateVisual(review.state);
                        return (
                          <Flexbox className={styles.reviewCard} gap={4} key={review.id ?? index}>
                            <Flexbox horizontal align={'center'} gap={8}>
                              <Avatar
                                avatar={review.authorAvatar ?? undefined}
                                name={review.author ?? '?'}
                                size={20}
                              />
                              <Icon color={visual.color} icon={visual.icon} size={14} />
                              <Text fontSize={12} weight={500}>
                                {review.author}
                              </Text>
                              <Text fontSize={12} type={'secondary'}>
                                {t(visual.labelKey as never)}
                              </Text>
                              {review.submittedAt ? (
                                <Text
                                  fontSize={12}
                                  title={dayjs(review.submittedAt).format('YYYY-MM-DD HH:mm')}
                                  type={'secondary'}
                                >
                                  {dayjs(review.submittedAt).fromNow()}
                                </Text>
                              ) : null}
                            </Flexbox>
                            {review.body ? (
                              <Markdown fontSize={13} variant={'chat'}>
                                {review.body}
                              </Markdown>
                            ) : null}
                          </Flexbox>
                        );
                      })}
                      {unattachedThreads.map((thread) => (
                        <ReviewThreadCard
                          key={thread.id}
                          stale={stale}
                          thread={thread}
                          writeDisabled={writeDisabled}
                          onReply={replyToThread}
                          onLoadMoreComments={(threadId, cursor) =>
                            loadMore('comments', cursor, threadId)
                          }
                        />
                      ))}
                      <CollectionFooter
                        error={conversationMore.loadMoreError}
                        loaded={allThreads.length + allReviews.length}
                        hasMore={
                          (activePager.meta.threads?.hasMore ?? pullRequest.threads.hasMore) ||
                          (activePager.meta.reviews?.hasMore ?? pullRequest.reviews.hasMore)
                        }
                        total={
                          (activePager.meta.threads?.total ?? pullRequest.threads.total ?? 0) +
                          (activePager.meta.reviews?.total ?? pullRequest.reviews.total ?? 0)
                        }
                        onRetry={conversationMore.retryLoadMore}
                        onLoadMore={
                          (activePager.meta.threads?.endCursor ?? pullRequest.threads.endCursor)
                            ? () =>
                                conversationMore.runLoadMore(() =>
                                  loadMore(
                                    'threads',
                                    (activePager.meta.threads?.endCursor ??
                                      pullRequest.threads.endCursor)!,
                                  ),
                                )
                            : (activePager.meta.reviews?.endCursor ?? pullRequest.reviews.endCursor)
                              ? () =>
                                  conversationMore.runLoadMore(() =>
                                    loadMore(
                                      'reviews',
                                      (activePager.meta.reviews?.endCursor ??
                                        pullRequest.reviews.endCursor)!,
                                    ),
                                  )
                              : undefined
                        }
                      />
                    </Flexbox>
                  ) : null}
                  {allChecks.length > 0 ? (
                    <div style={{ marginBlockStart: 32 }}>
                      <ReviewChecksPanel
                        checks={{
                          ...pullRequest.checks,
                          endCursor:
                            activePager.meta.checks?.endCursor ?? pullRequest.checks.endCursor,
                          hasMore: activePager.meta.checks?.hasMore ?? pullRequest.checks.hasMore,
                          items: allChecks,
                          loaded: allChecks.length,
                          total: activePager.meta.checks?.total ?? pullRequest.checks.total,
                        }}
                        onLoadMore={(cursor) => loadMore('checks', cursor)}
                      />
                    </div>
                  ) : null}
                </ReviewOverview>
              ) : (
                <Flexbox className={styles.diffBody} gap={12}>
                  <Flexbox horizontal align={'center'} gap={8}>
                    <Text weight={500}>
                      {t('reviews.filesChangedTitle', { count: pullRequest.changedFiles })}
                    </Text>
                    <Flexbox flex={1} />
                    <Segmented
                      size={'small'}
                      value={viewMode}
                      options={[
                        { label: t('reviews.viewSplit'), value: 'split' },
                        { label: t('reviews.viewUnified'), value: 'unified' },
                      ]}
                      onChange={(value) => setViewMode(value as 'split' | 'unified')}
                    />
                  </Flexbox>
                  {allFiles.map((file) => (
                    <Flexbox gap={8} key={file.filename}>
                      <ReviewFileCard
                        file={file}
                        viewMode={viewMode}
                        writeDisabled={writeDisabled}
                        onComment={addFileComment}
                      />
                      {(threadsByFile.get(file.filename) ?? []).map((thread) => (
                        <ReviewThreadCard
                          key={thread.id}
                          stale={stale}
                          thread={thread}
                          writeDisabled={writeDisabled}
                          onReply={replyToThread}
                          onLoadMoreComments={(threadId, cursor) =>
                            loadMore('comments', cursor, threadId)
                          }
                        />
                      ))}
                    </Flexbox>
                  ))}
                  <CollectionFooter
                    error={filesMore.loadMoreError}
                    hasMore={activePager.meta.files?.hasMore ?? pullRequest.files.hasMore}
                    loaded={allFiles.length}
                    total={activePager.meta.files?.total ?? pullRequest.files.total}
                    onRetry={filesMore.retryLoadMore}
                    onLoadMore={
                      (activePager.meta.files?.endCursor ?? pullRequest.files.endCursor)
                        ? () =>
                            filesMore.runLoadMore(() =>
                              loadMore(
                                'files',
                                (activePager.meta.files?.endCursor ?? pullRequest.files.endCursor)!,
                              ),
                            )
                        : undefined
                    }
                  />
                </Flexbox>
              )}
            </>
          ) : null}
        </div>
      </WorkSurfaceReview>
    </WorkSurface>
  );
});

ReviewPullRequestPage.displayName = 'ReviewPullRequestPage';

export default ReviewPullRequestPage;
