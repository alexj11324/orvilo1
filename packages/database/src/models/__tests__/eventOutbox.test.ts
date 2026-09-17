import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { eventOutbox, users, workspaces } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { EventOutboxModel, newEventId } from '../eventOutbox';

const serverDB: LobeChatDatabase = await getTestDB();

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
});
