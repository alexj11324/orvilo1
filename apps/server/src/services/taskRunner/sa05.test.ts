// @vitest-environment node
import type { TaskExecutionContract, TaskItem } from '@orvilo/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import type { ActionApprovalItem } from '@/database/schemas/actionApproval';
import type { TaskTopicItem } from '@/database/schemas/task';
import type * as AgentDelegationModule from '@/server/services/agentDelegation';
import type { ConsumeForDispatchOutcome } from '@/server/services/agentDelegation/actionApprovals';
import { AiAgentService } from '@/server/services/aiAgent';
import { TaskDispatchService } from '@/server/services/taskDispatch';

import { buildTaskPrompt } from './buildTaskPrompt';
import { TaskRunnerService } from './index';

vi.mock('@/server/services/taskLifecycle', () => ({ TaskLifecycleService: vi.fn() }));
vi.mock('@/server/services/taskWorkspace', () => ({ TaskWorkspaceService: vi.fn() }));
// `consumeForDispatch` is an instance field (arrow), not a prototype method —
// intercept the class via the barrel so tests control the scoped single-use
// approval lookup bound to the prepared dispatch.
const consumeApprovalMock = vi.fn<
  (params: {
    approvalId: string;
    dispatchId: string;
    expected: {
      actionType: string;
      baseVersion?: number | null;
      targetId: string;
      targetType: string;
      workspaceId: string | null;
    };
  }) => Promise<ConsumeForDispatchOutcome>
>();
vi.mock('@/server/services/agentDelegation', async (importOriginal) => {
  const mod = await importOriginal<typeof AgentDelegationModule>();
  return {
    ...mod,
    ActionApprovalService: function () {
      return { consumeForDispatch: consumeApprovalMock };
    },
  };
});
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

afterEach(() => {
  consumeApprovalMock.mockReset();
  vi.restoreAllMocks();
});

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

const approvalGrant = (overrides: Partial<ActionApprovalItem> = {}): ActionApprovalItem =>
  ({
    actionType: 'task.replan',
    approverUserId: 'user-reviewer',
    baseVersion: null,
    expiresAt: null,
    id: 'apv-1',
    targetId: 'task-1',
    targetType: 'task',
    workspaceId: 'ws-1',
    ...overrides,
  }) as ActionApprovalItem;

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

  it('C01 — refuses an authorized replan without an approval id', async () => {
    const task = baseTask();
    const { prepare, execAgent } = setupHappyPath(task, [priorTopic()]);

    await expect(
      newRunner().runTask({ ...runParams, intent: 'authorized_replan' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(vi.mocked(buildTaskPrompt)).not.toHaveBeenCalled();
    expect(execAgent).not.toHaveBeenCalled();
    void prepare;
  });

  it('C01 — a caller-supplied approver string alone is never evidence', async () => {
    const task = baseTask();
    setupHappyPath(task, [priorTopic()]);
    consumeApprovalMock.mockResolvedValue({ kind: 'missing' });

    await expect(
      newRunner().runTask({
        ...runParams,
        intent: 'authorized_replan',
        replanApprovalId: 'apv-missing',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(consumeApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: 'apv-missing' }),
    );
  });

  it('C01 — a replan approval minted for another task cannot authorize this one', async () => {
    const task = baseTask();
    setupHappyPath(task, [priorTopic()]);
    consumeApprovalMock.mockResolvedValue({
      approval: approvalGrant({ targetId: 'task-OTHER' }),
      kind: 'scope_mismatch',
    });

    await expect(
      newRunner().runTask({
        ...runParams,
        intent: 'authorized_replan',
        replanApprovalId: 'apv-1',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('C01 — an approval against a stale constraint revision cannot authorize the replan', async () => {
    const task = baseTask({ requirementRevision: 3 });
    setupHappyPath(task, [
      priorTopic({
        contract: {
          ...priorContract,
          versions: { ...priorContract.versions, requirementRevision: 2 },
        },
      }),
    ]);
    consumeApprovalMock.mockResolvedValue({
      approval: approvalGrant({ baseVersion: 2 }),
      kind: 'revision_mismatch',
    });

    await expect(
      newRunner().runTask({
        ...runParams,
        intent: 'authorized_replan',
        replanApprovalId: 'apv-1',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('C01 — an approved replan derives approvedBy server-side and rebuilds from the live task', async () => {
    const task = baseTask();
    setupHappyPath(task, [priorTopic()]);
    consumeApprovalMock.mockResolvedValue({ approval: approvalGrant(), kind: 'consumed' });

    const result = await newRunner().runTask({
      ...runParams,
      intent: 'authorized_replan',
      replanApprovalId: 'apv-1',
    });

    expect(consumeApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: 'apv-1',
        expected: {
          actionType: 'task.replan',
          baseVersion: task.requirementRevision,
          targetId: 'task-1',
          targetType: 'task',
          workspaceId: 'ws-1',
        },
      }),
    );
    expect(vi.mocked(buildTaskPrompt).mock.calls[0]?.[3]).toEqual({
      contractContent: undefined,
    });
    expect(vi.mocked(TaskTopicModel.prototype.startRun)).toHaveBeenCalledWith(
      'task-1',
      'tpc_1',
      expect.objectContaining({
        contract: expect.objectContaining({
          content: { instruction: 'EDITED LIVE instruction' },
          intent: 'authorized_replan',
          replan: {
            approvalId: 'apv-1',
            approvedBy: 'user-reviewer',
            changedFields: expect.arrayContaining(['instruction']),
          },
          revision: 2,
          sourceContractId: 'contract-0',
        }),
      }),
    );
    expect(result.contract).toEqual(
      expect.objectContaining({ constraintEdits: 'adopted', intent: 'authorized_replan' }),
    );
  });

  it('SC05 — the consume binds the prepared dispatch and a same-dispatch retry re-adopts', async () => {
    const task = baseTask();
    setupHappyPath(task, [priorTopic()]);
    // The dispatch prepared under THIS idempotency key already holds the
    // grant — a transient failure followed by a retry must not demand a
    // fresh approval nor attempt to consume twice.
    consumeApprovalMock.mockResolvedValue({ approval: approvalGrant(), kind: 'adopted' });

    const result = await newRunner().runTask({
      ...runParams,
      intent: 'authorized_replan',
      replanApprovalId: 'apv-1',
    });

    expect(consumeApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: 'apv-1', dispatchId: 'dsp-1' }),
    );
    expect(result.contract).toEqual(expect.objectContaining({ intent: 'authorized_replan' }));
  });

  it('SC05 — a grant consumed by a different dispatch is a conflict, not a retryable spend', async () => {
    const task = baseTask();
    setupHappyPath(task, [priorTopic()]);
    consumeApprovalMock.mockResolvedValue({
      approval: approvalGrant({ consumedAt: new Date(), consumedByDispatchId: 'dsp-OTHER' }),
      kind: 'unavailable',
    });

    await expect(
      newRunner().runTask({
        ...runParams,
        intent: 'authorized_replan',
        replanApprovalId: 'apv-1',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('C01 — a manual run on a drifted contract conflicts instead of silently re-running it', async () => {
    const task = baseTask({ requirementRevision: 2 });
    const { execAgent } = setupHappyPath(task, [
      priorTopic({
        contract: {
          ...priorContract,
          versions: { ...priorContract.versions, requirementRevision: 1 },
        },
      }),
    ]);

    await expect(newRunner().runTask(runParams)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(execAgent).not.toHaveBeenCalled();
  });

  it('C01 — an explicit repair on a drifted contract runs frozen and reports edits pending', async () => {
    const task = baseTask({ requirementRevision: 2 });
    setupHappyPath(task, [
      priorTopic({
        contract: {
          ...priorContract,
          versions: { ...priorContract.versions, requirementRevision: 1 },
        },
      }),
    ]);

    const result = await newRunner().runTask({ ...runParams, intent: 'repair' });

    expect(vi.mocked(buildTaskPrompt).mock.calls[0]?.[3]).toEqual({
      contractContent: priorContract.content,
    });
    expect(result.contract).toEqual(
      expect.objectContaining({
        constraintEdits: 'pending',
        intent: 'repair',
        sourceContractId: 'contract-0',
      }),
    );
  });

  it('C02 — sourceContractId pins the repaired delivery, not the latest seq', async () => {
    const task = baseTask();
    const olderContract = {
      ...priorContract,
      content: { instruction: 'OLDER frozen instruction' },
      contractId: 'contract-A',
      revision: 1,
    } as TaskExecutionContract;
    const newerContract = {
      ...priorContract,
      content: { instruction: 'NEWER frozen instruction' },
      contractId: 'contract-B',
      revision: 2,
    } as TaskExecutionContract;
    setupHappyPath(task, [
      priorTopic({ contract: olderContract, seq: 1, topicId: 'tpc_a' }),
      priorTopic({ contract: newerContract, seq: 2, topicId: 'tpc_b' }),
    ]);

    const result = await newRunner().runTask({
      ...runParams,
      intent: 'repair',
      sourceContractId: 'contract-A',
    });

    expect(vi.mocked(buildTaskPrompt).mock.calls[0]?.[3]).toEqual({
      contractContent: olderContract.content,
    });
    expect(result.contract).toEqual(expect.objectContaining({ sourceContractId: 'contract-A' }));
    expect(vi.mocked(TaskTopicModel.prototype.startRun)).toHaveBeenCalledWith(
      'task-1',
      'tpc_1',
      expect.objectContaining({
        contract: expect.objectContaining({
          content: expect.objectContaining({ instruction: 'OLDER frozen instruction' }),
          sourceContractId: 'contract-A',
        }),
      }),
    );
  });

  it('C02 — an unknown sourceContractId is an explicit error, not a fallback', async () => {
    const task = baseTask();
    const { execAgent } = setupHappyPath(task, [priorTopic()]);

    await expect(
      newRunner().runTask({
        ...runParams,
        intent: 'repair',
        sourceContractId: 'contract-NOPE',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(execAgent).not.toHaveBeenCalled();
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

  it('a verified integration seed enters as internal with a bound grant', async () => {
    const task = baseTask();
    const seedTopic = priorTopic({
      dispatchId: 'dsp-src',
      executionGeneration: 1,
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
        settlementGrant: expect.objectContaining({
          allowedIntents: ['repair'],
          expiresAt: expect.any(String),
          kind: 'integration_seed',
          sourceDispatchId: 'dsp-src',
          sourceGeneration: 1,
          sourceOperationId: 'op-src',
          sourceTopicId: 'tpc_0',
          workspaceId: 'ws-1',
        }),
        sourceDispatchId: 'dsp-src',
      }),
    );
  });

  it('a parent operation enters as internal with a bound grant', async () => {
    const task = baseTask();
    const parentTopic = priorTopic({
      dispatchId: 'dsp-parent',
      executionGeneration: 1,
      operationId: 'op-parent',
    });
    const { prepare } = setupHappyPath(task, [parentTopic]);

    await newRunner().runTask({ ...runParams, parentOperationId: 'op-parent' });

    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'internal',
        settlementGrant: expect.objectContaining({
          allowedIntents: ['repair'],
          kind: 'parent_operation',
          sourceDispatchId: 'dsp-parent',
          sourceGeneration: 1,
          sourceOperationId: 'op-parent',
          sourceTopicId: 'tpc_0',
          workspaceId: 'ws-1',
        }),
        sourceDispatchId: 'dsp-parent',
      }),
    );
  });

  it('C03 — a historical parent from a superseded generation cannot claim internal settlement', async () => {
    const task = baseTask({ executionGeneration: 2 });
    const staleParent = priorTopic({
      dispatchId: 'dsp-old',
      executionGeneration: 1,
      operationId: 'op-old',
    });
    const { prepare } = setupHappyPath(task, [staleParent]);

    await newRunner().runTask({ ...runParams, parentOperationId: 'op-old' });

    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'external', settlementGrant: undefined }),
    );
  });

  it('C03 — a historical integration seed from a superseded generation cannot claim internal settlement', async () => {
    const task = baseTask({ executionGeneration: 2 });
    const staleSeed = priorTopic({
      dispatchId: 'dsp-old',
      executionGeneration: 1,
      integration: {
        attempts: 0,
        baseBranch: 'main',
        branch: 'task/T-1',
        role: 'task',
        runTopicId: 'tpc_0',
        state: 'conflict',
      },
    });
    const { prepare } = setupHappyPath(task, [staleSeed]);

    await newRunner().runTask({
      ...runParams,
      integrationSeed: staleSeed.integration ?? undefined,
    });

    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'external', settlementGrant: undefined }),
    );
  });

  it('a reservation takeover enters as internal only for the live reservation token', async () => {
    const task = baseTask({
      runReservationExpiresAt: new Date(Date.now() + 60_000),
      runReservationId: 'reservation-9',
    });
    const { prepare } = setupHappyPath(task);

    await newRunner().runTask({ ...runParams, replaceReservationId: 'reservation-9' });

    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'internal',
        settlementGrant: expect.objectContaining({
          allowedIntents: ['continue', 'repair'],
          kind: 'reservation_takeover',
          reservationId: 'reservation-9',
          workspaceId: 'ws-1',
        }),
      }),
    );
  });

  it('a stale reservation token cannot claim internal settlement', async () => {
    const task = baseTask({
      runReservationExpiresAt: new Date(Date.now() + 60_000),
      runReservationId: 'reservation-9',
    });
    const { prepare } = setupHappyPath(task);

    await newRunner().runTask({ ...runParams, replaceReservationId: 'reservation-OLD' });

    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ origin: 'external' }));
  });

  it('C03 — an expired reservation cannot claim internal settlement', async () => {
    const task = baseTask({
      runReservationExpiresAt: new Date(Date.now() - 60_000),
      runReservationId: 'reservation-9',
    });
    const { prepare } = setupHappyPath(task);

    await newRunner().runTask({ ...runParams, replaceReservationId: 'reservation-9' });

    // The token matches but its validity lapsed — stale evidence, so the
    // claim enters as external and faces the normal admission boundary.
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'external', settlementGrant: undefined }),
    );
  });
});
