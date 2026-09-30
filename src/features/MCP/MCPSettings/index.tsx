import { Form as AForm } from 'antd';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { EditIcon, LinkIcon, Settings2Icon, TerminalIcon } from 'lucide-react';
import { useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';

import KeyValueEditor from '@/components/KeyValueEditor';
import MCPStdioCommandInput from '@/components/MCPStdioCommandInput';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ArgsInput from '@/features/PluginDevModal/MCPManifestForm/ArgsInput';
import { useToolStore } from '@/store/tool';
import { pluginSelectors } from '@/store/tool/selectors';

const styles = createStaticStyles(({ css, cssVar }) => ({
  compactForm: css`
    .ant-form-item {
      margin-block-end: ${cssVar.marginSM};
    }

    .ant-form-item-label {
      padding-block-end: ${cssVar.paddingXXS};

      label {
        height: auto;
        font-size: ${cssVar.fontSizeSM};
      }
    }
  `,

  configFormContainer: css`
    padding: ${cssVar.paddingLG};
    border: 1px solid ${cssVar.colorBorder};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillAlter};
  `,

  configHeader: css`
    margin-block-end: ${cssVar.marginLG};

    h5 {
      margin-block-end: ${cssVar.marginXS} !important;
      color: ${cssVar.colorTextHeading};
    }
  `,

  connectionForm: css`
    padding: ${cssVar.paddingMD};
    border: 1px solid ${cssVar.colorBorder};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillAlter};
  `,

  connectionPreview: css`
    padding: ${cssVar.paddingMD};
    border: 1px solid ${cssVar.colorBorder};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillAlter};
  `,

  editButton: css`
    position: absolute;
    inset-block-start: ${cssVar.paddingXS};
    inset-inline-end: ${cssVar.paddingXS};
  `,

  emptyState: css`
    padding: ${cssVar.paddingXL};
    border: 1px dashed ${cssVar.colorBorder};
    border-radius: ${cssVar.borderRadiusLG};

    color: ${cssVar.colorTextTertiary};
    text-align: center;

    background: ${cssVar.colorFillQuaternary};
  `,

  footer: css`
    display: flex;
    gap: ${cssVar.marginSM};
    margin-block-start: ${cssVar.marginLG};
  `,

  markdown: css`
    p {
      margin-block-end: ${cssVar.marginXS};
      color: ${cssVar.colorTextDescription};
    }
  `,

  previewItem: css`
    display: flex;
    align-items: center;
    justify-content: space-between;

    padding-block: ${cssVar.paddingXS};
    padding-inline: 0;

    &:not(:last-child) {
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,

  previewLabel: css`
    display: flex;
    gap: ${cssVar.marginXS};
    align-items: center;

    font-size: ${cssVar.fontSizeSM};
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
  `,

  previewValue: css`
    padding-block: ${cssVar.paddingXXS};
    padding-inline: ${cssVar.paddingXS};

    font-family: ${cssVar.fontFamilyCode};
    font-size: ${cssVar.fontSizeSM};
    font-weight: 600;
    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};
  `,

  sectionTitle: css`
    position: relative;

    display: flex;
    gap: ${cssVar.marginXS};
    align-items: center;

    height: 32px;

    font-size: ${cssVar.fontSizeLG};
    font-weight: 600;
    color: ${cssVar.colorTextHeading};

    &::after {
      content: '';

      flex: 1;

      height: 1px;
      margin-inline-start: ${cssVar.marginMD};

      background: linear-gradient(to right, ${cssVar.colorBorder}, transparent);
    }
  `,
}));

export interface SettingsRef {
  reset: () => void;
  save: () => Promise<void>;
}

interface SettingsProps {
  hideFooter?: boolean;
  identifier: string;
}

const Settings = ({
  ref,
  identifier,
  hideFooter,
}: SettingsProps & { ref?: React.RefObject<SettingsRef | null> }) => {
  const { t } = useTranslation(['plugin', 'common']);
  const [connectionForm] = AForm.useForm();
  const [envForm] = AForm.useForm();
  const [loading, setLoading] = useState(false);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [isEditingConnection, setIsEditingConnection] = useState(false);

  const [updatePluginSettings, updateInstallPlugin] = useToolStore((s) => [
    s.updatePluginSettings,
    s.updateInstallMcpPlugin,
  ]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      connectionForm.resetFields();
      envForm.resetFields();
      setIsEditingConnection(false);
    },
    save: async () => {
      if (isEditingConnection) {
        await connectionForm.submit();
      }
      await envForm.submit();
    },
  }));

  // Get installed plugin info
  const installedPlugin = useToolStore(pluginSelectors.getInstalledPluginById(identifier));
  const pluginSettings = useToolStore(pluginSelectors.getPluginSettingsById(identifier));

  if (!installedPlugin) {
    return null;
  }

  const customParams = installedPlugin.customParams?.mcp;
  const isStdioType = customParams?.type === 'stdio';

  const handleConnectionSubmit = async (values: any) => {
    setConnectionLoading(true);
    try {
      await updateInstallPlugin(identifier!, values);

      toast.success(t('settings.messages.connectionUpdateSuccess'));
      setIsEditingConnection(false);
    } catch (error) {
      console.error('Connection update failed:', error);
      toast.error(t('settings.messages.connectionUpdateFailed'));
    } finally {
      setConnectionLoading(false);
    }
  };

  const handleCancelEdit = () => {
    connectionForm.resetFields();
    setIsEditingConnection(false);
  };

  const handleEnvSubmit = async (values: { env?: Record<string, string> }) => {
    setLoading(true);
    try {
      await updatePluginSettings(identifier!, values.env || {}, { override: true });
      toast.success(t('settings.messages.envUpdateSuccess'));
    } catch (error) {
      console.error('Settings update failed:', error);
      toast.error(t('settings.messages.envUpdateFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col py-2 px-3">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-6">
          <div className={styles.sectionTitle}>
            <LinkIcon size={16} />
            {t('settings.connection.title')}
            {!isEditingConnection && (
              <Button
                className={styles.editButton}
                size="sm"
                variant="ghost"
                onClick={() => setIsEditingConnection(true)}
              >
                <EditIcon size={12} />
                {t('settings.edit')}
              </Button>
            )}
          </div>

          {!isEditingConnection ? (
            // Preview mode
            <div className="flex flex-col px-2">
              <div className={styles.previewItem}>
                <span className={styles.previewLabel}>{t('settings.connection.type')}</span>
                <div className="flex">
                  <TerminalIcon />
                  <div className={styles.previewValue}>
                    {customParams?.type?.toUpperCase() || 'Unknown'}
                  </div>
                </div>
              </div>

              {customParams?.type === 'http' && customParams?.url && (
                <div className={styles.previewItem}>
                  <span className={styles.previewLabel}>{t('settings.connection.url')}</span>
                  <span className={styles.previewValue}>{customParams.url}</span>
                </div>
              )}

              {customParams?.type === 'stdio' && (
                <>
                  {customParams?.command && (
                    <div className={styles.previewItem}>
                      <span className={styles.previewLabel}>
                        {t('settings.connection.command')}
                      </span>
                      <span className={styles.previewValue}>{customParams.command}</span>
                    </div>
                  )}

                  {customParams?.args && customParams.args.length > 0 && (
                    <div className={styles.previewItem}>
                      <span className={styles.previewLabel}>{t('settings.connection.args')}</span>
                      <span className={styles.previewValue}>{customParams.args.join(' ')}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            // Edit mode
            <div className={styles.connectionForm}>
              <AForm
                className={styles.compactForm}
                form={connectionForm}
                initialValues={customParams}
                layout="vertical"
                onFinish={handleConnectionSubmit}
              >
                {customParams?.type === 'http' && (
                  <AForm.Item
                    label={t('settings.connection.url')}
                    name={'url'}
                    rules={[{ message: t('settings.rules.urlRequired'), required: true }]}
                  >
                    <Input placeholder="https://mcp.example.com/server" />
                  </AForm.Item>
                )}

                {customParams?.type === 'stdio' && (
                  <>
                    <AForm.Item
                      label={t('settings.connection.command')}
                      name={'command'}
                      rules={[{ message: t('settings.rules.commandRequired'), required: true }]}
                    >
                      <MCPStdioCommandInput
                        placeholder="npx, uv, python..."
                        onParsedArgs={(args) => {
                          const existing: string[] = connectionForm.getFieldValue('args') ?? [];
                          connectionForm.setFieldValue('args', [
                            ...args,
                            ...existing.filter(Boolean),
                          ]);
                        }}
                      />
                    </AForm.Item>

                    <AForm.Item
                      label={t('settings.connection.args')}
                      name={'args'}
                      rules={[{ message: t('settings.rules.argsRequired'), required: true }]}
                    >
                      <ArgsInput placeholder="e.g: mcp-hello-world" />
                    </AForm.Item>
                  </>
                )}
                <div className={cn('flex gap-2', styles.footer)}>
                  <Button loading={connectionLoading} type="submit" variant="default">
                    {t('common:save')}
                  </Button>
                  <Button onClick={handleCancelEdit}>{t('common:cancel')}</Button>
                </div>
              </AForm>
            </div>
          )}
        </div>

        {/* Environment variable configuration (stdio type only) */}
        {isStdioType && (
          <div className="flex flex-col gap-3">
            <div className={styles.sectionTitle}>
              <Settings2Icon size={16} />
              {t('settings.configuration.title')}
            </div>
            <div className="text-muted-foreground" style={{ fontSize: 12 }}>
              {t('settings.envConfigDescription')}
            </div>
            <AForm
              form={envForm}
              initialValues={{ env: pluginSettings }}
              layout="vertical"
              onFinish={handleEnvSubmit}
            >
              <AForm.Item name="env" style={{ marginBottom: 0 }}>
                <KeyValueEditor
                  addButtonText={t('dev.mcp.env.add')}
                  keyPlaceholder="VARIABLE_NAME"
                />
              </AForm.Item>
              {!hideFooter && (
                <div className={cn('flex gap-2', styles.footer)}>
                  <Button loading={loading} type="submit" variant="default">
                    {t('common:save')}
                  </Button>
                  <Button onClick={() => envForm.resetFields()}>{t('common:reset')}</Button>
                </div>
              )}
            </AForm>
          </div>
        )}

        {/* HTTP type notice */}
        {!isStdioType && (
          <div>
            <div className={styles.sectionTitle}>
              <Settings2Icon size={16} />
              {t('settings.configuration.title')}
            </div>
            <div className={styles.emptyState}>
              <div className="text-muted-foreground">{t('settings.httpTypeNotice')}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
