'use client';

import type { DeviceExecutionTarget, DeviceListItem } from '@orvilo/types';
import { BoxIcon, LaptopIcon, MonitorOffIcon, SparklesIcon } from 'lucide-react';
import { memo } from 'react';

import { getDeviceIcon } from '@/features/DeviceManager/getDeviceIcon';

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
  ({ devicePlatform, size = 16, target }) => {
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
    <span className="inline-flex items-center gap-1.5 text-xs leading-5">
      <span
        aria-hidden
        className={
          online
            ? 'size-1.5 flex-none rounded-full bg-success [box-shadow:0_0_0_2px_var(--success-wash)]'
            : 'size-1.5 flex-none rounded-full bg-foreground-quaternary'
        }
      />
      <span>{online ? onlineLabel : offlineLabel}</span>
    </span>
  ),
);

ExecutionTargetDeviceStatus.displayName = 'ExecutionTargetPicker.ExecutionTargetDeviceStatus';
