'use client';

import { type BuiltinRenderProps } from '@orvilo/types';
import { AlertTriangleIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ActivateDeviceParams, ActivateDeviceState } from '../../../types';
import DeviceCard from '../DeviceCard';

const styles = {
  failure:
    'flex gap-2 items-center py-3 ps-3 pe-3 border border-[var(--ant-color-warning-border)] rounded-[var(--ant-border-radius)] text-sm leading-[inherit] text-[var(--ant-color-warning-text)] bg-[var(--ant-color-warning-bg)]',
};

const ActivateDevice = memo<BuiltinRenderProps<ActivateDeviceParams, ActivateDeviceState, string>>(
  ({ pluginState, content }) => {
    const { t } = useTranslation('plugin');
    const device = pluginState?.activatedDevice;

    if (device) return <DeviceCard activated device={device} />;

    // Activation failed without a thrown error (e.g. device offline / unknown), so no state is
    // produced. Fall back to the explanatory content the runtime returned instead of rendering
    // blank — the tool detail view only skips custom renders when `result.error` is set.
    if (typeof content === 'string' && content.length > 0) {
      return (
        <div className={styles.failure}>
          <span className="anticon" role="img">
            <AlertTriangleIcon fill={'transparent'} height={14} size={14} width={14} />
          </span>
          <span>
            {t('builtins.orvilo-remote-device.render.activationFailed')}: {content}
          </span>
        </div>
      );
    }

    return null;
  },
);

ActivateDevice.displayName = 'ActivateDevice';

export default ActivateDevice;
