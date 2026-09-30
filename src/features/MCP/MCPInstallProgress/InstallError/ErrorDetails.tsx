import { cssVar } from 'antd-style';
import * as m from 'motion/react-m';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { CodeBlock } from '@/components/ui/code-block';
import { type MCPErrorInfoMetadata } from '@/types/plugins';

const ErrorDetails = memo<{
  errorInfo: MCPErrorInfoMetadata;
  errorMessage?: string;
}>(({ errorInfo, errorMessage }) => {
  const { t } = useTranslation('plugin');

  return (
    <div className="flex flex-col gap-2">
      <m.div
        animate={{ height: 'auto', opacity: 1 }}
        initial={{ height: 0, opacity: 0 }}
        style={{ overflow: 'hidden' }}
      >
        <div
          className="flex flex-col gap-2"
          style={{
            backgroundColor: cssVar.colorFillQuaternary,
            borderRadius: 8,
            fontFamily: 'monospace',
            fontSize: '11px',
            padding: '8px 12px',
          }}
        >
          {errorInfo.params && (
            <div className="flex flex-col gap-1">
              <div>
                <Badge variant="info-light">{t('mcpInstall.errorDetails.connectionParams')}</Badge>
              </div>
              <div style={{ marginTop: 4, wordBreak: 'break-all' }}>
                {errorInfo.params.command && (
                  <div>
                    {t('mcpInstall.errorDetails.command')}: {errorInfo.params.command}
                  </div>
                )}
                {errorInfo.params.args && (
                  <div>
                    {t('mcpInstall.errorDetails.args')}: {errorInfo.params.args.join(' ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {errorInfo.errorLog && (
            <div className="flex flex-col gap-1">
              <div>
                <Badge variant="destructive-light">
                  {t('mcpInstall.errorDetails.errorOutput')}
                </Badge>
              </div>
              <CodeBlock
                code={errorInfo.errorLog}
                language="log"
                style={{
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              />
            </div>
          )}

          {errorInfo.originalError && errorInfo.originalError !== errorMessage && (
            <div>
              <Badge variant="warning-light">{t('mcpInstall.errorDetails.originalError')}</Badge>
              <div style={{ marginTop: 4, wordBreak: 'break-all' }}>{errorInfo.originalError}</div>
            </div>
          )}
        </div>
      </m.div>
    </div>
  );
});

export default ErrorDetails;
