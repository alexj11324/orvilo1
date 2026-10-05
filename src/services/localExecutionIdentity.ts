import { isDesktop } from '@orvilo/const';

import { gatewayConnectionService } from '@/services/electron/gatewayConnection';
import { TargetRequiredError } from '@/services/targetRequiredError';
import { useUserStore } from '@/store/user';

/**
 * The main process reports this sentinel when no device identity has been
 * materialized yet (`getDeviceId()`'s pre-boot fallback). It is NOT a usable
 * device id — treat it as "identity not proven".
 */
const UNPROVEN_DEVICE_ID = 'unknown';

let cached: { deviceId: string; ownerId: string } | undefined;
let inflight: { ownerId: string; promise: Promise<string | undefined> } | undefined;

export interface LocalExecutionIdentity {
  /**
   * This host's proven local device identity, resolved through the gateway
   * device handshake (`gatewayConnection.getDeviceInfo`): the stable
   * account-scoped machine-derived or persisted fallback identity.
   * Absent before login, when this client has no local runtime (web), or the
   * identity cannot be proven yet.
   */
  localDeviceId?: string;
}

/**
 * Record a device id that was proven by an upstream handshake (e.g. the
 * ElectronStore's `gatewayDeviceInfo` fetch) so service calls skip a
 * duplicate IPC round-trip. Unavailable evidence clears this owner's cached
 * identity; another account's evidence is never accepted.
 */
export const primeLocalExecutionIdentity = (
  deviceId: string | null | undefined,
  ownerId = useUserStore.getState().user?.id,
): void => {
  if (ownerId && ownerId === useUserStore.getState().user?.id) {
    cached = deviceId && deviceId !== UNPROVEN_DEVICE_ID ? { deviceId, ownerId } : undefined;
  }
};

/** Resolve this host's proven local device identity. Cached and deduplicated. */
export const resolveLocalExecutionIdentity = async (): Promise<LocalExecutionIdentity> => {
  // A web client has no local runtime — nothing to prove, no IPC to call.
  if (!isDesktop) return {};
  const ownerId = useUserStore.getState().user?.id;
  if (!ownerId) {
    cached = undefined;
    return {};
  }
  if (cached?.ownerId === ownerId) return { localDeviceId: cached.deviceId };

  if (inflight?.ownerId !== ownerId) {
    const promise = (async () => {
      try {
        const info = await gatewayConnectionService.getDeviceInfo();
        if (
          useUserStore.getState().user?.id === ownerId &&
          info?.userId === ownerId &&
          info.deviceId &&
          info.deviceId !== UNPROVEN_DEVICE_ID
        ) {
          cached = { deviceId: info.deviceId, ownerId };
          return info.deviceId;
        }
        return undefined;
      } catch (error) {
        console.error('Local device identity handshake failed', error);
        return undefined;
      }
    })();
    inflight = { ownerId, promise };
  }
  const { promise } = inflight;
  try {
    const localDeviceId = await promise;
    return localDeviceId && useUserStore.getState().user?.id === ownerId ? { localDeviceId } : {};
  } finally {
    if (inflight?.promise === promise) inflight = undefined;
  }
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
