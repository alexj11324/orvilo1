import { clsx, cn } from 'cn';
import { ChevronDownIcon, FileDiffIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import PatchDiff from '@/components/PatchDiff';
import { Button } from '@/components/ui/button';

import CommentComposer from './CommentComposer';
import type { ReviewFile, WriteOutcome } from './types';

const styles = {
  card: 'overflow-hidden rounded-(--radius-card) border border-divider bg-card',
  cardHeader:
    'cursor-pointer flex h-auto min-h-9 w-full items-center justify-start gap-2 rounded-none border-0 [border-block-end:1px_solid_var(--divider)] bg-fill-quaternary px-4 py-1.5 text-start font-normal whitespace-normal hover:bg-fill-quaternary hover:text-foreground aria-expanded:bg-fill-quaternary aria-expanded:text-foreground focus-visible:border-divider focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring/50 focus-visible:-outline-offset-2 active:not-aria-[haspopup]:translate-y-0',
  commentBox: '[border-block-start:1px_dashed_var(--divider)] px-4 py-2',
  threadHeader: 'font-mono text-sm leading-5.5 text-muted-foreground',
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
      <Button
        aria-expanded={!collapsed}
        className={clsx('flex flex-row items-center', styles.cardHeader)}
        size="normal"
        type="button"
        variant="ghost"
        onClick={() => setCollapsed((current) => !current)}
      >
        <span
          className="anticon"
          role="img"
          style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }}
        >
          <ChevronDownIcon fill={'transparent'} height={16} size={16} width={16} />
        </span>
        <span className="anticon" role="img">
          <FileDiffIcon
            className="text-muted-foreground"
            fill={'transparent'}
            height={16}
            size={16}
            width={16}
          />
        </span>
        <span className={cn('font-medium', styles.threadHeader)}>
          {file.status === 'renamed' && file.previousFilename
            ? `${file.previousFilename} → ${file.filename}`
            : file.filename}
        </span>
        <span className="flex flex-col flex-1" />
        <span className="text-xs text-muted-foreground">
          +{file.additions} −{file.deletions}
        </span>
      </Button>
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
        <div className="flex flex-col p-4">
          <div className="text-xs text-muted-foreground">{t('reviews.diffUnavailable')}</div>
        </div>
      )}
    </div>
  );
});

ReviewFileCard.displayName = 'ReviewFileCard';

export default ReviewFileCard;
