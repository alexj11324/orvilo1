import { Flexbox, Markdown } from '@lobehub/ui';
import { Button, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';

import CollectionFooter from './CollectionFooter';
import CommentComposer from './CommentComposer';
import type { ReviewThread, ReviewThreadComment, WriteOutcome } from './types';

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
  commentBox: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-block-start: 1px dashed ${cssVar.colorBorderSecondary};
  `,
  threadHeader: css`
    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
}));

const ThreadComment = memo<{ comment: ReviewThreadComment }>(({ comment }) => {
  const { t } = useTranslation('common');
  return (
    <Flexbox gap={4} padding={12}>
      <Flexbox horizontal align={'center'} gap={8}>
        <Avatar avatar={comment.authorAvatar ?? undefined} name={comment.author ?? '?'} size={20} />
        <Text fontSize={12} weight={500}>
          {comment.author}
        </Text>
        {comment.outdated ? <Tag>{t('reviews.threadOutdated')}</Tag> : null}
        {comment.side ? (
          <Text fontSize={12} type={'secondary'}>
            {comment.side === 'LEFT' ? t('reviews.commentSideLeft') : t('reviews.commentSideRight')}
          </Text>
        ) : null}
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
  );
});

ThreadComment.displayName = 'ThreadComment';

const ReviewThreadCard = memo<{
  onLoadMoreComments?: (threadId: string, cursor: string) => Promise<void> | void;
  onReply: (threadId: string, body: string) => Promise<WriteOutcome>;
  stale?: boolean;
  thread: ReviewThread;
  writeDisabled?: boolean;
}>(({ onLoadMoreComments, onReply, stale, thread, writeDisabled }) => {
  const { t } = useTranslation('common');
  const [replyOpen, setReplyOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const anchor = thread.path ? `${thread.path}${thread.line ? `:${thread.line}` : ''}` : null;
  const comments = thread.comments;

  return (
    <Flexbox className={styles.card}>
      {anchor ? (
        <Flexbox horizontal align={'center'} className={styles.cardHeader} gap={8}>
          <Text className={styles.threadHeader}>{anchor}</Text>
          {thread.isOutdated ? <Tag>{t('reviews.threadOutdated')}</Tag> : null}
          {thread.isResolved ? <Tag color={'green'}>{t('reviews.threadResolved')}</Tag> : null}
        </Flexbox>
      ) : null}
      {comments.items.map((comment, index) => (
        <ThreadComment comment={comment} key={comment.id ?? `${comment.createdAt}-${index}`} />
      ))}
      <CollectionFooter
        hasMore={comments.hasMore}
        loaded={comments.loaded}
        loading={loadingMore}
        total={comments.total}
        onLoadMore={
          comments.endCursor && onLoadMoreComments
            ? async () => {
                setLoadingMore(true);
                try {
                  await onLoadMoreComments(thread.id, comments.endCursor!);
                } finally {
                  setLoadingMore(false);
                }
              }
            : undefined
        }
      />
      <Flexbox className={styles.commentBox}>
        {replyOpen ? (
          <CommentComposer
            disabled={writeDisabled}
            placeholder={t('reviews.replyPlaceholder')}
            submitLabel={t('reviews.reply')}
            unknownHint={t('reviews.outcomeUnknown')}
            onSubmit={async (body) => {
              const outcome = await onReply(thread.id, body);
              if (outcome === 'applied') setReplyOpen(false);
              return outcome;
            }}
          />
        ) : thread.viewerCanReply === false ? (
          <Text fontSize={12} type={'secondary'}>
            {t('reviews.cannotReply')}
          </Text>
        ) : (
          <Button
            disabled={writeDisabled || stale}
            size={'small'}
            type={'text'}
            onClick={() => setReplyOpen(true)}
          >
            {t('reviews.reply')}
          </Button>
        )}
      </Flexbox>
    </Flexbox>
  );
});

ReviewThreadCard.displayName = 'ReviewThreadCard';

export default ReviewThreadCard;
