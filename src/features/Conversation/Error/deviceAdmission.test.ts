import type { DeviceAdmissionErrorData, DeviceListItem } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import {
  deviceDisplayName,
  isDeviceAdmissionErrorBody,
  resolveDeviceAdmissionAction,
  resolveRepairCandidates,
} from './deviceAdmission';

const buildBody = (
  overrides: Omit<Partial<DeviceAdmissionErrorData>, 'code'> & { code: string },
): unknown => ({
  detail: 'Human readable sentence — never parsed.',
  retryable: false,
  scope: 'personal',
  ...overrides,
});

const buildDevice = (deviceId: string): DeviceListItem =>
  ({ deviceId, friendlyName: `Device ${deviceId}`, hostname: null }) as DeviceListItem;

describe('isDeviceAdmissionErrorBody', () => {
  it('accepts every admission code', () => {
    for (const code of [
      'DEVICE_ACCESS_DENIED',
      'DEVICE_BINDING_CONFLICT',
      'DEVICE_BINDING_INVALID',
      'DEVICE_INVENTORY_INCOMPLETE',
      'DEVICE_NOT_FOUND',
      'DEVICE_REQUEST_UNAUTHORIZED',
      'DEVICE_REQUIRED',
      'DEVICE_SELECTION_REQUIRED',
      'DISPATCH_ADMISSION_PERSIST_FAILED',
      'EXECUTION_TARGET_NONE',
    ]) {
      expect(isDeviceAdmissionErrorBody(buildBody({ code }))).toBe(true);
    }
  });

  it('rejects non-admission shapes — never guesses from text', () => {
    expect(isDeviceAdmissionErrorBody(undefined)).toBe(false);
    expect(isDeviceAdmissionErrorBody(null)).toBe(false);
    expect(isDeviceAdmissionErrorBody('DEVICE_BINDING_INVALID')).toBe(false);
    expect(isDeviceAdmissionErrorBody({ detail: 'DEVICE_BINDING_INVALID happened' })).toBe(false);
    expect(isDeviceAdmissionErrorBody(buildBody({ code: 'PROVIDER_ERROR' }))).toBe(false);
    expect(isDeviceAdmissionErrorBody(buildBody({ code: 'device_binding_invalid' }))).toBe(false);
  });
});

describe('resolveDeviceAdmissionAction — ONE true action per code', () => {
  const actionFor = (
    overrides: Omit<Partial<DeviceAdmissionErrorData>, 'code'> & { code: string },
  ) => resolveDeviceAdmissionAction(buildBody(overrides) as DeviceAdmissionErrorData);

  it('DEVICE_INVENTORY_INCOMPLETE → retry the inventory query', () => {
    expect(actionFor({ code: 'DEVICE_INVENTORY_INCOMPLETE' })).toBe('retry-inventory');
  });

  it('DEVICE_REQUIRED → connect a device', () => {
    expect(actionFor({ code: 'DEVICE_REQUIRED' })).toBe('connect');
  });

  it('DEVICE_NOT_FOUND → repair when candidates exist, connect otherwise', () => {
    expect(actionFor({ code: 'DEVICE_NOT_FOUND' })).toBe('connect');
    expect(actionFor({ code: 'DEVICE_NOT_FOUND', repairCandidates: [] })).toBe('connect');
    expect(actionFor({ code: 'DEVICE_NOT_FOUND', repairCandidates: ['d1'] })).toBe('repair');
  });

  it('access errors → request authorization', () => {
    expect(actionFor({ code: 'DEVICE_ACCESS_DENIED' })).toBe('request-authorization');
    expect(actionFor({ code: 'DEVICE_REQUEST_UNAUTHORIZED' })).toBe('request-authorization');
  });

  it('binding/selection errors → repair', () => {
    expect(actionFor({ code: 'DEVICE_BINDING_INVALID' })).toBe('repair');
    expect(actionFor({ code: 'DEVICE_BINDING_CONFLICT' })).toBe('repair');
    expect(actionFor({ code: 'DEVICE_SELECTION_REQUIRED' })).toBe('repair');
    expect(actionFor({ code: 'EXECUTION_TARGET_NONE' })).toBe('repair');
  });

  it('DISPATCH_ADMISSION_PERSIST_FAILED → view run status', () => {
    expect(actionFor({ code: 'DISPATCH_ADMISSION_PERSIST_FAILED' })).toBe('view-run-status');
  });
});

describe('resolveRepairCandidates', () => {
  const pool = [buildDevice('a'), buildDevice('b'), buildDevice('c')];

  it('constrains the picker to server-named repair candidates', () => {
    const body = buildBody({
      code: 'DEVICE_BINDING_INVALID',
      repairCandidates: ['b'],
    }) as DeviceAdmissionErrorData;
    expect(resolveRepairCandidates(body, pool).map((d) => d.deviceId)).toEqual(['b']);
  });

  it('falls back to the shared candidate pool when the server named none', () => {
    const body = buildBody({ code: 'DEVICE_SELECTION_REQUIRED' }) as DeviceAdmissionErrorData;
    expect(resolveRepairCandidates(body, pool).map((d) => d.deviceId)).toEqual(['a', 'b', 'c']);
  });

  it('single repair candidate stays single — explicit one-button repair', () => {
    const body = buildBody({
      code: 'DEVICE_BINDING_INVALID',
      repairCandidates: ['c'],
    }) as DeviceAdmissionErrorData;
    const candidates = resolveRepairCandidates(body, pool);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].deviceId).toBe('c');
  });
});

describe('deviceDisplayName', () => {
  it('prefers friendlyName, falls back to hostname, then id', () => {
    expect(
      deviceDisplayName({ deviceId: 'x', friendlyName: 'Office Mac', hostname: 'mbp' } as never),
    ).toBe('Office Mac');
    expect(deviceDisplayName({ deviceId: 'x', friendlyName: null, hostname: 'mbp' } as never)).toBe(
      'mbp',
    );
    expect(deviceDisplayName({ deviceId: 'x', friendlyName: null, hostname: null } as never)).toBe(
      'x',
    );
  });
});
