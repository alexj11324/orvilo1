/**
 * @vitest-environment happy-dom
 */
import type { DeviceListItem, DeviceScope } from '@orvilo/types';
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

vi.mock('./useDeviceList', () => ({
  useDeviceList: () => ({
    data: listState.current.data,
    error: listState.current.error,
    isLoading: listState.current.isLoading,
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
    scope: 'personal',
    visibility: null,
    workingDirs: [],
    ...overrides,
  }) as DeviceListItem;

const workspaceDevice = (deviceId: string, online = true): DeviceListItem =>
  buildDevice({ deviceId, online, scope: 'workspace', visibility: 'public' });

const setInventory = (data?: DeviceListItem[], error?: unknown, isLoading = false) => {
  listState.current.data = data;
  listState.current.error = error;
  listState.current.isLoading = isLoading;
};

const renderState = (overrides?: {
  boundDeviceId?: string;
  canSelectDevice?: boolean;
  canSelectPersonalDevice?: boolean;
  memberSelectedDeviceId?: string;
  permissionsLoaded?: boolean;
  scope?: DeviceScope | 'personal' | 'workspace';
}) =>
  renderHook(() =>
    useDeviceSelectorState({
      boundDeviceId: overrides?.boundDeviceId,
      canSelectDevice: overrides?.canSelectDevice ?? true,
      canSelectPersonalDevice: overrides?.canSelectPersonalDevice,
      memberSelectedDeviceId: overrides?.memberSelectedDeviceId,
      permissionsLoaded: overrides?.permissionsLoaded ?? true,
      scope: (overrides?.scope === 'workspace' ? 'workspace' : 'personal') as
        'personal' | 'workspace',
    }),
  );

describe('useDeviceSelectorState', () => {
  beforeEach(() => {
    setInventory([]);
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
      expect(result.current.showDeviceSelector).toBe(false);
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

  describe('legal pool by scope', () => {
    it('offers owned personal candidates for an authorized workspace repair with no binding', () => {
      setInventory([buildDevice({ deviceId: 'mine' }), workspaceDevice('workspace')]);
      const { result } = renderState({ scope: 'workspace', canSelectPersonalDevice: true });
      expect(result.current.selectableDevices.map((d) => d.deviceId)).toEqual([
        'workspace',
        'mine',
      ]);
      expect(result.current.bindingState).toBe('unset');
      const denied = renderState({
        scope: 'workspace',
        canSelectPersonalDevice: true,
        canSelectDevice: false,
      });
      expect(denied.result.current.selectableDevices.map((d) => d.deviceId)).toEqual(['workspace']);
    });
    it('keeps only the exact personal member override valid in workspace settings', () => {
      setInventory([buildDevice({ deviceId: 'selected' }), buildDevice({ deviceId: 'other' })]);
      const { result } = renderState({
        boundDeviceId: 'selected',
        memberSelectedDeviceId: 'selected',
        scope: 'workspace',
      });
      expect(result.current.bindingState).toBe('valid');
      expect(result.current.selectableDevices.map((d) => d.deviceId)).toEqual(['selected']);
      expect(result.current.runnableDevices.map((d) => d.deviceId)).toEqual(['selected']);
      expect(result.current.showDeviceSelector).toBe(false);
    });

    it('does not authorize a personal shared binding or a mismatched member override', () => {
      setInventory([buildDevice({ deviceId: 'shared' }), buildDevice({ deviceId: 'override' })]);
      for (const memberSelectedDeviceId of [undefined, 'override']) {
        const { result, unmount } = renderState({
          boundDeviceId: 'shared',
          memberSelectedDeviceId,
          scope: 'workspace',
        });
        expect(result.current.bindingState).toBe('invalid');
        expect(result.current.selectableDevices).toEqual([]);
        unmount();
      }
    });

    it('personal scope selects only personal devices', () => {
      setInventory([buildDevice({ deviceId: 'p' }), workspaceDevice('w')]);
      const { result } = renderState({ scope: 'personal' });
      expect(result.current.selectableDevices.map((d) => d.deviceId)).toEqual(['p']);
    });

    it('workspace scope selects private + shared workspace devices (F07)', () => {
      // Private enrollments are legal for their enroller — the chat switcher
      // already judged them candidates; settings must see the identical set.
      setInventory([
        buildDevice({ deviceId: 'p' }),
        workspaceDevice('w'),
        buildDevice({ deviceId: 'wp', scope: 'workspace', visibility: 'private' }),
      ]);
      const { result } = renderState({ scope: 'workspace' });
      expect(result.current.selectableDevices.map((d) => d.deviceId)).toEqual(['wp', 'w']);
      // private + shared = 2 candidates → the selector formula opens.
      expect(result.current.showDeviceSelector).toBe(true);
    });

    it('a binding into a private workspace device is valid for its enroller', () => {
      setInventory([buildDevice({ deviceId: 'wp', scope: 'workspace', visibility: 'private' })]);
      const { result } = renderState({ boundDeviceId: 'wp', scope: 'workspace' });
      expect(result.current.bindingState).toBe('valid');
    });

    it('a private workspace device alone still counts as one candidate', () => {
      setInventory([buildDevice({ deviceId: 'wp', scope: 'workspace', visibility: 'private' })]);
      const { result } = renderState({ scope: 'workspace' });
      expect(result.current.selectableDevices).toHaveLength(1);
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
      const { result } = renderState({ boundDeviceId: 'missing', scope: 'workspace' });
      expect(result.current.bindingState).toBe('invalid');
    });
  });
});
