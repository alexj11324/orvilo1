'use client';

import { type BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ListOnlineDevicesState } from '../../../types';
import DeviceCard from '../DeviceCard';

const styles = {
  card: 'overflow-hidden w-full border border-sidebar-border rounded-[var(--ant-border-radius)] bg-card',
  empty:
    'py-3 ps-3 pe-3 border border-sidebar-border rounded-[var(--ant-border-radius)] text-sm leading-[inherit] text-[var(--ant-color-text-description)] bg-card',
};

const ListDevices = memo<BuiltinRenderProps<undefined, ListOnlineDevicesState>>(
  ({ pluginState }) => {
    const { t } = useTranslation('plugin');
    const devices = pluginState?.devices ?? [];

    if (devices.length === 0) {
      return (
        <div className={styles.empty}>
          {t('builtins.orvilo-remote-device.render.noOnlineDevices')}
        </div>
      );
    }

    return (
      <div className={cn('flex flex-col', styles.card)} role={'list'}>
        {devices.map((device) => (
          <DeviceCard device={device} key={device.deviceId} variant={'listItem'} />
        ))}
      </div>
    );
  },
);

ListDevices.displayName = 'ListDevices';

export default ListDevices;
