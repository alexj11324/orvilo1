// @vitest-environment node
import type { TaskItem } from '@orvilo/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';
import { TaskDependencyError } from '@/database/models/taskDependency';

import { TaskRunnerService } from './index';

vi.mock('@/server/services/taskLifecycle', () => ({ TaskLifecycleService: vi.fn() }));
vi.mock('@/server/services/taskWorkspace', () => ({ TaskWorkspaceService: vi.fn() }));
vi.mock('./buildTaskPrompt', () => ({ buildTaskPrompt: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

const candidate = {
  id: 'task-4',
  identifier: 'T-4',
  status: 'backlog',
  createdByUserId: 'owner',
  visibility: 'public',
} as TaskItem;

describe('prerequisite completion cascade', () => {
  it('leaves a reblocked candidate in backlog and retries on the next completion', async () => {
    vi.spyOn(TaskModel.prototype, 'getUnlockedTasksForMany').mockResolvedValue([candidate]);
    const pause = vi.spyOn(TaskModel.prototype, 'updateStatusIfCurrent').mockResolvedValue(null);
    const run = vi
      .spyOn(TaskRunnerService.prototype, 'runTask')
      .mockRejectedValueOnce(new TaskDependencyError('Reblocked', 'PRECONDITION_FAILED'))
      .mockResolvedValueOnce({ taskId: 'task-4', taskIdentifier: 'T-4', success: true } as never);
    const runner = new TaskRunnerService({} as never, 'owner');
    expect(await runner.cascadeOnCompletionMany(['task-1'])).toEqual({
      failed: [],
      paused: [],
      started: [],
    });
    expect(pause).not.toHaveBeenCalled();
    expect(await runner.cascadeOnCompletionMany(['task-2'])).toEqual({
      failed: [],
      paused: [],
      started: ['T-4'],
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('dispatches an owner-scoped runner when another member completes the last prerequisite', async () => {
    vi.spyOn(TaskModel.prototype, 'getUnlockedTasksForMany').mockResolvedValue([candidate]);
    const identities: string[] = [];
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockImplementation(async function (
      this: TaskRunnerService,
    ) {
      identities.push((this as unknown as { userId: string }).userId);
      return { taskId: candidate.id, taskIdentifier: candidate.identifier, success: true } as never;
    });
    const runner = new TaskRunnerService({} as never, 'other-member', 'workspace');
    expect((await runner.cascadeOnCompletionMany(['public-upstream'])).started).toEqual(['T-4']);
    expect(identities).toEqual(['owner']);
  });
});

describe('private dependency dispatch', () => {
  it.each(['started', 'paused', 'failed'] as const)(
    'does not expose %s private tasks to the completing member',
    async (outcome) => {
      const hidden = {
        ...candidate,
        visibility: 'private' as const,
        parentTaskId: outcome === 'paused' ? 'parent' : null,
      };
      vi.spyOn(TaskModel.prototype, 'getUnlockedTasksForMany').mockResolvedValue([hidden]);
      vi.spyOn(TaskModel.prototype, 'findById').mockResolvedValue({ id: 'parent' } as TaskItem);
      vi.spyOn(TaskModel.prototype, 'shouldPauseBeforeStart').mockReturnValue(outcome === 'paused');
      const pause = vi.spyOn(TaskModel.prototype, 'updateStatusIfCurrent').mockResolvedValue(null);
      const run = vi.spyOn(TaskRunnerService.prototype, 'runTask');
      if (outcome === 'failed') run.mockRejectedValue(new Error('private execution details'));
      else run.mockResolvedValue({ success: true } as never);
      const result = await new TaskRunnerService(
        {} as never,
        'other-member',
        'workspace',
      ).cascadeOnCompletionMany(['public-upstream']);
      expect(result).toEqual({ failed: [], paused: [], started: [] });
      if (outcome === 'paused') expect(run).not.toHaveBeenCalled();
      else expect(run).toHaveBeenCalledWith({ taskId: hidden.id });
      if (outcome !== 'started') expect(pause).toHaveBeenCalled();
    },
  );

  it('still reports private dispatch to the dependent owner', async () => {
    vi.spyOn(TaskModel.prototype, 'getUnlockedTasksForMany').mockResolvedValue([
      { ...candidate, visibility: 'private' },
    ]);
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({ success: true } as never);
    expect(
      (
        await new TaskRunnerService({} as never, 'owner', 'workspace').cascadeOnCompletionMany([
          'public-upstream',
        ])
      ).started,
    ).toEqual(['T-4']);
  });
});
