import { EditIcon, LinkIcon, Settings2Icon, TerminalIcon } from 'lucide-react';
import { useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Form from '@/components/GroupForm';
import KeyValueEditor from '@/components/KeyValueEditor';
import MCPStdioCommandInput from '@/components/MCPStdioCommandInput';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ArgsInput from '@/features/PluginDevModal/MCPManifestForm/ArgsInput';
import { useToolStore } from '@/store/tool';
import { pluginSelectors } from '@/store/tool/selectors';

const styles = {
  connectionForm: 'rounded-(--radius-card) border border-border bg-(--ant-color-fill-alter) p-5',
  editButton: 'order-1',
  emptyState:
    'rounded-(--radius-card) border border-dashed border-border bg-fill-quaternary p-8 text-center text-sm leading-5.5 text-foreground-tertiary',
  footer: 'flex flex-wrap gap-3 mbs-6',
  previewItem:
    'flex flex-wrap items-center justify-between gap-2 py-2 not-last:[border-block-end:1px_solid_var(--divider)]',
  previewLabel: 'flex items-center gap-2 text-sm leading-5.5 font-medium text-muted-foreground',
  previewValue:
    'min-w-0 max-w-full wrap-anywhere bg-fill-quaternary px-2 py-1 font-mono text-sm leading-5.5 font-semibold text-foreground',
  sectionTitle:
    "relative flex min-h-9 items-center gap-2 text-base leading-6 font-semibold text-foreground after:content-[''] after:flex-1 after:h-px after:ms-5 after:bg-linear-to-r after:from-border after:to-transparent",
};

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
  const [connectionForm] = Form.useForm();
  const [envForm] = Form.useForm();
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
    <div className="flex w-full max-w-160 flex-col px-3 py-2 text-sm leading-5.5">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-6">
          <div className={styles.sectionTitle}>
            <LinkIcon size={16} />
            {t('settings.connection.title')}
            {!isEditingConnection && (
              <Button
                className={styles.editButton}
                size="lg"
                variant="ghost"
                onClick={() => setIsEditingConnection(true)}
              >
                <EditIcon data-icon="inline-start" size={12} />
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
                  <span className={styles.previewValue}>
                    {customParams?.type?.toUpperCase() || 'Unknown'}
                  </span>
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
              <Form
                form={connectionForm}
                initialValues={customParams}
                layout="vertical"
                onFinish={handleConnectionSubmit}
              >
                {customParams?.type === 'http' && (
                  <Form.Item
                    label={t('settings.connection.url')}
                    name={'url'}
                    rules={[{ message: t('settings.rules.urlRequired'), required: true }]}
                  >
                    <Input
                      className="text-sm leading-5.5"
                      placeholder="https://mcp.example.com/server"
                      visualSize="normal"
                    />
                  </Form.Item>
                )}

                {customParams?.type === 'stdio' && (
                  <>
                    <Form.Item
                      label={t('settings.connection.command')}
                      name={'command'}
                      rules={[{ message: t('settings.rules.commandRequired'), required: true }]}
                    >
                      <MCPStdioCommandInput
                        className="rounded-(--radius-input) text-sm leading-5.5"
                        placeholder="npx, uv, python..."
                        size="lg"
                        onParsedArgs={(args) => {
                          const existing: string[] = connectionForm.getFieldValue('args') ?? [];
                          connectionForm.setFieldValue('args', [
                            ...args,
                            ...existing.filter(Boolean),
                          ]);
                        }}
                      />
                    </Form.Item>

                    <Form.Item
                      label={t('settings.connection.args')}
                      name={'args'}
                      rules={[{ message: t('settings.rules.argsRequired'), required: true }]}
                    >
                      <ArgsInput
                        className="text-sm leading-5.5"
                        placeholder="e.g: mcp-hello-world"
                      />
                    </Form.Item>
                  </>
                )}
                <div className={styles.footer}>
                  <Button loading={connectionLoading} size="lg" type="submit" variant="default">
                    {t('common:save')}
                  </Button>
                  <Button size="lg" onClick={handleCancelEdit}>
                    {t('common:cancel')}
                  </Button>
                </div>
              </Form>
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
            <div className="text-sm leading-5.5 text-muted-foreground">
              {t('settings.envConfigDescription')}
            </div>
            <Form
              form={envForm}
              initialValues={{ env: pluginSettings }}
              layout="vertical"
              onFinish={handleEnvSubmit}
            >
              <Form.Item name="env">
                <KeyValueEditor
                  addButtonText={t('dev.mcp.env.add')}
                  keyPlaceholder="VARIABLE_NAME"
                />
              </Form.Item>
              {!hideFooter && (
                <div className={styles.footer}>
                  <Button loading={loading} size="lg" type="submit" variant="default">
                    {t('common:save')}
                  </Button>
                  <Button size="lg" onClick={() => envForm.resetFields()}>
                    {t('common:reset')}
                  </Button>
                </div>
              )}
            </Form>
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
              <span className="text-muted-foreground">{t('settings.httpTypeNotice')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
