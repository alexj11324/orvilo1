// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { tasks, taskTopics, topics, users } from '../../schemas';
import { TaskModel } from '../task';
import { TaskTopicModel } from '../taskTopic';

const db = await getTestDB();
const userId = 'interrupted-run-owner';
const model = new TaskModel(db, userId);
const topicModel = new TaskTopicModel(db, userId);
beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values([{ id: userId }, { id: 'other-owner' }]);
});
afterEach(async () => {
  await db.delete(users);
});

const seed = async () => {
  const upstream = await model.create({ instruction: 'Upstream' });
  const task = await model.create({ instruction: 'Dependent' });
  await model.addDependency(task.id, upstream.id);
  await model.updateStatus(upstream.id, 'completed');
  await model.reserveRun(task.id, 'run-1');
  await db.insert(topics).values({ id: 'topic-1', userId });
  await topicModel.add(task.id, 'topic-1', { operationId: 'op-1', seq: 1 });
  await model.update(task.id, { currentTopicId: 'topic-1' });
  await model.updateStatus(upstream.id, 'backlog');
  return {
    currentTopicId: 'topic-1',
    id: task.id,
    operationId: 'op-1',
    reservationId: 'run-1',
    topicId: 'topic-1',
  };
};

describe('confirmed interruption compensation', () => {
  it('parks the interrupted generation and cancels its topic after dependency rejection', async () => {
    const input = await seed();
    await expect(model.updateStatus(input.id, 'completed')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(await model.recoverInterruptedRun(input)).toBe(true);
    expect(await model.findById(input.id)).toMatchObject({
      status: 'paused',
      runReservationId: null,
      runReservationExpiresAt: null,
    });
    expect((await topicModel.findByTaskId(input.id))[0].status).toBe('canceled');
    expect(
      (await db.select().from(topics).where(eq(topics.id, input.topicId)))[0].completedAt,
    ).not.toBeNull();
    expect(await model.recoverInterruptedRun(input)).toBe(false);
  });

  it.each(['reservation', 'topic', 'terminal', 'operation'])(
    'does not overwrite a newer %s fence',
    async (fence) => {
      const input = await seed();
      if (fence === 'reservation')
        await db.update(tasks).set({ runReservationId: 'run-2' }).where(eq(tasks.id, input.id));
      if (fence === 'topic') {
        await db.insert(topics).values({ id: 'topic-2', userId });
        await topicModel.add(input.id, 'topic-2', { operationId: 'op-2', seq: 2 });
        await db
          .update(tasks)
          .set({ currentTopicId: 'topic-2', runReservationId: 'run-2' })
          .where(eq(tasks.id, input.id));
      }
      if (fence === 'terminal')
        await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, input.id));
      if (fence === 'operation')
        await db
          .update(taskTopics)
          .set({ operationId: 'op-2' })
          .where(eq(taskTopics.taskId, input.id));
      const before = await model.findById(input.id);
      expect(await model.recoverInterruptedRun(input)).toBe(false);
      expect(await model.findById(input.id)).toEqual(before);
      if (fence === 'topic')
        expect(
          (await topicModel.findByTaskId(input.id)).find((t) => t.topicId === 'topic-2')?.status,
        ).toBe('running');
      if (fence === 'operation')
        expect((await topicModel.findByTaskId(input.id))[0].status).toBe('running');
    },
  );

  it('recovers a single-task path whose topic cancellation was already committed', async () => {
    const input = await seed();
    await topicModel.cancelIfRunning(input.id, input.topicId);
    expect(await model.recoverInterruptedRun(input)).toBe(true);
    expect((await model.findById(input.id))?.status).toBe('paused');
  });

  it('cancels a confirmed non-current operation without clearing the current run lease', async () => {
    const input = await seed();
    await db.insert(topics).values({ id: 'topic-old', userId });
    await topicModel.add(input.id, 'topic-old', { operationId: 'op-old', seq: 2 });
    expect(
      await model.recoverInterruptedRun({
        currentTopicId: null,
        id: input.id,
        operationId: 'op-old',
        reservationId: null,
        topicId: 'topic-old',
      }),
    ).toBe(false);
    expect(await model.findById(input.id)).toMatchObject({
      currentTopicId: 'topic-1',
      runReservationId: 'run-1',
      status: 'running',
    });
    expect(
      (await topicModel.findByTaskId(input.id)).find((topic) => topic.topicId === 'topic-old')?.status,
    ).toBe('canceled');
  });

  it('does not alter another owner task or topic', async () => {
    const input = await seed();
    expect(await new TaskModel(db, 'other-owner').recoverInterruptedRun(input)).toBe(false);
    expect((await model.findById(input.id))?.status).toBe('running');
    expect((await topicModel.findByTaskId(input.id))[0].status).toBe('running');
  });
});
