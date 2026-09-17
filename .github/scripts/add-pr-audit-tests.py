from pathlib import Path
r = Path.cwd()
p = r / 'src/store/task/slices/detail/action.test.ts'
s = p.read_text().replace('useClientDataSWR', 'useClientPollingSWR').replace('      refreshInterval: 15_000,', '      dedupingInterval: 1_000,\n      refreshInterval: 15_000,').replace('      refreshInterval: 0,', '      dedupingInterval: 1_000,\n      refreshInterval: 0,')
p.write_text(s)
p = r / 'apps/server/src/services/taskRunner/cascade.test.ts'
s = p.read_text().replace("  createdByUserId: 'owner',", "  createdByUserId: 'owner',\n  visibility: 'public',")
s += '''

describe('private dependency dispatch', () => {
  it.each(['started', 'paused', 'failed'] as const)('does not expose %s private tasks to the completing member', async (outcome) => {
    const hidden = { ...candidate, visibility: 'private' as const, parentTaskId: outcome === 'paused' ? 'parent' : null };
    vi.spyOn(TaskModel.prototype, 'getUnlockedTasksForMany').mockResolvedValue([hidden]);
    vi.spyOn(TaskModel.prototype, 'findById').mockResolvedValue({ id: 'parent' } as TaskItem);
    vi.spyOn(TaskModel.prototype, 'shouldPauseBeforeStart').mockReturnValue(outcome === 'paused');
    const pause = vi.spyOn(TaskModel.prototype, 'updateStatusIfCurrent').mockResolvedValue(null);
    const run = vi.spyOn(TaskRunnerService.prototype, 'runTask');
    if (outcome === 'failed') run.mockRejectedValue(new Error('private execution details'));
    else run.mockResolvedValue({ success: true } as never);
    const result = await new TaskRunnerService({} as never, 'other-member', 'workspace')
      .cascadeOnCompletionMany(['public-upstream']);
    expect(result).toEqual({ failed: [], paused: [], started: [] });
    if (outcome === 'paused') expect(run).not.toHaveBeenCalled();
    else expect(run).toHaveBeenCalledWith({ taskId: hidden.id });
    if (outcome !== 'started') expect(pause).toHaveBeenCalled();
  });

  it('still reports private dispatch to the dependent owner', async () => {
    vi.spyOn(TaskModel.prototype, 'getUnlockedTasksForMany').mockResolvedValue([{ ...candidate, visibility: 'private' }]);
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({ success: true } as never);
    expect((await new TaskRunnerService({} as never, 'owner', 'workspace')
      .cascadeOnCompletionMany(['public-upstream'])).started).toEqual(['T-4']);
  });
});
'''
p.write_text(s)
p = r / 'packages/database/src/models/__tests__/taskDependency.test.ts'
s = p.read_text().replace("import { eq } from 'drizzle-orm';", "import { readFileSync } from 'node:fs';\n\nimport { eq, sql } from 'drizzle-orm';").replace("import { TaskDependencyError } from '../taskDependency';", "import { TaskDependencyError } from '../taskDependency';\nimport { UserModel } from '../user';")
needle = "  it('rejects creator-only clear-all when another creator has a surviving dependent', async () => {"
assert s.count(needle) == 1
s = s.replace(needle, '''  it('dispatch discovery includes a private dependent after another member completes its public source', async () => {
    const { owner, member } = await workspace();
    const upstream = await member.create({ instruction: 'Public upstream' });
    const dependent = await owner.create({ instruction: 'Private dependent', visibility: 'private' });
    await owner.addDependency(dependent.id, upstream.id);
    expect(await member.getUnlockedTasks(upstream.id)).toEqual([]);
    await member.updateStatus(upstream.id, 'completed');
    expect((await member.getUnlockedTasks(upstream.id)).map(({ id }) => id)).toEqual([dependent.id]);
    expect(await member.findById(dependent.id)).toBeNull();
    const personal = new TaskModel(db, otherUserId);
    expect(await personal.getUnlockedTasks(upstream.id)).toEqual([]);
    await owner.update(dependent.id, { isDeleted: true });
    expect(await member.getUnlockedTasks(upstream.id)).toEqual([]);
  });

  it('does not let a caller trigger internal discovery from an inaccessible source', async () => {
    const { owner, member } = await workspace();
    const upstream = await owner.create({ instruction: 'Private upstream', visibility: 'private' });
    const dependent = await owner.create({ instruction: 'Private dependent', visibility: 'private' });
    await owner.addDependency(dependent.id, upstream.id);
    await owner.updateStatus(upstream.id, 'completed');
    expect(await member.getUnlockedTasks(upstream.id)).toEqual([]);
    expect((await owner.getUnlockedTasks(upstream.id)).map(({ id }) => id)).toEqual([dependent.id]);
  });

  it('backfills legacy edge ownership idempotently before the writer deletes their account', async () => {
    const { owner, member } = await workspace();
    const upstream = await owner.create({ instruction: 'Upstream' });
    const dependent = await owner.create({ instruction: 'Dependent' });
    await member.addDependency(dependent.id, upstream.id);
    await db.update(taskDependencies).set({ userId: otherUserId }).where(eq(taskDependencies.taskId, dependent.id));
    const migration = readFileSync(new URL('../../../migrations/0169_task_dependency_ownership.sql', import.meta.url), 'utf8');
    await db.execute(sql.raw(migration));
    await db.execute(sql.raw(migration));
    await UserModel.deleteUser(db, otherUserId);
    expect(await owner.getDependencies(dependent.id)).toMatchObject([{ userId }]);
    await expect(owner.reserveRun(dependent.id, 'still-blocked')).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await owner.updateStatus(upstream.id, 'completed');
    expect(await owner.reserveRun(dependent.id, 'now-ready')).toBe(true);
  });

''' + needle)
p.write_text(s)
p = r / 'apps/server/src/services/task/index.test.ts'
s = p.read_text().replace('    areAllDependenciesCompleted: vi.fn().mockResolvedValue(true),', '    areAllDependenciesCompleted: vi.fn().mockResolvedValue(true),\n    recoverInterruptedRun: vi.fn().mockResolvedValue(true),', 1)
needle = "  describe('prerequisite gating', () => {"
assert s.count(needle) == 1
s = s.replace(needle, '''  describe('interrupted state-change recovery', () => {
    const snapshot = {
      currentTopicId: 'topic-1', id: 'task-1', identifier: 'T-1',
      runReservationId: 'run-1', status: 'running',
    };
    const running = { taskId: 'task-1', topicId: 'topic-1', operationId: 'op-1', status: 'running' };
    const expectedRecovery = {
      currentTopicId: 'topic-1', id: 'task-1', operationId: 'op-1',
      reservationId: 'run-1', topicId: 'topic-1',
    };
    const rejected = new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Upstream reopened' });

    it.each(['single', 'cascade'])('recovers the confirmed generation when %s completion is reblocked after interruption', async (path) => {
      mockTaskModel.resolve.mockResolvedValue(snapshot);
      mockTaskModel.findAllDescendants.mockResolvedValue([]);
      mockTaskTopicModel.findRunningByTaskIds.mockResolvedValue([running]);
      mockTaskTopicModel.findByTaskId.mockResolvedValue([running]);
      mockTaskTopicModel.cancelRunningByTaskIds.mockResolvedValue([running]);
      mockTaskModel.updateStatus.mockRejectedValueOnce(rejected);
      mockTaskModel.updateStatusForIds.mockImplementationOnce(() => { throw rejected; });
      db.transaction = vi.fn(async (fn: any) => fn(db)) as any;
      const service = new TaskService(db, userId);
      const write = path === 'single'
        ? service.updateStatus({ id: 'T-1', status: 'completed' })
        : service.updateStatusCascade({ id: 'T-1', status: 'completed' });
      await expect(write).rejects.toBe(rejected);
      expect(interruptTaskMock).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'op-1' }));
      expect(mockTaskModel.recoverInterruptedRun).toHaveBeenCalledExactlyOnceWith(expectedRecovery);
      expect(taskWorktreeCleanupMock).not.toHaveBeenCalled();
      expect(cascadeManyMock).not.toHaveBeenCalled();
      mockTaskModel.updateStatus.mockReset();
      mockTaskModel.updateStatusForIds.mockReset();
    });

    it('recovers only confirmed interruptions after a partial family failure', async () => {
      mockTaskModel.resolve.mockResolvedValue(snapshot);
      mockTaskModel.findAllDescendants.mockResolvedValue([{ ...snapshot, id: 'task-2', currentTopicId: 'topic-2' }]);
      mockTaskTopicModel.findRunningByTaskIds.mockResolvedValue([
        running, { ...running, taskId: 'task-2', topicId: 'topic-2', operationId: 'op-2' },
      ]);
      interruptTaskMock.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
      await expect(new TaskService(db, userId).updateStatusCascade({ id: 'T-1', status: 'completed' }))
        .rejects.toThrow('Task interruption was not confirmed');
      expect(mockTaskModel.recoverInterruptedRun).toHaveBeenCalledExactlyOnceWith(expectedRecovery);
      expect(mockTaskModel.updateStatusForIds).not.toHaveBeenCalled();
      expect(taskWorktreeCleanupMock).not.toHaveBeenCalled();
    });

    it('surfaces a failed recovery rather than silently leaving a stopped run live', async () => {
      mockTaskModel.resolve.mockResolvedValue(snapshot);
      mockTaskTopicModel.findByTaskId.mockResolvedValue([running]);
      mockTaskModel.updateStatus.mockRejectedValueOnce(rejected);
      mockTaskModel.recoverInterruptedRun.mockRejectedValueOnce(new Error('Recovery database unavailable'));
      await expect(new TaskService(db, userId).updateStatus({ id: 'T-1', status: 'completed' }))
        .rejects.toMatchObject({ errors: [rejected, expect.any(Error)] });
    });
  });

''' + needle)
p.write_text(s)
(r / 'packages/database/src/models/__tests__/taskInterruptedRun.test.ts').write_text('''// @vitest-environment node
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
afterEach(async () => { await db.delete(users); });

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
  return { currentTopicId: 'topic-1', id: task.id, operationId: 'op-1', reservationId: 'run-1', topicId: 'topic-1' };
};

describe('confirmed interruption compensation', () => {
  it('parks the interrupted generation and cancels its topic after dependency rejection', async () => {
    const input = await seed();
    await expect(model.updateStatus(input.id, 'completed')).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(await model.recoverInterruptedRun(input)).toBe(true);
    expect(await model.findById(input.id)).toMatchObject({ status: 'paused', runReservationId: null, runReservationExpiresAt: null });
    expect((await topicModel.findByTaskId(input.id))[0].status).toBe('canceled');
    expect((await db.select().from(topics).where(eq(topics.id, input.topicId)))[0].completedAt).not.toBeNull();
    expect(await model.recoverInterruptedRun(input)).toBe(false);
  });

  it.each(['reservation', 'topic', 'terminal', 'operation'])('does not overwrite a newer %s fence', async (fence) => {
    const input = await seed();
    if (fence === 'reservation') await db.update(tasks).set({ runReservationId: 'run-2' }).where(eq(tasks.id, input.id));
    if (fence === 'topic') {
      await db.insert(topics).values({ id: 'topic-2', userId });
      await topicModel.add(input.id, 'topic-2', { operationId: 'op-2', seq: 2 });
      await db.update(tasks).set({ currentTopicId: 'topic-2', runReservationId: 'run-2' }).where(eq(tasks.id, input.id));
    }
    if (fence === 'terminal') await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, input.id));
    if (fence === 'operation') await db.update(taskTopics).set({ operationId: 'op-2' }).where(eq(taskTopics.taskId, input.id));
    const before = await model.findById(input.id);
    expect(await model.recoverInterruptedRun(input)).toBe(false);
    expect(await model.findById(input.id)).toEqual(before);
    if (fence === 'topic') expect((await topicModel.findByTaskId(input.id)).find(t => t.topicId === 'topic-2')?.status).toBe('running');
    if (fence === 'operation') expect((await topicModel.findByTaskId(input.id))[0].status).toBe('running');
  });

  it('recovers a single-task path whose topic cancellation was already committed', async () => {
    const input = await seed();
    await topicModel.cancelIfRunning(input.id, input.topicId);
    expect(await model.recoverInterruptedRun(input)).toBe(true);
    expect((await model.findById(input.id))?.status).toBe('paused');
  });

  it('does not alter another owner task or topic', async () => {
    const input = await seed();
    expect(await new TaskModel(db, 'other-owner').recoverInterruptedRun(input)).toBe(false);
    expect((await model.findById(input.id))?.status).toBe('running');
    expect((await topicModel.findByTaskId(input.id))[0].status).toBe('running');
  });
});
''')
(r / 'src/store/task/slices/detail/polling.test.tsx').write_text('''// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTaskStore } from '../../store';

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({ useActiveWorkspaceId: () => undefined }));
vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import('~base-ui-stubs')).baseUiStubs,
}));

afterEach(() => { vi.useRealTimers(); });

describe('task detail shared polling', () => {
  it('deduplicates staggered page/drawer subscriptions without skipping the next idle tick', async () => {
    vi.useFakeTimers();
    const detail = { id: 'task-1', identifier: 'T-1', instruction: 'Task', status: 'backlog', dependencies: [] } as any;
    const fetchTaskDetail = vi.fn().mockResolvedValue(detail);
    useTaskStore.setState({ taskDetailMap: { 'T-1': detail }, fetchTaskDetail });
    const cache = new Map();
    const wrapper = ({ children }: PropsWithChildren) => createElement(SWRConfig, {
      value: { provider: () => cache, isVisible: () => true, isOnline: () => true },
    }, children);
    const page = renderHook(() => useTaskStore.getState().useFetchTaskDetail('T-1'), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(fetchTaskDetail).toHaveBeenCalledTimes(1);
    const drawer = renderHook(() => useTaskStore.getState().useFetchTaskDetail('T-1'), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(fetchTaskDetail).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(fetchTaskDetail).toHaveBeenCalledTimes(2);
    page.unmount(); drawer.unmount();
  });
});
''')
