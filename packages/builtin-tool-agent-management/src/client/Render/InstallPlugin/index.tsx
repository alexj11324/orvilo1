'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge as Tag } from '@/components/reui/badge';

import type { InstallPluginParams, InstallPluginState } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    padding: 12px;
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
  `,
  label: css`
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
  `,
  statusFail: css`
    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorError};
  `,
  statusSuccess: css`
    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorSuccess};
  `,
  value: css`
    font-size: 13px;
  `,
}));

export const InstallPluginRender = memo<
  BuiltinRenderProps<InstallPluginParams, InstallPluginState>
>(({ pluginState }) => {
  const { t } = useTranslation('plugin');

  if (!pluginState) return null;

  return (
    <div className={styles.container}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-center gap-2">
          <span className={styles.label}>
            {t('builtins.orvilo-agent-management.render.installPlugin.plugin')}
          </span>
          <Tag>{pluginState.pluginName || pluginState.pluginId}</Tag>
        </div>
        <span className={pluginState.installed ? styles.statusSuccess : styles.statusFail}>
          {pluginState.installed
            ? t('builtins.orvilo-agent-management.render.installPlugin.success')
            : t('builtins.orvilo-agent-management.render.installPlugin.failed')}
        </span>
      </div>
    </div>
  );
});

InstallPluginRender.displayName = 'InstallPluginRender';

export default InstallPluginRender;
