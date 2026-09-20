import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { eventOutbox, users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { EventOutboxModel, newEventId } from '../eventOutbox';

const serverDB: OrviloDatabase = await getTestDB();

const userId = 'outbox-user';
const workspaceId = 'outbox-workspace';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values({ id: userId });
  await serverDB
    .insert(workspaces)
    .values({ id: workspaceId, name: 'WS', primaryOwnerId: userId, slug: 'outbox-ws' });
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('EventOutboxModel', () => {
  it('inserts an event inside the caller transaction so a rollback drops it', async () => {
    const model = new EventOutboxModel(serverDB);
    const eventId = newEventId();

    await expect(
      serverDB.transaction(async (tx) => {
        await model.insertOutboxEvent(tx, {
          aggregateId: 'task-1',
          aggregateType: 'task',
          eventId,
          eventType: 'task.assigned',
          payload: { assigneeUserId: userId },
          workspaceId,
        });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');

    // Nothing committed: the event died with the business change.
    expect(await serverDB.select().from(eventOutbox)).toHaveLength(0);
  });

  it('commits the event atomically with the enclosing transaction', async () => {
    const model = new EventOutboxModel(serverDB);
    const eventId = newEventId();

    await serverDB.transaction(async (tx) => {
      await model.insertOutboxEvent(tx, {
        aggregateId: 'task-1',
        aggregateType: 'task',
        eventId,
        eventType: 'task.assigned',
        workspaceId,
      });
    });

    const [row] = await serverDB.select().from(eventOutbox).where(eq(eventOutbox.eventId, eventId));
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(0);
    expect(row.nextAttemptAt).toBeNull();
  });

  describe('fetchPending', () => {
    it('returns due pending rows oldest-first and skips deferred ones', async () => {
      const model = new EventOutboxModel(serverDB);
      const first = await model.insertOutboxEvent(serverDB, {
        aggregateId: 'a',
        aggregateType: 'task',
        eventId: newEventId(),
        eventType: 'task.one',
        workspaceId,
      });
      const deferred = await model.insertOutboxEvent(serverDB, {
        aggregateId: 'b',
        aggregateType: 'task',
        eventId: newEventId(),
        eventType: 'task.two',
        workspaceId,
      });
      // Push the second row's next attempt into the future.
      await model.markFailed(deferred.id, { retryDelayMs: 60_000 });

      const pending = await model.fetchPending({ limit: 10 });

      expect(pending.map((row) => row.id)).toEqual([first.id]);
    });
  });

  describe('claimPending', () => {
    it('claims due rows and hides them from a concurrent claim until the timeout lapses', async () => {
      const model = new EventOutboxModel(serverDB);
      const row = await model.insertOutboxEvent(serverDB, {
        aggregateId: 'a',
        aggregateType: 'task',
        eventId: newEventId(),
        eventType: 'task.one',
        workspaceId,
      });

      const claimed = await model.claimPending({ limit: 10, visibilityTimeoutMs: 60_000 });
      expect(claimed.map((r) => r.id)).toEqual([row.id]);
      // The claim stamps nextAttemptAt as the visibility timeout.
      expect(claimed[0].nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 30_000);

      // A second overlapping sweep sees nothing.
      expect(await model.claimPending({ limit: 10, visibilityTimeoutMs: 60_000 })).toHaveLength(0);

      // Once the timeout lapses the row resurfaces (dead-worker recovery).
      const reclaimed = await model.claimPending({
        limit: 10,
        now: new Date(Date.now() + 61_000),
        visibilityTimeoutMs: 60_000,
      });
      expect(reclaimed.map((r) => r.id)).toEqual([row.id]);
    });

    it('lets a claimed row be delivered and failed normally', async () => {
      const model = new EventOutboxModel(serverDB);
      const row = await model.insertOutboxEvent(serverDB, {
        aggregateId: 'a',
        aggregateType: 'task',
        eventId: newEventId(),
        eventType: 'task.one',
        workspaceId,
      });

      await model.claimPending({ limit: 10, visibilityTimeoutMs: 60_000 });

      expect(await model.markDelivered(row.id)).toBe(true);
      const [stored] = await serverDB.select().from(eventOutbox).where(eq(eventOutbox.id, row.id));
      expect(stored.status).toBe('delivered');
    });
  });

  describe('markDelivered', () => {
    it('marks a pending row delivered exactly once', async () => {
      const model = new EventOutboxModel(serverDB);
      const row = await model.insertOutboxEvent(serverDB, {
        aggregateId: 'a',
        aggregateType: 'task',
        eventId: newEventId(),
        eventType: 'task.one',
        workspaceId,
      });

      expect(await model.markDelivered(row.id)).toBe(true);
      // Double-delivery of the marker is a no-op — the row is already terminal.
      expect(await model.markDelivered(row.id)).toBe(false);

      const [stored] = await serverDB.select().from(eventOutbox).where(eq(eventOutbox.id, row.id));
      expect(stored.status).toBe('delivered');
      expect(stored.deliveredAt).not.toBeNull();
    });
  });

  describe('markFailed', () => {
    it('defers the next attempt and keeps the row pending below the ceiling', async () => {
      const model = new EventOutboxModel(serverDB);
      const row = await model.insertOutboxEvent(serverDB, {
        aggregateId: 'a',
        aggregateType: 'task',
        eventId: newEventId(),
        eventType: 'task.one',
        workspaceId,
      });

      const failed = await model.markFailed(row.id, { retryDelayMs: 30_000 });

      expect(failed?.status).toBe('pending');
      expect(failed?.attempts).toBe(1);
      expect(failed?.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 10_000);
    });

    it('parks the row as failed once attempts hit the ceiling', async () => {
      const model = new EventOutboxModel(serverDB);
      const row = await model.insertOutboxEvent(serverDB, {
        aggregateId: 'a',
        aggregateType: 'task',
        eventId: newEventId(),
        eventType: 'task.one',
        workspaceId,
      });

      let current = row;
      for (let i = 0; i < 9; i += 1) {
        current = (await model.markFailed(current.id, { retryDelayMs: 1 }))!;
      }
      expect(current.status).toBe('pending');
      expect(current.attempts).toBe(9);

      const last = await model.markFailed(row.id, { retryDelayMs: 1 });
      expect(last?.status).toBe('failed');
      expect(last?.attempts).toBe(10);
      // Terminal: no further attempts and no delivery flip.
      expect(await model.markFailed(row.id, { retryDelayMs: 1 })).toBeUndefined();
      expect(await model.markDelivered(row.id)).toBe(false);
    });
  });

  describe('delivery ledger transitions (SA04/F06)', () => {
    const insertReceipt = (payload: Record<string, unknown> = {}) =>
      new EventOutboxModel(serverDB).insertOutboxEvent(serverDB, {
        aggregateId: 'op_1',
        aggregateType: 'agent_operation',
        eventId: newEventId(),
        eventType: 'agent_operation.child_result',
        payload: { deliveryState: 'received', ...payload },
        workspaceId,
      });

    it('received → offered → acked, each transition idempotent', async () => {
      const model = new EventOutboxModel(serverDB);
      const row = await insertReceipt();

      expect(await model.offerDeliveryReceiptByEventId(row.eventId)).toBe(true);
      // Re-offer is a no-op — a replayed settle never downgrades.
      expect(await model.offerDeliveryReceiptByEventId(row.eventId)).toBe(false);

      expect(
        await model.ackDeliveryReceiptByEventId({
          aggregateId: 'op_1',
          eventId: row.eventId,
        }),
      ).toBe(true);

      const [stored] = await serverDB
        .select()
        .from(eventOutbox)
        .where(eq(eventOutbox.eventId, row.eventId));
      expect(stored.status).toBe('delivered');
      expect((stored.payload as Record<string, unknown>).deliveryState).toBe('acked');
      expect(stored.deliveredAt).not.toBeNull();

      // Re-ack is a no-op.
      expect(
        await model.ackDeliveryReceiptByEventId({ aggregateId: 'op_1', eventId: row.eventId }),
      ).toBe(false);
    });

    it('ack against a foreign aggregateId is refused', async () => {
      const model = new EventOutboxModel(serverDB);
      const row = await insertReceipt();

      expect(
        await model.ackDeliveryReceiptByEventId({
          aggregateId: 'op_other',
          eventId: row.eventId,
        }),
      ).toBe(false);
      const [stored] = await serverDB
        .select()
        .from(eventOutbox)
        .where(eq(eventOutbox.eventId, row.eventId));
      expect(stored.status).toBe('pending');
    });

    it('a superseded receipt can never be acked', async () => {
      const model = new EventOutboxModel(serverDB);
      const row = await insertReceipt({ deliveryState: 'superseded' });

      expect(
        await model.ackDeliveryReceiptByEventId({ aggregateId: 'op_1', eventId: row.eventId }),
      ).toBe(false);
    });

    it('nextAttemptAt shields a live receipt from the pending sweep', async () => {
      const model = new EventOutboxModel(serverDB);
      const row = await model.insertOutboxEvent(serverDB, {
        aggregateId: 'op_1',
        aggregateType: 'agent_operation',
        eventId: newEventId(),
        eventType: 'agent_operation.child_result',
        nextAttemptAt: new Date(Date.now() + 60 * 60_000),
        payload: { deliveryState: 'offered' },
        workspaceId,
      });

      const pending = await model.fetchPending({ limit: 10 });
      expect(pending.map((r) => r.id)).not.toContain(row.id);
    });
  });

  describe('tool-approval receipts (SA02/F04)', () => {
    const approvalEvent = (payload: Record<string, unknown> = {}) => ({
      aggregateId: 'op_1',
      aggregateType: 'agent_operation' as const,
      eventId: newEventId(),
      eventType: 'agent_operation.tool_approval',
      payload: {
        argsHash: 'hash_a',
        expiresAt: Date.now() + 60_000,
        ...payload,
      },
      workspaceId,
    });

    it('decision CAS lands once — a second submit is dropped', async () => {
      const model = new EventOutboxModel(serverDB);
      const event = approvalEvent();
      await model.upsertDeliveryReceipt({ event });

      const decision = { action: 'approved', decidedAt: Date.now(), decidedByUserId: userId };
      expect(await model.recordToolApprovalDecision({ decision, eventId: event.eventId })).toBe(
        'decided',
      );
      // Second submit (double-click / retry) cannot flip the decision.
      expect(
        await model.recordToolApprovalDecision({
          decision: { ...decision, action: 'denied' },
          eventId: event.eventId,
        }),
      ).toBe('already_decided');
    });

    it('consume CAS grants an approved, unexpired, args-matched receipt exactly once', async () => {
      const model = new EventOutboxModel(serverDB);
      const event = approvalEvent();
      await model.upsertDeliveryReceipt({ event });
      await model.recordToolApprovalDecision({
        decision: { action: 'approved', decidedAt: Date.now(), decidedByUserId: userId },
        eventId: event.eventId,
      });

      const params = { argsHash: 'hash_a', eventId: event.eventId, now: Date.now() };
      expect(await model.consumeToolApprovalReceipt(params)).toBe(true);
      // One-time: the same grant cannot be spent twice.
      expect(await model.consumeToolApprovalReceipt(params)).toBe(false);
    });

    it('refuses consume on wrong argsHash, denied decision, or expiry', async () => {
      const model = new EventOutboxModel(serverDB);

      const approved = approvalEvent();
      await model.upsertDeliveryReceipt({ event: approved });
      await model.recordToolApprovalDecision({
        decision: { action: 'approved', decidedAt: Date.now(), decidedByUserId: userId },
        eventId: approved.eventId,
      });
      // Approval covers `hash_a` — a call presenting different args refuses.
      expect(
        await model.consumeToolApprovalReceipt({
          argsHash: 'hash_b',
          eventId: approved.eventId,
          now: Date.now(),
        }),
      ).toBe(false);

      const denied = approvalEvent();
      await model.upsertDeliveryReceipt({ event: denied });
      await model.recordToolApprovalDecision({
        decision: { action: 'denied', decidedAt: Date.now(), decidedByUserId: userId },
        eventId: denied.eventId,
      });
      expect(
        await model.consumeToolApprovalReceipt({
          argsHash: 'hash_a',
          eventId: denied.eventId,
          now: Date.now(),
        }),
      ).toBe(false);

      const expired = approvalEvent({ expiresAt: Date.now() - 1 });
      await model.upsertDeliveryReceipt({ event: expired });
      await model.recordToolApprovalDecision({
        decision: { action: 'approved', decidedAt: Date.now() - 60_000, decidedByUserId: userId },
        eventId: expired.eventId,
      });
      expect(
        await model.consumeToolApprovalReceipt({
          argsHash: 'hash_a',
          eventId: expired.eventId,
          now: Date.now(),
        }),
      ).toBe(false);
    });

    it('renew re-pends an expired receipt and clears any stale decision', async () => {
      const model = new EventOutboxModel(serverDB);
      const event = approvalEvent({ expiresAt: Date.now() - 1 });
      await model.upsertDeliveryReceipt({ event });
      await model.recordToolApprovalDecision({
        decision: { action: 'approved', decidedAt: Date.now() - 120_000, decidedByUserId: userId },
        eventId: event.eventId,
      });

      const now = Date.now();
      const freshExpiry = now + 60_000;
      expect(
        await model.renewToolApprovalReceipt({
          eventId: event.eventId,
          expiresAt: freshExpiry,
          now,
        }),
      ).toBe(true);

      const payload = await model.getDeliveryReceiptPayload(event.eventId);
      expect(payload?.decision).toBeUndefined();
      expect(payload?.expiresAt).toBe(freshExpiry);
      expect(payload?.requestedAt).toBe(now);

      // A non-expired receipt cannot be renewed.
      const live = approvalEvent();
      await model.upsertDeliveryReceipt({ event: live });
      expect(
        await model.renewToolApprovalReceipt({
          eventId: live.eventId,
          expiresAt: freshExpiry,
          now,
        }),
      ).toBe(false);
    });
  });
});
