'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge as Tag } from '@/components/reui/badge';

import type { InstallPluginParams, InstallPluginState } from '../../../types';

export const InstallPluginRender = memo<
  BuiltinRenderProps<InstallPluginParams, InstallPluginState>
>(({ pluginState }) => {
  const { t } = useTranslation('plugin');

  if (!pluginState) return null;

  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--ant-color-fill-quaternary)] p-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-center gap-2">
          <span className="text-xs leading-[inherit] font-medium text-muted-foreground">
            {t('builtins.orvilo-agent-management.render.installPlugin.plugin')}
          </span>
          <Tag>{pluginState.pluginName || pluginState.pluginId}</Tag>
        </div>
        <span
          className={
            pluginState.installed
              ? 'text-[13px] font-medium text-success'
              : 'text-[13px] font-medium text-destructive'
          }
        >
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
