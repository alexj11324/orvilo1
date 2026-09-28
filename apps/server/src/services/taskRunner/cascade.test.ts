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

  it('routes an unlocked dependent through the orchestrator dispatch gate', async () => {
    const task = {
      domainRevision: 3,
      executionGeneration: 2,
      id: 'task-child',
      identifier: 'TASK-2',
      parentTaskId: null,
    } as TaskItem;
    const service = new TaskRunnerService({} as any, 'user-1', 'workspace-1');
    (service as any).taskModel = {
      getDependents: vi.fn().mockResolvedValue([]),
      getUnlockedTasksForMany: vi.fn().mockResolvedValue([task]),
    };
    const runTask = vi.spyOn(service, 'runTask').mockResolvedValue({
      operationId: 'operation-1',
      success: true,
      taskId: task.id,
      taskIdentifier: task.identifier,
      topicId: 'topic-1',
    } as any);

    await expect(service.cascadeOnCompletionMany(['task-parent'])).resolves.toEqual({
      failed: [],
      paused: [],
      started: ['TASK-2'],
    });
    expect(runTask).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: task.id, trigger: 'orchestrator' }),
    );
  });

  describe('stale dependency inputs', () => {
    const serviceWith = ({ runningTopics, upstreamTopics }: any) => {
      const service = new TaskRunnerService({} as any, 'user-1', 'workspace-1');
      (service as any).taskModel = {
        getDependents: vi.fn().mockResolvedValue([{ taskId: 'task-dep', type: 'blocks' }]),
        getUnlockedTasksForMany: vi.fn().mockResolvedValue([]),
      };
      const markInputStale = vi.fn().mockResolvedValue(undefined);
      (service as any).taskTopicModel = {
        findByTaskId: vi.fn().mockResolvedValue(upstreamTopics),
        findRunningByTaskIds: vi.fn().mockResolvedValue(runningTopics),
        markInputStale,
      };
      return { markInputStale, service };
    };

    const runningTopic = (delivery: any) =>
      ({
        contract: {
          content: {
            dependencies: [
              { dependsOnId: 'task-up', delivery, identifier: 'T-UP', type: 'blocks' },
            ],
            instruction: 'downstream work',
          },
        },
        status: 'running',
        topicId: 'topic-dep-1',
      }) as any;

    const completedUpstream = {
      integration: { expectedHeadSha: 'sha-new', integratedSha: 'sha-int-new' },
      operationId: 'op-2',
      seq: 2,
      status: 'completed',
      topicId: 'topic-up-2',
    } as any;

    it('marks a running dependent whose recorded receipt names a superseded delivery', async () => {
      const { markInputStale, service } = serviceWith({
        runningTopics: [
          runningTopic({
            integratedSha: 'sha-int-old',
            sourceSha: 'sha-old',
            topicId: 'topic-up-1',
          }),
        ],
        upstreamTopics: [completedUpstream],
      });

      await service.cascadeOnCompletionMany(['task-up']);

      expect(markInputStale).toHaveBeenCalledWith(
        'task-dep',
        'topic-dep-1',
        expect.objectContaining({
          dependsOnId: 'task-up',
          expectedDelivery: expect.objectContaining({ topicId: 'topic-up-1' }),
          observedDelivery: expect.objectContaining({
            integratedSha: 'sha-int-new',
            topicId: 'topic-up-2',
          }),
        }),
      );
    });

    it('leaves the dependent alone when the recorded receipt still matches the latest delivery', async () => {
      const { markInputStale, service } = serviceWith({
        runningTopics: [
          runningTopic({
            integratedSha: 'sha-int-new',
            sourceSha: 'sha-new',
            topicId: 'topic-up-2',
          }),
        ],
        upstreamTopics: [completedUpstream],
      });

      await service.cascadeOnCompletionMany(['task-up']);

      expect(markInputStale).not.toHaveBeenCalled();
    });

    it('marks the dependent when the upstream rollback left no completed delivery at all', async () => {
      const { markInputStale, service } = serviceWith({
        runningTopics: [
          runningTopic({
            integratedSha: 'sha-int-old',
            sourceSha: 'sha-old',
            topicId: 'topic-up-1',
          }),
        ],
        upstreamTopics: [],
      });

      await service.cascadeOnCompletionMany(['task-up']);

      expect(markInputStale).toHaveBeenCalledWith(
        'task-dep',
        'topic-dep-1',
        expect.objectContaining({ dependsOnId: 'task-up', observedDelivery: null }),
      );
    });
  });
});
