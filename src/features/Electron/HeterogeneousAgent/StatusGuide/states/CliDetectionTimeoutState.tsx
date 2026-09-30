import { cssVar } from 'antd-style';
import { ClockAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/reui/code-block/code-block';

import GuideActions from '../GuideActions';
import GuideShell from '../GuideShell';
import type { HeterogeneousAgentGuideStateProps } from '../types';

const CliDetectionTimeoutState = ({
  config,
  error,
  onOpenSystemTools,
  onRetry,
  variant,
}: HeterogeneousAgentGuideStateProps) => {
  const { t } = useTranslation('chat');
  const rawErrorDetails = error?.stderr || error?.message;

  return (
    <GuideShell
      icon={<ClockAlert color={cssVar.colorWarning} size={20} />}
      title={t('cliDetectionTimeoutGuide.title', { name: config.title })}
      variant={variant}
      actions={
        <GuideActions
          retryPrimary
          openSystemToolsLabel={t('cliDetectionTimeoutGuide.actions.openSystemTools')}
          retryLabel={t('cliDetectionTimeoutGuide.actions.retry')}
          onOpenSystemTools={onOpenSystemTools}
          onRetry={onRetry}
        />
      }
      headerDescription={
        <div className="text-muted-foreground">
          {t('cliDetectionTimeoutGuide.desc', { command: error?.command || config.title })}
        </div>
      }
    >
      <div className="text-muted-foreground" style={{ fontSize: 12 }}>
        {t('cliDetectionTimeoutGuide.hint')}
      </div>

      {rawErrorDetails && (
        <div className="flex flex-col gap-1.5">
          <div className="font-semibold" style={{ fontSize: 12 }}>
            {t('cliDetectionTimeoutGuide.errorDetails')}
          </div>
          <CodeBlock
            wrap
            code={rawErrorDetails}
            language="log"
            style={{ maxHeight: 160, overflow: 'auto' }}
          />
        </div>
      )}
    </GuideShell>
  );
};

export default CliDetectionTimeoutState;
