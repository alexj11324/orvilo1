import { copyToClipboard, Icon } from '@lobehub/ui';
import { Button, toast } from '@lobehub/ui/base-ui';
import { DiscordIcon, GithubIcon } from '@lobehub/ui/icons';
import { SOCIAL_URL } from '@orvilo/business-const';
import { cssVar } from 'antd-style';
import { AlertTriangle, Copy, RotateCw } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { GITHUB_ISSUES } from '@/const/url';
import BaseErrorForm from '@/features/Conversation/Error/BaseErrorForm';

import { useRetryParentMessage } from './useRetryParentMessage';

interface TraceIdErrorProps {
  id: string;
  onRetry?: () => Promise<void> | void;
  showRetry?: boolean;
  traceId?: string;
}

const TraceIdError = memo<TraceIdErrorProps>(({ id, onRetry, showRetry = true, traceId }) => {
  const { t } = useTranslation('error');
  const { disabled, loading, retryParentMessage } = useRetryParentMessage(id);

  const handleCopyTraceId = useCallback(async () => {
    if (!traceId) return;

    try {
      await copyToClipboard(traceId);
      toast.success(t('unknownError.copyTraceId'));
    } catch {
      /* noop */
    }
  }, [t, traceId]);

  // `unknownError.desc` / `unknownError.sharedDesc` both end with "…or report
  // on", which makes this link the object of the sentence — hiding it would
  // leave the copy dangling mid-phrase. So a deployment without a Discord
  // server falls back to the issue tracker (the app's canonical report
  // destination) and only the channel-specific presentation follows it.
  const hasDiscord = Boolean(SOCIAL_URL.discord);
  const reportUrl = SOCIAL_URL.discord ?? GITHUB_ISSUES;

  const handleRetry = useCallback(() => {
    if (onRetry) {
      void onRetry();
      return;
    }

    void retryParentMessage();
  }, [onRetry, retryParentMessage]);

  return (
    <BaseErrorForm
      avatar={<Icon icon={AlertTriangle} size={24} />}
      title={t(showRetry ? 'unknownError.title' : 'unknownError.sharedTitle')}
      action={
        showRetry ? (
          <Button
            disabled={!onRetry && disabled}
            icon={<Icon icon={RotateCw} />}
            loading={!onRetry && loading}
            size={'small'}
            type={'primary'}
            onClick={handleRetry}
          >
            {t('unknownError.retry')}
          </Button>
        ) : undefined
      }
      desc={
        <span>
          {t(showRetry ? 'unknownError.desc' : 'unknownError.sharedDesc')}{' '}
          <a
            href={reportUrl}
            rel="noopener noreferrer"
            target="_blank"
            style={{
              alignItems: 'center',
              color: hasDiscord ? '#5865F2' : cssVar.colorLink,
              display: 'inline-flex',
              gap: 2,
              verticalAlign: 'middle',
            }}
          >
            <Icon icon={hasDiscord ? DiscordIcon : GithubIcon} size={14} />
            {hasDiscord ? 'Discord' : 'GitHub'}
          </a>
          {traceId && (
            <>
              {' · '}
              {t('unknownError.traceIdLabel')}{' '}
              <code
                title={t('unknownError.copyTraceIdTooltip')}
                style={{
                  cursor: 'pointer',
                  opacity: 0.65,
                  textDecoration: 'underline dashed',
                  textDecorationColor: cssVar.colorTextQuaternary,
                  textUnderlineOffset: 3,
                }}
                onClick={handleCopyTraceId}
              >
                {traceId}
                <Icon icon={Copy} size={11} style={{ marginLeft: 3, verticalAlign: 'middle' }} />
              </code>
            </>
          )}
        </span>
      }
    />
  );
});

export default TraceIdError;
