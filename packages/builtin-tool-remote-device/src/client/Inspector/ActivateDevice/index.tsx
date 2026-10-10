'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ActivateDeviceParams, ActivateDeviceState } from '../../../types';

const styles = {
  device:
    'truncate max-w-60 py-0.5 ps-2 pe-2 rounded-[var(--ant-border-radius-sm)] font-medium text-foreground bg-accent',
};

export const ActivateDeviceInspector = memo<
  BuiltinInspectorProps<ActivateDeviceParams, ActivateDeviceState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');
  const device = pluginState?.activatedDevice;
  const requestedDeviceId = args?.deviceId || partialArgs?.deviceId;
  const deviceLabel =
    device?.friendlyName ||
    device?.hostname ||
    (requestedDeviceId ? requestedDeviceId.slice(0, 12) : '');

  return (
    <div className={inspectorTextStyles.root}>
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-remote-device.apiName.activateDevice')}
      </span>
      {deviceLabel && <span className={styles.device}>{deviceLabel}</span>}
    </div>
  );
});

ActivateDeviceInspector.displayName = 'ActivateDeviceInspector';
