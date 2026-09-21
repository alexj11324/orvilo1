'use client';

import { Center, Empty, Flexbox, Icon, Markdown, PatchDiff } from '@lobehub/ui';
import { Button, Tag, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CircleDashedIcon,
  ExternalLinkIcon,
  FileDiffIcon,
  GitPullRequestArrowIcon,
  GitPullRequestClosedIcon,
  GitPullRequestIcon,
  MessageSquarePlusIcon,
  PlugIcon,
  XCircleIcon,
} from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import TextArea from '@/components/TextArea';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { pullRequestKeys } from '@/libs/swr/keys';
import { pullRequestService } from '@/services/pullRequest';
import { isTrpcErrorCode } from '@/utils/trpcError';

type PullRequestDetail = {
  additions: number;
  author: string | null;
  authorAvatar: string | null;
  baseRef: string | null;
  body: string;
  changedFiles: number;
  checks: {
    conclusion: string | null;
    detailsUrl: string | null;
    name: string;
    status: string | null;
  }[];
  checksState: string | null;
  deletions: number;
  files: {
    additions: number;
    deletions: number;
    filename: string;
    patch: string | null;
    previousFilename: string | null;
    status: string;
  }[];
  headRef: string | null;
  headSha: string | null;
  id: string;
  isDraft: boolean;
  mergeable: string | null;
  number: number;
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  reviews: {
    author: string | null;
    authorAvatar: string | null;
    body: string;
    state: string | null;
    submittedAt: string | null;
  }[];
  state: string | null;
  threads: {
    comments: {
      author: string | null;
      authorAvatar: string | null;
      body: string;
      createdAt: string | null;
      line: number | null;
      outdated: boolean;
      path: string | null;
      side: string | null;
    }[];
    id: string;
    isResolved: boolean;
    line: number | null;
    path: string | null;
  }[];
  title: string;
  url: string;
};

const styles = createStaticStyles(({ css }) => ({
  card: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  cardHeader: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  checkRow: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 5px;
    padding-inline: 12px;
  `,
  commentBox: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-block-start: 1px dashed ${cssVar.colorBorderSecondary};
  `,
  fileHeader: css`
    cursor: pointer;
    display: flex;
    gap: 8px;
    align-items: center;
  `,
  identifier: css`
    font-family: ${cssVar.fontFamilyCode};
    color: ${cssVar.colorTextSecondary};
  `,
  sectionTitle: css`
    padding-inline-start: 4px;
  `,
  threadHeader: css`
    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
}));

const checkIcon = (check: { conclusion: string | null; status: string | null }) => {
  const conclusion = check.conclusion ?? check.status;
  if (conclusion === 'SUCCESS' || conclusion === 'NEUTRAL' || conclusion === 'COMPLETED') {
    return { color: cssVar.colorSuccess, icon: CheckCircle2Icon };
  }
  if (
    conclusion === 'SKIPPED' ||
    conclusion === 'STALE' ||
    conclusion === null ||
    conclusion === 'IN_PROGRESS' ||
    conclusion === 'QUEUED' ||
    conclusion === 'PENDING' ||
    conclusion === 'EXPECTED'
  ) {
    return { color: cssVar.colorWarning, icon: CircleDashedIcon };
  }
  return { color: cssVar.colorError, icon: XCircleIcon };
};

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
    return {
      color: 'red',
      icon: GitPullRequestClosedIcon,
      labelKey: 'reviews.state.closed',
    };
  }
  if (pullRequest.isDraft) {
    return { color: 'default', icon: GitPullRequestIcon, labelKey: 'reviews.state.draft' };
  }
  return { color: 'green', icon: GitPullRequestIcon, labelKey: 'reviews.state.open' };
};

const CommentComposer = memo<{
  onSubmit: (body: string) => Promise<boolean>;
  placeholder: string;
  submitLabel: string;
}>(({ onSubmit, placeholder, submitLabel }) => {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <Flexbox gap={8}>
      <TextArea placeholder={placeholder} rows={3} value={body} onChange={setBody} />
      <Flexbox horizontal justify={'flex-end'}>
        <Button
          disabled={!body.trim()}
          loading={submitting}
          size={'small'}
          onClick={async () => {
            setSubmitting(true);
            const ok = await onSubmit(body.trim());
            setSubmitting(false);
            if (ok) setBody('');
          }}
        >
          {submitLabel}
        </Button>
      </Flexbox>
    </Flexbox>
  );
});

CommentComposer.displayName = 'CommentComposer';

const FileBlock = memo<{
  file: PullRequestDetail['files'][number];
  onComment: (params: { body: string; line: number; side: 'LEFT' | 'RIGHT' }) => Promise<boolean>;
}>(({ file, onComment }) => {
  const { t } = useTranslation('common');
  const [collapsed, setCollapsed] = useState(false);
  const [commentAt, setCommentAt] = useState<{ line: number; side: 'LEFT' | 'RIGHT' } | null>(null);

  return (
    <Flexbox className={styles.card}>
      <Flexbox
        horizontal
        align={'center'}
        className={`${styles.cardHeader} ${styles.fileHeader}`}
        onClick={() => setCollapsed((current) => !current)}
      >
        <Icon
          icon={ChevronDownIcon}
          size={14}
          style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }}
        />
        <Icon color={cssVar.colorTextSecondary} icon={FileDiffIcon} size={14} />
        <Text className={styles.threadHeader} weight={500}>
          {file.status === 'renamed' && file.previousFilename
            ? `${file.previousFilename} → ${file.filename}`
            : file.filename}
        </Text>
        <Flexbox flex={1} />
        <Text fontSize={12} type={'secondary'}>
          +{file.additions} −{file.deletions}
        </Text>
      </Flexbox>
      {collapsed ? null : file.patch ? (
        <>
          <PatchDiff
            fileName={file.filename}
            patch={file.patch}
            showHeader={false}
            viewMode={'unified'}
            diffOptions={{
              enableGutterUtility: true,
              lineHoverHighlight: 'both',
              // The gutter "+" affordance mirrors GitHub: click picks the line
              // (and additions/deletions side) for a review comment.
              onGutterUtilityClick: (range) => {
                const side =
                  range.endSide === 'deletions' || range.side === 'deletions' ? 'LEFT' : 'RIGHT';
                setCommentAt({ line: range.end, side });
              },
            }}
          />
          {commentAt ? (
            <Flexbox className={styles.commentBox} gap={8}>
              <Text className={styles.threadHeader}>
                {file.filename}:{commentAt.line} ·{' '}
                {commentAt.side === 'LEFT'
                  ? t('reviews.commentSideLeft')
                  : t('reviews.commentSideRight')}
              </Text>
              <CommentComposer
                placeholder={t('reviews.commentPlaceholder')}
                submitLabel={t('reviews.addComment')}
                onSubmit={async (body) => {
                  const ok = await onComment({
                    body,
                    line: commentAt.line,
                    side: commentAt.side,
                  });
                  if (ok) setCommentAt(null);
                  return ok;
                }}
              />
            </Flexbox>
          ) : null}
        </>
      ) : (
        <Flexbox padding={12}>
          <Text fontSize={12} type={'secondary'}>
            {t('reviews.diffUnavailable')}
          </Text>
        </Flexbox>
      )}
    </Flexbox>
  );
});

FileBlock.displayName = 'FileBlock';

const ThreadBlock = memo<{
  onReply: (threadId: string, body: string) => Promise<boolean>;
  thread: PullRequestDetail['threads'][number];
}>(({ onReply, thread }) => {
  const { t } = useTranslation('common');
  const [replyOpen, setReplyOpen] = useState(false);
  const anchor = thread.path ? `${thread.path}${thread.line ? `:${thread.line}` : ''}` : null;
  return (
    <Flexbox className={styles.card}>
      {anchor ? (
        <Flexbox horizontal align={'center'} className={styles.cardHeader} gap={8}>
          <Text className={styles.threadHeader}>{anchor}</Text>
          {thread.isResolved ? <Tag color={'green'}>{t('reviews.threadResolved')}</Tag> : null}
        </Flexbox>
      ) : null}
      {thread.comments.map((comment, index) => (
        <Flexbox gap={4} key={`${comment.createdAt ?? ''}-${index}`} padding={12}>
          <Flexbox horizontal align={'center'} gap={8}>
            <Avatar
              avatar={comment.authorAvatar ?? undefined}
              name={comment.author ?? '?'}
              size={20}
            />
            <Text fontSize={12} weight={500}>
              {comment.author}
            </Text>
            {comment.outdated ? <Tag>{t('reviews.threadOutdated')}</Tag> : null}
            {comment.createdAt ? (
              <Text
                fontSize={12}
                title={dayjs(comment.createdAt).format('YYYY-MM-DD HH:mm')}
                type={'secondary'}
              >
                {dayjs(comment.createdAt).fromNow()}
              </Text>
            ) : null}
          </Flexbox>
          <Markdown fontSize={13} variant={'chat'}>
            {comment.body}
          </Markdown>
        </Flexbox>
      ))}
      <Flexbox className={styles.commentBox}>
        {replyOpen ? (
          <CommentComposer
            placeholder={t('reviews.replyPlaceholder')}
            submitLabel={t('reviews.reply')}
            onSubmit={async (body) => {
              const ok = await onReply(thread.id, body);
              if (ok) setReplyOpen(false);
              return ok;
            }}
          />
        ) : (
          <Button size={'small'} type={'text'} onClick={() => setReplyOpen(true)}>
            {t('reviews.reply')}
          </Button>
        )}
      </Flexbox>
    </Flexbox>
  );
});

ThreadBlock.displayName = 'ThreadBlock';

/**
 * `/reviews/:reviewId` — a real PR's review workspace: diff with line-anchored
 * comments, review threads with replies, check results, and comment/approve/
 * request-changes submission through the user's GitHub connection (F02).
 */
const ReviewPullRequestPage = memo(() => {
  const { t } = useTranslation('common');
  const { reviewId: rawId } = useParams<{ reviewId: string }>();
  const reviewId = rawId ? decodeURIComponent(rawId) : '';
  const workspaceId = useActiveWorkspaceId();
  const navigate = useNavigate();

  const { data, error, isLoading } = useClientDataSWR(
    reviewId ? pullRequestKeys.detail(workspaceId, reviewId) : null,
    () => pullRequestService.detail(reviewId),
  );
  const pullRequest = data?.data as PullRequestDetail | undefined;
  const notConnected = isTrpcErrorCode(error, 'PRECONDITION_FAILED');

  const refresh = useCallback(async () => {
    await mutate(pullRequestKeys.detail(workspaceId, reviewId));
    await mutate(pullRequestKeys.queue(workspaceId, 'for-me'));
    await mutate(pullRequestKeys.queue(workspaceId, 'created'));
  }, [reviewId, workspaceId]);

  const [reviewBody, setReviewBody] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);

  const submit = useCallback(
    async (event: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES') => {
      if (!reviewId) return;
      setSubmitting(event);
      try {
        await pullRequestService.submitReview({
          body: reviewBody.trim() || undefined,
          event,
          id: reviewId,
        });
        toast.success(t('reviews.submitted'));
        setReviewBody('');
        await refresh();
      } catch (submitError) {
        console.error('[reviews:submit]', submitError);
        toast.error(t('reviews.submitFailed'));
      } finally {
        setSubmitting(null);
      }
    },
    [refresh, reviewBody, reviewId, t],
  );

  const replyToThread = useCallback(
    async (threadId: string, body: string) => {
      try {
        await pullRequestService.replyThread({ body, id: reviewId, threadId });
        await refresh();
        return true;
      } catch (replyError) {
        console.error('[reviews:reply]', replyError);
        toast.error(t('reviews.replyFailed'));
        return false;
      }
    },
    [refresh, reviewId, t],
  );

  const addFileComment = useCallback(
    async (params: { body: string; line: number; side: 'LEFT' | 'RIGHT' }, path: string) => {
      try {
        await pullRequestService.addFileComment({
          body: params.body,
          id: reviewId,
          line: params.line,
          path,
          side: params.side,
        });
        await refresh();
        return true;
      } catch (commentError) {
        console.error('[reviews:fileComment]', commentError);
        toast.error(t('reviews.commentFailed'));
        return false;
      }
    },
    [refresh, reviewId, t],
  );

  const state = pullRequest ? prStateVisual(pullRequest) : null;
  const failedChecks =
    pullRequest?.checks.filter(
      (check) =>
        check.conclusion !== null &&
        !['COMPLETED', 'NEUTRAL', 'SKIPPED', 'SUCCESS', 'STALE'].includes(check.conclusion),
    ).length ?? 0;

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 0 }}>
            <Button
              icon={<Icon icon={ChevronLeftIcon} />}
              size={'small'}
              type={'text'}
              onClick={() => navigate('/reviews')}
            />
            <Text ellipsis weight={500}>
              {pullRequest?.title ?? t('tab.reviews')}
            </Text>
          </Flexbox>
        }
      />
      <WideScreenContainer
        gap={16}
        paddingBlock={16}
        style={{ maxWidth: 960 }}
        wrapperStyle={{ flex: 1, overflowY: 'auto' }}
      >
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
            <Flexbox gap={8}>
              <Flexbox horizontal align={'center'} gap={8} wrap={'wrap'}>
                {state ? <Tag color={state.color}>{t(state.labelKey as never)}</Tag> : null}
                <Text className={styles.identifier} fontSize={13}>
                  {pullRequest.headRef ?? ''} → {pullRequest.baseRef ?? ''}
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
                {pullRequest.checks.length > 0 ? (
                  <Text fontSize={13} type={'secondary'}>
                    {failedChecks
                      ? t('reviews.checksFailing', { count: failedChecks })
                      : t('reviews.checksPassing')}
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

            {pullRequest.checks.length > 0 ? (
              <Flexbox className={styles.card}>
                <Flexbox horizontal align={'center'} className={styles.cardHeader} gap={8}>
                  <Text weight={500}>{t('reviews.checks')}</Text>
                  <Text fontSize={12} type={'secondary'}>
                    {pullRequest.checks.length}
                  </Text>
                </Flexbox>
                {pullRequest.checks.map((check, index) => {
                  const visual = checkIcon(check);
                  return (
                    <Flexbox className={styles.checkRow} key={`${check.name}-${index}`}>
                      <Icon color={visual.color} icon={visual.icon} size={14} />
                      <Text fontSize={13}>{check.name}</Text>
                      {check.detailsUrl ? (
                        <Text
                          fontSize={12}
                          style={{ cursor: 'pointer' }}
                          type={'secondary'}
                          onClick={() =>
                            window.open(check.detailsUrl!, '_blank', 'noopener,noreferrer')
                          }
                        >
                          <Icon icon={ExternalLinkIcon} size={12} />
                        </Text>
                      ) : null}
                    </Flexbox>
                  );
                })}
              </Flexbox>
            ) : null}

            {pullRequest.reviews.length + pullRequest.threads.length > 0 ? (
              <Flexbox gap={8}>
                <Text className={styles.sectionTitle} type={'secondary'} weight={500}>
                  {t('reviews.conversation')}
                </Text>
                {pullRequest.reviews.map((review, index) => {
                  const visual = reviewStateVisual(review.state);
                  return (
                    <Flexbox className={styles.card} gap={4} key={index} padding={12}>
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
                {pullRequest.threads.map((thread) => (
                  <ThreadBlock key={thread.id} thread={thread} onReply={replyToThread} />
                ))}
              </Flexbox>
            ) : null}

            <Flexbox className={styles.card} gap={8} padding={12}>
              <TextArea
                placeholder={t('reviews.reviewPlaceholder')}
                rows={4}
                value={reviewBody}
                onChange={setReviewBody}
              />
              <Flexbox horizontal gap={8} justify={'flex-end'}>
                <Button
                  disabled={!reviewBody.trim()}
                  loading={submitting === 'COMMENT'}
                  onClick={() => void submit('COMMENT')}
                >
                  {t('reviews.submitComment')}
                </Button>
                <Button loading={submitting === 'APPROVE'} onClick={() => void submit('APPROVE')}>
                  {t('reviews.submitApprove')}
                </Button>
                <Button
                  danger
                  loading={submitting === 'REQUEST_CHANGES'}
                  onClick={() => void submit('REQUEST_CHANGES')}
                >
                  {t('reviews.submitRequestChanges')}
                </Button>
              </Flexbox>
            </Flexbox>

            <Flexbox gap={8}>
              <Text className={styles.sectionTitle} type={'secondary'} weight={500}>
                {t('reviews.filesChangedTitle', { count: pullRequest.changedFiles })}
              </Text>
              {pullRequest.files.map((file) => (
                <FileBlock
                  file={file}
                  key={file.filename}
                  onComment={async (params) => addFileComment(params, file.filename)}
                />
              ))}
            </Flexbox>
          </>
        ) : null}
      </WideScreenContainer>
    </Flexbox>
  );
});

ReviewPullRequestPage.displayName = 'ReviewPullRequestPage';

export default ReviewPullRequestPage;
