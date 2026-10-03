import { describe, expect, it } from 'vitest';

import {
  type DeviceCandidate,
  isDeviceBindingInvalid,
  isRunnableDevice,
  isSelectableDevice,
  resolveExecutionDevice,
  shouldShowDeviceSelector,
} from './deviceExecution';

const candidate = (deviceId: string, over: Partial<DeviceCandidate> = {}): DeviceCandidate => ({
  capabilityOk: true,
  deviceId,
  isLocalMachine: false,
  online: true,
  scopeOk: true,
  versionOk: true,
  ...over,
});

const A = candidate('device-a');
const B = candidate('device-b');

describe('resolveExecutionDevice', () => {
  it('resolves a valid session binding, even offline, over any other device', () => {
    const offlineA = candidate('device-a', { online: false });
    expect(resolveExecutionDevice({ sessionBoundDeviceId: 'device-a' }, [offlineA, B])).toEqual({
      deviceId: 'device-a',
      reason: 'session_bound',
      status: 'resolved',
    });
  });

  it('blocks with DEVICE_BINDING_INVALID when the bound device is gone — no silent re-bind', () => {
    const resolution = resolveExecutionDevice({ sessionBoundDeviceId: 'device-a' }, [B]);
    expect(resolution).toEqual({
      code: 'DEVICE_BINDING_INVALID',
      repairCandidates: ['device-b'],
      status: 'blocked',
    });
  });

  it('still blocks on an invalid binding when the request carries an explicit device (repair ≠ resume)', () => {
    const resolution = resolveExecutionDevice(
      { explicitDeviceId: 'device-b', sessionBoundDeviceId: 'device-a' },
      [B],
    );
    expect(resolution).toMatchObject({ code: 'DEVICE_BINDING_INVALID', status: 'blocked' });
  });

  it('rejects an explicit request for a device outside the authorized set — never swaps in a default', () => {
    const resolution = resolveExecutionDevice(
      { agentDefaultDeviceId: 'device-b', explicitDeviceId: 'device-c' },
      [A, B],
    );
    expect(resolution).toEqual({ code: 'DEVICE_REQUEST_UNAUTHORIZED', status: 'blocked' });
  });

  it('honors an explicit request inside the authorized set', () => {
    expect(resolveExecutionDevice({ explicitDeviceId: 'device-b' }, [A, B])).toEqual({
      deviceId: 'device-b',
      reason: 'explicit_request',
      status: 'resolved',
    });
  });

  it('lets a member preference win only when policy allows choice', () => {
    expect(
      resolveExecutionDevice(
        { agentDefaultDeviceId: 'device-b', userAgentPreferenceDeviceId: 'device-a' },
        [A, B],
      ),
    ).toEqual({ deviceId: 'device-a', reason: 'user_agent_preference', status: 'resolved' });
  });

  it('blocks member preference override when the policy is pinned — admin default wins', () => {
    expect(
      resolveExecutionDevice(
        {
          agentDefaultDeviceId: 'device-b',
          explicitRequestAllowed: false,
          userAgentPreferenceDeviceId: 'device-a',
        },
        [A, B],
      ),
    ).toEqual({ deviceId: 'device-b', reason: 'agent_default', status: 'resolved' });
  });

  it('ignores an explicit request under a pinned policy rather than overriding the default', () => {
    expect(
      resolveExecutionDevice(
        {
          agentDefaultDeviceId: 'device-b',
          explicitDeviceId: 'device-a',
          explicitRequestAllowed: false,
        },
        [A, B],
      ),
    ).toEqual({ deviceId: 'device-b', reason: 'agent_default', status: 'resolved' });
  });

  it('blocks on an incomplete inventory — never judged as 0 or 1, never auto-binds', () => {
    expect(resolveExecutionDevice({ deviceInventoryComplete: false }, [B])).toEqual({
      code: 'DEVICE_INVENTORY_INCOMPLETE',
      status: 'blocked',
    });
    expect(resolveExecutionDevice({ deviceInventoryComplete: false }, [])).toEqual({
      code: 'DEVICE_INVENTORY_INCOMPLETE',
      status: 'blocked',
    });
  });

  it('auto-resolves the single legitimate candidate for a never-bound principal', () => {
    expect(resolveExecutionDevice({}, [B])).toEqual({
      deviceId: 'device-b',
      reason: 'single_candidate',
      status: 'resolved',
    });
  });

  it('does not auto-resolve a single candidate when a stale preference exists elsewhere', () => {
    expect(resolveExecutionDevice({ userAgentPreferenceDeviceId: 'device-x' }, [B])).toEqual({
      deviceId: 'device-b',
      reason: 'single_candidate',
      status: 'resolved',
    });
  });

  it('returns DEVICE_REQUIRED with zero legitimate candidates', () => {
    const incompatible = candidate('device-a', { capabilityOk: false });
    expect(resolveExecutionDevice({}, [incompatible])).toEqual({
      code: 'DEVICE_REQUIRED',
      status: 'blocked',
    });
  });

  it('returns DEVICE_SELECTION_REQUIRED when multiple candidates and no default applies', () => {
    expect(resolveExecutionDevice({}, [A, B])).toEqual({
      code: 'DEVICE_SELECTION_REQUIRED',
      status: 'blocked',
    });
  });

  it('excludes out-of-scope devices from the candidate set entirely', () => {
    const foreignScope = candidate('device-c', { scopeOk: false });
    expect(resolveExecutionDevice({}, [B, foreignScope])).toEqual({
      deviceId: 'device-b',
      reason: 'single_candidate',
      status: 'resolved',
    });
  });

  it('an offline device stays selectable but is not runnable', () => {
    const offline = candidate('device-b', { online: false });
    expect(isSelectableDevice(offline)).toBe(true);
    expect(isRunnableDevice(offline)).toBe(false);
  });
});

describe('isDeviceBindingInvalid', () => {
  it('flags a binding whose device left the selectable set', () => {
    expect(isDeviceBindingInvalid('device-a', [B])).toBe(true);
    expect(isDeviceBindingInvalid('device-a', [A, B])).toBe(false);
    expect(isDeviceBindingInvalid(undefined, [B])).toBe(false);
  });
});

describe('shouldShowDeviceSelector', () => {
  const base = {
    canSelectDevice: true,
    deviceInventoryComplete: true,
    permissionsLoaded: true,
  };

  it('shows only with >1 selectable and full inventory + permissions', () => {
    expect(shouldShowDeviceSelector({ ...base, selectableDeviceCount: 2 })).toBe(true);
    expect(shouldShowDeviceSelector({ ...base, selectableDeviceCount: 1 })).toBe(false);
    expect(shouldShowDeviceSelector({ ...base, selectableDeviceCount: 0 })).toBe(false);
  });

  it('hides while inventory or permissions are unresolved', () => {
    expect(
      shouldShowDeviceSelector({
        ...base,
        deviceInventoryComplete: false,
        selectableDeviceCount: 2,
      }),
    ).toBe(false);
    expect(
      shouldShowDeviceSelector({ ...base, permissionsLoaded: false, selectableDeviceCount: 2 }),
    ).toBe(false);
    expect(
      shouldShowDeviceSelector({ ...base, canSelectDevice: false, selectableDeviceCount: 3 }),
    ).toBe(false);
  });

  it('counts an offline device as a candidate (still selectable, just not startable)', () => {
    const devices = [A, candidate('device-b', { online: false })];
    const selectableCount = devices.filter(isSelectableDevice).length;
    expect(shouldShowDeviceSelector({ ...base, selectableDeviceCount: selectableCount })).toBe(
      true,
    );
  });
});
