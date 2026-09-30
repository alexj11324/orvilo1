import { Alert, Button } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
      <Alert
        type="error"
        variant={'borderless'}
        action={
          <div className="flex flex-col">
            <Button
              size={'small'}
              type={'fill'}
              onClick={() => {
                cancelInstallMCPPlugin(identifier);
              }}
            >
              {t('common:close')}
            </Button>
          </div>
        }
        title={t('mcpInstall.installError', {
          detail: t(`mcpInstall.errorTypes.${errorInfo.type}`),
        })}
      />
      {errorInfo.metadata && (
        <ErrorDetails errorInfo={errorInfo.metadata} errorMessage={errorInfo.message} />
      )}
    </div>
  );
});
export default InstallError;
