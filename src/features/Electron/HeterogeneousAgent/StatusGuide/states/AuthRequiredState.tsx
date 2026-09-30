import { isDesktop } from '@orvilo/const';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/reui/code-block/code-block';

import GuideActions from '../GuideActions';
import GuideShell from '../GuideShell';
import type { HeterogeneousAgentGuideStateProps } from '../types';

const AuthRequiredState = ({
  config,
  error,
  onOpenSystemTools,
  variant,
}: HeterogeneousAgentGuideStateProps) => {
  const { t } = useTranslation('chat');
  const rawErrorDetails = error?.stderr || error?.message;
  const docsUrl = error?.docsUrl || config.docsUrl;

  return (
    <GuideShell
      icon={<config.icon size={24} />}
      title={t('cliAuthGuide.title', { name: config.title })}
      variant={variant}
      actions={
        <GuideActions
          showDocs
          docsUrl={docsUrl}
          openDocsLabel={t('cliAuthGuide.actions.openDocs')}
          openSystemToolsLabel={t(
            isDesktop
              ? 'cliAuthGuide.actions.openSystemTools'
              : 'cliAuthGuide.actions.openCloudCredentials',
          )}
          onOpenSystemTools={onOpenSystemTools}
        />
      }
      headerDescription={
        <div className="text-muted-foreground">
          {t('cliAuthGuide.desc', { name: config.title })}
        </div>
      }
    >
      {isDesktop && (
        <div className="flex flex-col gap-1.5">
          <div className="font-semibold" style={{ fontSize: 12 }}>
            {t('cliAuthGuide.runCommand')}
          </div>
          <CodeBlock wrap code={config.signInCommand} language="bash" variant="ghost" />
        </div>
      )}

      <div className="text-muted-foreground" style={{ fontSize: 12 }}>
        {t(isDesktop ? 'cliAuthGuide.afterLogin' : 'cliAuthGuide.cloudAfterUpdate')}
      </div>

      {rawErrorDetails && (
        <div className="flex flex-col gap-1.5">
          <div className="font-semibold" style={{ fontSize: 12 }}>
            {t('cliAuthGuide.errorDetails')}
          </div>
          <CodeBlock
            wrap
            code={rawErrorDetails}
            language="log"
            style={{ maxHeight: 200, overflow: 'auto' }}
          />
        </div>
      )}
    </GuideShell>
  );
};

export default AuthRequiredState;
