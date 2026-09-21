import { Flexbox, Icon } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { GitPullRequestDraftIcon, PencilLineIcon, RefreshCwIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import TextArea from '@/components/TextArea';

import type { WriteOutcome } from './types';

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

type SubmitEvent = 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';

/**
 * The review-submit region — rendered below the code, never dominating above
 * it. The write contract lives in the intent-derived operationId the caller
 * computes: the same (head, session, body, action) intent keeps one id across
 * retries and refreshes, so a retry is a server-side reconcile, never a
 * blind resubmit. `unknown` keeps the draft and surfaces an explicit
 * recoverable state; `applied` clears it.
 */
const ReviewSubmitPanel = memo<{
  disabled?: boolean;
  onSubmit: (event: SubmitEvent, body: string) => Promise<WriteOutcome>;
  /** Re-read remote state before an unknown-outcome intent is retried. */
  onVerify?: () => Promise<void>;
  pendingReviewId: string | null;
  stale?: boolean;
}>(({ disabled, onSubmit, onVerify, pendingReviewId, stale }) => {
  const { t } = useTranslation('common');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  // The intent whose outcome could not be confirmed — the draft stays, the
  // banner explains, and the only resend path re-verifies remote state first.
  const [unknownIntent, setUnknownIntent] = useState<{ body: string; event: SubmitEvent } | null>(
    null,
  );

  const submit = async (event: SubmitEvent, intentBody: string) => {
    setSubmitting(event);
    try {
      const outcome = await onSubmit(event, intentBody);
      if (outcome === 'applied') {
        setBody('');
        setUnknownIntent(null);
      } else if (outcome === 'unknown') {
        setUnknownIntent({ body: intentBody, event });
      }
    } finally {
      setSubmitting(null);
    }
  };

  const verifyAndRetry = async () => {
    if (!unknownIntent) return;
    setVerifying(true);
    try {
      await onVerify?.();
      await submit(unknownIntent.event, unknownIntent.body);
    } finally {
      setVerifying(false);
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
      {unknownIntent ? (
        <Flexbox className={styles.banner} role={'alert'}>
          <Icon color={cssVar.colorWarning} icon={RefreshCwIcon} size={14} />
          <Text fontSize={12}>{t('reviews.outcomeUnknown')}</Text>
          <Flexbox flex={1} />
          <Button loading={verifying} size={'small'} onClick={() => void verifyAndRetry()}>
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
      <Flexbox horizontal gap={8} justify={'flex-end'}>
        <Button
          disabled={disabled || stale || !body.trim()}
          loading={submitting === 'COMMENT'}
          onClick={() => void submit('COMMENT', body.trim())}
        >
          {t('reviews.submitComment')}
        </Button>
        <Button
          disabled={disabled || stale}
          loading={submitting === 'APPROVE'}
          onClick={() => void submit('APPROVE', body.trim())}
        >
          {t('reviews.submitApprove')}
        </Button>
        <Button
          danger
          disabled={disabled || stale}
          loading={submitting === 'REQUEST_CHANGES'}
          onClick={() => void submit('REQUEST_CHANGES', body.trim())}
        >
          {t('reviews.submitRequestChanges')}
        </Button>
      </Flexbox>
    </Flexbox>
  );
});

ReviewSubmitPanel.displayName = 'ReviewSubmitPanel';

export default ReviewSubmitPanel;
