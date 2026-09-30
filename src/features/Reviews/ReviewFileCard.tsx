import { Flexbox, Icon, PatchDiff } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
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
    <Flexbox className={styles.card} id={`file-${encodeURIComponent(file.filename)}`}>
      <Flexbox
        horizontal
        align={'center'}
        className={styles.cardHeader}
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
            <Flexbox className={styles.commentBox} gap={8}>
              <Text className={styles.threadHeader}>
                {file.filename}:{commentAt.line} ·{' '}
                {commentAt.side === 'LEFT'
                  ? t('reviews.commentSideLeft')
                  : t('reviews.commentSideRight')}
              </Text>
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

ReviewFileCard.displayName = 'ReviewFileCard';

export default ReviewFileCard;
