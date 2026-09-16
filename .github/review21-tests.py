from pathlib import Path

def edit(path, old, new):
    p=Path(path); s=p.read_text()
    if s.count(old)!=1: raise RuntimeError(f'{path}: {s.count(old)} matches for {old[:80]}')
    p.write_text(s.replace(old,new,1))

def append(path,s):
    with Path(path).open('a') as f: f.write(s)

p='packages/database/src/models/__tests__/taskDependency.test.ts'
edit(p, 'import { tasks, users, workspaces }', 'import { taskDependencies, tasks, users, workspaces }')
append(p, r'''

describe('prerequisite review regressions', () => {
  const workspace = async () => {
    const workspaceId = 'prerequisite-review-workspace';
    await db.insert(workspaces).values({
      id: workspaceId, name: 'Review', slug: workspaceId, primaryOwnerId: userId,
    });
    return {
      owner: new TaskModel(db, userId, workspaceId),
      member: new TaskModel(db, otherUserId, workspaceId),
    };
  };

  it('keeps legacy member-authored edges visible to the dependent owner after demotion', async () => {
    const { owner, member } = await workspace();
    const upstream = await owner.create({ instruction: 'Upstream' });
    const dependent = await owner.create({ instruction: 'Shared dependent' });
    await member.addDependency(dependent.id, upstream.id);
    expect((await owner.getDependencies(dependent.id))[0].userId).toBe(userId);
    await db.update(taskDependencies).set({ userId: otherUserId })
      .where(eq(taskDependencies.taskId, dependent.id));
    await owner.updateVisibility(dependent.id, 'private');
    expect(await owner.getDependencies(dependent.id)).toHaveLength(1);
    expect(await member.getDependencies(dependent.id)).toEqual([]);
    await expect(owner.reserveRun(dependent.id, 'blocked')).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(owner.updateStatus(dependent.id, 'completed')).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await owner.removeDependency(dependent.id, upstream.id);
    expect(await owner.getDependencies(dependent.id)).toEqual([]);
  });

  it('evaluates mixed-visibility readiness in the dependent owner scope regardless of the last completer', async () => {
    const { owner, member } = await workspace();
    const privateTask = await owner.create({ instruction: 'Private upstream', visibility: 'private' });
    const publicTask = await member.create({ instruction: 'Public upstream' });
    const dependent = await owner.create({ instruction: 'Shared dependent' });
    await owner.addDependency(dependent.id, privateTask.id);
    await owner.addDependency(dependent.id, publicTask.id);
    await owner.updateStatus(privateTask.id, 'completed');
    expect(await owner.getUnlockedTasks(privateTask.id)).toEqual([]);
    await member.updateStatus(publicTask.id, 'completed');
    expect((await member.getUnlockedTasks(publicTask.id)).map(({ id }) => id)).toEqual([dependent.id]);
    expect(await member.areAllDependenciesCompleted(dependent.id)).toBe(false);
    expect(await owner.areAllDependenciesCompleted(dependent.id)).toBe(true);
  });

  it('rejects creator-only clear-all when another creator has a surviving dependent', async () => {
    const { owner, member } = await workspace();
    const upstream = await owner.create({ instruction: 'Upstream' });
    const unrelated = await owner.create({ instruction: 'Unrelated' });
    const dependent = await member.create({ instruction: 'Surviving dependent' });
    await member.addDependency(dependent.id, upstream.id);
    await expect(owner.deleteAll({ restrictToCreator: true })).rejects.toThrow('dependency links');
    expect(await owner.findById(upstream.id)).not.toBeNull();
    expect(await owner.findById(unrelated.id)).not.toBeNull();
    expect(await member.areAllDependenciesCompleted(dependent.id)).toBe(false);
    expect(await member.getDependencies(dependent.id)).toHaveLength(1);
  });

  it('allows deleting a complete internal dependency set atomically', async () => {
    const upstream = await create('Upstream');
    const dependent = await create('Dependent');
    await model.addDependency(dependent.id, upstream.id);
    expect(await model.deleteAll()).toBe(2);
    expect((await model.list()).total).toBe(0);
  });

  it('does not erase surviving blockers through subtree deletion', async () => {
    const root = await create('Root');
    const child = await model.create({ instruction: 'Child', parentTaskId: root.id });
    const external = await create('External');
    await model.addDependency(external.id, child.id);
    await expect(model.deleteSubtree(root.id)).rejects.toThrow('dependency links');
    expect(await model.findById(root.id)).not.toBeNull();
    expect(await model.findById(child.id)).not.toBeNull();
  });

  it('fences deferred heartbeat writes by token, status, mode and interval while preserving counters', async () => {
    const task = await model.create({ instruction: 'Heartbeat', status: 'scheduled',
      automationMode: 'heartbeat', heartbeatInterval: 600,
      context: { scheduler: { tickToken: 'old', consecutiveFailures: 2 } },
    });
    const patch = { tickToken: 'next', tickMessageId: 'message', scheduledAt: new Date().toISOString() };
    expect(await model.updateContextIfHeartbeatTick(task.id, 'stale', 600, patch)).toBe(false);
    expect(await model.updateContextIfHeartbeatTick(task.id, 'old', 900, patch)).toBe(false);
    expect(await model.updateContextIfHeartbeatTick(task.id, 'old', 600, patch)).toBe(true);
    expect((await model.findById(task.id))?.context).toMatchObject({ scheduler: { ...patch, consecutiveFailures: 2 } });
    expect(await model.updateContextIfHeartbeatTick(task.id, 'old', 600, patch)).toBe(false);
    await model.updateStatus(task.id, 'paused');
    expect(await model.updateContextIfHeartbeatTick(task.id, 'next', 600, patch)).toBe(false);
    await model.update(task.id, { status: 'scheduled', automationMode: 'schedule' });
    expect(await model.updateContextIfHeartbeatTick(task.id, 'next', 600, patch)).toBe(false);
  });
});
''')

p='apps/server/src/services/taskRunner/heartbeatTick.test.ts'
edit(p, "import { BriefModel } from '@/database/models/brief';", "import { BriefModel } from '@/database/models/brief';\nimport { TaskDependencyError } from '@/database/models/taskDependency';")
edit(p, "vi.mock('@/database/server', () => ({", """const { commitTick, scheduleTick, cancelTick } = vi.hoisted(() => ({
  commitTick: vi.fn(), scheduleTick: vi.fn(), cancelTick: vi.fn(),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () { return { updateContextIfHeartbeatTick: commitTick }; }),
}));

vi.mock('@/database/server', () => ({""")
edit(p, "  setTaskSchedulerExecutionCallback: mockSetTaskSchedulerExecutionCallback,", "  setTaskSchedulerExecutionCallback: mockSetTaskSchedulerExecutionCallback,\n  createTaskSchedulerModule: () => ({ scheduleNextTopic: scheduleTick, cancelScheduled: cancelTick }),")
edit(p, "    vi.clearAllMocks();", """    vi.clearAllMocks();
    commitTick.mockReset().mockResolvedValue(true);
    scheduleTick.mockReset().mockResolvedValue('next-message');
    cancelTick.mockReset().mockResolvedValue(undefined);
    mockRunner.runTask.mockReset();""")
edit(p, "  it('runs the task and excludes transient error briefs from tick gating',", r'''  it('durably re-arms a blocked heartbeat without creating an execution', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ context: { scheduler: { tickToken: 'old' } } })]);
    mockRunner.runTask.mockRejectedValue(new TaskDependencyError('Blocked', 'PRECONDITION_FAILED'));
    expect(await runHeartbeatTick(taskId, userId, 'old')).toEqual({ ran: false, reason: 'dependencies-blocked' });
    expect(scheduleTick).toHaveBeenCalledWith({ delay: 30, taskId, userId, tickToken: expect.any(String) });
    expect(commitTick).toHaveBeenCalledWith(taskId, 'old', 30, expect.objectContaining({ tickMessageId: 'next-message' }));
    expect(cancelTick).not.toHaveBeenCalled();
  });

  it('cancels the deferred message when pause or a newer tick wins the CAS', async () => {
    mockSelectTask.mockResolvedValue([baseTask()]);
    mockRunner.runTask.mockRejectedValue(new TaskDependencyError('Blocked', 'PRECONDITION_FAILED'));
    commitTick.mockResolvedValue(false);
    await runHeartbeatTick(taskId, userId);
    expect(cancelTick).toHaveBeenCalledWith('next-message');
  });

  it('propagates queue failures instead of falsely claiming a deferred tick', async () => {
    mockSelectTask.mockResolvedValue([baseTask()]);
    mockRunner.runTask.mockRejectedValue(new TaskDependencyError('Blocked', 'PRECONDITION_FAILED'));
    scheduleTick.mockRejectedValue(new Error('queue offline'));
    await expect(runHeartbeatTick(taskId, userId)).rejects.toThrow('queue offline');
    expect(commitTick).not.toHaveBeenCalled();
  });

  it('does not resume or re-arm an explicitly paused task', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ status: 'paused' })]);
    expect(await runHeartbeatTick(taskId, userId)).toEqual({ ran: false, reason: 'paused' });
    expect(mockRunner.runTask).not.toHaveBeenCalled();
    expect(scheduleTick).not.toHaveBeenCalled();
  });

  it('runs the task and excludes transient error briefs from tick gating',''')

p='apps/server/src/services/taskLifecycle/onTopicComplete.test.ts'
edit(p, "import { TaskLifecycleService } from './index';", "import { TaskDependencyError } from '@/database/models/taskDependency';\n\nimport { TaskLifecycleService } from './index';")
edit(p, "  describe('reason=done', () => {", r'''  describe('reopened prerequisite during completion', () => {
    it('parks the settled run and releases only its completion lease', async () => {
      findById.mockResolvedValue(baseTask({ parentTaskId: 'parent', automationMode: null }));
      const model = (service as any).taskModel;
      model.updateStatusIfReservation.mockRejectedValueOnce(new TaskDependencyError('Reopened', 'PRECONDITION_FAILED'))
        .mockResolvedValueOnce({ id: 'task-1', status: 'paused' });
      await expect(service.onTopicComplete({ operationId: 'op-1', reason: 'done', taskId: 'task-1', taskIdentifier: 'TASK-1', topicId: 'topic-1' })).resolves.toBeUndefined();
      expect(model.updateStatusIfReservation).toHaveBeenLastCalledWith('task-1', 'completion:op-1', 'running', 'paused', { error: expect.stringContaining('prerequisite') });
      expect(model.releaseRunReservation).toHaveBeenCalledWith('task-1', 'completion:op-1');
      expect(cascadeOnCompletion).not.toHaveBeenCalled();
      expect(fakeScheduler.scheduleNextTopic).not.toHaveBeenCalled();
    });

    it('preserves the lease for retry if the recovery write itself fails', async () => {
      findById.mockResolvedValue(baseTask({ parentTaskId: 'parent', automationMode: null }));
      const model = (service as any).taskModel;
      model.updateStatusIfReservation.mockRejectedValueOnce(new TaskDependencyError('Reopened', 'PRECONDITION_FAILED'))
        .mockRejectedValueOnce(new Error('database unavailable'));
      await expect(service.onTopicComplete({ operationId: 'op-1', reason: 'done', taskId: 'task-1', taskIdentifier: 'TASK-1', topicId: 'topic-1' })).rejects.toThrow('database unavailable');
      expect(model.releaseRunReservation).not.toHaveBeenCalled();
    });
  });

  describe('reason=done', () => {''')

p='apps/server/src/routers/lambda/__tests__/integration/task.integration.test.ts'
edit(p, "import { TaskService } from '@/server/services/task';", "import { TaskService } from '@/server/services/task';\nimport { TaskIntegrationService } from '@/server/services/taskIntegration';")
edit(p, "  describe('clearAll', () => {", r'''  describe('guarded deletion cleanup', () => {
    it('rejects a blocked delete with an actionable error before touching worktrees', async () => {
      const upstream = await caller.create({ instruction: 'Upstream' });
      const dependent = await caller.create({ instruction: 'Dependent' });
      await caller.addDependency({ taskId: dependent.data.id, dependsOnId: upstream.data.id });
      const cleanup = vi.spyOn(TaskIntegrationService.prototype, 'cleanupTaskWorktrees').mockResolvedValue(undefined);
      try {
        await expect(caller.delete({ id: upstream.data.id })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(cleanup).not.toHaveBeenCalled();
        expect((await caller.find({ id: upstream.data.id })).data.id).toBe(upstream.data.id);
      } finally { cleanup.mockRestore(); }
    });

    it('uses a pre-delete snapshot but performs cleanup only after the deletion commits', async () => {
      const task = await caller.create({ instruction: 'Removable' });
      const cleanup = vi.spyOn(TaskIntegrationService.prototype, 'cleanupTaskWorktrees').mockImplementation(async (id, snapshot) => {
        expect(await new TaskModel(serverDB, userId).findById(id)).toBeNull();
        expect(Array.isArray(snapshot)).toBe(true);
      });
      try {
        await caller.delete({ id: task.data.id });
        expect(cleanup).toHaveBeenCalledTimes(1);
      } finally { cleanup.mockRestore(); }
    });
  });

  describe('clearAll', () => {''')

p='apps/server/src/services/taskIntegration/__tests__/index.test.ts'
edit(p, "  describe('cleanupTaskWorktrees', () => {", r'''  describe('cleanupTaskWorktrees', () => {
    it('uses the pre-delete snapshot after task-topic rows cascade away', async () => {
      mockTaskTopicModel.findByTaskId.mockResolvedValue([asTopic(seedRecord())]);
      const snapshot = await service.snapshotTaskWorktrees('task_1');
      expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
      mockTaskTopicModel.findByTaskId.mockClear().mockResolvedValue([]);
      await service.cleanupTaskWorktrees('task_1', snapshot);
      expect(mockTaskTopicModel.findByTaskId).not.toHaveBeenCalled();
      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledTimes(1);
      expect(mockTaskTopicModel.updateIntegration).not.toHaveBeenCalled();
    });
''')

p='src/store/task/slices/detail/action.test.ts'
edit(p, "import { toast } from '@lobehub/ui/base-ui';", "import { toast } from '@lobehub/ui/base-ui';\nimport { renderHook } from '@testing-library/react';\n\nimport { useClientDataSWR } from '@/libs/swr';")
edit(p, "describe('TaskDetailSliceAction', () => {", r'''describe('TaskDetailSliceAction', () => {
  it('refreshes an idle mounted detail even before its first collaborative dependency exists', () => {
    useTaskStore.setState({ taskDetailMap: { 'T-1': { identifier: 'T-1', instruction: 'Task', status: 'backlog', dependencies: [] } as any } });
    renderHook(() => useTaskStore.getState().useFetchTaskDetail('T-1'));
    expect(useClientDataSWR).toHaveBeenLastCalledWith(expect.anything(), expect.any(Function), { refreshInterval: 15_000 });
  });

  it('does not poll without a mounted task id', () => {
    renderHook(() => useTaskStore.getState().useFetchTaskDetail());
    expect(useClientDataSWR).toHaveBeenLastCalledWith(null, expect.any(Function), { refreshInterval: 0 });
  });
''')

Path('apps/server/src/services/taskRunner/cascade.test.ts').write_text(r'''// @vitest-environment node
import type { TaskItem } from '@orvilo/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';
import { TaskDependencyError } from '@/database/models/taskDependency';

import { TaskRunnerService } from './index';

vi.mock('@/server/services/taskLifecycle', () => ({ TaskLifecycleService: vi.fn() }));
vi.mock('@/server/services/taskWorkspace', () => ({ TaskWorkspaceService: vi.fn() }));
vi.mock('./buildTaskPrompt', () => ({ buildTaskPrompt: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

const candidate = { id: 'task-4', identifier: 'T-4', status: 'backlog', createdByUserId: 'owner' } as TaskItem;

describe('prerequisite completion cascade', () => {
  it('leaves a reblocked candidate in backlog and retries on the next completion', async () => {
    vi.spyOn(TaskModel.prototype, 'getUnlockedTasksForMany').mockResolvedValue([candidate]);
    const pause = vi.spyOn(TaskModel.prototype, 'updateStatusIfCurrent').mockResolvedValue(null);
    const run = vi.spyOn(TaskRunnerService.prototype, 'runTask')
      .mockRejectedValueOnce(new TaskDependencyError('Reblocked', 'PRECONDITION_FAILED'))
      .mockResolvedValueOnce({ taskId: 'task-4', taskIdentifier: 'T-4', success: true } as never);
    const runner = new TaskRunnerService({} as never, 'owner');
    expect(await runner.cascadeOnCompletionMany(['task-1'])).toEqual({ failed: [], paused: [], started: [] });
    expect(pause).not.toHaveBeenCalled();
    expect(await runner.cascadeOnCompletionMany(['task-2'])).toEqual({ failed: [], paused: [], started: ['T-4'] });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('dispatches an owner-scoped runner when another member completes the last prerequisite', async () => {
    vi.spyOn(TaskModel.prototype, 'getUnlockedTasksForMany').mockResolvedValue([candidate]);
    const identities: string[] = [];
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockImplementation(async function (this: TaskRunnerService) {
      identities.push((this as unknown as { userId: string }).userId);
      return { taskId: candidate.id, taskIdentifier: candidate.identifier, success: true } as never;
    });
    const runner = new TaskRunnerService({} as never, 'other-member', 'workspace');
    expect((await runner.cascadeOnCompletionMany(['public-upstream'])).started).toEqual(['T-4']);
    expect(identities).toEqual(['owner']);
  });
});
''')
