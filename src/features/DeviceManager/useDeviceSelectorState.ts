import type { DeviceListItem } from '@orvilo/types';
import { shouldShowDeviceSelector } from '@orvilo/types';
import { useMemo } from 'react';

import { executionTargetDeviceCandidates } from '@/helpers/executionTarget';

import { useDeviceList } from './useDeviceList';

/**
 * The device-selection states the shared execution contract defines
 * (docs/development/device-execution-contract.md). Every surface that offers
 * or displays an execution device — agent settings, connect flow, diagnostics
 * — resolves through this hook so the 0 / 1 / many rules can never drift.
 */
export interface DeviceSelectorState {
  /**
   * Binding resolution for `boundDeviceId`:
   * - `unset` — nothing bound yet (auto-resolve happens at admission, never here)
   * - `valid` — the bound device is still a legal candidate
   * - `invalid` — bound device gone / illegal → `DEVICE_BINDING_INVALID` repair
   * - `pending` — inventory still resolving; the caller must not judge yet
   */
  bindingState: 'unset' | 'valid' | 'invalid' | 'pending';
  /** Whether the caller may change the device (permission + policy not `fixed`). */
  canSelectDevice: boolean;
  /** `useDeviceList` settled successfully. Loading/failed is never 0 or 1. */
  deviceInventoryComplete: boolean;
  deviceInventoryError: unknown;
  /** `canSelectDevice` and friends could be evaluated (permissions loaded). */
  permissionsLoaded: boolean;
  /** Online subset of `selectableDevices` — devices that can start right now. */
  runnableDevices: DeviceListItem[];
  /**
   * Devices the principal may execute on — legal scope only. Offline devices
   * STAY in this set (offline ≠ removed from config); they just cannot start.
   */
  selectableDevices: DeviceListItem[];
  /**
   * The contract formula verbatim: the picker renders only when the user has
   * more than one legitimate candidate AND is allowed to change it. Hiding the
   * picker never unbinds the device.
   */
  showDeviceSelector: boolean;
}

export interface UseDeviceSelectorStateOptions {
  /** Currently persisted binding, if any. */
  boundDeviceId?: string;
  /** Caller-side permission/policy result (`useEffectiveAgencyConfig`). */
  canSelectDevice: boolean;
  /** Caller-owned device explicitly selected in the workspace member override. */
  memberSelectedDeviceId?: string;
  /**
   * Which legal pool to select from. `personal` agents may only bind the
   * caller's own devices; `workspace` agents use workspace-scope devices plus
   * the caller's exact personal member override, never a personal shared default.
   */
  scope: 'personal' | 'workspace';
}

/**
 * Resolve the device-selection state for one surface.
 *
 * `permissionsLoaded` is computed inside from nothing — callers feed their own
 * `isPreferenceLoading`/`isAccessLoading` into `canSelectDevice` upstream and
 * pass `permissionsReady` so a still-resolving policy never looks like a deny.
 */
export const useDeviceSelectorState = ({
  boundDeviceId,
  canSelectDevice,
  memberSelectedDeviceId,
  permissionsLoaded = true,
  scope,
}: UseDeviceSelectorStateOptions & { permissionsLoaded?: boolean }): DeviceSelectorState => {
  const { data: devices, error, isLoading } = useDeviceList();
  const deviceInventoryComplete = !isLoading && !error;

  const { selectableDevices, runnableDevices } = useMemo(() => {
    // ONE candidate set shared with the chat switcher, connect flow and the
    // blocked-run repair UI: workspace scope includes the caller's private
    // enrollments (`visibility === 'private'`), which are legal for their
    // enroller — a surface that dropped them computed a different pool than
    // the admission contract resolves against.
    const selectable = executionTargetDeviceCandidates(devices, scope);
    return {
      runnableDevices: selectable.filter((device) => device.online),
      selectableDevices: selectable,
    };
  }, [boundDeviceId, devices, memberSelectedDeviceId, scope]);

  const bindingState: DeviceSelectorState['bindingState'] = useMemo(() => {
    if (!boundDeviceId) return 'unset';
    if (!deviceInventoryComplete) return 'pending';
    return selectableDevices.some((device) => device.deviceId === boundDeviceId)
      ? 'valid'
      : 'invalid';
  }, [boundDeviceId, deviceInventoryComplete, selectableDevices]);

  return {
    bindingState,
    canSelectDevice,
    deviceInventoryComplete,
    deviceInventoryError: error,
    permissionsLoaded,
    runnableDevices,
    selectableDevices,
    // The contract formula verbatim — shared with every resolution surface
    // (packages/types/src/agent/deviceExecution.ts). Hiding the picker never
    // unbinds the device.
    showDeviceSelector: shouldShowDeviceSelector({
      canSelectDevice,
      deviceInventoryComplete,
      permissionsLoaded,
      selectableDeviceCount: selectableDevices.length,
    }),
  };
};
