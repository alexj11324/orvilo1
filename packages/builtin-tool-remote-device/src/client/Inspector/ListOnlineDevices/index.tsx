'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { MonitorIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ListOnlineDevicesState } from '../../../types';

const styles = {
  count: 'inline-flex items-center h-5 text-xs leading-5 text-[var(--ant-color-text-description)]',
  icon: 'flex-none',
  root: 'gap-2',
};

export const ListOnlineDevicesInspector = memo<
  BuiltinInspectorProps<undefined, ListOnlineDevicesState>
>(({ isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');
  const isPending = isArgumentsStreaming || isLoading;
  const deviceCount = pluginState?.devices?.length;

  return (
    <div className={cn(inspectorTextStyles.root, styles.root)}>
      <span className={cn('anticon', styles.icon)} role="img">
        <MonitorIcon fill={'transparent'} height={14} size={14} width={14} />
      </span>
      <span className={cn(isPending && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-remote-device.apiName.listOnlineDevices')}
      </span>
      {!isPending && deviceCount !== undefined && (
        <span className={styles.count}>
          {t('builtins.orvilo-remote-device.inspector.onlineCount', { count: deviceCount })}
        </span>
      )}
    </div>
  );
});

ListOnlineDevicesInspector.displayName = 'ListOnlineDevicesInspector';
