import { describe, expect, it } from 'vitest';

import {
  type AgentDeviceSettingsStateInput,
  resolveAgentDeviceSettingsState,
} from './agentDeviceSettingsState';

// The blocked-state matrix the device group renders, per
// docs/development/device-execution-contract.md: zero-device / invalid-binding
// / offline-bound are blocking prompts, not config rows — and never gated by
// the >1 picker rule. Loading or failed inventory never reads as 0 or 1.

const input = (
  overrides?: Partial<AgentDeviceSettingsStateInput>,
): AgentDeviceSettingsStateInput => ({
  bindingState: 'unset',
  canSelectDevice: true,
  deviceInventoryComplete: true,
  isPreferenceLoading: false,
  selectableDeviceCount: 2,
  ...overrides,
});

const device = (online = true) => ({ deviceId: 'a', online }) as never;

describe('resolveAgentDeviceSettingsState', () => {
  it('shows the zero-device notice only when the inventory is complete and empty', () => {
    expect(
      resolveAgentDeviceSettingsState(input({ selectableDeviceCount: 0 })).showZeroDeviceNotice,
    ).toBe(true);
    expect(
      resolveAgentDeviceSettingsState(input({ selectableDeviceCount: 1 })).showZeroDeviceNotice,
    ).toBe(false);
  });

  it('never reads loading or failed inventory as zero devices', () => {
    expect(
      resolveAgentDeviceSettingsState(
        input({ deviceInventoryComplete: false, selectableDeviceCount: 0 }),
      ).showZeroDeviceNotice,
    ).toBe(false);
  });

  it('hides the zero-device notice when the principal may not select', () => {
    expect(
      resolveAgentDeviceSettingsState(input({ canSelectDevice: false, selectableDeviceCount: 0 }))
        .showZeroDeviceNotice,
    ).toBe(false);
  });

  it('surfaces the DEVICE_BINDING_INVALID repair prompt on a stale binding', () => {
    expect(
      resolveAgentDeviceSettingsState(input({ bindingState: 'invalid' })).showRepairPrompt,
    ).toBe(true);
    expect(resolveAgentDeviceSettingsState(input({ bindingState: 'valid' })).showRepairPrompt).toBe(
      false,
    );
  });

  it('shows the read-only binding display for valid or invalid bindings without permission', () => {
    for (const bindingState of ['valid', 'invalid'] as const) {
      expect(
        resolveAgentDeviceSettingsState(input({ bindingState, canSelectDevice: false }))
          .showReadOnlyBinding,
      ).toBe(true);
    }
    expect(
      resolveAgentDeviceSettingsState(input({ bindingState: 'unset', canSelectDevice: false }))
        .showReadOnlyBinding,
    ).toBe(false);
  });

  it('hides the read-only display while preferences or inventory are still resolving', () => {
    expect(
      resolveAgentDeviceSettingsState(
        input({
          bindingState: 'valid',
          canSelectDevice: false,
          isPreferenceLoading: true,
        }),
      ).showReadOnlyBinding,
    ).toBe(false);
    expect(
      resolveAgentDeviceSettingsState(
        input({
          bindingState: 'valid',
          canSelectDevice: false,
          deviceInventoryComplete: false,
        }),
      ).showReadOnlyBinding,
    ).toBe(false);
  });

  it('flags a bound-but-offline device as a blocking notice', () => {
    expect(
      resolveAgentDeviceSettingsState(input({ bindingState: 'valid', boundDevice: device(false) }))
        .showOfflineNotice,
    ).toBe(true);
  });

  it('does not flag an online or unresolved bound device', () => {
    expect(
      resolveAgentDeviceSettingsState(input({ bindingState: 'valid', boundDevice: device(true) }))
        .showOfflineNotice,
    ).toBe(false);
    expect(
      resolveAgentDeviceSettingsState(input({ bindingState: 'valid' })).showOfflineNotice,
    ).toBe(false);
  });
});

describe('minimal Device section visibility', () => {
  it('hides the entire settled singleton group without writing a binding', () => {
    for (const bindingState of ['unset', 'valid'] as const) {
      expect(
        resolveAgentDeviceSettingsState(input({ selectableDeviceCount: 1, bindingState }))
          .showDeviceGroup,
      ).toBe(false);
    }
  });
  it('keeps loading, zero/many candidates and invalid binding repair visible', () => {
    for (const state of [
      { selectableDeviceCount: 0 },
      { selectableDeviceCount: 2 },
      { selectableDeviceCount: 1, deviceInventoryComplete: false },
      { selectableDeviceCount: 1, bindingState: 'invalid' as const },
    ])
      expect(resolveAgentDeviceSettingsState(input(state)).showDeviceGroup).toBe(true);
  });
});

describe('confirmed explicit local choice with optional unverified hosts', () => {
  it('hides the singleton Device group without pretending the inventory is complete', () => {
    const state = input({
      bindingState: 'pending',
      selectableDeviceCount: 1,
      deviceInventoryComplete: false,
      explicitLocalDeviceIsEligible: true,
      runtimeInventoryOfflineOnly: true,
    });
    expect(resolveAgentDeviceSettingsState(state).showDeviceGroup).toBe(false);
    expect(state.deviceInventoryComplete).toBe(false);
  });
  it('keeps failed online verification and truly unbound uncertainty visible', () => {
    const pending = input({
      bindingState: 'pending',
      selectableDeviceCount: 1,
      deviceInventoryComplete: false,
    });
    expect(
      resolveAgentDeviceSettingsState({
        ...pending,
        explicitLocalDeviceIsEligible: true,
        runtimeInventoryOfflineOnly: false,
      }).showDeviceGroup,
    ).toBe(true);
    expect(
      resolveAgentDeviceSettingsState({
        ...pending,
        runtimeInventoryOfflineOnly: true,
        explicitLocalDeviceIsEligible: false,
      }).showDeviceGroup,
    ).toBe(true);
  });
});
