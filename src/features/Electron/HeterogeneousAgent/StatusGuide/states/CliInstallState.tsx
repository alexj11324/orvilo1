import { HeterogeneousAgentSessionErrorCode } from '@orvilo/electron-client-ipc';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/reui/code-block/code-block';

import GuideActions from '../GuideActions';
import GuideShell from '../GuideShell';
import type { HeterogeneousAgentGuideStateProps } from '../types';

const CliInstallState = ({
  config,
  error,
  onOpenSystemTools,
  variant,
}: HeterogeneousAgentGuideStateProps) => {
  const { t } = useTranslation('chat');
  const translationPrefix = config.translationPrefix;
  const docsUrl = error?.docsUrl || config.docsUrl;
  const installCommands = error?.installCommands?.length
    ? error.installCommands
    : config.installCommands;
  const [recommendedCommand, alternativeCommand] = installCommands;
  const showErrorReason =
    Boolean(error?.message) && error?.code !== HeterogeneousAgentSessionErrorCode.CliNotFound;

  // `translationPrefix` is dynamic at runtime, so use the string-key overload
  // with `defaultValue` to satisfy the i18n key typing.
  const tKey = (suffix: string, options?: Record<string, unknown>) =>
    t(`${translationPrefix}.${suffix}`, { defaultValue: '', ...options });

  return (
    <GuideShell
      headerDescription={<div className="text-muted-foreground">{tKey('desc')}</div>}
      icon={<config.icon size={24} />}
      title={tKey('title')}
      variant={variant}
      actions={
        <GuideActions
          showDocs
          docsUrl={docsUrl}
          openDocsLabel={tKey('actions.openDocs')}
          openSystemToolsLabel={tKey('actions.openSystemTools')}
          onOpenSystemTools={onOpenSystemTools}
        />
      }
    >
      {showErrorReason && (
        <div className="text-muted-foreground" style={{ fontSize: 12 }}>
          {tKey('reason', { message: error?.message })}
        </div>
      )}

      {recommendedCommand && (
        <div className="flex flex-col gap-1.5">
          <div className="font-semibold" style={{ fontSize: 12 }}>
            {tKey('installWithNpm')}
          </div>
          <CodeBlock wrap code={recommendedCommand} language="bash" variant="ghost" />
        </div>
      )}

      {alternativeCommand && (
        <div className="flex flex-col gap-1.5">
          <div className="font-semibold" style={{ fontSize: 12 }}>
            {tKey('installWithBrew')}
          </div>
          <CodeBlock wrap code={alternativeCommand} language="bash" variant="ghost" />
        </div>
      )}

      <div className="text-muted-foreground" style={{ fontSize: 12 }}>
        {tKey('afterInstall')}
      </div>
    </GuideShell>
  );
};

export default CliInstallState;
