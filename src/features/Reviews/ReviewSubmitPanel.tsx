import { createStaticStyles, cssVar, cx } from 'antd-style';
import { GitPullRequestDraftIcon, PencilLineIcon, RefreshCwIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import type { ReviewComposerController } from './useReviewComposer';

const styles = createStaticStyles(({ css }) => ({
  banner: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorWarningBorder};
    border-radius: ${cssVar.borderRadius};

    background: ${cssVar.colorWarningBg};
  `,
  card: css`
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
}));

/**
 * The review-submit region. Its controller lives in the page so closing this
 * on-demand panel cannot discard a draft or an unknown-outcome retry intent.
 */
const ReviewSubmitPanel = memo<{
  /** The viewer authored this PR — GitHub only allows them a COMMENT review. */
  commentOnly?: boolean;
  composer: ReviewComposerController;
  disabled?: boolean;
  pendingReviewId: string | null;
  stale?: boolean;
}>(({ commentOnly, composer, disabled, pendingReviewId, stale }) => {
  const { t } = useTranslation('common');
  const { body, busy, setBody, submitting, unknownIntent, verifying } = composer;

  return (
    <div className={cx('flex flex-col gap-2', styles.card)}>
      <div className="flex items-center gap-2">
        <PencilLineIcon color={cssVar.colorTextSecondary} size={14} />
        <div className="font-medium">{t('reviews.submitReviewTitle')}</div>
      </div>
      {pendingReviewId ? (
        <div className={cx('flex flex-col items-center gap-2', styles.banner)} role={'status'}>
          <GitPullRequestDraftIcon color={cssVar.colorWarning} size={14} />
          <div className="text-[12px]">{t('reviews.pendingDraftBanner')}</div>
        </div>
      ) : null}
      {unknownIntent ? (
        <div className={cx('flex flex-col items-center gap-2', styles.banner)} role={'alert'}>
          <RefreshCwIcon color={cssVar.colorWarning} size={14} />
          <div className="text-[12px]">{t('reviews.outcomeUnknown')}</div>
          <div className="flex-1" />
          <Button loading={verifying} size="sm" onClick={() => void composer.verifyAndRetry()}>
            {t('reviews.outcomeUnknownAction')}
          </Button>
        </div>
      ) : null}
      {stale ? (
        <div className={cx('flex flex-col items-center gap-2', styles.banner)} role={'alert'}>
          <div className="text-[12px]">{t('reviews.headDrifted')}</div>
        </div>
      ) : null}
      <Textarea
        disabled={disabled || stale}
        placeholder={t('reviews.reviewPlaceholder')}
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {/* One write intent in flight at a time — a second click would send a
          different operationId and land two submissions. */}
      <div className="flex justify-end gap-2">
        <Button
          disabled={disabled || stale || busy || !body.trim()}
          loading={submitting === 'COMMENT'}
          onClick={() => void composer.submit('COMMENT', body.trim())}
        >
          {t('reviews.submitComment')}
        </Button>
        <Button
          disabled={disabled || stale || busy || commentOnly}
          loading={submitting === 'APPROVE'}
          title={commentOnly ? t('reviews.authorReviewCommentOnly') : undefined}
          onClick={() => void composer.submit('APPROVE', body.trim())}
        >
          {t('reviews.submitApprove')}
        </Button>
        <Button
          disabled={disabled || stale || busy || commentOnly}
          loading={submitting === 'REQUEST_CHANGES'}
          title={commentOnly ? t('reviews.authorReviewCommentOnly') : undefined}
          variant="destructive"
          onClick={() => void composer.submit('REQUEST_CHANGES', body.trim())}
        >
          {t('reviews.submitRequestChanges')}
        </Button>
      </div>
    </div>
  );
});

ReviewSubmitPanel.displayName = 'ReviewSubmitPanel';

export default ReviewSubmitPanel;
