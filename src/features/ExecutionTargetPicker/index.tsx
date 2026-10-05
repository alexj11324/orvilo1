'use client';

import type { DeviceExecutionTarget, DeviceListItem } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { BoxIcon, LaptopIcon, MonitorOffIcon, SparklesIcon } from 'lucide-react';
import { memo } from 'react';

import { getDeviceIcon } from '@/features/DeviceManager/getDeviceIcon';

// The grouping/candidate derivations live in the shared helper so settings,
// chat, connect and repair surfaces all read ONE pool definition.
export {
  executionTargetDeviceCandidates,
  groupExecutionTargetDevices,
} from '@/helpers/executionTarget';

const styles = createStaticStyles(({ css }) => ({
  dotOffline: css`
    flex: none;

    width: 6px;
    height: 6px;
    border-radius: 50%;

    background: ${cssVar.colorTextQuaternary};
  `,
  dotOnline: css`
    flex: none;

    width: 6px;
    height: 6px;
    border-radius: 50%;

    background: ${cssVar.colorSuccess};
    box-shadow: 0 0 0 2px ${cssVar.colorSuccessBg};
  `,
  status: css`
    display: inline-flex;
    gap: 6px;
    align-items: center;
  `,
}));

export const SHARED_EXECUTION_TARGETS = ['auto', 'device', 'none', 'sandbox'] as const;

export const isSharedExecutionTarget = (
  target: DeviceExecutionTarget | undefined,
): target is Exclude<DeviceExecutionTarget, 'local'> =>
  !!target &&
  SHARED_EXECUTION_TARGETS.includes(target as (typeof SHARED_EXECUTION_TARGETS)[number]);

export const executionTargetValue = (target: DeviceExecutionTarget, deviceId?: string) =>
  target === 'device' && deviceId ? `device:${deviceId}` : `target:${target}`;

export const parseExecutionTargetValue = (
  value: string,
): { deviceId?: string; target: DeviceExecutionTarget } | undefined => {
  if (value.startsWith('device:')) {
    const deviceId = value.slice('device:'.length);
    return deviceId ? { deviceId, target: 'device' } : undefined;
  }

  if (!value.startsWith('target:')) return undefined;
  const target = value.slice('target:'.length) as DeviceExecutionTarget;
  return ['auto', 'local', 'none', 'sandbox'].includes(target) ? { target } : undefined;
};

export interface ExecutionTargetSelection {
  deviceId?: string;
  target: DeviceExecutionTarget;
}

/**
 * Resolve the execution target an agent currently points at.
 *
 * Shared by the Agent Profile picker (which renders it) and the Permission page
 * (which can only fix a target that actually resolves) so the two surfaces
 * cannot disagree about what "no environment picked yet" means. A `device`
 * target whose bound device is gone — unshared, deleted, still loading —
 * resolves to `undefined` rather than a dangling selection.
 */
export const resolveExecutionTargetSelection = ({
  boundDeviceId,
  configuredTarget,
  devices,
  isHeterogeneous,
}: {
  boundDeviceId?: string;
  configuredTarget?: DeviceExecutionTarget;
  devices: DeviceListItem[];
  isHeterogeneous: boolean;
}): ExecutionTargetSelection | undefined => {
  if (configuredTarget === 'device') {
    const boundDevice = devices.find((device) => device.deviceId === boundDeviceId);
    return boundDevice ? { deviceId: boundDevice.deviceId, target: 'device' } : undefined;
  }

  if (configuredTarget === 'local' || isSharedExecutionTarget(configuredTarget))
    return { target: configuredTarget };

  // Built-in-runtime agents default to "no environment" when nothing is stored;
  // heterogeneous ones genuinely have no selection until the author picks one.
  return configuredTarget === undefined && !isHeterogeneous ? { target: 'none' } : undefined;
};

interface ExecutionTargetIconProps {
  devicePlatform?: string | null;
  size?: number;
  target: DeviceExecutionTarget;
}

export const ExecutionTargetIcon = memo<ExecutionTargetIconProps>(
  ({ devicePlatform, size = 14, target }) => {
    switch (target) {
      case 'auto': {
        return <SparklesIcon size={size} />;
      }
      case 'device': {
        return <>{getDeviceIcon(devicePlatform, size)}</>;
      }
      case 'local': {
        return <LaptopIcon size={size} />;
      }
      case 'none': {
        return <MonitorOffIcon size={size} />;
      }
      case 'sandbox': {
        return <BoxIcon size={size} />;
      }
    }
  },
);

ExecutionTargetIcon.displayName = 'ExecutionTargetPicker.ExecutionTargetIcon';

interface ExecutionTargetDeviceStatusProps {
  offlineLabel: string;
  online: boolean;
  onlineLabel: string;
}

export const ExecutionTargetDeviceStatus = memo<ExecutionTargetDeviceStatusProps>(
  ({ offlineLabel, online, onlineLabel }) => (
    <span className={styles.status}>
      <span aria-hidden className={online ? styles.dotOnline : styles.dotOffline} />
      <span>{online ? onlineLabel : offlineLabel}</span>
    </span>
  ),
);

ExecutionTargetDeviceStatus.displayName = 'ExecutionTargetPicker.ExecutionTargetDeviceStatus';
