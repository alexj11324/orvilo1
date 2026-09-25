'use client';

import { Center, Empty, Flexbox, Icon, Markdown } from '@lobehub/ui';
import { Button, Segmented, Tag, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  CircleDashedIcon,
  ExternalLinkIcon,
  GitPullRequestArrowIcon,
  GitPullRequestClosedIcon,
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
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { WorkSurface, WorkSurfaceReview } from '@/features/WorkSurface';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { pullRequestKeys } from '@/libs/swr/keys';
import { pullRequestService, type ReviewPageCollection } from '@/services/pullRequest';
import { isTrpcErrorCode } from '@/utils/trpcError';

import CollectionFooter from './CollectionFooter';
import ReviewChecksPanel, { checkSummaryVisual } from './ReviewChecksPanel';
import ReviewFileCard from './ReviewFileCard';
import { reviewOperationId } from './reviewOperationId';
import {
  applyReviewPagerPage,
  emptyReviewPager,
  reviewPagerKey,
  type ReviewPagerPage,
  reviewPagerScope,
} from './reviewPager';
import ReviewSubmitPanel from './ReviewSubmitPanel';
import ReviewThreadCard from './ReviewThreadCard';
import type { PullRequestDetail, ReviewThread, WriteOutcome } from './types';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  fileNavRow: css`
    cursor: pointer;

    display: flex;
    gap: 6px;
    align-items: center;

    padding-block: 5px;
    padding-inline: 10px;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  identifier: css`
    font-family: ${cssVar.fontFamilyCode};
    color: ${cssVar.colorTextSecondary};
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

const prStateVisual = (pullRequest: PullRequestDetail) => {
  if (pullRequest.state === 'MERGED') {
    return { color: 'purple', icon: GitPullRequestArrowIcon, labelKey: 'reviews.state.merged' };
  }
  if (pullRequest.state === 'CLOSED') {
    return { color: 'red', icon: GitPullRequestClosedIcon, labelKey: 'reviews.state.closed' };
  }
  if (pullRequest.isDraft) {
    return { color: 'default', icon: GitPullRequestIcon, labelKey: 'reviews.state.draft' };
  }
  return { color: 'green', icon: GitPullRequestIcon, labelKey: 'reviews.state.open' };
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
 * `/reviews/:reviewId` — a code-review work surface: file navigation on the
 * left, diff + inline threads in the main column, explicit review-submit
 * region at the bottom. Every write is pinned to `snapshotId` +
 * `observedHeadSha`; drift and stale pages gate the write instead of landing
 * on a head the reviewer never saw.
 */
const ReviewPullRequestPage = memo(() => {
  const { t } = useTranslation('common');
  const { reviewId: rawId } = useParams<{ reviewId: string }>();
  const reviewId = rawId ? decodeURIComponent(rawId) : '';
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const location = useLocation();
  // The queue passes its exact URL; fall back to the workspace-aware list.
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? '/reviews';

  const { data, error, isLoading } = useClientDataSWR(
    reviewId ? pullRequestKeys.detail(workspaceId, reviewId) : null,
    () => pullRequestService.detail(reviewId),
  );
  const pullRequest = data?.data as PullRequestDetail | undefined;
  const notConnected = isTrpcErrorCode(error, 'PRECONDITION_FAILED');

  const [stale, setStale] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');

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
  if (pager.key !== pagerKey) setPager(emptyReviewPager(pagerKey));
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
  }, [reviewId, workspaceId]);

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
    [pullRequest?.headSha, reviewId],
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
    [refresh, t],
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

  const state = pullRequest ? prStateVisual(pullRequest) : null;
  const checksSummary = pullRequest?.checks.summary ?? null;
  const checksVisual = checksSummary ? checkSummaryVisual(checksSummary.state) : null;
  const writeDisabled = stale || !pullRequest?.headSha;

  const scrollToFile = (filename: string) => {
    document
      .getElementById(`file-${encodeURIComponent(filename)}`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
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

  return (
    <WorkSurface>
      <NavHeader
        left={
          <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 0 }}>
            <Button
              aria-label={t('reviews.backToPullRequests')}
              icon={<Icon icon={ChevronLeftIcon} />}
              size={'small'}
              type={'text'}
              onClick={() => navigate(returnTo)}
            />
            <Text ellipsis weight={500}>
              {pullRequest?.title ?? t('tab.reviews')}
            </Text>
          </Flexbox>
        }
      />
      <WorkSurfaceReview
        navWidth={240}
        footer={
          pullRequest ? (
            <ReviewSubmitPanel
              disabled={writeDisabled}
              pendingReviewId={pullRequest.reviewSession.pendingReviewId}
              stale={stale}
              onSubmit={submit}
              onVerify={refresh}
            />
          ) : undefined
        }
        nav={
          pullRequest && allFiles.length > 0 ? (
            <Flexbox gap={2} paddingBlock={8}>
              <Text
                fontSize={12}
                style={{ paddingBlock: 4, paddingInline: 10 }}
                type={'secondary'}
                weight={500}
              >
                {t('reviews.filesChangedTitle', { count: pullRequest.changedFiles })}
              </Text>
              {allFiles.map((file) => (
                <Flexbox
                  className={styles.fileNavRow}
                  key={file.filename}
                  title={file.filename}
                  onClick={() => scrollToFile(file.filename)}
                >
                  <Text ellipsis className={styles.identifier} fontSize={12}>
                    {file.filename}
                  </Text>
                  <Flexbox flex={1} />
                  <Text fontSize={12} type={'secondary'}>
                    +{file.additions} −{file.deletions}
                  </Text>
                </Flexbox>
              ))}
              <CollectionFooter
                hasMore={activePager.meta.files?.hasMore ?? pullRequest.files.hasMore}
                loaded={allFiles.length}
                total={activePager.meta.files?.total ?? pullRequest.files.total}
                onLoadMore={
                  (activePager.meta.files?.endCursor ?? pullRequest.files.endCursor)
                    ? () =>
                        void loadMore(
                          'files',
                          (activePager.meta.files?.endCursor ?? pullRequest.files.endCursor)!,
                        )
                    : undefined
                }
              />
            </Flexbox>
          ) : undefined
        }
        navLabel={t('reviews.filesChangedTitle', {
          count: pullRequest?.changedFiles ?? allFiles.length,
        })}
      >
        <Flexbox gap={16} padding={16}>
          {isLoading ? (
            <Center padding={32}>
              <Text type={'secondary'}>{t('myWork.loading')}</Text>
            </Center>
          ) : notConnected ? (
            <Center gap={8} padding={24}>
              <Empty description={t('reviews.connectGitHub')} icon={PlugIcon} />
              <Button onClick={() => navigate('/settings/connector')}>
                {t('reviews.connectGitHubAction')}
              </Button>
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

              <Flexbox gap={8}>
                <Flexbox horizontal align={'center'} gap={8} wrap={'wrap'}>
                  {state ? <Tag color={state.color}>{t(state.labelKey as never)}</Tag> : null}
                  <Text className={styles.identifier} fontSize={13}>
                    {pullRequest.headRef ?? ''} → {pullRequest.baseRef ?? ''}
                  </Text>
                  <Text className={styles.identifier} fontSize={13}>
                    {pullRequest.headSha ? pullRequest.headSha.slice(0, 7) : ''}
                  </Text>
                  <Flexbox flex={1} />
                  <Button
                    icon={<Icon icon={ExternalLinkIcon} />}
                    size={'small'}
                    type={'text'}
                    onClick={() => window.open(pullRequest.url, '_blank', 'noopener,noreferrer')}
                  >
                    {t('reviews.openInGitHub')}
                  </Button>
                </Flexbox>
                <Flexbox horizontal align={'center'} gap={12} wrap={'wrap'}>
                  <Flexbox horizontal align={'center'} gap={6}>
                    <Avatar
                      avatar={pullRequest.authorAvatar ?? undefined}
                      name={pullRequest.author ?? '?'}
                      size={20}
                    />
                    <Text fontSize={13}>{pullRequest.author}</Text>
                  </Flexbox>
                  <Text fontSize={13} type={'secondary'}>
                    +{pullRequest.additions} −{pullRequest.deletions} ·{' '}
                    {t('reviews.filesChanged', { count: pullRequest.changedFiles })}
                  </Text>
                  {checksVisual && checksSummary ? (
                    <Text fontSize={13} style={{ color: checksVisual.color }}>
                      {t(checksVisual.labelKey as never, { count: checksSummary.failing })}
                    </Text>
                  ) : null}
                  {pullRequest.rateLimit?.remaining !== null &&
                  pullRequest.rateLimit?.remaining !== undefined &&
                  pullRequest.rateLimit.remaining < 500 ? (
                    <Text fontSize={12} type={'warning'}>
                      {t('reviews.rateLimit', { remaining: pullRequest.rateLimit.remaining })}
                    </Text>
                  ) : null}
                </Flexbox>
              </Flexbox>

              {pullRequest.body ? (
                <Flexbox className={styles.card} padding={12}>
                  <Markdown fontSize={14} variant={'chat'}>
                    {pullRequest.body}
                  </Markdown>
                </Flexbox>
              ) : null}

              {allChecks.length > 0 ? (
                <ReviewChecksPanel
                  checks={{
                    ...pullRequest.checks,
                    endCursor: activePager.meta.checks?.endCursor ?? pullRequest.checks.endCursor,
                    hasMore: activePager.meta.checks?.hasMore ?? pullRequest.checks.hasMore,
                    items: allChecks,
                    loaded: allChecks.length,
                    total: activePager.meta.checks?.total ?? pullRequest.checks.total,
                  }}
                  onLoadMore={(cursor) => void loadMore('checks', cursor)}
                />
              ) : null}

              {allFiles.length > 0 ? (
                <Flexbox gap={8}>
                  <Flexbox horizontal align={'center'} gap={8}>
                    <Text className={styles.sectionTitle} type={'secondary'} weight={500}>
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
                    hasMore={activePager.meta.files?.hasMore ?? pullRequest.files.hasMore}
                    loaded={allFiles.length}
                    total={activePager.meta.files?.total ?? pullRequest.files.total}
                    onLoadMore={
                      (activePager.meta.files?.endCursor ?? pullRequest.files.endCursor)
                        ? () =>
                            void loadMore(
                              'files',
                              (activePager.meta.files?.endCursor ?? pullRequest.files.endCursor)!,
                            )
                        : undefined
                    }
                  />
                </Flexbox>
              ) : null}

              {unattachedThreads.length + allReviews.length > 0 ? (
                <Flexbox gap={8}>
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
                    loaded={allThreads.length + allReviews.length}
                    hasMore={
                      (activePager.meta.threads?.hasMore ?? pullRequest.threads.hasMore) ||
                      (activePager.meta.reviews?.hasMore ?? pullRequest.reviews.hasMore)
                    }
                    total={
                      (activePager.meta.threads?.total ?? pullRequest.threads.total ?? 0) +
                      (activePager.meta.reviews?.total ?? pullRequest.reviews.total ?? 0)
                    }
                    onLoadMore={
                      (activePager.meta.threads?.endCursor ?? pullRequest.threads.endCursor)
                        ? () =>
                            void loadMore(
                              'threads',
                              (activePager.meta.threads?.endCursor ??
                                pullRequest.threads.endCursor)!,
                            )
                        : (activePager.meta.reviews?.endCursor ?? pullRequest.reviews.endCursor)
                          ? () =>
                              void loadMore(
                                'reviews',
                                (activePager.meta.reviews?.endCursor ??
                                  pullRequest.reviews.endCursor)!,
                              )
                          : undefined
                    }
                  />
                </Flexbox>
              ) : null}
            </>
          ) : null}
        </Flexbox>
      </WorkSurfaceReview>
    </WorkSurface>
  );
});

ReviewPullRequestPage.displayName = 'ReviewPullRequestPage';

export default ReviewPullRequestPage;
