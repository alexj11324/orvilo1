import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deriveDeviceId, resolvePersistentDeviceIdentity } from './index';

const machine = () => 'synthetic-machine-A';
const unavailable = () => {
  throw new Error('machine identifier unavailable');
};
let identityDirectory: string;

beforeEach(async () => {
  identityDirectory = await mkdtemp(path.join(os.tmpdir(), 'orvilo-device-identity-test-'));
});
afterEach(async () => {
  await rm(identityDirectory, { recursive: true, force: true });
});

const resolve = (principal = 'user-A', readMachineId = machine) =>
  resolvePersistentDeviceIdentity(principal, { identityDirectory, readMachineId });

describe('persistent device identity shared by CLI and desktop', () => {
  it('preserves the existing normal ID and caches it for a failing reader', async () => {
    const canonical = deriveDeviceId('user-A', { readMachineId: machine });
    expect(await resolve()).toEqual(canonical);
    expect(await resolve('user-A', unavailable)).toEqual(canonical);
  });

  it('preserves fallback identity through restart and machine-reader recovery', async () => {
    const fallback = await resolve('user-A', unavailable);
    expect(fallback.identitySource).toBe('fallback');
    expect(await resolve('user-A', unavailable)).toEqual(fallback);
    expect(await resolve()).toEqual(fallback);
    expect(await resolve('user-A', unavailable)).toEqual(fallback);
  });

  it.each(['normal-first', 'fallback-first', 'both-fail'] as const)(
    'publishes one complete record during simultaneous %s startup',
    async (order) => {
      const readers =
        order === 'normal-first'
          ? [machine, unavailable]
          : order === 'fallback-first'
            ? [unavailable, machine]
            : [unavailable, unavailable];
      const identities = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          resolve('user-A', readers[index % readers.length]),
        ),
      );
      expect(new Set(identities.map((identity) => identity.deviceId)).size).toBe(1);
      expect(await resolve()).toEqual(identities[0]);
      expect(
        (await readdir(identityDirectory)).filter((name) => name.endsWith('.json')),
      ).toHaveLength(1);
    },
  );

  it('isolates personal accounts and workspace principals', async () => {
    const identities = await Promise.all(
      ['user-A', 'user-B', 'workspace:A', 'workspace:B'].map((principal) =>
        resolve(principal, unavailable),
      ),
    );
    expect(new Set(identities.map((identity) => identity.deviceId)).size).toBe(4);
  });

  it('rejects a known-machine record copied to a different readable machine', async () => {
    await resolve();
    await expect(resolve('user-A', () => 'synthetic-machine-B')).rejects.toThrow(
      'different machine',
    );
  });

  it('validates a recovered fallback record on later machine reads', async () => {
    await resolve('user-A', unavailable);
    await resolve();
    await expect(resolve('user-A', () => 'synthetic-machine-B')).rejects.toThrow(
      'different machine',
    );
  });

  it('stores no raw machine identifier or principal in identity records', async () => {
    await resolve();
    const records = await readdir(identityDirectory);
    expect(records).toHaveLength(1);
    const contents = await readFile(path.join(identityDirectory, records[0]), 'utf8');
    expect(contents).not.toContain(machine());
    expect(contents).not.toContain('user-A');
    expect(records[0]).not.toContain('user-A');
  });

  it('reports a corrupt record instead of silently changing device identity', async () => {
    await resolve();
    const [record] = await readdir(identityDirectory);
    await writeFile(path.join(identityDirectory, record), '{invalid-json');
    await expect(resolve()).rejects.toThrow();
  });
});
