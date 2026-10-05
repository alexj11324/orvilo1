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

import { bindTopicDeviceAtomically, repairTopicDeviceBinding } from './executionAdmission';

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

    expect(result).toEqual({ bindingRevision: 1, boundDeviceId: 'dev-B', outcome: 'bound' });
    const topic = await readTopic('t-bind-canon');
    // Canonical form: executionConfig carries BOTH the pin and the target —
    // the row must never end up with a device but no stored intent.
    expect(topic?.metadata?.executionConfig).toEqual({
      boundDeviceId: 'dev-B',
      executionTarget: 'device',
    });
    expect(topic?.metadata?.boundDeviceId).toBe('dev-B');
    // The binding epoch starts at 1 — repair CASes compare it verbatim.
    expect(topic?.metadata?.bindingRevision).toBe(1);
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

    expect(result).toEqual({ bindingRevision: 1, boundDeviceId: 'dev-B', outcome: 'bound' });
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

    expect(first).toEqual({ bindingRevision: 1, boundDeviceId: 'dev-A', outcome: 'bound' });
    expect(second).toEqual({ bindingRevision: 1, boundDeviceId: 'dev-A', outcome: 'occupied' });
    const topic = await readTopic('t-bind-race');
    expect(topic?.metadata?.boundDeviceId).toBe('dev-A');
    expect(topic?.metadata?.executionConfig?.boundDeviceId).toBe('dev-A');
    expect(topic?.metadata?.bindingRevision).toBe(1);
  });

  it('honors the legacy top-level pin as an occupied binding', async () => {
    await insertTopic('t-bind-legacy', { boundDeviceId: 'dev-old' });

    const result = await bindTopicDeviceAtomically(db, {
      deviceId: 'dev-B',
      topicId: 't-bind-legacy',
      userId: 'pg-user',
    });

    expect(result).toEqual({ bindingRevision: 0, boundDeviceId: 'dev-old', outcome: 'occupied' });
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

describe('repairTopicDeviceBinding (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = await getTestDB();
    await db.insert(users).values({ id: 'pg-user' }).onConflictDoNothing();
  });

  it('repairs a stale pin when binding + revision match — canonical triple + fresh epoch', async () => {
    await insertTopic('t-repair-ok', {
      bindingRevision: 3,
      boundDeviceId: 'dev-old',
      executionConfig: { boundDeviceId: 'dev-old', executionTarget: 'device' },
      heteroSessionBindingKey: 'key-old',
      heteroSessionBindingKeyByWorkingDirectory: { '/w': 'key-old' },
      heteroSessionId: 'session-old',
      heteroSessionIdByWorkingDirectory: { '/w': 'session-old' },
      workingDirectory: '/repo/keep-me',
    });

    const result = await repairTopicDeviceBinding(db, {
      deviceId: 'dev-new',
      expectedBindingRevision: 3,
      expectedBoundDeviceId: 'dev-old',
      topicId: 't-repair-ok',
    });

    expect(result).toEqual({ bindingRevision: 4, boundDeviceId: 'dev-new', outcome: 'bound' });
    const topic = await readTopic('t-repair-ok');
    // Canonical triple + inheritWorkspaceScope:false — a human repair pick
    // must not be re-clamped by workspace-scope inheritance.
    expect(topic?.metadata?.executionConfig).toEqual({
      boundDeviceId: 'dev-new',
      executionTarget: 'device',
      inheritWorkspaceScope: false,
    });
    expect(topic?.metadata?.boundDeviceId).toBe('dev-new');
    expect(topic?.metadata?.bindingRevision).toBe(4);
    // The old device's native session handles are REMOVED — the repaired
    // device mints a fresh session, never resurrects a foreign session id.
    expect(topic?.metadata?.heteroSessionId).toBeUndefined();
    expect(topic?.metadata?.heteroSessionBindingKey).toBeUndefined();
    expect(topic?.metadata?.heteroSessionIdByWorkingDirectory).toBeUndefined();
    expect(topic?.metadata?.heteroSessionBindingKeyByWorkingDirectory).toBeUndefined();
    expect(topic?.metadata?.workingDirectory).toBe('/repo/keep-me');
  });

  it("CAS loses on a binding that moved — winner's pin returned, row untouched", async () => {
    await insertTopic('t-repair-race', {
      bindingRevision: 2,
      boundDeviceId: 'dev-winner',
      executionConfig: { boundDeviceId: 'dev-winner', executionTarget: 'device' },
    });

    const result = await repairTopicDeviceBinding(db, {
      deviceId: 'dev-new',
      expectedBoundDeviceId: 'dev-old',
      topicId: 't-repair-race',
    });

    expect(result).toEqual({
      bindingRevision: 2,
      boundDeviceId: 'dev-winner',
      outcome: 'occupied',
    });
    const topic = await readTopic('t-repair-race');
    expect(topic?.metadata?.boundDeviceId).toBe('dev-winner');
    expect(topic?.metadata?.bindingRevision).toBe(2);
  });

  it('CAS loses on a stale revision even when the pin still matches', async () => {
    await insertTopic('t-repair-rev', {
      bindingRevision: 5,
      boundDeviceId: 'dev-A',
      executionConfig: { boundDeviceId: 'dev-A', executionTarget: 'device' },
    });

    const result = await repairTopicDeviceBinding(db, {
      deviceId: 'dev-new',
      expectedBindingRevision: 1,
      expectedBoundDeviceId: 'dev-A',
      topicId: 't-repair-rev',
    });

    // Same pin but the epoch moved — a first-bind/repair landed in between.
    expect(result).toEqual({ bindingRevision: 5, boundDeviceId: 'dev-A', outcome: 'occupied' });
    const topic = await readTopic('t-repair-rev');
    expect(topic?.metadata?.boundDeviceId).toBe('dev-A');
  });

  it('installs a binding on an unbound topic only while it stays unbound', async () => {
    await insertTopic('t-repair-unbound', {});

    const result = await repairTopicDeviceBinding(db, {
      deviceId: 'dev-new',
      topicId: 't-repair-unbound',
    });

    expect(result).toEqual({ bindingRevision: 1, boundDeviceId: 'dev-new', outcome: 'bound' });

    // A second repair asserting "still unbound" loses to the first winner.
    const second = await repairTopicDeviceBinding(db, {
      deviceId: 'dev-other',
      topicId: 't-repair-unbound',
    });
    expect(second).toEqual({
      bindingRevision: 1,
      boundDeviceId: 'dev-new',
      outcome: 'occupied',
    });
    const topic = await readTopic('t-repair-unbound');
    expect(topic?.metadata?.boundDeviceId).toBe('dev-new');
  });

  it('the effective-binding CAS reads the legacy top-level pin as the truth', async () => {
    await insertTopic('t-repair-legacy', { boundDeviceId: 'dev-legacy' });

    // Expected pin matches the legacy mirror — repair proceeds.
    const result = await repairTopicDeviceBinding(db, {
      deviceId: 'dev-new',
      expectedBoundDeviceId: 'dev-legacy',
      topicId: 't-repair-legacy',
    });
    expect(result).toEqual({ bindingRevision: 1, boundDeviceId: 'dev-new', outcome: 'bound' });
    const topic = await readTopic('t-repair-legacy');
    expect(topic?.metadata?.executionConfig?.boundDeviceId).toBe('dev-new');
  });

  it('throws when the topic is missing — never pretends to repair nothing', async () => {
    await expect(
      repairTopicDeviceBinding(db, {
        deviceId: 'dev-new',
        expectedBoundDeviceId: 'dev-old',
        topicId: 't-repair-missing',
      }),
    ).rejects.toThrow(/topic missing/);
  });
});
