'use client';

import { AgentIcon } from '@lobehub/icons';
import { Markdown } from '@lobehub/ui';
import { formatAbsoluteDate } from '@orvilo/utils/time';
import { createStaticStyles, responsive } from 'antd-style';
import { cn } from 'cn';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import Rate from '@/components/RatingOverview/Rate';
import { type SkillCommentItem } from '@/types/discover';

const styles = createStaticStyles(({ css, cssVar }) => ({
  author: css`
    font-size: 16px;
    font-weight: 700;
    line-height: 1.2;
    color: ${cssVar.colorText};
    word-break: break-word;

    ${responsive.sm} {
      font-size: 15px;
    }
  `,
  avatar: css`
    flex: none;
    line-height: 0;
  `,
  card: css`
    padding-block: 22px;
    padding-inline: 24px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 22px;

    background: ${cssVar.colorBgContainer};

    ${responsive.sm} {
      padding-block: 18px;
      padding-inline: 16px;
      border-radius: 18px;
    }
  `,
  content: css`
    font-size: 16px;
    line-height: 1.56;
    color: ${cssVar.colorTextSecondary};

    p {
      margin-block: 0;
    }

    p + p {
      margin-block-start: 0.72em;
    }

    a {
      color: ${cssVar.colorLink};
    }

    strong {
      font-weight: 600;
      color: ${cssVar.colorText};
    }

    ${responsive.sm} {
      font-size: 15px;
    }
  `,
  date: css`
    flex: none;

    font-size: 13px;
    font-weight: 500;
    line-height: 1.3;
    color: ${cssVar.colorTextDescription};
    white-space: nowrap;
  `,
  rate: css`
    line-height: 1;
  `,
}));

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
    <div className={cn('flex flex-col', styles.card)} style={{ gap: 14 }}>
      <div className={'flex gap-3 items-center justify-between flex-wrap'}>
        <div className={'flex gap-3 items-center'}>
          <div className={styles.avatar}>{avatar}</div>
          <div className={'flex flex-col'} style={{ gap: 6 }}>
            <div className={cn(styles.author)}>{authorName}</div>
            {typeof item.rating === 'number' && (
              <Rate className={styles.rate} gap={3} size={16} value={item.rating} />
            )}
          </div>
        </div>
        <div className={cn(styles.date)}>{createdAt}</div>
      </div>
      <Markdown className={styles.content} variant={'chat'}>
        {item.content}
      </Markdown>
    </div>
  );
});

export default CommentItem;
