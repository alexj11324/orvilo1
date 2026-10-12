'use client';

import { AgentIcon } from '@lobehub/icons';
import { Markdown } from '@lobehub/ui';
import { formatAbsoluteDate } from '@orvilo/utils/time';
import { cn } from 'cn';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import Rate from '@/components/RatingOverview/Rate';
import { type SkillCommentItem } from '@/types/discover';

import nativeStyles from './CommentItem.module.css';

const styles = {
  author: 'text-base leading-6 font-semibold text-foreground [word-break:break-word]',
  avatar: 'flex-none leading-0',
  card: 'px-6 py-5.5 rounded-(--radius-card) border border-divider bg-card [@media(width<=575.98px)]:px-4 [@media(width<=575.98px)]:py-4.5',
  content: nativeStyles.content,
  date: 'flex-none text-xs leading-5 font-medium text-foreground-description whitespace-nowrap',
  rate: 'leading-none',
};

const CommentItem = memo<{ item: SkillCommentItem }>(({ item }) => {
  const { t } = useTranslation('discover');
  const author = item.author;
  const createdAt = useMemo(() => {
    const date = new Date(item.createdAt);

    if (Number.isNaN(date.getTime())) return item.createdAt;

    return formatAbsoluteDate(date);
  }, [item.createdAt]);

  const authorName = useMemo(() => {
    const displayName = author?.displayName?.trim();
    const identifier = author?.identifier?.trim();

    if (displayName) {
      if (displayName.startsWith('@') || /\s/.test(displayName)) return displayName;
      return `@${displayName}`;
    }
    if (identifier) return identifier.startsWith('@') ? identifier : `@${identifier}`;

    return t('skills.details.comments.anonymous');
  }, [author?.displayName, author?.identifier, t]);

  const avatar = useMemo(() => {
    if (author?.type === 'agent' && author.sourceType) {
      return <AgentIcon agent={author.sourceType} shape={'circle'} size={32} type={'avatar'} />;
    }

    return (
      <Avatar avatar={author?.avatar || authorName} shape={'circle'} size={32} title={authorName} />
    );
  }, [author?.avatar, author?.sourceType, author?.type, authorName]);

  return (
    <div className={cn('flex flex-col gap-3.5', styles.card)}>
      <div className={'flex gap-3 items-center justify-between flex-wrap'}>
        <div className={'flex gap-3 items-center'}>
          <div className={styles.avatar}>{avatar}</div>
          <div className={'flex flex-col gap-1.5'}>
            <div className={cn(styles.author)}>{authorName}</div>
            {typeof item.rating === 'number' && (
              <Rate className={styles.rate} gap={3} size={16} value={item.rating} />
            )}
          </div>
        </div>
        <div className={cn(styles.date)}>{createdAt}</div>
      </div>
      <Markdown className={styles.content} fontSize={14} lineHeight={22 / 14} variant={'chat'}>
        {item.content}
      </Markdown>
    </div>
  );
});

export default CommentItem;
