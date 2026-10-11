import { PatchDiff } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { clsx, cn } from 'cn';
import { ChevronDownIcon, FileDiffIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import CommentComposer from './CommentComposer';
import type { ReviewFile, WriteOutcome } from './types';

const styles = {
  card: 'overflow-hidden rounded-(--radius-card) border border-divider bg-card',
  cardHeader:
    'cursor-pointer flex items-center gap-2 border-b border-divider bg-fill-quaternary px-3 py-1.5',
  commentBox: 'border-t border-dashed border-divider px-3 py-2',
  threadHeader: 'font-mono text-xs leading-5 text-muted-foreground',
} as const;

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
      className={clsx('flex flex-col', styles.card)}
      id={`file-${encodeURIComponent(file.filename)}`}
    >
      <div
        className={clsx('flex flex-row items-center', styles.cardHeader)}
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
        <div className="text-xs text-muted-foreground">
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
            <div className={clsx('flex flex-col gap-2', styles.commentBox)}>
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
          <div className="text-xs text-muted-foreground">{t('reviews.diffUnavailable')}</div>
        </div>
      )}
    </div>
  );
});

ReviewFileCard.displayName = 'ReviewFileCard';

export default ReviewFileCard;
