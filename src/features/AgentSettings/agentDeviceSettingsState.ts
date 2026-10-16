import type { DeviceListItem } from '@orvilo/types';

import type { DeviceSelectorState } from '@/features/DeviceManager/useDeviceSelectorState';

export interface AgentDeviceSettingsStateInput {
  bindingState: DeviceSelectorState['bindingState'];
  boundDevice?: DeviceListItem;
  canSelectDevice: boolean;
  deviceInventoryComplete: boolean;
  explicitLocalDeviceIsEligible?: boolean;
  isPreferenceLoading: boolean;
  runtimeInventoryOfflineOnly?: boolean;
  selectableDeviceCount: number;
}

export interface AgentDeviceSettingsState {
  showDeviceGroup: boolean;
  showOfflineNotice: boolean;
  showReadOnlyBinding: boolean;
  showRepairPrompt: boolean;
  showZeroDeviceNotice: boolean;
}

/**
 * The device group's blocked-state matrix, per
 * docs/development/device-execution-contract.md. These are blocking prompts —
 * not configuration rows — and are never gated by the >1 picker rule:
 *
 * - zero legal devices → blocking notice (never an arbitrary backend fallback)
 * - stale binding → DEVICE_BINDING_INVALID repair prompt (never silent rebind)
 * - bound device offline → blocking notice
 * - no selection permission → non-editable display of the binding
 * - loading / failed inventory never resolves to a 0-or-1 judgment (the
 *   caller passes `deviceInventoryComplete` straight through)
 */
export const resolveAgentDeviceSettingsState = ({
  bindingState,
  boundDevice,
  canSelectDevice,
  deviceInventoryComplete,
  isPreferenceLoading,
  selectableDeviceCount,
}: AgentDeviceSettingsStateInput): AgentDeviceSettingsState => ({
  showDeviceGroup: true,
  showOfflineNotice: bindingState === 'valid' && !!boundDevice && !boundDevice.online,

  // Without management permission, a resolved binding is displayed read-only.
  showReadOnlyBinding:
    deviceInventoryComplete &&
    !isPreferenceLoading &&
    !canSelectDevice &&
    (bindingState === 'valid' || bindingState === 'invalid'),

  showRepairPrompt: bindingState === 'invalid',

  showZeroDeviceNotice: deviceInventoryComplete && canSelectDevice && selectableDeviceCount === 0,
});
