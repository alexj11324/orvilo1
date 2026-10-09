import type { DeviceListItem } from '@orvilo/types';
import { isSelectableDevice, shouldShowDeviceSelector } from '@orvilo/types';
import { useMemo } from 'react';

import { executionTargetDeviceCandidates } from '@/helpers/executionTarget';

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
  /** Revalidate this surface’s scoped device/runtime evidence. */
  refreshDevices: () => Promise<unknown>;
  /** Online subset of `selectableDevices` — devices that can start right now. */
  runnableDevices: DeviceListItem[];
  runtimeInventoryOfflineOnly: boolean;
  runtimeInventoryUnverified: boolean;
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
  /** Agent settings opt into server-owned installed-runtime eligibility. */
  agentId?: string;
  /** Currently persisted binding, if any. */
  boundDeviceId?: string;
  /** Caller-side permission/policy result (`useEffectiveAgencyConfig`). */
  canSelectDevice: boolean;
  /** Authority to choose the caller's personal pool for a workspace Agent. */
  canSelectPersonalDevice?: boolean;
  /** Caller-owned device explicitly selected in the workspace member override. */
  memberSelectedDeviceId?: string;
  /**
   * Which legal pool to select from. `personal` agents may only bind the
   * caller's own devices; `workspace` agents use workspace-scope devices plus
   * the caller's exact personal member override. Authorized private owners and
   * member-selectable callers may also choose a new caller-personal device.
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
  agentId,
  boundDeviceId,
  canSelectDevice,
  canSelectPersonalDevice = false,
  memberSelectedDeviceId,
  permissionsLoaded = true,
  scope,
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
    // ONE candidate set shared with the chat switcher, connect flow and the
    // blocked-run repair UI: workspace scope includes the caller's private
    // enrollments (`visibility === 'private'`), which are legal for their
    // enroller — a surface that dropped them computed a different pool than
    // the admission contract resolves against.
    const scoped = executionTargetDeviceCandidates(devices, scope);
    const personal =
      scope === 'workspace'
        ? (devices ?? []).filter(
            (device) =>
              device.scope === 'personal' &&
              ((canSelectDevice && canSelectPersonalDevice) ||
                (device.deviceId === boundDeviceId && memberSelectedDeviceId === boundDeviceId)),
          )
        : [];
    const authorized = [...scoped, ...personal];
    const runtimeIds = agentId
      ? new Set(
          runtimeInventory.data?.candidates
            .filter(isSelectableDevice)
            .map((candidate) => candidate.deviceId),
        )
      : undefined;
    const selectable = runtimeIds
      ? (devices ?? []).filter((device) => runtimeIds.has(device.deviceId))
      : authorized;
    return {
      runnableDevices: selectable.filter((device) => device.online),
      selectableDevices: selectable,
    };
  }, [
    agentId,
    runtimeInventory.data,
    boundDeviceId,
    canSelectDevice,
    canSelectPersonalDevice,
    devices,
    memberSelectedDeviceId,
    scope,
  ]);

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
    showDeviceSelector: shouldShowDeviceSelector({
      canSelectDevice,
      deviceInventoryComplete,
      permissionsLoaded,
      selectableDeviceCount: selectableDevices.length,
    }),
  };
};
