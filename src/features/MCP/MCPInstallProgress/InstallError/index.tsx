import { CircleAlert } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useToolStore } from '@/store/tool';
import { type MCPErrorInfo } from '@/types/plugins';

import ErrorDetails from './ErrorDetails';

interface InstallErrorProps {
  errorInfo: MCPErrorInfo;
  identifier: string;
}

const InstallError = memo<InstallErrorProps>(({ errorInfo, identifier }) => {
  const { t } = useTranslation(['plugin', 'common']);

  const cancelInstallMCPPlugin = useToolStore((s) => s.cancelInstallMCPPlugin);

  return (
    <div className="flex flex-col gap-2">
      <Alert variant="destructive">
        <CircleAlert aria-hidden className="size-4" />
        <AlertTitle>
          {t('mcpInstall.installError', {
            detail: t(`mcpInstall.errorTypes.${errorInfo.type}`),
          })}
        </AlertTitle>
        <AlertAction>
          <Button
            size={'sm'}
            variant="outline"
            onClick={() => {
              cancelInstallMCPPlugin(identifier);
            }}
          >
            {t('common:close')}
          </Button>
        </AlertAction>
      </Alert>
      {errorInfo.metadata && (
        <ErrorDetails errorInfo={errorInfo.metadata} errorMessage={errorInfo.message} />
      )}
    </div>
  );
});
export default InstallError;
