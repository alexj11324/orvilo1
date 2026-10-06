// @vitest-environment node
import type { AutomationOccurrenceSnapshot, TaskExecutionContract, TaskItem } from '@orvilo/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BriefModel } from '@/database/models/brief';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import type { ActionApprovalItem } from '@/database/schemas/actionApproval';
import type { TaskTopicItem } from '@/database/schemas/task';
import type * as AgentDelegationModule from '@/server/services/agentDelegation';
import type { ConsumeForDispatchOutcome } from '@/server/services/agentDelegation/actionApprovals';
import { AiAgentService } from '@/server/services/aiAgent';
import { TaskDispatchService } from '@/server/services/taskDispatch';

import type * as TaskPromptModule from './buildTaskPrompt';
import { buildTaskPrompt } from './buildTaskPrompt';
import { TaskRunnerService } from './index';

vi.mock('@/database/models/goal', () => ({
  GoalModel: class {
    findByGraphTask = async () => undefined;
  },
}));
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
  // Run-start settlement reads and stamps the task through its own model
  // instance — point it at the same fixture row.
  vi.spyOn(TaskModel.prototype, 'findById').mockResolvedValue(task);
  vi.spyOn(TaskModel.prototype, 'updateStatusIfReservation').mockResolvedValue(task);
  vi.spyOn(TaskModel.prototype, 'updateStatusIfCurrent').mockResolvedValue(task);
  vi.spyOn(TaskModel.prototype, 'updateStatus').mockResolvedValue(task);
  vi.spyOn(TaskModel.prototype, 'resolveTaskReviewRequirement').mockResolvedValue(false);
  vi.spyOn(TaskModel.prototype, 'areAllDependenciesCompleted').mockResolvedValue(true);
  vi.spyOn(TaskModel.prototype, 'claimRunKickoff').mockResolvedValue(true);
  vi.spyOn(TaskTopicModel.prototype, 'findByTaskId').mockResolvedValue(topics);
  vi.spyOn(TaskTopicModel.prototype, 'findByTopicId').mockResolvedValue(null);
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
    getAgentConfig: vi.fn().mockResolvedValue({
      agencyConfig: {
        heterogeneousProvider: { type: 'codex' },
        executionTargetSelectionPolicy: 'member',
      },
    }),
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

/** Keep the real prompt renderer and contract assembler; stub only stored context reads. */
const useActualPromptBuilder = async () => {
  vi.spyOn(BriefModel.prototype, 'findByTaskId').mockResolvedValue([]);
  vi.spyOn(TaskModel.prototype, 'getComments').mockResolvedValue([]);
  vi.spyOn(TaskModel.prototype, 'findSubtasks').mockResolvedValue([]);
  vi.spyOn(TaskModel.prototype, 'getDependencies').mockResolvedValue([]);
  vi.spyOn(TaskModel.prototype, 'getTreePinnedDocuments').mockResolvedValue({
    tree: [],
    nodeMap: {},
  });
  vi.spyOn(TaskModel.prototype, 'derivedStatusByIds').mockResolvedValue({ 'task-1': 'scheduled' });
  vi.spyOn(TaskModel.prototype, 'findByIds').mockResolvedValue([]);
  const actual = await vi.importActual<typeof TaskPromptModule>('./buildTaskPrompt');
  vi.mocked(buildTaskPrompt).mockImplementationOnce(actual.buildTaskPrompt);
};

describe('TaskRunnerService run intent (SA05-A)', () => {
  it.each(['schedule', 'heartbeat'] as const)(
    'refuses a parked %s automation before dispatch or runtime effects',
    async (trigger) => {
      const { execAgent, prepare } = setupHappyPath(
        baseTask({
          automationMode: trigger,
          context: { execution: { parked: { at: new Date().toISOString(), reason: 'paused' } } },
        }),
      );

      await expect(newRunner().runTask({ ...runParams, trigger })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'Automation is paused or no longer active.',
      });
      expect(prepare).not.toHaveBeenCalled();
      expect(execAgent).not.toHaveBeenCalled();
    },
  );

  it('blocks unadmitted events before task lookup, dispatch or runtime effects', async () => {
    const { execAgent, prepare } = setupHappyPath(baseTask(), []);
    const resolve = vi.mocked(TaskModel.prototype.resolve);
    await expect(newRunner().runTask({ ...runParams, trigger: 'event' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: 'Event dispatch admission evidence is required',
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(execAgent).not.toHaveBeenCalled();
  });

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

  it('a new occurrence uses the published edit without inheriting the last topic contract', async () => {
    const task = baseTask({
      automationMode: 'schedule',
      status: 'scheduled',
      totalTopics: 1,
      instruction: 'NEW OCCURRENCE: update issue 739',
      config: { model: 'm', provider: 'p', automationDeviceId: 'pinned-device' },
    });
    const { execAgent, prepare } = setupHappyPath(task, [priorTopic()]);
    const occurrence: AutomationOccurrenceSnapshot = {
      occurrenceId: 'schedule-occurrence-2',
      definition: {
        assigneeAgentId: task.assigneeAgentId,
        config: task.config,
        instruction: task.instruction,
        definitionVersionId: 'published-v2',
        policyRevision: 2,
        requirementRevision: 1,
      },
    };
    prepare.mockResolvedValue({
      dispatch: {
        generation: 2,
        id: 'dsp-occurrence-2',
        automationOccurrence: occurrence,
      } as never,
      fence: 2,
      owner: 'owner',
      task,
    });
    const runner = newRunner();
    (runner as any).taskWorkspace = { provision: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(TaskDispatchService.prototype, 'freezeAutomationContent').mockImplementation(
      async (prepared, content, fileIds) => {
        prepared.dispatch.automationOccurrence = { ...occurrence, content, fileIds };
        return prepared.dispatch.automationOccurrence;
      },
    );
    await useActualPromptBuilder();
    const oldTopics = vi
      .spyOn(TaskTopicModel.prototype, 'findWithHandoff')
      .mockResolvedValue([
        { topicId: 'old-topic', handoff: { summary: 'OLD_TOPIC_CONTEXT_MUST_NOT_CONTINUE' } },
      ] as never);

    await runner.runTask({
      taskId: task.id,
      idempotencyKey: 'schedule-occurrence-2',
      trigger: 'schedule',
      intent: 'fresh_occurrence',
    });

    expect(execAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('NEW OCCURRENCE: update issue 739'),
        deviceId: 'pinned-device',
      }),
    );
    expect(execAgent.mock.calls[0]?.[0].prompt).not.toContain('FROZEN source instruction');
    expect(execAgent.mock.calls[0]?.[0].prompt).not.toContain(
      'OLD_TOPIC_CONTEXT_MUST_NOT_CONTINUE',
    );
    expect(oldTopics).not.toHaveBeenCalled();
    const contract = vi.mocked(TaskTopicModel.prototype.startRun).mock.calls[0]?.[2].contract;
    expect(contract).toMatchObject({
      intent: 'fresh_occurrence',
      content: { instruction: task.instruction },
      occurrence: {
        occurrenceId: 'schedule-occurrence-2',
        definition: { definitionVersionId: 'published-v2' },
      },
    });
    expect(contract?.sourceContractId).toBeUndefined();
  });

  it('retries the same occurrence with its original instruction, event input and device after an edit', async () => {
    const task = baseTask({
      automationMode: 'schedule',
      status: 'scheduled',
      instruction: 'LATER EDIT: ignore the report',
      config: { model: 'm', provider: 'p', automationDeviceId: 'later-device' },
    });
    const { execAgent, prepare } = setupHappyPath(task, [priorTopic()]);
    const occurrence: AutomationOccurrenceSnapshot = {
      occurrenceId: 'existing-occurrence',
      definition: {
        assigneeAgentId: task.assigneeAgentId,
        config: { model: 'm', provider: 'p', automationDeviceId: 'original-device' },
        instruction: 'ORIGINAL: investigate this report',
        definitionVersionId: 'published-v1',
        policyRevision: 1,
        requirementRevision: 1,
      },
      content: { instruction: 'ORIGINAL: investigate this report', verify: { enabled: false } },
      input: {
        data: { report: 'UNIQUE_REPORT_931' },
        eventId: 'event-1',
        eventType: 'report',
        inputHash: 'frozen-hash',
        inputRef: 'inbox-1',
        receivedAt: '2026-10-03T00:00:00Z',
        source: 'verified-source',
      },
    };
    prepare.mockResolvedValue({
      dispatch: { generation: 2, id: 'dsp-retry', automationOccurrence: occurrence } as never,
      fence: 2,
      owner: 'owner',
      task,
    });
    const runner = newRunner();
    (runner as any).taskWorkspace = { provision: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(TaskDispatchService.prototype, 'freezeAutomationContent').mockResolvedValue(
      occurrence,
    );
    await useActualPromptBuilder();

    await runner.runTask({
      taskId: task.id,
      idempotencyKey: 'existing-occurrence',
      trigger: 'schedule',
      intent: 'fresh_occurrence',
    });

    const execInput = execAgent.mock.calls[0]?.[0];
    expect(execInput).toMatchObject({ deviceId: 'original-device' });
    expect(execInput?.prompt).toContain('ORIGINAL: investigate this report');
    expect(execInput?.prompt).toContain('UNIQUE_REPORT_931');
    expect(execInput?.prompt).not.toContain('LATER EDIT');
    const contract = vi.mocked(TaskTopicModel.prototype.startRun).mock.calls[0]?.[2].contract;
    expect(contract?.occurrence).toEqual(occurrence);
    expect(contract?.content?.instruction).toBe('ORIGINAL: investigate this report');
  });

  it.each([
    {
      label: 'a conflicting fixed Agent Device policy',
      agencyConfig: {
        executionTargetSelectionPolicy: 'fixed',
        executionTarget: 'device',
        boundDeviceId: 'other-device',
        heterogeneousProvider: { type: 'codex' },
      },
    },
    {
      label: 'a Prime executor without a Device dispatch host',
      agencyConfig: { heterogeneousProvider: { type: 'orvilo', engine: 'prime' } },
    },
  ])('does not start $label after the automation target is pinned', async ({ agencyConfig }) => {
    const task = baseTask({
      automationMode: 'schedule',
      status: 'scheduled',
      config: { model: 'm', provider: 'p', automationDeviceId: 'pinned-device' },
    });
    const { execAgent } = setupHappyPath(task);
    const runner = newRunner();
    (runner as any).agentModel.getAgentConfig.mockResolvedValue({ agencyConfig });
    vi.spyOn(TaskDispatchService.prototype, 'freezeAutomationContent').mockResolvedValue(
      undefined as never,
    );
    await expect(
      runner.runTask({
        taskId: task.id,
        idempotencyKey: 'fresh-pinned',
        trigger: 'schedule',
        intent: 'fresh_occurrence',
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(execAgent).not.toHaveBeenCalled();
    expect(vi.mocked(TaskTopicModel.prototype.startRun)).not.toHaveBeenCalled();
  });

  it('does not allow a manual caller to use fresh occurrence to adopt unauthorized edits', async () => {
    const { execAgent, prepare } = setupHappyPath(baseTask(), [priorTopic()]);
    await expect(
      newRunner().runTask({
        taskId: 'task-1',
        idempotencyKey: 'new',
        intent: 'fresh_occurrence',
        trigger: 'manual',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(prepare).not.toHaveBeenCalled();
    expect(execAgent).not.toHaveBeenCalled();
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

  it('SC05 — a transient pre-dispatch failure parks the claim so the same key can retry', async () => {
    const task = baseTask();
    const { execAgent } = setupHappyPath(task, [priorTopic()]);
    vi.mocked(buildTaskPrompt).mockRejectedValueOnce(
      new Error('worktree materialization timed out'),
    );

    await expect(newRunner().runTask(runParams)).rejects.toThrow(
      'worktree materialization timed out',
    );
    expect(execAgent).not.toHaveBeenCalled();

    expect(vi.mocked(TaskDispatchService.prototype.transition)).toHaveBeenCalledWith(
      expect.objectContaining({ dispatch: expect.objectContaining({ id: 'dsp-1' }) }),
      expect.objectContaining({
        expected: ['requested', 'claimed', 'provisioning'],
        phase: 'waiting',
        waitingReason: 'dispatch_prepare_retryable',
      }),
    );
    expect(vi.mocked(TaskDispatchService.prototype.settle)).not.toHaveBeenCalledWith(
      expect.anything(),
      'failed',
    );
  });

  it('SC05 — a deterministic refusal still settles the dispatch failed', async () => {
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

    expect(vi.mocked(TaskDispatchService.prototype.settle)).toHaveBeenCalledWith(
      expect.objectContaining({ dispatch: expect.objectContaining({ id: 'dsp-1' }) }),
      'failed',
    );
    expect(vi.mocked(TaskDispatchService.prototype.transition)).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ phase: 'waiting' }),
    );
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
