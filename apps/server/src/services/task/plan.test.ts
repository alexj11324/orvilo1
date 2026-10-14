// @vitest-environment node
import type { TaskConfig, TaskContext } from '@orvilo/types';
import Ajv from 'ajv';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import type * as AgentModule from '@/database/models/agent';
import { IssueDeliveryModel } from '@/database/models/issueDelivery';
import { RepositoryModel } from '@/database/models/repository';
import { TaskModel } from '@/database/models/task';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { VerifyRunModel } from '@/database/models/verifyRun';
import {
  agentOperations,
  agents,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
import { acceptances, verifyCheckResults, verifyRuns } from '@/database/schemas/verify';
import type * as WorkspaceGuard from '@/server/routers/lambda/_helpers/workspaceAgentGuard';
import { assertCanUseWorkspaceAgent } from '@/server/routers/lambda/_helpers/workspaceAgentGuard';
import { AiAgentService } from '@/server/services/aiAgent';
import { runAcpJudgment } from '@/server/services/aiGeneration/judgment';
import {
  cancelAutomationOccurrence,
  requireAutomationParent,
  startAutomationPlan,
} from '@/server/services/taskAutomationQueue';
import { TaskDispatchQueuedError } from '@/server/services/taskDispatch';
import { TaskGraphService } from '@/server/services/taskGraph';
import { TaskRunnerService } from '@/server/services/taskRunner';

import { seedReviewedIssueDelivery } from '../../../../../packages/database/tests/fixtures/issueDelivery';
import { IssueChecklistService } from './checklist';
import { TaskService } from './index';
import { issuePlanFingerprint, TaskPlanService } from './plan';

vi.mock('@/database/models/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentModule>();
  return {
    ...actual,
    AgentModel: class extends actual.AgentModel {
      getOrchestratorSourceAgentId = async () => 'issue-plan-agent';
      getAgentSnapshotForTaskCreate = async () => null;
    },
  };
});
vi.mock('@/server/services/aiGeneration/judgment', () => ({ runAcpJudgment: vi.fn() }));
vi.mock('@/server/routers/lambda/_helpers/workspaceAgentGuard', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceGuard>()),
  assertCanUseWorkspaceAgent: vi.fn(),
}));

const db = await getTestDB();
const ws = 'issue-plan-workspace';
const user = 'issue-plan-user';
const id = 'issue-plan-parent';
const agent = 'issue-plan-agent';
const service = () => new TaskPlanService(db, user, ws);
const check = {
  deliveryKind: 'artifact',
  items: [{ id: 'outcome', title: 'Observed outcome', required: true }],
};
const proposal = () => ({
  summary: 'Deliver A and B, then C',
  scope: 'Confirmed request scope',
  reviewerAgentId: agent,
  checklist: check,
  tasks: ['A', 'B', 'C'].map((name, index) => ({
    name,
    instruction: `Deliver ${name}`,
    assigneeAgentId: agent,
    reviewerAgentId: agent,
    dependsOn: index === 2 ? [0, 1] : [],
    checklist: check,
  })),
});

beforeEach(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, ws));
  await db.delete(users).where(eq(users.id, user));
  await db.insert(users).values({ id: user });
  await db.insert(workspaces).values({ id: ws, name: 'Plan QA', slug: ws, primaryOwnerId: user });
  await db.insert(workspaceMembers).values({ workspaceId: ws, userId: user, role: 'owner' });
  await db.insert(agents).values({
    id: agent,
    userId: user,
    workspaceId: ws,
    visibility: 'public',
    model: 'saved-model',
    provider: 'openai',
    agencyConfig: { heterogeneousProvider: { type: 'codex' } },
  });
  await db.insert(tasks).values({
    id,
    identifier: 'PLAN-1',
    seq: 1,
    name: 'Parent',
    instruction: 'Deliver outcome',
    description: 'Request background',
    createdByUserId: user,
    workspaceId: ws,
    workflowCategory: 'triage',
    triageStatus: 'untriaged',
  });
  vi.spyOn(TaskService.prototype, 'runReadySubtasks').mockResolvedValue({
    kickedOff: [],
    failed: [],
    plan: { layers: [], blocked: [], cycles: [] },
  } as never);
  vi.mocked(runAcpJudgment).mockResolvedValue({
    data: proposal(),
    run: { operationId: 'planning-operation', status: 'done' },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Issue plan confirmation', () => {
  it('starts a new explicit planning attempt after a terminal malformed reply', async () => {
    await db.insert(agentOperations).values({
      id: 'failed-planning-reply',
      userId: user,
      workspaceId: ws,
      taskId: id,
      status: 'done',
      appContext: { judgment: { purpose: 'task.plan', attempt: 0 } },
    });

    await service().draftIssuePlan(id);

    expect(vi.mocked(runAcpJudgment).mock.calls[0][2].judgment.attempt).toBe(1);
  });

  it.each(['running', 'unconfirmed-stop'] as const)(
    'does not replace a planning writer that is %s',
    async (state) => {
      await db.insert(agentOperations).values({
        id: 'live-planning-reply',
        userId: user,
        workspaceId: ws,
        taskId: id,
        status: state === 'running' ? 'running' : 'done',
        appContext: { judgment: { purpose: 'task.plan', attempt: 0 } },
        metadata: state === 'unconfirmed-stop' ? { remoteCancel: { state: 'unknown' } } : null,
      });

      await expect(service().draftIssuePlan(id)).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(runAcpJudgment).not.toHaveBeenCalled();
    },
  );

  it('emits a planning schema the judgment validator can compile and enforce', async () => {
    await service().draftIssuePlan(id);
    const input = vi.mocked(runAcpJudgment).mock.calls[0][2].input;
    const validate = new Ajv({ allErrors: true, strict: false }).compile(input.schema!.schema);
    expect(validate(proposal())).toBe(true);
    expect(validate({ ...proposal(), tasks: 'not a task array' })).toBe(false);
  });

  it('keeps an authorized intake repository in the Issue draft without starting delivery', async () => {
    const repository = await new RepositoryModel(db, user, ws).upsertByRemoteIdentity({
      providerHost: 'github.com',
      remoteRepositoryId: 'slack-target',
      coordinate: { owner: 'owner', name: 'slack-repo', defaultBranch: 'canary' },
    });
    const draft = await service().intake({
      name: 'Slack code request',
      instruction: 'Implement the supplied scope',
      repositoryId: repository.id,
    });
    expect(draft.workflowCategory).toBe('triage');
    expect(draft.config).toMatchObject({
      workspace: { repo: 'owner/slack-repo', baseBranch: 'canary' },
    });
    expect((draft.context as TaskContext).issuePlan?.confirmedAt).toBeUndefined();
    expect(TaskService.prototype.runReadySubtasks).not.toHaveBeenCalled();
    await expect(
      service().intake({ name: 'Request', instruction: 'Scope', repositoryId: 'unreadable-repo' }),
    ).rejects.toThrow('Repository not found');
  });
  it('captures a genuine periodic DAG occurrence before launching children and rejects a borrowed principal', async () => {
    await db.update(tasks).set({ automationMode: 'heartbeat' }).where(eq(tasks.id, id));
    const draft = await service().draftIssuePlan(id);
    await service().confirmIssuePlan({ id, revision: draft.plan!.revision });
    expect(TaskService.prototype.runReadySubtasks).not.toHaveBeenCalled();
    const oldGenerations = new Map(
      draft.subtasks.map((task) => [task.id, task.executionGeneration]),
    );
    const parent = (await new TaskModel(db, user, ws).findById(id))!;
    await expect(
      startAutomationPlan(db, user, ws, {
        task: parent,
        trigger: 'heartbeat',
        idempotencyKey: 'heartbeat:first',
      }),
    ).rejects.toBeInstanceOf(TaskDispatchQueuedError);
    const active = await new TaskDispatchModel(db, ws).findActiveByTaskId(id);
    expect(active).toMatchObject({
      phase: 'waiting',
      waitingReason: 'automation_plan_running',
      initiator: user,
    });
    expect(TaskService.prototype.runReadySubtasks).toHaveBeenCalledWith(id, active!.id, active!.id);
    for (const oldChild of draft.subtasks) {
      const fresh = (await new TaskModel(db, user, ws).findById(oldChild.id))!;
      expect(fresh.executionGeneration).toBe(oldGenerations.get(oldChild.id)! + 1);
    }
    const child = (await new TaskModel(db, user, ws).findById(draft.subtasks[0].id))!;
    expect(await requireAutomationParent(db, user, ws, child, active!.id)).toMatchObject({
      id: active!.id,
    });
    await expect(
      requireAutomationParent(db, 'another-member', ws, child, active!.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      requireAutomationParent(db, user, 'another-workspace', child, active!.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const foreign = { ...child, id: 'unrelated-issue' };
    await expect(requireAutomationParent(db, user, ws, foreign, active!.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await db
      .update(tasks)
      .set({ executionGeneration: active!.generation + 1 })
      .where(eq(tasks.id, id));
    await expect(requireAutomationParent(db, user, ws, child, active!.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('retains the active occurrence and queued successor when a native child stop is unconfirmed', async () => {
    await db.update(tasks).set({ automationMode: 'heartbeat' }).where(eq(tasks.id, id));
    const draft = await service().draftIssuePlan(id);
    await service().confirmIssuePlan({ id, revision: draft.plan!.revision });
    await expect(
      startAutomationPlan(db, user, ws, {
        task: (await new TaskModel(db, user, ws).findById(id))!,
        trigger: 'heartbeat',
        idempotencyKey: 'heartbeat:cancel-first',
      }),
    ).rejects.toBeInstanceOf(TaskDispatchQueuedError);
    const model = new TaskDispatchModel(db, ws);
    const active = (await model.findActiveByTaskId(id))!;
    await model.request({
      taskId: id,
      trigger: 'heartbeat',
      origin: 'external',
      idempotencyKey: 'heartbeat:cancel-next',
      requestedBy: user,
      initiator: user,
      executionUserId: user,
    });
    await db.insert(agentOperations).values({
      id: 'native-child-still-running',
      taskId: draft.subtasks[0].id,
      userId: user,
      workspaceId: ws,
      agentId: agent,
      status: 'running',
    });
    vi.spyOn(AiAgentService.prototype, 'interruptTask').mockResolvedValue({
      success: true,
      cancelState: 'unknown',
      deviceCancellationConfirmed: false,
    } as never);
    await expect(cancelAutomationOccurrence(db, user, ws, id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect((await model.findById(active.id))?.phase).toBe('cancel_requested');
    expect((await model.findOldestQueued(id))?.idempotencyKey).toBe('heartbeat:cancel-next');
    const [operation] = await db
      .select()
      .from(agentOperations)
      .where(eq(agentOperations.id, 'native-child-still-running'));
    expect(operation.status).toBe('running');
  });

  it('invalidates reviewed prior-round proofs before computing the next A/B → C layer', async () => {
    await db.update(tasks).set({ automationMode: 'heartbeat' }).where(eq(tasks.id, id));
    const draft = await service().draftIssuePlan(id);
    await service().confirmIssuePlan({ id, revision: draft.plan!.revision });
    // Fixture the finished prior round while preserving the same standing scope.
    const standing = (await new TaskModel(db, user, ws).findById(id))!.context as TaskContext;
    for (const child of draft.subtasks) {
      await db.delete(acceptances).where(eq(acceptances.subjectId, child.id));
      await seedReviewedIssueDelivery(db, child.id);
      const [aggregate] = await db
        .select()
        .from(acceptances)
        .where(eq(acceptances.subjectId, child.id));
      const definition = {
        ...aggregate.metadata!.issueChecklist!,
        confirmedAt: standing.issuePlan!.confirmedAt!,
        confirmedBy: user,
      };
      await db
        .update(acceptances)
        .set({ metadata: { issueChecklist: definition } })
        .where(eq(acceptances.id, aggregate.id));
      const current = (await new TaskModel(db, user, ws).findById(child.id))!;
      await db
        .update(tasks)
        .set({
          config: {
            ...(current.config as TaskConfig | null),
            workspace: { repo: definition.repo, baseBranch: definition.targetBranch },
          },
        })
        .where(eq(tasks.id, child.id));
      Object.assign(
        standing.issuePlan!.checklists.find((check) => check.taskId === child.id)!,
        {
          items: definition.items,
          deliveryKind: definition.deliveryKind,
          repo: definition.repo,
          targetBranch: definition.targetBranch,
        },
      );
    }
    const graph = await new TaskGraphService(db, user, ws).planForParent(id);
    const parent = (await new TaskModel(db, user, ws).findById(id))!;
    standing.issuePlan!.scopeFingerprint = issuePlanFingerprint(
      [parent, ...graph.descendants],
      await new TaskModel(db, user, ws).getDependenciesByTaskIds([
        id,
        ...graph.descendants.map((child) => child.id),
      ]),
    );
    for (const taskId of [id, ...draft.subtasks.map((child) => child.id)]) {
      const current = (await new TaskModel(db, user, ws).findById(taskId))!;
      await db
        .update(tasks)
        .set({
          context: { ...(current.context as TaskContext | null), issuePlan: standing.issuePlan },
        })
        .where(eq(tasks.id, taskId));
    }
    const proofModel = new IssueDeliveryModel(db, user, ws);
    const before = await proofModel.readCurrentDeliveryProof(
      draft.subtasks.map((child) => child.id),
    );
    expect(Object.values(before).every((proof) => proof.availableForDependents)).toBe(true);
    vi.mocked(TaskService.prototype.runReadySubtasks).mockRestore();
    const run = vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({} as never);
    await expect(
      startAutomationPlan(db, user, ws, {
        task: (await new TaskModel(db, user, ws).findById(id))!,
        trigger: 'heartbeat',
        idempotencyKey: 'heartbeat:round-2',
      }),
    ).rejects.toBeInstanceOf(TaskDispatchQueuedError);
    expect(run.mock.calls.map(([params]) => params.taskId).sort()).toEqual(
      draft.subtasks
        .slice(0, 2)
        .map((child) => child.id)
        .sort(),
    );
    const after = await proofModel.readCurrentDeliveryProof(
      draft.subtasks.map((child) => child.id),
    );
    expect(Object.values(after).every((proof) => !proof.availableForDependents)).toBe(true);
  });

  it('drafts real A/B → C and child → parent edges without executing, then freezes all Checklists before dispatch', async () => {
    const draft = await service().draftIssuePlan(id);
    expect(draft.subtasks.map((task) => task.name)).toEqual(['A', 'B', 'C']);
    expect(draft.dependencies.filter((edge) => edge.type === 'blocks')).toHaveLength(5);
    expect((await new TaskModel(db, user, ws).findById(id))?.workflowCategory).toBe('triage');
    expect(TaskService.prototype.runReadySubtasks).not.toHaveBeenCalled();
    expect(await new IssueChecklistService(db, user, ws).getChecklist(id)).toMatchObject({
      definition: undefined,
    });
    await service().confirmIssuePlan({ id, revision: draft.plan!.revision });
    for (const taskId of [id, ...draft.subtasks.map((task) => task.id)]) {
      const task = await new TaskModel(db, user, ws).findById(taskId);
      expect(task?.workflowCategory).toBe('backlog');
      expect((task?.context as TaskContext).issuePlan?.confirmedBy).toBe(user);
      expect(
        (await new IssueChecklistService(db, user, ws).getChecklist(taskId)).definition?.items,
      ).toEqual(check.items);
    }
    expect(TaskService.prototype.runReadySubtasks).toHaveBeenCalledTimes(1);
    await service().confirmIssuePlan({ id, revision: draft.plan!.revision });
    expect(TaskService.prototype.runReadySubtasks).toHaveBeenCalledTimes(1);
  });

  it('confirms repository and target scope without freezing a checkout path or device', async () => {
    await new RepositoryModel(db, user, ws).upsertByRemoteIdentity({
      providerHost: 'github.com',
      remoteRepositoryId: 'plan-repo',
      coordinate: { owner: 'org', name: 'repo', defaultBranch: 'canary' },
    });
    await db
      .update(tasks)
      .set({
        config: {
          workspace: {
            provider: 'git',
            repo: 'org/repo',
            repoPath: '/old-device/repo',
            deviceId: 'old-device',
            baseBranch: 'canary',
          },
        },
      })
      .where(eq(tasks.id, id));
    const code = {
      ...proposal(),
      tasks: proposal().tasks.map((task, index) =>
        index === 0
          ? {
              ...task,
              checklist: {
                ...check,
                deliveryKind: 'code',
                repo: 'org/repo',
                targetBranch: 'canary',
              },
            }
          : task,
      ),
    };
    vi.mocked(runAcpJudgment).mockResolvedValue({
      data: code,
      run: { operationId: 'planning-operation', status: 'done' },
    });
    const draft = await service().draftIssuePlan(id);
    expect(draft.plan?.scope.repositories).toEqual([{ repo: 'org/repo', targetBranch: 'canary' }]);
    expect((draft.subtasks[0].config as { workspace: unknown }).workspace).toEqual({
      provider: 'git',
      repo: 'org/repo',
      baseBranch: 'canary',
    });
    await new TaskModel(db, user, ws).update(id, {
      config: {
        workspace: {
          provider: 'git',
          repo: 'org/repo',
          baseBranch: 'canary',
          repoPath: '/new-device/repo',
          deviceId: 'new-device',
        },
      },
    });
    await expect(
      service().confirmIssuePlan({ id, revision: draft.plan!.revision }),
    ).resolves.toMatchObject({ plan: { confirmedBy: user } });
  });

  it('rejects a stale displayed graph and leaves every Checklist unconfirmed', async () => {
    const draft = await service().draftIssuePlan(id);
    await new TaskModel(db, user, ws).removeDependency(draft.subtasks[2].id, draft.subtasks[0].id);
    await expect(
      service().confirmIssuePlan({ id, revision: draft.plan!.revision }),
    ).rejects.toThrow('scope or dependencies changed');
    expect(
      (await new IssueChecklistService(db, user, ws).getChecklist(id)).definition,
    ).toBeUndefined();
    expect(TaskService.prototype.runReadySubtasks).not.toHaveBeenCalled();
  });

  it('rolls back the whole confirmation if a child Checklist changed after drafting', async () => {
    const draft = await service().draftIssuePlan(id);
    const ledger = new IssueChecklistService(db, user, ws);
    await ledger.confirmChecklist({
      taskId: draft.subtasks[2].id,
      expectedRevision: 0,
      deliveryKind: 'artifact',
      items: [{ id: 'new', title: 'Changed acceptance', required: true }],
    });
    await expect(
      service().confirmIssuePlan({ id, revision: draft.plan!.revision }),
    ).rejects.toThrow('Checklist changed');
    expect((await ledger.getChecklist(id)).definition).toBeUndefined();
    expect((await ledger.getChecklist(draft.subtasks[0].id)).definition).toBeUndefined();
    expect((await ledger.getChecklist(draft.subtasks[2].id)).definition?.items[0].title).toBe(
      'Changed acceptance',
    );
    expect(TaskService.prototype.runReadySubtasks).not.toHaveBeenCalled();
  });

  it('rejects cyclic Agent output atomically without retaining draft children', async () => {
    const cyclic = proposal();
    cyclic.tasks[0].dependsOn = [2];
    vi.mocked(runAcpJudgment).mockResolvedValue({
      data: cyclic,
      run: { operationId: 'planning-operation', status: 'done' },
    });
    await expect(service().draftIssuePlan(id)).rejects.toThrow('cycle');
    expect((await service().getIssuePlan(id)).subtasks).toHaveLength(0);
  });

  it('dispatches as the requester when an Owner confirms on their behalf', async () => {
    const owner = 'issue-plan-owner';
    await db.insert(users).values({ id: owner }).onConflictDoNothing();
    await db
      .update(workspaceMembers)
      .set({ role: 'member' })
      .where(eq(workspaceMembers.userId, user));
    await db.insert(workspaceMembers).values({ workspaceId: ws, userId: owner, role: 'owner' });
    await db.update(workspaces).set({ primaryOwnerId: owner }).where(eq(workspaces.id, ws));
    const draft = await service().draftIssuePlan(id);
    const dispatchUsers: string[] = [];
    vi.mocked(TaskService.prototype.runReadySubtasks).mockImplementation(async function (
      this: TaskService,
    ) {
      dispatchUsers.push((this as unknown as { userId: string }).userId);
      return { kickedOff: [], failed: [], plan: { layers: [], blocked: [], cycles: [] } } as never;
    });
    await new TaskPlanService(db, owner, ws).confirmIssuePlan({
      id,
      revision: draft.plan!.revision,
    });
    expect(dispatchUsers).toEqual([user]);
  });

  it('does not give ordinary Issue editors plan-confirmation authority', async () => {
    const draft = await service().draftIssuePlan(id);
    const member = 'issue-plan-member';
    await db.delete(users).where(eq(users.id, member));
    await db.insert(users).values({ id: member });
    await db.insert(workspaceMembers).values({ workspaceId: ws, userId: member, role: 'member' });
    await expect(
      new TaskPlanService(db, member, ws).confirmIssuePlan({ id, revision: draft.plan!.revision }),
    ).rejects.toThrow('Only the requester');
    expect(
      (await new IssueChecklistService(db, user, ws).getChecklist(id)).definition,
    ).toBeUndefined();
  });

  it('appends a new scope on the same settled Issue and retains accepted historical results', async () => {
    const draft = await service().draftIssuePlan(id);
    await service().confirmIssuePlan({ id, revision: draft.plan!.revision });
    const topicId = 'issue-plan-delivery-topic';
    const operationId = 'issue-plan-delivery-operation';
    await db.insert(topics).values({ id: topicId, userId: user, workspaceId: ws });
    await db
      .insert(agentOperations)
      .values({ id: operationId, userId: user, workspaceId: ws, taskId: id, status: 'done' });
    await db.insert(taskTopics).values({
      taskId: id,
      topicId,
      operationId,
      userId: user,
      workspaceId: ws,
      seq: 1,
      executionGeneration: 1,
      status: 'completed',
    });
    await db
      .update(tasks)
      .set({ currentTopicId: topicId, executionGeneration: 1 })
      .where(eq(tasks.id, id));
    const ledger = new IssueChecklistService(db, user, ws);
    const review = await ledger.prepareReview(id, operationId);
    const [accepted] = await db
      .insert(verifyCheckResults)
      .values({
        verifyRunId: review.run.id,
        operationId,
        checkItemId: review.run.plan![0].id,
        checkItemTitle: 'Observed outcome',
        checkItemIndex: 0,
        required: true,
        verifierType: 'agent',
        verdict: 'passed',
        status: 'passed',
        userDecision: 'accepted',
        userId: user,
        workspaceId: ws,
      })
      .returning();
    await new VerifyRunModel(db, user, ws).setDecision(review.run.id, 'accept', {
      decidedAt: new Date().toISOString(),
      decidedBy: user,
    });
    await db.update(tasks).set({ workflowCategory: 'done' }).where(eq(tasks.id, id));
    for (const child of draft.subtasks)
      await db.update(tasks).set({ workflowCategory: 'done' }).where(eq(tasks.id, child.id));
    const revised = await service().draftIssuePlan(id);
    expect(revised.plan?.revision).toBe(2);
    expect(revised.subtasks).toHaveLength(6);
    const redrafted = await service().draftIssuePlan(id);
    expect(redrafted.subtasks).toHaveLength(6);
    await service().confirmIssuePlan({ id, revision: redrafted.plan!.revision });
    const historical = await ledger.getChecklist(id);
    expect(historical.results.find((result) => result.id === accepted.id)?.userDecision).toBe(
      'accepted',
    );
    expect(historical.definition?.revision).toBe(2);
    for (const child of draft.subtasks)
      expect((await new TaskModel(db, user, ws).findById(child.id))?.workflowCategory).toBe('done');
  });

  it('preserves requester attribution when another editor drafts the plan', async () => {
    await db
      .update(workspaceMembers)
      .set({ role: 'member' })
      .where(eq(workspaceMembers.userId, user));
    const editor = 'issue-plan-editor';
    await db.delete(users).where(eq(users.id, editor));
    await db.insert(users).values({ id: editor });
    await db.insert(workspaceMembers).values({ workspaceId: ws, userId: editor, role: 'member' });
    const privateTopic = 'issue-plan-requester-private';
    await db
      .insert(topics)
      .values({ id: privateTopic, userId: user, workspaceId: ws, agentId: agent });
    await db
      .update(tasks)
      .set({ context: { origin: { topicId: privateTopic, agentId: agent } } })
      .where(eq(tasks.id, id));
    const draft = await new TaskPlanService(db, editor, ws).draftIssuePlan(id);
    expect(vi.mocked(runAcpJudgment).mock.calls[0][1]).toBe(editor);
    expect(vi.mocked(runAcpJudgment).mock.calls[0][2].judgment.sourceTopicId).toBeUndefined();
    expect(draft.subtasks.every((task) => task.createdByUserId === user)).toBe(true);
    expect(draft.plan?.plannedBy).toBe(editor);
    await expect(
      service().confirmIssuePlan({ id, revision: draft.plan!.revision }),
    ).resolves.toMatchObject({ plan: { confirmedBy: user } });
  });

  it('links an explicit follow-up request and posts into the same continuous private session', async () => {
    const topicId = 'issue-plan-source-topic';
    await db.insert(topics).values({
      id: topicId,
      userId: user,
      workspaceId: ws,
      agentId: agent,
    });
    const result = await service().intake({
      issueId: id,
      name: 'New request',
      instruction: 'New supplied request'.repeat(30),
      origin: { topicId, agentId: agent },
    });
    expect(result.id).toBe(id);
    expect(result.name).toBe('New request');
    expect(result.description).toBe('New supplied request'.repeat(30).slice(0, 255));
    expect((result.context as TaskContext).issuePlan?.requirement).toBe(
      'New supplied request'.repeat(30),
    );
    expect((result.context as TaskContext).origin?.topicId).toBe(topicId);
    expect((result.context as TaskContext).issuePlan?.conversationPlan?.topicId).toBe(topicId);
    expect(await db.query.topics.findFirst({ where: eq(topics.id, topicId) })).toMatchObject({
      userId: user,
    });
    expect(
      JSON.parse(vi.mocked(runAcpJudgment).mock.calls[0][2].input.messages[0].content as string)
        .request,
    ).toBe('New supplied request'.repeat(30));
  });

  it('keeps confirmed current delivery scope frozen until final acceptance', async () => {
    const draft = await service().draftIssuePlan(id);
    await service().confirmIssuePlan({ id, revision: draft.plan!.revision });
    await expect(service().draftIssuePlan(id)).rejects.toThrow(
      'Finish the current accepted delivery',
    );
  });
  it.each(['schedule', 'heartbeat', 'event'] as const)(
    'publishes %s standing scope without fabricating an occurrence or starting children',
    async (mode) => {
      await db.update(tasks).set({ automationMode: mode }).where(eq(tasks.id, id));
      const draft = await service().draftIssuePlan(id);
      const dispatch = vi.spyOn(TaskService.prototype, 'runReadySubtasks');
      dispatch.mockClear();
      const confirmed = await service().confirmIssuePlan({ id, revision: draft.plan!.revision });
      expect(confirmed.plan?.confirmedAt).toBeTruthy();
      expect(confirmed.dispatch).toBeUndefined();
      expect(dispatch).not.toHaveBeenCalled();
    },
  );
});

async function refinementFixture() {
  const topicId = 'refinement-origin';
  await db.insert(topics).values({ id: topicId, userId: user, workspaceId: ws });
  await new TaskModel(db, user, ws).update(id, { context: { origin: { topicId } } });
  const draft = await service().draftIssuePlan(id);
  await service().confirmIssuePlan({ id, revision: draft.plan!.revision });
  const operationId = 'refinement-operation';
  await db.insert(agentOperations).values({
    id: operationId,
    userId: user,
    workspaceId: ws,
    agentId: agent,
    topicId,
    status: 'running',
  });
  vi.mocked(TaskService.prototype.runReadySubtasks).mockClear();
  const input = {
    identifier: id,
    revision: draft.plan!.revision,
    refinementRevision: 0,
    addTasks: [
      {
        sourceIdentifier: draft.subtasks[0].identifier,
        name: 'Implementation detail',
        instruction: 'Implement the already approved outcome using the refined approach',
      },
    ],
  };
  return { draft, input, operationId };
}

describe('confirmed implementation refinement', () => {
  it.each(['added Issue', 'changed dependency'])(
    'starts the next periodic graph after a legal refinement of %s',
    async (change) => {
      await db.update(tasks).set({ automationMode: 'heartbeat' }).where(eq(tasks.id, id));
      const f = await refinementFixture();
      const input =
        change === 'added Issue'
          ? f.input
          : {
              ...f.input,
              addTasks: [],
              dependencies: [
                {
                  identifier: f.draft.subtasks[0].identifier,
                  dependsOnIdentifier: f.draft.subtasks[1].identifier,
                  action: 'add' as const,
                },
              ],
            };
      const refined = await service().refineIssuePlan(input, f.operationId);
      await db
        .update(agentOperations)
        .set({ status: 'done' })
        .where(eq(agentOperations.id, f.operationId));
      await expect(
        startAutomationPlan(db, user, ws, {
          task: (await new TaskModel(db, user, ws).findById(id))!,
          trigger: 'heartbeat',
          idempotencyKey: `heartbeat:refined-${change}`,
        }),
      ).rejects.toBeInstanceOf(TaskDispatchQueuedError);
      const dispatch = await new TaskDispatchModel(db, ws).findActiveByTaskId(id);
      expect(dispatch).toMatchObject({
        phase: 'waiting',
        waitingReason: 'automation_plan_running',
        automationOccurrence: {
          definition: { issuePlan: { scopeFingerprint: refined.plan!.scopeFingerprint } },
        },
      });
      expect(TaskService.prototype.runReadySubtasks).toHaveBeenLastCalledWith(
        id,
        dispatch!.id,
        dispatch!.id,
      );
    },
  );

  it('refines from a task-scoped interactive Orchestrator conversation without a delivery generation', async () => {
    const f = await refinementFixture();
    await db
      .update(agentOperations)
      .set({ taskId: id, appContext: {} })
      .where(eq(agentOperations.id, f.operationId));
    const result = await service().refineIssuePlan(f.input, f.operationId);
    expect(result.added).toHaveLength(1);
    expect(result.plan?.refinement?.operationId).toBe(f.operationId);
    expect(TaskService.prototype.runReadySubtasks).toHaveBeenCalledOnce();
  });

  it('keeps a separate active writer blocked when the interactive Orchestrator refines', async () => {
    const f = await refinementFixture();
    await db
      .update(agentOperations)
      .set({ taskId: id, appContext: {} })
      .where(eq(agentOperations.id, f.operationId));
    await db.insert(agentOperations).values({
      id: 'other-active-writer',
      taskId: id,
      userId: user,
      workspaceId: ws,
      agentId: agent,
      status: 'running',
    });
    await expect(service().refineIssuePlan(f.input, f.operationId)).rejects.toThrow(
      'device acknowledgement',
    );
    expect((await service().getIssuePlan(id)).subtasks).toHaveLength(3);
  });

  it('does not exempt an actual current delivery writer just because its operation has no generation metadata', async () => {
    const f = await refinementFixture();
    const parent = (await new TaskModel(db, user, ws).findById(id))!;
    await db
      .update(agentOperations)
      .set({ taskId: id })
      .where(eq(agentOperations.id, f.operationId));
    await db.insert(taskTopics).values({
      seq: 1,
      taskId: id,
      topicId: 'refinement-origin',
      userId: user,
      workspaceId: ws,
      operationId: f.operationId,
      executionGeneration: parent.executionGeneration,
      status: 'running',
    });
    await expect(service().refineIssuePlan(f.input, f.operationId)).rejects.toThrow(
      'device acknowledgement',
    );
    expect(TaskService.prototype.runReadySubtasks).not.toHaveBeenCalled();
  });

  it('rejects a stale actual delivery Run even without generation metadata on its operation', async () => {
    const f = await refinementFixture();
    const member = f.draft.subtasks[0];
    await db
      .update(tasks)
      .set({ executionGeneration: member.executionGeneration + 1 })
      .where(eq(tasks.id, member.id));
    await db
      .update(agentOperations)
      .set({ taskId: member.id })
      .where(eq(agentOperations.id, f.operationId));
    await db.insert(taskTopics).values({
      seq: 1,
      taskId: member.id,
      topicId: 'refinement-origin',
      userId: user,
      workspaceId: ws,
      operationId: f.operationId,
      executionGeneration: member.executionGeneration,
      status: 'running',
    });
    await expect(service().refineIssuePlan(f.input, f.operationId)).rejects.toThrow(
      'current Issue generation',
    );
    expect(TaskService.prototype.runReadySubtasks).not.toHaveBeenCalled();
  });

  it('reuses exact approval provenance, adds actual parent blocks and auto-starts as original requester', async () => {
    const f = await refinementFixture();
    const prior = (
      await new IssueChecklistService(db, user, ws).getChecklist(f.draft.subtasks[0].id)
    ).definition!;
    const originalIdentity: string[] = [];
    vi.mocked(TaskService.prototype.runReadySubtasks).mockImplementation(async function (
      this: TaskService,
    ) {
      originalIdentity.push((this as unknown as { userId: string }).userId);
      return { kickedOff: [], failed: [], plan: { layers: [], blocked: [], cycles: [] } } as never;
    });
    const result = await service().refineIssuePlan(f.input, f.operationId);
    expect(originalIdentity).toEqual([user]);
    expect(result.plan).toMatchObject({
      revision: f.draft.plan!.revision,
      confirmedAt: (await service().getIssuePlan(id)).plan!.confirmedAt,
      refinement: { revision: 1, operationId: f.operationId, agentId: agent },
    });
    expect(result.plan!.checklists).toHaveLength(f.draft.plan!.checklists.length + 1);
    for (const check of f.draft.plan!.checklists)
      expect(result.plan!.checklists.find((row) => row.taskId === check.taskId)).toEqual(check);
    const added = result.added[0];
    expect(added.createdByUserId).toBe(user);
    expect(added.workflowCategory).toBe('backlog');
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({ taskId: id, dependsOnId: added.id, type: 'blocks' }),
    );
    const checklist = await new IssueChecklistService(db, user, ws).getChecklist(added.id);
    expect(checklist.definition).toMatchObject({
      items: prior.items,
      confirmedBy: prior.confirmedBy,
      confirmedAt: prior.confirmedAt,
      inheritedFrom: { taskId: f.draft.subtasks[0].id, operationId: f.operationId },
    });
    expect(checklist.history).toEqual([]);
    expect(checklist.current?.deliveryAccepted).toBe(false);
    expect(checklist.current?.itemsAccepted).toBe(false);
    await expect(
      new TaskModel(db, user, ws).assertConfirmedIssuePlan(added.id),
    ).resolves.toBeUndefined();
    expect(vi.mocked(assertCanUseWorkspaceAgent)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user, agentId: agent }),
    );
  });

  it('cannot change or remove required criteria, repository or final target via refinement input', async () => {
    const f = await refinementFixture();
    for (const extra of [
      { items: [] },
      { checklist: { items: [] } },
      { repo: 'outside/repo' },
      { targetBranch: 'other' },
    ])
      await expect(
        service().refineIssuePlan(
          { ...f.input, addTasks: [{ ...f.input.addTasks[0], ...extra }] },
          f.operationId,
        ),
      ).rejects.toThrow();
    expect((await service().getIssuePlan(id)).plan!.checklists).toEqual(f.draft.plan!.checklists);
    expect(TaskService.prototype.runReadySubtasks).not.toHaveBeenCalled();
  });

  it('uses persisted Orchestrator operation identity and rejects other Agents and callers', async () => {
    const f = await refinementFixture();
    await expect(service().refineIssuePlan(f.input, 'missing-operation')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await db
      .update(agentOperations)
      .set({ agentId: null })
      .where(eq(agentOperations.id, f.operationId));
    await expect(service().refineIssuePlan(f.input, f.operationId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await db
      .update(agentOperations)
      .set({ agentId: agent, status: 'done' })
      .where(eq(agentOperations.id, f.operationId));
    await expect(service().refineIssuePlan(f.input, f.operationId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rolls back a new implementation task and membership when legal dependency validation detects a cycle', async () => {
    const f = await refinementFixture();
    await expect(
      service().refineIssuePlan(
        {
          ...f.input,
          dependencies: [
            {
              identifier: f.draft.subtasks[0].identifier,
              dependsOnIdentifier: f.draft.subtasks[2].identifier,
              action: 'add',
            },
          ],
        },
        f.operationId,
      ),
    ).rejects.toMatchObject({ reason: 'CYCLE' });
    const after = await service().getIssuePlan(id);
    expect(after.subtasks).toHaveLength(3);
    expect(after.plan?.refinement).toBeUndefined();
    expect(TaskService.prototype.runReadySubtasks).not.toHaveBeenCalled();
  });

  it('preserves old accepted history without inheriting its results in the implementation task', async () => {
    const f = await refinementFixture();
    const old = await seedReviewedIssueDelivery(db, f.draft.subtasks[0].id);
    const source = (await new TaskModel(db, user, ws).findById(f.draft.subtasks[0].id))!;
    await db
      .update(agents)
      .set({ agencyConfig: { heterogeneousProvider: { type: 'codex' } } })
      .where(eq(agents.id, source.reviewerAgentId!));
    await db
      .update(verifyRuns)
      .set({ userDecision: 'accept' })
      .where(eq(verifyRuns.id, old.run.id));
    await db
      .update(verifyCheckResults)
      .set({ userDecision: 'accepted' })
      .where(eq(verifyCheckResults.id, old.result.id));
    const result = await service().refineIssuePlan(f.input, f.operationId);
    const checklist = await new IssueChecklistService(db, user, ws).getChecklist(
      result.added[0].id,
    );
    expect(checklist.history).toEqual([]);
    expect(checklist.results).toEqual([]);
    const [oldRound] = await db.select().from(verifyRuns).where(eq(verifyRuns.id, old.run.id));
    expect(oldRound.userDecision).toBe('accept');
  });

  it('refuses to supersede an active parent writer or change dependencies of a live task', async () => {
    const f = await refinementFixture();
    await db.insert(agentOperations).values({
      id: 'active-parent-report',
      userId: user,
      workspaceId: ws,
      agentId: agent,
      taskId: id,
      status: 'running',
    });
    await expect(service().refineIssuePlan(f.input, f.operationId)).rejects.toThrow(
      'device acknowledgement',
    );
    await db
      .update(agentOperations)
      .set({ status: 'interrupted' })
      .where(eq(agentOperations.id, 'active-parent-report'));
    await db.insert(agentOperations).values({
      id: 'active-implementation',
      userId: user,
      workspaceId: ws,
      agentId: agent,
      taskId: f.draft.subtasks[0].id,
      status: 'running',
    });
    await expect(
      service().refineIssuePlan(
        {
          ...f.input,
          dependencies: [
            {
              identifier: f.draft.subtasks[0].identifier,
              dependsOnIdentifier: f.draft.subtasks[1].identifier,
              action: 'add',
            },
          ],
        },
        f.operationId,
      ),
    ).rejects.toThrow('device acknowledgement');
    expect((await service().getIssuePlan(id)).subtasks).toHaveLength(3);
  });

  it('reopens acknowledged canceled scope for a new human-confirmed plan without accepting unwanted old work', async () => {
    const f = await refinementFixture();
    const parent = (await new TaskModel(db, user, ws).findById(id))!;
    const stopId = 'plan-stop-dispatch';
    await db.insert(taskDispatches).values({
      id: stopId,
      taskId: id,
      workspaceId: ws,
      phase: 'cancel_requested',
      generation: parent.executionGeneration,
      taskRevision: parent.domainRevision,
      requirementRevision: parent.requirementRevision,
      policyRevision: parent.policyRevision,
      requestedBy: user,
      idempotencyKey: stopId,
      fence: 1,
      leaseOwner: 'stop-worker',
      cancelRequestedAt: new Date(),
    });
    await db.update(tasks).set({ workflowCategory: 'canceled' }).where(eq(tasks.id, id));
    await expect(service().draftIssuePlan(id)).rejects.toThrow('device acknowledgement');
    const settled = await new TaskDispatchModel(db, ws).settleCancellation({
      dispatchId: stopId,
      fence: 1,
      generation: parent.executionGeneration,
      owner: 'stop-worker',
    });
    expect(settled?.dispatch.phase).toBe('canceled');
    const next = await service().draftIssuePlan(id);
    expect(next.plan!.confirmedAt).toBeUndefined();
    expect(next.plan!.revision).toBe(f.draft.plan!.revision + 1);
    const oldIds = new Set(f.draft.subtasks.map((task) => task.id));
    expect(next.plan!.checklists.every((check) => !oldIds.has(check.taskId))).toBe(true);
    expect(
      next.dependencies.filter((edge) => edge.taskId === id && oldIds.has(edge.dependsOnId)),
    ).toEqual([]);
    await service().confirmIssuePlan({ id, revision: next.plan!.revision });
    for (const old of f.draft.subtasks) {
      expect((await new TaskModel(db, user, ws).findById(old.id))?.workflowCategory).toBe(
        'canceled',
      );
      await expect(
        new TaskModel(db, user, ws).assertConfirmedIssuePlan(old.id),
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    }
  });
});
