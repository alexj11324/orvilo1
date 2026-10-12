/**
 * @vitest-environment happy-dom
 */
import type { DeviceCandidate, DeviceListItem } from '@orvilo/types';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeviceSelectorState } from './useDeviceSelectorState';

// The shared execution contract's visibility matrix, pinned as code:
//   picker ⟺ permissionsLoaded ∧ inventoryComplete ∧ canSelectDevice ∧ >1 legal
// Loading / failed inventory never reads as 0 or 1; offline devices stay in
// the selectable pool but drop out of runnable.

const listState = vi.hoisted(() => ({
  current: {
    data: undefined as DeviceListItem[] | undefined,
    error: undefined as unknown,
    isLoading: false,
  },
}));

const runtimeState = vi.hoisted(() => ({
  current: {
    data: undefined as
      | {
          candidates: DeviceCandidate[];
          devices?: DeviceListItem[];
          inventoryComplete: boolean;
          runtimeInventoryError?: string;
          runtimeInventoryOfflineOnly?: boolean;
        }
      | undefined,
    error: undefined as unknown,
    isLoading: false,
  },
  refresh: vi.fn(),
}));

vi.mock('./useDeviceList', () => ({
  useAgentDeviceCandidates: () => ({ ...runtimeState.current, mutate: runtimeState.refresh }),
  useDeviceList: () => ({
    data: listState.current.data,
    error: listState.current.error,
    isLoading: listState.current.isLoading,
    mutate: vi.fn(),
  }),
}));

const buildDevice = (overrides: Partial<DeviceListItem> & { deviceId: string }): DeviceListItem =>
  ({
    channels: [],
    defaultCwd: null,
    enroller: null,
    friendlyName: null,
    hostname: overrides.deviceId,
    identitySource: 'machine-id',
    lastSeen: new Date(0).toISOString(),
    online: true,
    platform: null,
    registered: true,
    workingDirs: [],
    ...overrides,
  }) as DeviceListItem;

const workspaceDevice = (deviceId: string, online = true): DeviceListItem =>
  buildDevice({ deviceId, online });

const setInventory = (data?: DeviceListItem[], error?: unknown, isLoading = false) => {
  listState.current.data = data;
  listState.current.error = error;
  listState.current.isLoading = isLoading;
};

const renderState = (overrides?: {
  agentId?: string;
  boundDeviceId?: string;
  canSelectDevice?: boolean;

  permissionsLoaded?: boolean;
}) =>
  renderHook(() =>
    useDeviceSelectorState({
      agentId: overrides?.agentId,
      boundDeviceId: overrides?.boundDeviceId,
      canSelectDevice: overrides?.canSelectDevice ?? true,

      permissionsLoaded: overrides?.permissionsLoaded ?? true,
    }),
  );

describe('useDeviceSelectorState', () => {
  beforeEach(() => {
    setInventory([]);
    runtimeState.current = { data: undefined, error: undefined, isLoading: false };
  });

  describe('visibility matrix', () => {
    it('hides the picker while the inventory is still loading', () => {
      setInventory(
        [buildDevice({ deviceId: 'a' }), buildDevice({ deviceId: 'b' })],
        undefined,
        true,
      );
      const { result } = renderState();
      expect(result.current.deviceInventoryComplete).toBe(false);
      expect(result.current.showDeviceSelector).toBe(false);
    });

    it('hides the picker when the inventory query failed', () => {
      setInventory(undefined, new Error('boom'));
      const { result } = renderState();
      expect(result.current.deviceInventoryComplete).toBe(false);
      expect(result.current.deviceInventoryError).toBeInstanceOf(Error);
      expect(result.current.showDeviceSelector).toBe(false);
    });

    it('hides the picker with zero legal devices', () => {
      setInventory([]);
      const { result } = renderState();
      expect(result.current.deviceInventoryComplete).toBe(true);
      expect(result.current.selectableDevices).toHaveLength(0);
      expect(result.current.showDeviceSelector).toBe(false);
    });

    it('hides the picker with exactly one legal device', () => {
      setInventory([buildDevice({ deviceId: 'a' })]);
      const { result } = renderState();
      expect(result.current.selectableDevices).toHaveLength(1);
      expect(result.current.showDeviceSelector).toBe(true);
    });

    it('shows the picker with more than one legal device', () => {
      setInventory([buildDevice({ deviceId: 'a' }), buildDevice({ deviceId: 'b' })]);
      const { result } = renderState();
      expect(result.current.showDeviceSelector).toBe(true);
    });

    it('keeps offline devices in the selectable pool but not runnable', () => {
      setInventory([
        buildDevice({ deviceId: 'a', online: true }),
        buildDevice({ deviceId: 'b', online: false }),
      ]);
      const { result } = renderState();
      expect(result.current.selectableDevices.map((d) => d.deviceId)).toEqual(['a', 'b']);
      expect(result.current.runnableDevices.map((d) => d.deviceId)).toEqual(['a']);
      // A online + B offline still counts as >1 legal candidates.
      expect(result.current.showDeviceSelector).toBe(true);
    });

    it('hides the picker when the principal may not select', () => {
      setInventory([buildDevice({ deviceId: 'a' }), buildDevice({ deviceId: 'b' })]);
      const { result } = renderState({ canSelectDevice: false });
      expect(result.current.showDeviceSelector).toBe(false);
    });

    it('hides the picker while permissions are still resolving', () => {
      setInventory([buildDevice({ deviceId: 'a' }), buildDevice({ deviceId: 'b' })]);
      const { result } = renderState({ permissionsLoaded: false });
      expect(result.current.permissionsLoaded).toBe(false);
      expect(result.current.showDeviceSelector).toBe(false);
    });
  });

  describe('bindingState', () => {
    it('reports unset without a binding', () => {
      setInventory([buildDevice({ deviceId: 'a' })]);
      const { result } = renderState();
      expect(result.current.bindingState).toBe('unset');
    });

    it('reports pending while the inventory resolves', () => {
      setInventory(undefined, undefined, true);
      const { result } = renderState({ boundDeviceId: 'a' });
      expect(result.current.bindingState).toBe('pending');
    });

    it('reports valid when the bound device is still legal', () => {
      setInventory([buildDevice({ deviceId: 'a' }), buildDevice({ deviceId: 'b' })]);
      const { result } = renderState({ boundDeviceId: 'a' });
      expect(result.current.bindingState).toBe('valid');
    });

    it('reports invalid when the bound device is gone or illegal', () => {
      setInventory([buildDevice({ deviceId: 'b' })]);
      const { result } = renderState({ boundDeviceId: 'a' });
      expect(result.current.bindingState).toBe('invalid');
    });

    it('invalid triggers even when the bound device is merely offline-present scope-wise', () => {
      // A binding into the wrong scope is invalid, not just "offline".
      setInventory([workspaceDevice('w1'), workspaceDevice('w2')]);
      const { result } = renderState({ boundDeviceId: 'missing' });
      expect(result.current.bindingState).toBe('invalid');
    });
  });
});

describe('Agent settings installed-runtime candidates', () => {
  const candidate = (deviceId: string, capabilityOk = true): DeviceCandidate => ({
    deviceId,
    capabilityOk,
    versionOk: true,
    scopeOk: true,
    isLocalMachine: false,
    online: true,
  });
  beforeEach(() => {
    setInventory([buildDevice({ deviceId: 'a' }), buildDevice({ deviceId: 'b', online: false })]);
    runtimeState.current = { data: undefined, error: undefined, isLoading: false };
  });

  it.each([0, 1, 2])(
    'counts %i matching runtimes instead of the number of registered hosts',
    (count) => {
      runtimeState.current.data = {
        candidates: [candidate('a', count > 0), candidate('b', count > 1)],
        inventoryComplete: true,
      };
      const { result } = renderState({ agentId: 'codex-agent' });
      expect(result.current.deviceInventoryComplete).toBe(true);
      expect(result.current.selectableDevices).toHaveLength(count);
      expect(result.current.showDeviceSelector).toBe(count > 0);
      expect(result.current.runnableDevices.map((device) => device.deviceId)).toEqual(
        count ? ['a'] : [],
      );
    },
  );

  it('never treats unknown or failed runtime verification as a settled singleton', () => {
    runtimeState.current.data = {
      candidates: [candidate('a')],
      inventoryComplete: false,
      runtimeInventoryError: 'Offline host has no installed-runtime evidence',
    };
    const { result } = renderState({ agentId: 'codex-agent' });
    expect(result.current.deviceInventoryComplete).toBe(false);
    expect(result.current.runtimeInventoryUnverified).toBe(true);
    expect(result.current.deviceInventoryError).toBeTruthy();
    expect(result.current.showDeviceSelector).toBe(false);
  });

  it('does not offer a host excluded by the authoritative runtime/permission inventory', () => {
    runtimeState.current.data = { candidates: [candidate('b')], inventoryComplete: true };
    const { result } = renderState({ agentId: 'codex-agent', boundDeviceId: 'a' });
    expect(result.current.selectableDevices.map((device) => device.deviceId)).toEqual(['b']);
    expect(result.current.bindingState).toBe('invalid');
  });

  it('waits for runtime evidence instead of judging an unloaded query as empty', () => {
    const { result } = renderState({ agentId: 'codex-agent', boundDeviceId: 'a' });
    expect(result.current.deviceInventoryComplete).toBe(false);
    expect(result.current.bindingState).toBe('pending');
    expect(result.current.selectableDevices).toEqual([]);
  });
});

describe('authoritative Agent-specific scope', () => {
  it('takes personal-pool membership from the server instead of a stale UI permission flag', () => {
    setInventory([workspaceDevice('shared'), buildDevice({ deviceId: 'personal' })]);
    runtimeState.current.data = {
      inventoryComplete: true,
      candidates: ['shared', 'personal'].map((deviceId) => ({
        deviceId,
        capabilityOk: true,
        versionOk: true,
        scopeOk: true,
        online: true,
        isLocalMachine: false,
      })),
    };
    const { result } = renderState({
      agentId: 'agent-1',
    });
    expect(result.current.selectableDevices.map((device) => device.deviceId)).toEqual([
      'shared',
      'personal',
    ]);
    expect(result.current.showDeviceSelector).toBe(true);
  });
});

describe('offline-only runtime inventory metadata', () => {
  it('retains a confirmed local member and incomplete verdict with unknown offline alternatives', () => {
    setInventory([
      buildDevice({ deviceId: 'local' }),
      buildDevice({ deviceId: 'unknown', online: false }),
    ]);
    runtimeState.current.data = {
      candidates: [
        {
          deviceId: 'local',
          capabilityOk: true,
          versionOk: true,
          scopeOk: true,
          online: true,
          isLocalMachine: true,
        },
      ],
      inventoryComplete: false,
      runtimeInventoryError: 'Offline host is unverified',
      runtimeInventoryOfflineOnly: true,
    };
    const { result } = renderState({ agentId: 'agent-1', boundDeviceId: 'local' });
    expect(result.current.selectableDevices.map((device) => device.deviceId)).toEqual(['local']);
    expect(result.current.deviceInventoryComplete).toBe(false);
    expect(result.current.runtimeInventoryOfflineOnly).toBe(true);
    expect(result.current.bindingState).toBe('pending');
  });
});

describe('a workspace Agent’s saved host', () => {
  it('displays the enrolling member’s saved host alongside the caller’s devices', () => {
    setInventory([buildDevice({ deviceId: 'caller-laptop' })]);
    runtimeState.current.data = {
      candidates: [
        {
          deviceId: 'owner-laptop',
          capabilityOk: true,
          versionOk: true,
          scopeOk: true,
          online: true,
          isLocalMachine: false,
        },
      ],
      devices: [buildDevice({ deviceId: 'owner-laptop', friendlyName: 'Owner laptop' })],
      inventoryComplete: true,
    };
    const { result } = renderState({
      agentId: 'shared-agent',
      boundDeviceId: 'owner-laptop',
      canSelectDevice: false,
    });
    expect(result.current.bindingState).toBe('valid');
    expect(result.current.selectableDevices.map((device) => device.friendlyName)).toEqual([
      'Owner laptop',
    ]);
    expect(result.current.showDeviceSelector).toBe(false);
  });
});
