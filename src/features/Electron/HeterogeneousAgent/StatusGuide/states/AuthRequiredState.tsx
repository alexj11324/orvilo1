import { Text } from '@lobehub/ui/base-ui';
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
        <Text type="secondary">{t('cliAuthGuide.desc', { name: config.title })}</Text>
      }
    >
      {isDesktop && (
        <div className="flex flex-col gap-1.5">
          <Text strong style={{ fontSize: 12 }}>
            {t('cliAuthGuide.runCommand')}
          </Text>
          <CodeBlock wrap code={config.signInCommand} language="bash" variant="ghost" />
        </div>
      )}

      <Text style={{ fontSize: 12 }} type="secondary">
        {t(isDesktop ? 'cliAuthGuide.afterLogin' : 'cliAuthGuide.cloudAfterUpdate')}
      </Text>

      {rawErrorDetails && (
        <div className="flex flex-col gap-1.5">
          <Text strong style={{ fontSize: 12 }}>
            {t('cliAuthGuide.errorDetails')}
          </Text>
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
