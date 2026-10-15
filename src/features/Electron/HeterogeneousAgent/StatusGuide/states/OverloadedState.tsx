import { Ban, Loader2, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/reui/code-block/code-block';
import { Button } from '@/components/ui/button';

import GuideActions from '../GuideActions';
import GuideShell from '../GuideShell';
import type { HeterogeneousAgentGuideStateProps } from '../types';

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
        icon={<Loader2 className="animate-spin motion-reduce:animate-none" size={16} />}
        title={t('cliOverloadedGuide.autoRetry.title', { name: config.title })}
        variant={variant}
        actions={
          <div className="flex flex-wrap gap-2 justify-end">
            <Button size="normal" variant="ghost" onClick={autoRetry.onCancel}>
              <Ban size={16} /> {t('cliOverloadedGuide.autoRetry.actions.cancel')}
            </Button>
            <Button size="normal" onClick={autoRetry.onRetryNow}>
              <RotateCcw size={16} /> {t('cliOverloadedGuide.autoRetry.actions.retryNow')}
            </Button>
          </div>
        }
        headerDescription={
          <div className="text-muted-foreground text-xs leading-5">
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
        <div className="text-muted-foreground text-sm leading-5.5">
          {t('cliOverloadedGuide.desc', { name: config.title })}
        </div>
      }
    >
      <div className="text-muted-foreground text-xs leading-5">
        {t('cliOverloadedGuide.retryHint')}
      </div>

      {rawErrorDetails && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs leading-5 font-semibold">
            {t('cliOverloadedGuide.errorDetails')}
          </div>
          <CodeBlock
            wrap
            className="[&_pre]:p-3 max-h-50 overflow-auto"
            code={rawErrorDetails}
            language="log"
          />
        </div>
      )}
    </GuideShell>
  );
};

export default OverloadedState;
