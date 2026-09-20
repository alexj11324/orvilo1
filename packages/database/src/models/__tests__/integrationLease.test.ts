// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { integrationLeases } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { IntegrationLeaseModel } from '../integrationLease';

const serverDB: OrviloDatabase = await getTestDB();
const model = new IntegrationLeaseModel(serverDB);

const params = (key: string, ownerToken: string, deadlineMs = 60_000) => ({
  deadline: new Date(Date.now() + deadlineMs),
  expectedBaseSha: 'sha-base',
  key,
  ownerTaskId: 'task_1',
  ownerToken,
  ownerTopicId: 'topic_1',
  ref: 'main',
  target: 'device:dev-1:/repos/orvilo',
});

afterEach(async () => {
  await serverDB.delete(integrationLeases);
});

describe('IntegrationLeaseModel', () => {
  it('lets exactly one claimant win a live key', async () => {
    const key = 'ws:test-single-winner';
    const first = await model.acquire(params(key, 'owner-a'));
    const second = await model.acquire(params(key, 'owner-b'));

    expect(first.lease?.ownerToken).toBe('owner-a');
    expect(second.lease).toBeUndefined();
    expect(second.prior?.ownerToken).toBe('owner-a');
  });

  it('serializes concurrent acquires — never two winners', async () => {
    const key = 'ws:test-concurrent';
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => model.acquire(params(key, `owner-${i}`))),
    );

    expect(results.filter((r) => r.lease)).toHaveLength(1);
  });

  it('hands a cleanly released row to the next owner', async () => {
    const key = 'ws:test-released';
    const first = await model.acquire(params(key, 'owner-a'));
    await model.release(first.lease!.id, 'owner-a');

    const second = await model.acquire(params(key, 'owner-b'));

    expect(second.lease?.ownerToken).toBe('owner-b');
    expect(second.prior?.ownerToken).toBe('owner-a');
    expect(second.prior?.releasedAt).not.toBeNull();
    expect(second.prior?.outcomeUnknown).toBe(false);
  });

  it('steals an expired lease and reports the unclean prior for reconciliation', async () => {
    const key = 'ws:test-steal';
    await model.acquire(params(key, 'owner-a', -1_000));

    const second = await model.acquire(params(key, 'owner-b'));

    expect(second.lease?.ownerToken).toBe('owner-b');
    expect(second.prior?.ownerToken).toBe('owner-a');
    expect(second.prior?.releasedAt).toBeNull();
  });

  it('renews only for the owner — a stolen or released lease rejects fencing', async () => {
    const key = 'ws:test-fence';
    const { lease } = await model.acquire(params(key, 'owner-a'));

    await expect(model.renew(lease!.id, 'owner-b', new Date())).resolves.toBe(false);
    await expect(model.renew(lease!.id, 'owner-a', new Date(), 'merge')).resolves.toBe(true);

    await model.release(lease!.id, 'owner-a');
    await expect(model.renew(lease!.id, 'owner-a', new Date())).resolves.toBe(false);
  });

  it('keeps outcome_unknown visible to the next claimant after an ambiguous crash', async () => {
    const key = 'ws:test-outcome-unknown';
    const { lease } = await model.acquire(params(key, 'owner-a'));
    // Ambiguous crash: the holder marked the outcome unknown and never
    // released — the row only frees by deadline expiry.
    await model.markOutcomeUnknown(lease!.id, 'owner-a');
    await serverDB
      .update(integrationLeases)
      .set({ deadline: new Date(Date.now() - 1) })
      .where(eq(integrationLeases.id, lease!.id));

    const second = await model.acquire(params(key, 'owner-b'));

    expect(second.lease?.ownerToken).toBe('owner-b');
    expect(second.prior?.outcomeUnknown).toBe(true);
    expect(second.prior?.phase).toBe('claimed');
    // Reacquisition resets the ambiguity for this ownership.
    expect(second.lease?.outcomeUnknown).toBe(false);
  });
});
