import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { MessageSquareText } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { type MarkdownElementProps } from '../type';
import { type ParsedUserFeedbackComment, parseUserFeedback } from './parseUserFeedback';

const registeredStyles = createStaticStyles(({ css, cssVar }) => ({
  root: css`
    /* Override @lobehub/ui Markdown's default <details> card chrome (bg + padding + box-shadow).
       Need !important because the lib targets via .parent details (higher specificity).
       padding-bottom puts a 12px gap above the divider; margin-bottom puts a 12px gap below it,
       matching the symmetric 12px the task card uses around its own internal divider. */
    margin-block: 0 12px !important;
    padding-block: 0 12px !important;
    padding-inline: 0 !important;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary} !important;
    border-radius: 0 !important;

    background: transparent !important;
    box-shadow: none !important;
  `,
}));

const styles = {
  body: 'pt-3 ps-11',
  comment: 'text-sm leading-5.5 text-foreground [word-break:break-word] whitespace-pre-wrap',
  countBadge:
    'flex-none py-0.25 px-1.5 rounded-(--radius-chip) text-xs leading-5 text-muted-foreground bg-fill-quaternary',
  headerIcon: 'flex flex-none items-center justify-center size-8 text-muted-foreground',
  summary: 'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
  time: 'text-xs leading-5 text-foreground-tertiary',
};

const Comment = memo<{ comment: ParsedUserFeedbackComment }>(({ comment }) => (
  <div className="flex flex-col gap-0.5">
    {comment.time && <span className={styles.time}>{comment.time}</span>}
    <div className={styles.comment}>{comment.content}</div>
  </div>
));

Comment.displayName = 'UserFeedbackComment';

const Render = memo<MarkdownElementProps>(({ children }) => {
  const { t } = useTranslation('chat');
  const text = typeof children === 'string' ? children : String(children ?? '');
  const comments = useMemo(() => parseUserFeedback(text), [text]);

  if (comments.length === 0) return null;

  const countLabel = t('userFeedback.commentCount', { count: comments.length });

  return (
    <details className={registeredStyles.root}>
      <summary className={styles.summary} data-slot="markdown-feedback-summary">
        <div className="flex items-center gap-3">
          <span className={styles.headerIcon}>
            <MessageSquareText size={16} />
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="truncate text-sm leading-5.5 font-medium">
              {t('userFeedback.title')}
            </div>
            <span className={styles.countBadge}>{countLabel}</span>
          </div>
        </div>
      </summary>
      <div className={cn('flex flex-col gap-3', styles.body)}>
        {comments.map((comment, idx) => (
          <Comment comment={comment} key={comment.id ?? idx} />
        ))}
      </div>
    </details>
  );
});

Render.displayName = 'UserFeedbackRender';

export default Render;
