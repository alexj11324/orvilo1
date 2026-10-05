import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { machineId, machineIdSync } from 'node-machine-id';

/**
 * Constant mixed into the deviceId hash. Not a secret — it only ensures the
 * hash input is namespaced to Orvilo so the same machine id used elsewhere
 * can't produce a colliding value.
 */
const SALT = 'orvilo-device-salt';

export type IdentitySource = 'fallback' | 'machine-id';

export interface DeviceIdentity {
  deviceId: string;
  identitySource: IdentitySource;
}

export interface DeriveDeviceIdOptions {
  /**
   * Reuse an existing id when the machine identifier is unavailable
   * (e.g. the desktop's previously stored Electron Store UUID, or a CLI
   * `--device-id` override). Keeps a device stable across the fallback path.
   */
  fallbackId?: string;
  /**
   * Override the raw machine-id reader. Defaults to `node-machine-id`. Exists
   * so callers in restricted environments and tests can inject a value without
   * mocking the module.
   */
  readMachineId?: () => string;
}

/**
 * Namespace a stable per-install seed (stored UUID, connection id) into a
 * `fallbackId` for a specific principal. Fallback machines (no readable
 * machine id) must still derive the SAME id for the same principal across
 * calls — probe, real enroll, and restore all re-derive — and a raw seed
 * cannot be reused across principals (a workspace fallback equal to the
 * personal deviceId would collide the two pools).
 */
export const deriveScopedFallbackId = (seedId: string, principal: string): string =>
  createHash('sha256').update(`${seedId}|${principal}|${SALT}`).digest('hex').slice(0, 32);

/**
 * Derive a stable deviceId for `(machine, user)`.
 *
 * Same machine + same user → same id (survives Orvilo reinstall, since the
 * machine id is OS-level). Same machine + different user → different id, so the
 * server can't correlate accounts on one machine. When the machine id can't be
 * read, falls back to `fallbackId` (or a fresh random UUID) and flags the
 * source so callers/UI can surface that this device may not survive a reinstall.
 */
export const deriveDeviceId = (
  userId: string,
  options: DeriveDeviceIdOptions = {},
): DeviceIdentity => {
  const readMachineId = options.readMachineId ?? (() => machineIdSync(true));

  try {
    const machineId = readMachineId();
    if (!machineId) throw new Error('empty machine id');

    // Fast sha256 is deliberate: this derives an opaque, stable device
    // identifier from a high-entropy machine UUID — it is NOT password storage.
    // A slow KDF (bcrypt/scrypt) only helps for low-entropy secrets; here the
    // input space is infeasible to brute-force, so it would add no security.
    // userId is mixed in solely for cross-account isolation (same machine +
    // different user → different deviceId), not as a hashed credential.
    const deviceId = createHash('sha256')
      .update(`${machineId}|${userId}|${SALT}`)
      .digest('hex')
      .slice(0, 32);

    return { deviceId, identitySource: 'machine-id' };
  } catch {
    return { deviceId: options.fallbackId ?? randomUUID(), identitySource: 'fallback' };
  }
};

interface StoredDeviceIdentity extends DeviceIdentity {
  /** Existing machine/principal hash, used to detect a copied record; never a raw machine ID. */
  machineDeviceId?: string;
  version: 1;
}

export interface PersistentDeviceIdentityOptions {
  /** Test isolation only. Real clients share the user-level directory across installations. */
  identityDirectory?: string;
  readMachineId?: () => string;
}

const readIdentityRecord = async (filename: string): Promise<StoredDeviceIdentity | undefined> => {
  let contents: string;
  try {
    contents = await readFile(filename, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  const { deviceId, identitySource, machineDeviceId, version } = JSON.parse(contents) as {
    deviceId?: unknown;
    identitySource?: unknown;
    machineDeviceId?: unknown;
    version?: unknown;
  };
  if (
    version !== 1 ||
    typeof deviceId !== 'string' ||
    !/^(?:[\da-f]{32}|[\da-f-]{36})$/.test(deviceId) ||
    (identitySource !== 'machine-id' && identitySource !== 'fallback')
  ) {
    throw new Error('Invalid persisted device identity record');
  }
  if (
    machineDeviceId !== undefined &&
    (typeof machineDeviceId !== 'string' ||
      !/^[\da-f]{32}$/.test(machineDeviceId) ||
      (identitySource === 'machine-id' && machineDeviceId !== deviceId))
  ) {
    throw new Error('Invalid persisted device identity record');
  }
  // The guards above prove machineDeviceId is a 32-hex string or absent;
  // tsgo does not narrow the destructured unknown, so the type is stated here.
  return {
    deviceId,
    identitySource,
    machineDeviceId: machineDeviceId as string | undefined,
    version,
  };
};

/**
 * Canonical local identity shared by CLI and Electron, independent of their
 * per-install connection IDs. The first complete record wins, including a
 * fallback record; a later successful OS read must not rotate its device ID.
 * Known-machine records are rejected on a different readable OS identity.
 * This is local enrollment continuity, not proof against cloned OS state.
 */
export const resolvePersistentDeviceIdentity = async (
  principal: string,
  options: PersistentDeviceIdentityOptions = {},
): Promise<DeviceIdentity> => {
  const directory = options.identityDirectory ?? path.join(os.homedir(), '.orvilo-device-identity');
  const filename = path.join(
    directory,
    `${createHash('sha256').update(principal).digest('hex')}.json`,
  );
  let rawMachineId: string;
  try {
    rawMachineId = await (options.readMachineId ? options.readMachineId() : machineId(true));
  } catch {
    rawMachineId = '';
  }
  const candidate = deriveDeviceId(principal, { readMachineId: () => rawMachineId });
  const machineDeviceId =
    candidate.identitySource === 'machine-id' ? candidate.deviceId : undefined;

  await mkdir(directory, { mode: 0o700, recursive: true });
  let record = await readIdentityRecord(filename);
  if (!record) {
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ ...candidate, machineDeviceId, version: 1 }), {
        flag: 'wx',
        mode: 0o600,
      });
      try {
        // Hard-link publication is atomic and cannot overwrite a concurrent winner.
        await link(temporary, filename);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    } finally {
      await rm(temporary, { force: true });
    }
    record = await readIdentityRecord(filename);
    if (!record) throw new Error('Persisted device identity disappeared during creation');
  }

  if (machineDeviceId && record.machineDeviceId && machineDeviceId !== record.machineDeviceId) {
    throw new Error('Persisted device identity belongs to a different machine');
  }
  if (machineDeviceId && !record.machineDeviceId) {
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ ...record, machineDeviceId }), {
        flag: 'wx',
        mode: 0o600,
      });
      // Concurrent successful readers on this machine attach the same validation hash.
      await rename(temporary, filename);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return { deviceId: record.deviceId, identitySource: record.identitySource };
};
