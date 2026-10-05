import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { MessageSquareText } from 'lucide-react';
import { memo, useMemo } from 'react';

import { type MarkdownElementProps } from '../type';
import { type ParsedUserFeedbackComment, parseUserFeedback } from './parseUserFeedback';

const styles = createStaticStyles(({ css, cssVar }) => ({
  body: css`
    padding-block-start: 12px;
    padding-inline-start: 44px;
  `,
  comment: css`
    font-size: 13px;
    line-height: 1.6;
    color: ${cssVar.colorText};
    word-break: break-word;
    white-space: pre-wrap;
  `,
  countBadge: css`
    flex: none;

    padding-block: 1px;
    padding-inline: 6px;
    border-radius: 4px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  headerIcon: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    inline-size: 32px;
    block-size: 32px;

    color: ${cssVar.colorTextSecondary};
  `,
  root: css`
    /* Override @lobehub/ui Markdown's default <details> card chrome (bg + padding + box-shadow).
       Need !important because the lib targets via .parent details (higher specificity).
       padding-bottom puts a 12px gap above the divider; margin-bottom puts a 12px gap below it,
       matching the symmetric 12px the task card uses around its own internal divider. */
    margin-block: 0 12px !important;
    padding-block: 0 12px !important;
    padding-inline: 0 !important;
    border-block-end: 1px solid ${cssVar.colorSplit} !important;
    border-radius: 0 !important;

    background: transparent !important;
    box-shadow: none !important;
  `,
  summary: css`
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }
  `,
  time: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

const Comment = memo<{ comment: ParsedUserFeedbackComment }>(({ comment }) => (
  <div className="flex flex-col gap-0.5">
    {comment.time && <span className={styles.time}>{comment.time}</span>}
    <div className={styles.comment}>{comment.content}</div>
  </div>
));

Comment.displayName = 'UserFeedbackComment';

const Render = memo<MarkdownElementProps>(({ children }) => {
  const text = typeof children === 'string' ? children : String(children ?? '');
  const comments = useMemo(() => parseUserFeedback(text), [text]);

  if (comments.length === 0) return null;

  const countLabel = comments.length === 1 ? '1 comment' : `${comments.length} comments`;

  return (
    <details className={styles.root}>
      <summary className={styles.summary}>
        <div className="flex items-center gap-3">
          <span className={styles.headerIcon}>
            <MessageSquareText size={16} />
          </span>
          <div className="flex items-center flex-1 gap-2" style={{ minWidth: 0 }}>
            <div className="truncate font-medium">User feedback</div>
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
