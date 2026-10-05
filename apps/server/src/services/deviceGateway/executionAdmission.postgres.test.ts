// @vitest-environment node
/**
 * Real-PostgreSQL (PGlite) coverage for `bindTopicDeviceAtomically` — the
 * conditional first-bind CAS. Mocked-driver tests cannot prove the jsonb
 * merge, the CAS guards, or the winner re-read actually behave against real
 * SQL semantics; these do.
 */
import { type OrviloDatabase } from '@orvilo/database';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { topics, users } from '@/database/schemas';

import { bindTopicDeviceAtomically } from './executionAdmission';

// The bind path never consults the gateway or the device registry — the mocks
// exist only so importing the module does not pull the heavy service graph.
vi.mock('@/database/models/device', () => ({
  DeviceModel: class DeviceModelMock {},
}));
vi.mock('./index', () => ({
  deviceGateway: { queryDeviceList: vi.fn() },
}));

let db: OrviloDatabase;

const readTopic = async (topicId: string) => {
  const rows = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1);
  return rows[0];
};

const insertTopic = async (id: string, metadata?: Record<string, unknown>) => {
  await db.insert(topics).values({ id, metadata: metadata ?? {}, userId: 'pg-user' });
};

describe('bindTopicDeviceAtomically (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = await getTestDB();
    await db.insert(users).values({ id: 'pg-user' }).onConflictDoNothing();
  });

  it('installs the canonical binding — executionConfig + legacy top-level pin together', async () => {
    await insertTopic('t-bind-canon', { workingDirectory: '/repo/keep-me' });

    const result = await bindTopicDeviceAtomically(db, {
      deviceId: 'dev-B',
      topicId: 't-bind-canon',
      userId: 'pg-user',
    });

    expect(result).toEqual({ boundDeviceId: 'dev-B', outcome: 'bound' });
    const topic = await readTopic('t-bind-canon');
    // Canonical form: executionConfig carries BOTH the pin and the target —
    // the row must never end up with a device but no stored intent.
    expect(topic?.metadata?.executionConfig).toEqual({
      boundDeviceId: 'dev-B',
      executionTarget: 'device',
    });
    expect(topic?.metadata?.boundDeviceId).toBe('dev-B');
    // Unrelated metadata is preserved, not clobbered by the merge.
    expect(topic?.metadata?.workingDirectory).toBe('/repo/keep-me');
  });

  it('preserves existing executionConfig keys while merging the pin', async () => {
    await insertTopic('t-bind-merge', {
      executionConfig: { localSandbox: true },
    });

    const result = await bindTopicDeviceAtomically(db, {
      deviceId: 'dev-B',
      topicId: 't-bind-merge',
      userId: 'pg-user',
    });

    expect(result).toEqual({ boundDeviceId: 'dev-B', outcome: 'bound' });
    const topic = await readTopic('t-bind-merge');
    expect(topic?.metadata?.executionConfig).toEqual({
      boundDeviceId: 'dev-B',
      executionTarget: 'device',
      localSandbox: true,
    });
  });

  it('CAS: a concurrent bind cannot overwrite — the loser adopts the winner', async () => {
    await insertTopic('t-bind-race', {});

    const first = await bindTopicDeviceAtomically(db, {
      deviceId: 'dev-A',
      topicId: 't-bind-race',
      userId: 'pg-user',
    });
    const second = await bindTopicDeviceAtomically(db, {
      deviceId: 'dev-B',
      topicId: 't-bind-race',
      userId: 'pg-user',
    });

    expect(first).toEqual({ boundDeviceId: 'dev-A', outcome: 'bound' });
    expect(second).toEqual({ boundDeviceId: 'dev-A', outcome: 'occupied' });
    const topic = await readTopic('t-bind-race');
    expect(topic?.metadata?.boundDeviceId).toBe('dev-A');
    expect(topic?.metadata?.executionConfig?.boundDeviceId).toBe('dev-A');
  });

  it('honors the legacy top-level pin as an occupied binding', async () => {
    await insertTopic('t-bind-legacy', { boundDeviceId: 'dev-old' });

    const result = await bindTopicDeviceAtomically(db, {
      deviceId: 'dev-B',
      topicId: 't-bind-legacy',
      userId: 'pg-user',
    });

    expect(result).toEqual({ boundDeviceId: 'dev-old', outcome: 'occupied' });
    const topic = await readTopic('t-bind-legacy');
    expect(topic?.metadata?.boundDeviceId).toBe('dev-old');
  });

  it('throws when the topic is missing — never pretends to bind nothing', async () => {
    await expect(
      bindTopicDeviceAtomically(db, {
        deviceId: 'dev-B',
        topicId: 't-does-not-exist',
        userId: 'pg-user',
      }),
    ).rejects.toThrow(/no binding persisted/);
  });
});
