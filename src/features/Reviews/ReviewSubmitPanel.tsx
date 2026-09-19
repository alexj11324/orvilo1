import { Flexbox, Icon } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { GitPullRequestDraftIcon, PencilLineIcon } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import TextArea from '@/components/TextArea';

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
 * The review-submit region — rendered below the code, never dominating above
 * it. Carries the write contract: operationId stays stable across retries of
 * the same payload and rotates after a landed write so a fresh review gets a
 * fresh operation.
 */
const ReviewSubmitPanel = memo<{
  disabled?: boolean;
  pendingReviewId: string | null;
  stale?: boolean;
  onSubmit: (
    event: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES',
    body: string,
    operationId: string,
  ) => Promise<boolean>;
}>(({ disabled, onSubmit, pendingReviewId, stale }) => {
  const { t } = useTranslation('common');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  // One operationId per pending submit — a retried click replays the same
  // operation server-side instead of becoming a blind resubmit. Rotated after
  // a success so the next review is a new operation.
  const operationIdRef = useRef<string | null>(null);

  const submit = async (event: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES') => {
    operationIdRef.current ??= crypto.randomUUID();
    const operationId = operationIdRef.current;
    setSubmitting(event);
    try {
      const ok = await onSubmit(event, body.trim(), operationId);
      if (ok) {
        setBody('');
        operationIdRef.current = null;
      }
    } finally {
      setSubmitting(null);
    }
  };

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
      <Flexbox horizontal gap={8} justify={'flex-end'}>
        <Button
          disabled={disabled || stale || !body.trim()}
          loading={submitting === 'COMMENT'}
          onClick={() => void submit('COMMENT')}
        >
          {t('reviews.submitComment')}
        </Button>
        <Button
          disabled={disabled || stale}
          loading={submitting === 'APPROVE'}
          onClick={() => void submit('APPROVE')}
        >
          {t('reviews.submitApprove')}
        </Button>
        <Button
          danger
          disabled={disabled || stale}
          loading={submitting === 'REQUEST_CHANGES'}
          onClick={() => void submit('REQUEST_CHANGES')}
        >
          {t('reviews.submitRequestChanges')}
        </Button>
      </Flexbox>
    </Flexbox>
  );
});

ReviewSubmitPanel.displayName = 'ReviewSubmitPanel';

export default ReviewSubmitPanel;
