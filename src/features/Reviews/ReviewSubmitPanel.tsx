import { Flexbox, Icon } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { GitPullRequestDraftIcon, PencilLineIcon, RefreshCwIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import TextArea from '@/components/TextArea';

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
  composer: ReviewComposerController;
  disabled?: boolean;
  pendingReviewId: string | null;
  stale?: boolean;
}>(({ composer, disabled, pendingReviewId, stale }) => {
  const { t } = useTranslation('common');
  const { body, busy, setBody, submitting, unknownIntent, verifying } = composer;

  return (
    <Flexbox className={styles.card} gap={8}>
      <Flexbox horizontal align={'center'} gap={8}>
        <Icon color={cssVar.colorTextSecondary} icon={PencilLineIcon} size={14} />
        <Text weight={500}>{t('reviews.submitReviewTitle')}</Text>
      </Flexbox>
      {pendingReviewId ? (
        <Flexbox className={styles.banner} role={'status'}>
          <Icon color={cssVar.colorWarning} icon={GitPullRequestDraftIcon} size={14} />
          <Text fontSize={12}>{t('reviews.pendingDraftBanner')}</Text>
        </Flexbox>
      ) : null}
      {unknownIntent ? (
        <Flexbox className={styles.banner} role={'alert'}>
          <Icon color={cssVar.colorWarning} icon={RefreshCwIcon} size={14} />
          <Text fontSize={12}>{t('reviews.outcomeUnknown')}</Text>
          <Flexbox flex={1} />
          <Button loading={verifying} size={'small'} onClick={() => void composer.verifyAndRetry()}>
            {t('reviews.outcomeUnknownAction')}
          </Button>
        </Flexbox>
      ) : null}
      {stale ? (
        <Flexbox className={styles.banner} role={'alert'}>
          <Text fontSize={12}>{t('reviews.headDrifted')}</Text>
        </Flexbox>
      ) : null}
      <TextArea
        disabled={disabled || stale}
        placeholder={t('reviews.reviewPlaceholder')}
        rows={4}
        value={body}
        onChange={setBody}
      />
      {/* One write intent in flight at a time — a second click would send a
          different operationId and land two submissions. */}
      <Flexbox horizontal gap={8} justify={'flex-end'}>
        <Button
          disabled={disabled || stale || busy || !body.trim()}
          loading={submitting === 'COMMENT'}
          onClick={() => void composer.submit('COMMENT', body.trim())}
        >
          {t('reviews.submitComment')}
        </Button>
        <Button
          disabled={disabled || stale || busy}
          loading={submitting === 'APPROVE'}
          onClick={() => void composer.submit('APPROVE', body.trim())}
        >
          {t('reviews.submitApprove')}
        </Button>
        <Button
          danger
          disabled={disabled || stale || busy}
          loading={submitting === 'REQUEST_CHANGES'}
          onClick={() => void composer.submit('REQUEST_CHANGES', body.trim())}
        >
          {t('reviews.submitRequestChanges')}
        </Button>
      </Flexbox>
    </Flexbox>
  );
});

ReviewSubmitPanel.displayName = 'ReviewSubmitPanel';

export default ReviewSubmitPanel;
