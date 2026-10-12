import type { DeviceListItem } from '@orvilo/types';
import { isSelectableDevice, shouldShowDeviceSelector } from '@orvilo/types';
import { useMemo } from 'react';

import { useAgentDeviceCandidates, useDeviceList } from './useDeviceList';

/**
 * The device-selection states the shared execution contract defines
 * (docs/development/device-execution-contract.md). Every surface that offers
 * or displays an execution device — agent settings, connect flow, diagnostics
 * — resolves through this hook so the 0 / 1 / many rules can never drift.
 */
export interface DeviceSelectorState {
  /**
   * Binding resolution for `boundDeviceId`:
   * - `unset` — nothing bound yet (choose a host explicitly in settings)
   * - `valid` — the bound device is still a legal candidate
   * - `invalid` — bound device gone / illegal → `DEVICE_BINDING_INVALID` repair
   * - `pending` — inventory still resolving; the caller must not judge yet
   */
  bindingState: 'unset' | 'valid' | 'invalid' | 'pending';
  /** Whether the caller may change the device (Agent management permission). */
  canSelectDevice: boolean;
  /** `useDeviceList` settled successfully. Loading/failed is never 0 or 1. */
  deviceInventoryComplete: boolean;
  deviceInventoryError: unknown;
  /** `canSelectDevice` and friends could be evaluated (permissions loaded). */
  permissionsLoaded: boolean;
  /** Revalidate this surface’s scoped device/runtime evidence. */
  refreshDevices: () => Promise<unknown>;
  /** Online subset of `selectableDevices` — devices that can start right now. */
  runnableDevices: DeviceListItem[];
  runtimeInventoryOfflineOnly: boolean;
  runtimeInventoryUnverified: boolean;
  /**
   * Devices the principal may execute on through ownership or Agent Use. Offline devices
   * STAY in this set (offline ≠ removed from config); they just cannot start.
   */
  selectableDevices: DeviceListItem[];
  /**
   * Multiple candidates and unset/invalid bindings expose the settings picker.
   * Hiding a valid singleton never unbinds its saved host.
   */
  showDeviceSelector: boolean;
}

export interface UseDeviceSelectorStateOptions {
  /** Agent settings opt into server-owned installed-runtime eligibility. */
  agentId?: string;
  /** Currently persisted binding, if any. */
  boundDeviceId?: string;
  /** Caller-side permission/policy result (`useEffectiveAgencyConfig`). */
  canSelectDevice: boolean;
}

/**
 * Resolve the device-selection state for one surface.
 *
 * `permissionsLoaded` is computed inside from nothing — callers feed their own
 * `isPreferenceLoading`/`isAccessLoading` into `canSelectDevice` upstream and
 * pass `permissionsReady` so a still-resolving policy never looks like a deny.
 */
export const useDeviceSelectorState = ({
  agentId,
  boundDeviceId,
  canSelectDevice,
  permissionsLoaded = true,
}: UseDeviceSelectorStateOptions & { permissionsLoaded?: boolean }): DeviceSelectorState => {
  const { data: devices, error, isLoading, mutate: refreshList } = useDeviceList();
  const runtimeInventory = useAgentDeviceCandidates(permissionsLoaded ? agentId : undefined);
  const runtimeInventoryUnverified =
    !!agentId && !!runtimeInventory.data && !runtimeInventory.data.inventoryComplete;
  const deviceInventoryError =
    error ??
    (agentId ? runtimeInventory.error : undefined) ??
    (runtimeInventoryUnverified
      ? (runtimeInventory.data?.runtimeInventoryError ?? 'Device runtime verification incomplete')
      : undefined);
  const deviceInventoryComplete =
    !isLoading &&
    !deviceInventoryError &&
    (!agentId || runtimeInventory.data?.inventoryComplete === true);

  const { selectableDevices, runnableDevices } = useMemo(() => {
    // Saved hosts from authorized Agents supplement the configuring member’s
    // own devices, so another owner’s host remains visible as the current binding.
    const authorized = devices ?? [];
    const runtimeIds = agentId
      ? new Set(
          runtimeInventory.data?.candidates
            .filter(isSelectableDevice)
            .map((candidate) => candidate.deviceId),
        )
      : undefined;
    const selectable = runtimeIds
      ? (runtimeInventory.data?.devices ?? devices ?? []).filter((device) =>
          runtimeIds.has(device.deviceId),
        )
      : authorized;
    return {
      runnableDevices: selectable.filter((device) => device.online),
      selectableDevices: selectable,
    };
  }, [agentId, runtimeInventory.data, boundDeviceId, canSelectDevice, devices]);

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
    deviceInventoryError,
    permissionsLoaded,
    refreshDevices: async () => {
      await Promise.all([refreshList(), ...(agentId ? [runtimeInventory.mutate()] : [])]);
    },
    runtimeInventoryUnverified,
    runtimeInventoryOfflineOnly:
      !!agentId && runtimeInventory.data?.runtimeInventoryOfflineOnly === true,
    runnableDevices,
    selectableDevices,
    // The contract formula verbatim — shared with every resolution surface
    // (packages/types/src/agent/deviceExecution.ts). Hiding the picker never
    // unbinds the device.
    showDeviceSelector:
      (canSelectDevice &&
        deviceInventoryComplete &&
        permissionsLoaded &&
        !boundDeviceId &&
        selectableDevices.length > 0) ||
      shouldShowDeviceSelector({
        canSelectDevice,
        deviceInventoryComplete,
        permissionsLoaded,
        selectableDeviceCount: selectableDevices.length,
      }),
  };
};
