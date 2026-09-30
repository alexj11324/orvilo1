'use client';

import { cssVar } from 'antd-style';
import { CircleAlert, TriangleAlert, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import PluginAvatar from '@/components/Plugins/PluginAvatar';
import PluginTag from '@/components/Plugins/PluginTag';
import { toast } from '@/components/toast';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { useToolStore } from '@/store/tool';
import { mcpStoreSelectors } from '@/store/tool/selectors';
import { type McpConnectionParams } from '@/types/plugins';
import { type OrviloToolCustomPlugin } from '@/types/tool/plugin';

import ConfigDisplay from './ConfigDisplay';
import { type McpInstallRequest } from './types';

interface CustomPluginInstallModalProps {
  installRequest: McpInstallRequest | null;
  isMarketplace?: boolean;
  onComplete?: () => void;
}

const CustomPluginInstallModal = memo<CustomPluginInstallModalProps>(
  ({ installRequest, isMarketplace = false, onComplete }) => {
    const { t } = useTranslation(['plugin', 'common']);
    const [loading, setLoading] = useState(false);
    const { allowed: canCreate } = usePermission('create_content');
    const { allowed: canEdit } = usePermission('edit_own_content');

    // Track config updates
    const [updatedConfig, setUpdatedConfig] = useState<{
      env?: Record<string, string>;
      headers?: Record<string, string>;
    }>({});

    const [installCustomPlugin] = useToolStore((s) => [s.installCustomPlugin]);
    const testMcpConnection = useToolStore((s) => s.testMcpConnection);
    const togglePlugin = useAgentStore((s) => s.togglePlugin);

    // Generate a unique identifier for custom plugin connection testing
    const identifier = installRequest?.schema?.identifier || '';
    const testState = useToolStore(mcpStoreSelectors.getMCPConnectionTestState(identifier));
    const [errorDismissed, setErrorDismissed] = useState(false);
    useEffect(() => setErrorDismissed(false), [testState.error]);

    const schema = installRequest?.schema;
    const isStdioMcp = schema?.config.type === 'stdio';

    // Reset loading state and config
    useEffect(() => {
      if (!installRequest) {
        setLoading(false);
        setUpdatedConfig({});
      }
    }, [installRequest]);

    const handleConfirm = useCallback(async () => {
      if (!canCreate || !canEdit || !installRequest || !schema) return;

      setLoading(true);
      try {
        // Merge original config with user-updated config
        const finalConfig = {
          ...schema.config,
          env: updatedConfig.env || schema.config.env,
          headers: updatedConfig.headers || schema.config.headers,
        };

        // Custom plugin: test connection first to get the real manifest
        const testParams: McpConnectionParams = {
          connection: finalConfig,
          identifier,
          metadata: {
            avatar: schema.icon,
            description: schema.description,
          },
        };

        const testResult = await testMcpConnection(testParams);

        if (!testResult.success) {
          throw new Error(testResult.error || t('protocolInstall.messages.connectionTestFailed'));
        }

        if (!testResult.manifest) {
          throw new Error(t('protocolInstall.messages.manifestNotFound'));
        }

        // Third-party marketplace and custom plugins: build custom plugin data
        // Use the real manifest obtained from connection testing
        const customPlugin: OrviloToolCustomPlugin = {
          customParams: {
            avatar: schema.icon,
            description: schema.description,
            mcp: {
              ...finalConfig, // Use the merged config
              headers: finalConfig.type === 'http' ? finalConfig.headers : undefined,
            },
          },
          identifier: schema.identifier,
          manifest: testResult.manifest, // Use the real manifest
          type: 'customPlugin',
        };

        await installCustomPlugin(customPlugin);
        await togglePlugin(schema.identifier);
        toast.success(t('protocolInstall.messages.installSuccess', { name: schema.name }));

        onComplete?.();
      } catch (error) {
        console.error('Plugin installation error:', error);
        toast.error(t('protocolInstall.messages.installError'));
        setLoading(false);
      }
    }, [
      installRequest,
      canCreate,
      canEdit,
      schema,
      updatedConfig,
      onComplete,
      installCustomPlugin,
      testMcpConnection,
      togglePlugin,
      t,
      identifier,
    ]);

    const handleCancel = useCallback(() => {
      onComplete?.();
    }, [onComplete]);

    if (!installRequest || !schema) return null;

    // Render different Alert components based on type
    const renderAlert = () => {
      const sourceAlert = !isMarketplace ? (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>{t('protocolInstall.custom.security.description')}</AlertTitle>
        </Alert>
      ) : (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>{t('protocolInstall.marketplace.unverified.warning')}</AlertTitle>
        </Alert>
      );

      return (
        <div className="flex flex-col gap-2">
          {sourceAlert}
          {isStdioMcp && (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle>{t('protocolInstall.stdio.commandExecution.title')}</AlertTitle>
              <AlertDescription>
                {t('protocolInstall.stdio.commandExecution.description')}
              </AlertDescription>
            </Alert>
          )}
        </div>
      );
    };

    const modalTitle = isMarketplace
      ? t('protocolInstall.marketplace.title')
      : t('protocolInstall.custom.title');

    const okText = isStdioMcp
      ? t('protocolInstall.actions.runCommandAndInstall')
      : isMarketplace
        ? t('protocolInstall.actions.install')
        : t('protocolInstall.actions.installAnyway');

    return (
      <ImperativeModal
        open
        confirmLoading={loading || testState.loading}
        okButtonProps={{ disabled: !canCreate || !canEdit }}
        okText={okText}
        title={modalTitle}
        width={680}
        onCancel={handleCancel}
        onOk={handleConfirm}
      >
        <div className="flex flex-col gap-6">
          {renderAlert()}

          <div
            className="flex gap-4 justify-between p-4 border"
            style={{
              borderColor: cssVar.colorBorderSecondary,
              background: cssVar.colorBgContainer,
            }}
          >
            <div className="flex gap-4">
              <PluginAvatar avatar={schema.icon} size={40} />
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  {schema.name}
                  <PluginTag type={'customPlugin'} />
                </div>
                <span className="text-[12px] text-muted-foreground">{schema.description}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <ConfigDisplay schema={schema} onConfigUpdate={setUpdatedConfig} />
            {/* Show connection test error */}
            {testState.error && !errorDismissed && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>{t('protocolInstall.messages.connectionTestFailed')}</AlertTitle>
                <AlertDescription>{testState.error}</AlertDescription>
                <AlertAction>
                  <button
                    aria-label={t('common:close')}
                    className="text-muted-foreground"
                    type="button"
                    onClick={() => setErrorDismissed(true)}
                  >
                    <X size={16} />
                  </button>
                </AlertAction>
              </Alert>
            )}
          </div>
        </div>
      </ImperativeModal>
    );
  },
);

CustomPluginInstallModal.displayName = 'CustomPluginInstallModal';

export default CustomPluginInstallModal;
