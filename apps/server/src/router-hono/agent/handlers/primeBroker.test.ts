// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  isDeviceAdmissionLive,
  type RemoteRunAdmission,
} from '@/server/services/heterogeneousAgent/runAdmission';

const admission = (overrides: Partial<RemoteRunAdmission> = {}): RemoteRunAdmission => ({
  channel: 'agent_run_request',
  deviceId: 'device-1',
  generation: 1,
  idempotencyKey: 'op-1',
  state: 'acknowledged',
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('isDeviceAdmissionLive', () => {
  // ROOT CAUSE: under await-ack gateway semantics the ledger is still
  // `pending` when the device's own `/activate` lands (the record is written
  // before the gateway call returns), so a running|acknowledged-only check
  // deadlocked every conversation run with 403 `Run is not device-admitted`.
  it('admits a pending admission — the ledger is written before the gateway call', () => {
    expect(isDeviceAdmissionLive(admission({ state: 'pending' }), 'device-1')).toBe(true);
  });

  it('admits acknowledged and running admissions', () => {
    expect(isDeviceAdmissionLive(admission({ state: 'acknowledged' }), 'device-1')).toBe(true);
    expect(isDeviceAdmissionLive(admission({ state: 'running' }), 'device-1')).toBe(true);
  });

  it('rejects terminal or wrong-device admissions', () => {
    expect(isDeviceAdmissionLive(admission({ state: 'rejected' }), 'device-1')).toBe(false);
    expect(isDeviceAdmissionLive(admission({ state: 'offline' }), 'device-1')).toBe(false);
    expect(isDeviceAdmissionLive(admission({ deviceId: 'device-2' }), 'device-1')).toBe(false);
    expect(isDeviceAdmissionLive(admission({ channel: 'cloud_sandbox' }), 'device-1')).toBe(false);
    expect(isDeviceAdmissionLive(undefined, 'device-1')).toBe(false);
  });
});
