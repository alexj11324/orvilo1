import { Button, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { Ban, Loader2, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/reui/code-block/code-block';

import GuideActions from '../GuideActions';
import GuideShell from '../GuideShell';
import type { HeterogeneousAgentGuideStateProps } from '../types';

const styles = createStaticStyles(({ css }) => ({
  errorDetails: css`
    && pre {
      padding: 12px;
    }
  `,
}));

const OverloadedState = ({
  autoRetry,
  config,
  error,
  onRetry,
  variant,
}: HeterogeneousAgentGuideStateProps) => {
  const { t } = useTranslation('chat');
  const rawErrorDetails = error?.stderr || error?.message;

  // Auto-retry pending: a lightweight progress card. Keep it compact — the
  // countdown is folded into the description line and the raw error details are
  // hidden (they stay on the manual/exhausted card below, where the user is
  // actually stuck and may want to copy them).
  if (autoRetry) {
    return (
      <GuideShell
        compact
        icon={<Loader2 className="animate-spin" size={18} />}
        title={t('cliOverloadedGuide.autoRetry.title', { name: config.title })}
        variant={variant}
        actions={
          <div className="flex gap-2 justify-end" style={{ flexWrap: 'wrap' }}>
            <Button icon={<Ban size={14} />} size="small" type="text" onClick={autoRetry.onCancel}>
              {t('cliOverloadedGuide.autoRetry.actions.cancel')}
            </Button>
            <Button icon={<RotateCcw size={14} />} size="small" onClick={autoRetry.onRetryNow}>
              {t('cliOverloadedGuide.autoRetry.actions.retryNow')}
            </Button>
          </div>
        }
        headerDescription={
          <Text style={{ fontSize: 12 }} type="secondary">
            {t('cliOverloadedGuide.autoRetry.status', {
              attempt: autoRetry.attempt,
              max: autoRetry.maxAttempts,
              seconds: autoRetry.secondsLeft,
            })}
          </Text>
        }
      />
    );
  }

  return (
    <GuideShell
      icon={<config.icon size={24} />}
      title={t('cliOverloadedGuide.title', { name: config.title })}
      variant={variant}
      actions={
        <GuideActions retryLabel={t('cliOverloadedGuide.actions.retry')} onRetry={onRetry} />
      }
      headerDescription={
        <Text type="secondary">{t('cliOverloadedGuide.desc', { name: config.title })}</Text>
      }
    >
      <Text style={{ fontSize: 12 }} type="secondary">
        {t('cliOverloadedGuide.retryHint')}
      </Text>

      {rawErrorDetails && (
        <div className="flex flex-col gap-1.5">
          <Text strong style={{ fontSize: 12 }}>
            {t('cliOverloadedGuide.errorDetails')}
          </Text>
          <CodeBlock
            wrap
            className={styles.errorDetails}
            code={rawErrorDetails}
            language="log"
            style={{ maxHeight: 200, overflow: 'auto' }}
          />
        </div>
      )}
    </GuideShell>
  );
};

export default OverloadedState;
