import { PatchDiff } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { ChevronDownIcon, FileDiffIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import CommentComposer from './CommentComposer';
import type { ReviewFile, WriteOutcome } from './types';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  cardHeader: css`
    cursor: pointer;

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

/**
 * One changed file: patch diff (unified or split) plus the line-comment
 * affordance. Anchored with `id={file-…}` for the file navigation panel.
 */
const ReviewFileCard = memo<{
  file: ReviewFile;
  viewMode: 'split' | 'unified';
  writeDisabled?: boolean;
  onComment: (params: {
    body: string;
    line: number;
    path: string;
    side: 'LEFT' | 'RIGHT';
  }) => Promise<WriteOutcome>;
}>(({ file, onComment, viewMode, writeDisabled }) => {
  const { t } = useTranslation('common');
  const [collapsed, setCollapsed] = useState(false);
  const [commentAt, setCommentAt] = useState<{ line: number; side: 'LEFT' | 'RIGHT' } | null>(null);

  return (
    <div
      className={cx('flex flex-col', styles.card)}
      id={`file-${encodeURIComponent(file.filename)}`}
    >
      <div
        className={cx('flex flex-row items-center', styles.cardHeader)}
        onClick={() => setCollapsed((current) => !current)}
      >
        <span
          className="anticon"
          role="img"
          style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }}
        >
          <ChevronDownIcon fill={'transparent'} height={14} size={14} width={14} />
        </span>
        <span className="anticon" role="img">
          <FileDiffIcon
            color={cssVar.colorTextSecondary}
            fill={'transparent'}
            height={14}
            size={14}
            width={14}
          />
        </span>
        <div className={cn('font-medium', styles.threadHeader)}>
          {file.status === 'renamed' && file.previousFilename
            ? `${file.previousFilename} → ${file.filename}`
            : file.filename}
        </div>
        <div className="flex flex-col flex-1" />
        <div className="text-[12px] text-muted-foreground">
          +{file.additions} −{file.deletions}
        </div>
      </div>
      {collapsed ? null : file.patch ? (
        <>
          <PatchDiff
            fileName={file.filename}
            patch={file.patch}
            showHeader={false}
            viewMode={viewMode}
            diffOptions={{
              enableGutterUtility: !writeDisabled,
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
            <div className={cx('flex flex-col gap-2', styles.commentBox)}>
              <div className={cn(styles.threadHeader)}>
                {file.filename}:{commentAt.line} ·{' '}
                {commentAt.side === 'LEFT'
                  ? t('reviews.commentSideLeft')
                  : t('reviews.commentSideRight')}
              </div>
              <CommentComposer
                disabled={writeDisabled}
                placeholder={t('reviews.commentPlaceholder')}
                submitLabel={t('reviews.addComment')}
                unknownHint={t('reviews.outcomeUnknown')}
                onSubmit={async (body) => {
                  const outcome = await onComment({
                    body,
                    line: commentAt.line,
                    path: file.filename,
                    side: commentAt.side,
                  });
                  if (outcome === 'applied') setCommentAt(null);
                  return outcome;
                }}
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col p-3">
          <div className="text-[12px] text-muted-foreground">{t('reviews.diffUnavailable')}</div>
        </div>
      )}
    </div>
  );
});

ReviewFileCard.displayName = 'ReviewFileCard';

export default ReviewFileCard;
