// @vitest-environment node
import type { TaskExecutionContract, TaskItem } from '@orvilo/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import type { TaskTopicItem } from '@/database/schemas/task';
import { AiAgentService } from '@/server/services/aiAgent';
import { TaskDispatchService } from '@/server/services/taskDispatch';

import { buildTaskPrompt } from './buildTaskPrompt';
import { TaskRunnerService } from './index';

vi.mock('@/server/services/taskLifecycle', () => ({ TaskLifecycleService: vi.fn() }));
vi.mock('@/server/services/taskWorkspace', () => ({ TaskWorkspaceService: vi.fn() }));
vi.mock('./buildTaskPrompt', () => ({
  // Echo back the inherited contract content (or recompute the live
  // instruction) so the persisted run contract exposes which policy source
  // the prompt was rendered from.
  buildTaskPrompt: vi.fn().mockImplementation(
    async (
      task: TaskItem,
      _deps: unknown,
      _extra: unknown,
      opts?: {
        contractContent?: TaskExecutionContract['content'];
      },
    ) => ({
      acceptanceEnabled: false,
      contractContent: opts?.contractContent ?? { instruction: task.instruction },
      fileIds: [],
      prompt: 'do the thing',
    }),
  ),
}));

afterEach(() => vi.restoreAllMocks());

const baseTask = (overrides: Partial<TaskItem> = {}): TaskItem =>
  ({
    assigneeAgentId: 'agt_assignee',
    assigneeUserId: null,
    config: {},
    executionGeneration: 1,
    id: 'task-1',
    identifier: 'T-1',
    instruction: 'EDITED LIVE instruction',
    status: 'backlog',
    workspaceId: 'ws-1',
    ...overrides,
  }) as TaskItem;

const priorContract: TaskExecutionContract = {
  acceptance: { enabled: false },
  budget: { maxRounds: null, round: 1 },
  content: {
    instruction: 'FROZEN source instruction',
    verify: { criteria: [{ title: 'frozen criterion' }], enabled: true, requirement: 'frozen req' },
  },
  contractId: 'contract-0',
  environment: {},
  revision: 1,
  schemaVersion: 1,
  tools: ['Task'],
  versions: { executionGeneration: 1, planRevision: null },
} as TaskExecutionContract;

const priorTopic = (overrides: Partial<TaskTopicItem> = {}): TaskTopicItem =>
  ({
    contract: priorContract,
    seq: 1,
    status: 'completed',
    taskId: 'task-1',
    topicId: 'tpc_0',
    ...overrides,
  }) as TaskTopicItem;

/** Stub the happy path far enough to observe prepare() and startRun(). */
const setupHappyPath = (task: TaskItem, topics: TaskTopicItem[] = []) => {
  vi.spyOn(TaskModel.prototype, 'resolve').mockResolvedValue(task);
  vi.spyOn(TaskModel.prototype, 'areAllDependenciesCompleted').mockResolvedValue(true);
  vi.spyOn(TaskModel.prototype, 'claimRunKickoff').mockResolvedValue(true);
  vi.spyOn(TaskTopicModel.prototype, 'findByTaskId').mockResolvedValue(topics);
  vi.spyOn(TaskModel.prototype, 'reserveRun').mockResolvedValue(true);
  vi.spyOn(TaskModel.prototype, 'renewRunReservation').mockResolvedValue(true);
  vi.spyOn(TaskModel.prototype, 'updateTaskConfig').mockResolvedValue(null as never);
  vi.spyOn(TaskModel.prototype, 'updateWithLog').mockResolvedValue(null as never);
  vi.spyOn(TaskModel.prototype, 'updateCurrentTopic').mockResolvedValue(undefined);
  vi.spyOn(TaskModel.prototype, 'incrementTopicCount').mockResolvedValue(undefined);
  vi.spyOn(TaskModel.prototype, 'updateHeartbeat').mockResolvedValue(undefined);
  vi.spyOn(TaskModel.prototype, 'releaseRunReservation').mockResolvedValue(true);
  vi.spyOn(TaskModel.prototype, 'releaseRunKickoff').mockResolvedValue(undefined);
  vi.spyOn(TaskModel.prototype, 'failRunReservation').mockResolvedValue(undefined as never);
  vi.spyOn(TaskModel.prototype, 'getCheckpointConfig').mockReturnValue({
    onAgentRequest: false,
  } as never);
  vi.spyOn(TaskModel.prototype, 'getReviewConfig').mockReturnValue(undefined);
  vi.spyOn(TaskTopicModel.prototype, 'startRun').mockResolvedValue(undefined as never);
  const prepare = vi.spyOn(TaskDispatchService.prototype, 'prepare').mockResolvedValue({
    dispatch: { generation: 1, id: 'dsp-1' } as never,
    fence: 1,
    owner: 'test-owner',
    task,
  });
  vi.spyOn(TaskDispatchService.prototype, 'transition').mockResolvedValue(undefined as never);
  vi.spyOn(TaskDispatchService.prototype, 'settle').mockResolvedValue(undefined as never);
  const execAgent = vi
    .spyOn(AiAgentService.prototype, 'execAgent')
    .mockImplementation(async (input: any) => {
      // Drive the registration callback so the persisted contract — the
      // authoritative policy record — is observable via startRun.
      await input.beforeOperationStart?.({ operationId: 'op-1', topicId: 'tpc_1' });
      return { operationId: 'op-1', success: true, topicId: 'tpc_1' } as never;
    });
  return { execAgent, prepare };
};

const newRunner = () => {
  const db = {} as { transaction: (callback: (tx: unknown) => Promise<void>) => Promise<void> };
  db.transaction = async (callback) => callback(db);
  const service = new TaskRunnerService(db as never, 'user-1', 'ws-1');
  (service as unknown as { agentModel: unknown }).agentModel = {
    getAgentModelConfig: vi.fn().mockResolvedValue({ model: 'm', provider: 'p' }),
    getBuiltinAgent: vi.fn(),
  };
  (service as unknown as { delegationService: unknown }).delegationService = {
    assertMayCommit: vi.fn().mockResolvedValue(undefined),
    claimExecutionEpoch: vi.fn().mockResolvedValue(7),
  };
  return service;
};

const runParams = {
  idempotencyKey: 'k-1',
  taskId: 'task-1',
  workspaceOverride: { workingDirectory: '/tmp/wt', workingDirectoryConfig: {} as never },
};

describe('TaskRunnerService run intent (SA05-A)', () => {
  it('repair re-executes the frozen source contract, not the live-edited task', async () => {
    const task = baseTask();
    setupHappyPath(task, [priorTopic()]);

    await newRunner().runTask({ ...runParams, intent: 'repair' });

    // The prompt renders from the persisted contract — the in-place Task
    // edit after the source attempt does not rewrite the repair's policy.
    expect(vi.mocked(buildTaskPrompt).mock.calls[0]?.[3]).toEqual({
      contractContent: priorContract.content,
    });
    expect(vi.mocked(TaskTopicModel.prototype.startRun)).toHaveBeenCalledWith(
      'task-1',
      'tpc_1',
      expect.objectContaining({
        contract: expect.objectContaining({
          content: expect.objectContaining({ instruction: 'FROZEN source instruction' }),
          revision: 2,
          sourceContractId: 'contract-0',
        }),
      }),
    );
  });

  it('defaults to repair semantics when no intent is given', async () => {
    const task = baseTask();
    setupHappyPath(task, [priorTopic()]);

    await newRunner().runTask(runParams);

    expect(vi.mocked(buildTaskPrompt).mock.calls[0]?.[3]).toEqual({
      contractContent: priorContract.content,
    });
  });

  it('refuses an authorized replan without an explicit approver', async () => {
    const task = baseTask();
    const { prepare, execAgent } = setupHappyPath(task, [priorTopic()]);

    await expect(
      newRunner().runTask({ ...runParams, intent: 'authorized_replan' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(vi.mocked(buildTaskPrompt)).not.toHaveBeenCalled();
    expect(execAgent).not.toHaveBeenCalled();
    void prepare;
  });

  it('an approved replan rebuilds constraints from the live task as a new revision', async () => {
    const task = baseTask();
    setupHappyPath(task, [priorTopic()]);

    await newRunner().runTask({
      ...runParams,
      intent: 'authorized_replan',
      replanApprovedBy: 'user-reviewer',
    });

    expect(vi.mocked(buildTaskPrompt).mock.calls[0]?.[3]).toEqual({
      contractContent: undefined,
    });
    expect(vi.mocked(TaskTopicModel.prototype.startRun)).toHaveBeenCalledWith(
      'task-1',
      'tpc_1',
      expect.objectContaining({
        contract: expect.objectContaining({
          content: { instruction: 'EDITED LIVE instruction' },
          revision: 2,
          sourceContractId: 'contract-0',
        }),
      }),
    );
  });
});

describe('TaskRunnerService settlement evidence (SA05-B)', () => {
  it('marker params without a verifiable association do not mint an internal claim', async () => {
    const task = baseTask();
    const { prepare } = setupHappyPath(task, [
      // A topic exists but is not owned by the claimed parent operation.
      priorTopic({ operationId: 'op-other', status: 'completed' }),
    ]);

    await newRunner().runTask({
      ...runParams,
      parentOperationId: 'op-bogus',
      skipTaskVerification: true,
    });

    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'external', settlementGrant: undefined }),
    );
  });

  it('a verified integration seed enters as internal with a persisted grant', async () => {
    const task = baseTask();
    const seedTopic = priorTopic({
      dispatchId: 'dsp-src',
      integration: {
        attempts: 0,
        baseBranch: 'main',
        branch: 'task/T-1',
        role: 'task',
        runTopicId: 'tpc_0',
        state: 'conflict',
      },
      operationId: 'op-src',
    });
    const { prepare } = setupHappyPath(task, [seedTopic]);

    await newRunner().runTask({
      ...runParams,
      integrationSeed: seedTopic.integration ?? undefined,
    });

    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'internal',
        settlementGrant: {
          kind: 'integration_seed',
          sourceOperationId: 'op-src',
          sourceTopicId: 'tpc_0',
        },
        sourceDispatchId: 'dsp-src',
      }),
    );
  });

  it('a reservation takeover enters as internal only for the live reservation token', async () => {
    const task = baseTask({ runReservationId: 'reservation-9' });
    const { prepare } = setupHappyPath(task);

    await newRunner().runTask({ ...runParams, replaceReservationId: 'reservation-9' });

    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'internal',
        settlementGrant: { kind: 'reservation_takeover' },
      }),
    );
  });

  it('a stale reservation token cannot claim internal settlement', async () => {
    const task = baseTask({ runReservationId: 'reservation-9' });
    const { prepare } = setupHappyPath(task);

    await newRunner().runTask({ ...runParams, replaceReservationId: 'reservation-OLD' });

    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ origin: 'external' }));
  });
});
