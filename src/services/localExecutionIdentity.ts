import { isDesktop } from '@orvilo/const';

import { gatewayConnectionService } from '@/services/electron/gatewayConnection';
import { TargetRequiredError } from '@/services/targetRequiredError';

/**
 * The main process reports this sentinel when no device identity has been
 * materialized yet (`getDeviceId()`'s pre-boot fallback). It is NOT a usable
 * device id — treat it as "identity not proven".
 */
const UNPROVEN_DEVICE_ID = 'unknown';

let cachedLocalDeviceId: string | undefined;
let inflight: Promise<string | undefined> | undefined;

export interface LocalExecutionIdentity {
  /**
   * This host's proven local device identity, resolved through the gateway
   * device handshake (`gatewayConnection.getDeviceInfo`): the stable
   * user-scoped machine-derived id, or the persisted fallback UUID before
   * login. Absent when this client has no local runtime (web) or the
   * identity cannot be proven yet.
   */
  localDeviceId?: string;
}

/**
 * Record a device id that was proven by an upstream handshake (e.g. the
 * ElectronStore's `gatewayDeviceInfo` fetch) so service calls skip a
 * duplicate IPC round-trip. `undefined`/`unknown` inputs are ignored —
 * priming can only strengthen evidence, never fabricate it.
 */
export const primeLocalExecutionIdentity = (deviceId: string | null | undefined): void => {
  if (deviceId && deviceId !== UNPROVEN_DEVICE_ID) {
    cachedLocalDeviceId = deviceId;
  }
};

/** Resolve this host's proven local device identity. Cached and deduplicated. */
export const resolveLocalExecutionIdentity = async (): Promise<LocalExecutionIdentity> => {
  // A web client has no local runtime — nothing to prove, no IPC to call.
  if (!isDesktop) return {};
  if (cachedLocalDeviceId) return { localDeviceId: cachedLocalDeviceId };

  inflight ??= (async () => {
    try {
      const deviceId = (await gatewayConnectionService.getDeviceInfo())?.deviceId;
      if (deviceId && deviceId !== UNPROVEN_DEVICE_ID) {
        cachedLocalDeviceId = deviceId;
        return deviceId;
      }
      return undefined;
    } catch {
      // Never cache a failure — the next caller retries the handshake.
      return undefined;
    } finally {
      inflight = undefined;
    }
  })();

  return { localDeviceId: await inflight };
};

/**
 * Entry guard for the local-runtime services under `src/services/electron/`:
 * every method requires proven local identity before touching the IPC bridge,
 * so a call can never reach this machine's filesystem/shell/terminal merely
 * because the client happens to be a desktop build (`isDesktop` alone is not
 * evidence). Throws `TargetRequiredError` when no identity can be proven.
 */
export const requireProvenLocalDeviceId = async (operation: string): Promise<string> => {
  const { localDeviceId } = await resolveLocalExecutionIdentity();
  if (!localDeviceId) throw new TargetRequiredError(operation);
  return localDeviceId;
};
