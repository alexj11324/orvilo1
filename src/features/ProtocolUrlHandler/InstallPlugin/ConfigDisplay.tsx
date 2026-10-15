'use client';

import { type McpInstallSchema } from '@orvilo/electron-client-ipc';
import { LinkIcon, Settings2Icon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import KeyValueEditor from '@/components/KeyValueEditor';

const styles = {
  configEditor: 'mbs-3',
  configSection: 'mbe-6 rounded-(--radius-card) p-4',
  configTitle: 'flex h-6 items-center gap-2 text-sm font-semibold text-foreground',
  previewContainer: 'px-2',
  previewItem:
    'flex items-center justify-between py-2 px-0 not-last:border-be not-last:border-divider',
  previewLabel: 'flex items-center gap-2 text-xs font-medium text-muted-foreground',
  previewValue:
    'rounded-(--radius-chip) bg-fill-quaternary py-1 px-2 font-mono text-xs font-semibold text-foreground',
  typeValue: 'flex items-center gap-2',
  urlValue:
    'max-w-75 rounded-(--radius-card) border border-border bg-popover py-2 px-3 font-mono text-xs font-medium [word-break:auto-phrase]',
};

interface ConfigDisplayProps {
  onConfigUpdate?: (updatedConfig: {
    env?: Record<string, string>;
    headers?: Record<string, string>;
  }) => void;
  schema: McpInstallSchema;
}

const ConfigDisplay = memo<ConfigDisplayProps>(({ schema, onConfigUpdate }) => {
  const { t } = useTranslation('plugin');

  // Local state management for config data
  const [currentEnv, setCurrentEnv] = useState<Record<string, string>>(schema.config.env || {});
  const [currentHeaders, setCurrentHeaders] = useState<Record<string, string>>(
    schema.config.headers || {},
  );

  // Handle environment variable updates
  const handleEnvUpdate = (newEnv: Record<string, string>) => {
    setCurrentEnv(newEnv);
    onConfigUpdate?.({ env: newEnv, headers: currentHeaders });
  };

  // Handle Headers updates
  const handleHeadersUpdate = (newHeaders: Record<string, string>) => {
    setCurrentHeaders(newHeaders);
    onConfigUpdate?.({ env: currentEnv, headers: newHeaders });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Installation info */}
      <div className={`${styles.configSection} flex flex-col border border-divider bg-card`}>
        <div className={styles.configTitle}>
          <LinkIcon size={16} />
          {t('protocolInstall.install.title')}
        </div>

        <div className={styles.previewContainer}>
          {/* Connection type */}
          <div className={styles.previewItem}>
            <span className={styles.previewLabel}>{t('protocolInstall.config.type.label')}</span>
            <div className={styles.typeValue}>
              <span className={styles.previewValue}>
                {schema.config.type === 'stdio' ? 'STDIO' : 'HTTP'}
              </span>
            </div>
          </div>

          {/* HTTP type shows URL */}
          {schema.config.type === 'http' && schema.config.url && (
            <div className={styles.previewItem}>
              <span className={styles.previewLabel}>{t('protocolInstall.config.url')}</span>
              <div className={styles.urlValue}>{schema.config.url}</div>
            </div>
          )}

          {/* STDIO type shows command and args */}
          {schema.config.type === 'stdio' && (
            <>
              {schema.config.command && (
                <div className={styles.previewItem}>
                  <span className={styles.previewLabel}>{t('protocolInstall.config.command')}</span>
                  <span className={styles.previewValue}>{schema.config.command}</span>
                </div>
              )}

              {schema.config.args && schema.config.args.length > 0 && (
                <div className={styles.previewItem}>
                  <span className={styles.previewLabel}>{t('protocolInstall.config.args')}</span>
                  <span className={styles.previewValue}>{schema.config.args.join(' ')}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Config info - directly use KeyValueEditor */}
      <div className={`${styles.configSection} flex flex-col border border-divider bg-card`}>
        <div className={styles.configTitle}>
          <Settings2Icon size={16} />
          {schema.config.type === 'stdio'
            ? t('protocolInstall.config.env')
            : t('protocolInstall.config.headers')}
        </div>

        <div className={styles.configEditor}>
          {/* HTTP type shows Headers */}
          {schema.config.type === 'http' && (
            <KeyValueEditor
              addButtonText={t('protocolInstall.config.addHeaders')}
              style={{ border: 'none' }}
              value={currentHeaders}
              onChange={handleHeadersUpdate}
            />
          )}

          {/* STDIO type shows environment variables */}
          {schema.config.type === 'stdio' && (
            <KeyValueEditor
              addButtonText={t('protocolInstall.config.addEnv')}
              style={{ border: 'none' }}
              value={currentEnv}
              onChange={handleEnvUpdate}
            />
          )}
        </div>
      </div>
    </div>
  );
});

ConfigDisplay.displayName = 'ConfigDisplay';

export default ConfigDisplay;
