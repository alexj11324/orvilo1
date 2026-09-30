import { createStaticStyles } from 'antd-style';
import { Ban, Loader2, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/reui/code-block/code-block';
import { Button } from '@/components/ui/button';

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
            <Button size="sm" variant="ghost" onClick={autoRetry.onCancel}>
              <Ban size={14} /> {t('cliOverloadedGuide.autoRetry.actions.cancel')}
            </Button>
            <Button size="sm" onClick={autoRetry.onRetryNow}>
              <RotateCcw size={14} /> {t('cliOverloadedGuide.autoRetry.actions.retryNow')}
            </Button>
          </div>
        }
        headerDescription={
          <div className="text-muted-foreground" style={{ fontSize: 12 }}>
            {t('cliOverloadedGuide.autoRetry.status', {
              attempt: autoRetry.attempt,
              max: autoRetry.maxAttempts,
              seconds: autoRetry.secondsLeft,
            })}
          </div>
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
        <div className="text-muted-foreground">
          {t('cliOverloadedGuide.desc', { name: config.title })}
        </div>
      }
    >
      <div className="text-muted-foreground" style={{ fontSize: 12 }}>
        {t('cliOverloadedGuide.retryHint')}
      </div>

      {rawErrorDetails && (
        <div className="flex flex-col gap-1.5">
          <div className="font-semibold" style={{ fontSize: 12 }}>
            {t('cliOverloadedGuide.errorDetails')}
          </div>
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
