import os from 'node:os';

import type { DeviceIdentity } from '@orvilo/device-identity';
import { resolvePersistentDeviceIdentity } from '@orvilo/device-identity';

import { createLambdaClient } from '../api/client';

/**
 * Resolve a stable device identity. An explicit `--device-id` wins (lets a user
 * pin a VM to a fixed identity); otherwise use the shared persistent identity
 * so the same machine + user maps to one device across reconnects. Returns undefined
 * when neither an explicit id nor a userId is available.
 */
export async function resolveDeviceIdentity(
  userId: string | undefined,
  explicitDeviceId?: string,
): Promise<DeviceIdentity | undefined> {
  if (explicitDeviceId) return { deviceId: explicitDeviceId, identitySource: 'fallback' };
  if (userId) return resolvePersistentDeviceIdentity(userId);
  return undefined;
}

/**
 * Register this device in the server registry. Shared by `orvilo login` (so the
 * device row exists right after auth) and `orvilo connect` (so the row exists
 * before the WS opens). Connection startup requires successful registration.
 */
export async function registerDevice(
  auth: { serverUrl: string; token: string; tokenType: 'apiKey' | 'jwt' | 'serviceToken' },
  identity: DeviceIdentity,
): Promise<void> {
  const trpc = createLambdaClient(auth);
  await trpc.device.register.mutate({
    deviceId: identity.deviceId,
    hostname: os.hostname(),
    identitySource: identity.identitySource,
    platform: process.platform,
  });
}
