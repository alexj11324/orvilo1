// @vitest-environment node
import { type OrviloDatabase } from '@orvilo/database';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedPrimeRuntime } from '@/database/fixtures/seedPrimeRuntime';
import { AcceptanceModel } from '@/database/models/acceptance';
import { LinearSyncModel } from '@/database/models/linearSync';
import { ProjectModel } from '@/database/models/project';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { projects, taskDispatches, tasks } from '@/database/schemas';
import { TaskService } from '@/server/services/task';
import { TaskDispatchService } from '@/server/services/taskDispatch';
import { TaskIntegrationService } from '@/server/services/taskIntegration';
import { TaskWorkspaceService } from '@/server/services/taskWorkspace';
import { createTaskRuntime } from '@/server/services/toolExecution/serverRuntimes/task';

import { taskRouter } from '../../task';
import { workAttentionRouter } from '../../workAttention';
import {
  cleanupTestUser,
  createTestAgent,
  createTestContext,
  createTestTopic,
  createTestUser,
} from './setup';

// Mock getServerDB
let testDB: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return testDB;
  }),
}));

// Mock AiAgentService
const mockExecAgent = vi.fn().mockResolvedValue({
  operationId: 'op_test',
  success: true,
  topicId: 'tpc_test',
});
const mockInterruptTask = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn().mockImplementation(function () {
    return {
      execAgent: mockExecAgent,
      interruptTask: mockInterruptTask,
    };
  }),
}));

// Mock TaskLifecycleService
vi.mock('@/server/services/taskLifecycle', () => ({
  TaskLifecycleService: vi.fn().mockImplementation(function () {
    return {
      onTopicComplete: vi.fn(),
    };
  }),
}));

// Mock TaskReviewService
vi.mock('@/server/services/taskReview', () => ({
  TaskReviewService: vi.fn().mockImplementation(function () {
    return {
      review: vi.fn(),
    };
  }),
}));

// Mock initModelRuntimeFromDeploymentConfig
vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDeploymentConfig: vi.fn(),
}));

// These tests exercise the orchestrated-dispatch path (cascade, batch run):
// keep the CAID admission gate open here — the flag-off hold is covered in
// `services/taskDispatch`'s unit tests.
// These cases cover the inbox fallback, which exists only while the built-in
// harness is offered; the refusal without it is covered in the runner's tests.
vi.mock('@/server/featureFlags/builtinHarness', () => ({
  isBuiltinHarnessOffered: async () => true,
}));
vi.mock('@/server/featureFlags/caidAdmission', () => ({
  isCaidDispatchAllowed: vi.fn(async () => true),
}));

// `task.update` requires `expectedDomainRevision` on any assignee write; real
// clients resolve it from the row before mutating. Tests do the same.
const revisionOf = async (id: string) =>
  (
    await testDB
      .select({ revision: tasks.domainRevision })
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1)
  )[0]?.revision;

// Mock the assignment-notification business slot (default impl is a no-op;
// the router must fire it only on an actual assignee change to someone else).
const mockNotifyTaskAssigned = vi.fn().mockResolvedValue(undefined);
vi.mock('@/business/server/task/notifyTaskAssigned', () => ({
  notifyTaskAssigned: (...args: unknown[]) => mockNotifyTaskAssigned(...args),
}));

// Mock the comment-notification business slot (default impl is a no-op).
const mockNotifyTaskCommentActivity = vi.fn().mockResolvedValue(undefined);
vi.mock('@/business/server/task/notifyTaskCommentActivity', () => ({
  notifyTaskCommentActivity: (...args: unknown[]) => mockNotifyTaskCommentActivity(...args),
}));

// Notifications are retained past the response through `after()`; run that
// work eagerly here and flush it before asserting on the slots above.
const afterResponseTasks = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock('@/server/utils/scheduleAfterResponse', () => ({
  after: (work: () => unknown) => void afterResponseTasks.push(Promise.resolve().then(work)),
}));
const flushAfterResponse = async () => {
  while (afterResponseTasks.length > 0) await Promise.all(afterResponseTasks.splice(0));
};

describe('Task Router Integration', () => {
  let serverDB: OrviloDatabase;
  let userId: string;
  let otherUserId: string | undefined;
  let testAgentId: string;
  let testTopicId: string;
  let caller: ReturnType<typeof taskRouter.createCaller>;

  beforeEach(async () => {
    vi.clearAllMocks();
    serverDB = await getTestDB();
    testDB = serverDB;
    userId = await createTestUser(serverDB);
    testAgentId = await createTestAgent(serverDB, userId, 'agt_test');
    testTopicId = await createTestTopic(serverDB, userId, 'tpc_test');
    // Update mock to return the real topic ID
    mockExecAgent.mockResolvedValue({
      operationId: 'op_test',
      success: true,
      topicId: testTopicId,
    });
    caller = taskRouter.createCaller(createTestContext(userId));
  });

  afterEach(async () => {
    await cleanupTestUser(serverDB, userId);
    if (otherUserId) await cleanupTestUser(serverDB, otherUserId);
    otherUserId = undefined;
  });

  describe('automation result outputs', () => {
    const createAutomation = () =>
      caller.create({
        automationMode: 'schedule',
        instruction: 'Analyze each error report',
        schedulePattern: '0 * * * *',
      });

    it('persists destination and credential references without exposing credential ciphertext', async () => {
      const automation = await createAutomation();
      const { credentials } = await import('@/database/schemas');
      await serverDB.insert(credentials).values({
        id: 'output-cred-1',
        ownerUserId: userId,
        key: 'result-hook',
        name: 'Result hook',
        type: 'kv-header',
        payload: 'encrypted-output-fixture',
      });
      expect(await caller.listAutomationOutputCredentials({ taskId: automation.data.id })).toEqual([
        { id: 'output-cred-1', name: 'Result hook', type: 'kv-header' },
      ]);
      await caller.updateAutomationOutputs({
        taskId: automation.data.id,
        resultWebhooks: [
          {
            credentialId: 'output-cred-1',
            id: 'webhook-1',
            url: 'https://receiver.example/results',
          },
        ],
      });
      const updated = await new TaskModel(serverDB, userId).findById(automation.data.id);
      expect(updated?.config).toMatchObject({
        resultWebhooks: [
          {
            credentialId: 'output-cred-1',
            id: 'webhook-1',
            url: 'https://receiver.example/results',
          },
        ],
      });
      expect(
        JSON.stringify(await caller.listAutomationResults({ taskId: automation.data.id })),
      ).not.toContain('encrypted-output-fixture');
      expect(mockExecAgent).not.toHaveBeenCalled();
    });

    it('rejects another user credential, reserved inbox identity and secret-bearing endpoints', async () => {
      const automation = await createAutomation();
      otherUserId = await createTestUser(serverDB);
      const { credentials } = await import('@/database/schemas');
      await serverDB.insert(credentials).values({
        id: 'output-other-cred',
        ownerUserId: otherUserId,
        key: 'result-hook',
        name: 'Private hook',
        type: 'kv-header',
        payload: 'encrypted-private-fixture',
      });
      await expect(
        caller.updateAutomationOutputs({
          taskId: automation.data.id,
          resultWebhooks: [
            {
              credentialId: 'output-other-cred',
              id: 'webhook-1',
              url: 'https://receiver.example/results',
            },
          ],
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        caller.updateAutomationOutputs({
          taskId: automation.data.id,
          resultWebhooks: [{ id: 'inbox', url: 'https://receiver.example/results' }],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(
        caller.updateAutomationOutputs({
          taskId: automation.data.id,
          resultWebhooks: [
            { id: 'webhook-1', url: 'https://receiver.example/results?token=secret' },
          ],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('requires acknowledged ambiguity to retry only output without starting another Agent', async () => {
      const automation = await createAutomation();
      const { automationResultDeliveries } = await import('@/database/schemas/task');
      await serverDB.insert(automationResultDeliveries).values({
        id: 'result-unknown-1',
        taskId: automation.data.id,
        userId,
        operationId: 'result-operation-1',
        destinationId: 'webhook-1',
        endpoint: 'https://receiver.example/results',
        status: 'unknown',
        payload: {
          version: 1,
          completedAt: '2026-10-03T00:00:00Z',
          evidence: {},
          identifier: automation.data.identifier,
          runId: 'result-operation-1',
          status: 'succeeded',
          stopReason: 'done',
          summary: 'Error ERR-784 analyzed',
          taskId: automation.data.id,
        },
      });
      await expect(caller.retryAutomationResult({ id: 'result-unknown-1' })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
      });
      const broker = vi
        .spyOn(await import('@/libs/hatchet'), 'enqueueHatchetTask')
        .mockResolvedValue('queued-output');
      try {
        expect(
          await caller.retryAutomationResult({ id: 'result-unknown-1', acknowledgeUnknown: true }),
        ).toBe(true);
      } finally {
        broker.mockRestore();
      }
      expect((await caller.listAutomationResults({ taskId: automation.data.id }))[0].status).toBe(
        'pending',
      );
      expect(mockExecAgent).not.toHaveBeenCalled();
    });

    it('denies editing another workspace member automation output settings', async () => {
      otherUserId = await createTestUser(serverDB);
      const { workspaces, workspaceMembers } = await import('@/database/schemas');
      const workspaceId = 'automation-output-permission-workspace';
      await serverDB.insert(workspaces).values({
        id: workspaceId,
        name: 'Output test',
        primaryOwnerId: userId,
        slug: workspaceId,
      });
      await serverDB.insert(workspaceMembers).values([
        { role: 'owner', userId, workspaceId },
        { role: 'member', userId: otherUserId, workspaceId },
      ]);
      const ownerContext = { ...createTestContext(userId), workspaceId, workspaceRole: 'owner' };
      const ownerCaller = taskRouter.createCaller(ownerContext);
      const automation = await ownerCaller.create({
        automationMode: 'schedule',
        instruction: 'Workspace errors',
        schedulePattern: '0 * * * *',
      });
      const memberContext = {
        ...createTestContext(otherUserId),
        workspaceId,
        workspaceRole: 'member',
      };
      const memberCaller = taskRouter.createCaller(memberContext);
      await expect(
        memberCaller.updateAutomationOutputs({
          taskId: automation.data.id,
          resultWebhooks: [{ id: 'webhook-1', url: 'https://receiver.example/results' }],
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('create + find + detail', () => {
    it('removes a related issue whose stored id predates the task_ prefix', async () => {
      const source = await caller.create({ instruction: 'Source' });
      const peer = await caller.create({ instruction: 'Peer' });
      const legacyId = 'legacytaskrelation001';
      await serverDB.update(tasks).set({ id: legacyId }).where(eq(tasks.id, source.data.id));

      await caller.addDependency({
        dependsOnId: peer.data.identifier,
        taskId: source.data.identifier,
        type: 'relates',
      });
      expect((await caller.detail({ id: peer.data.identifier })).data.dependencies).toMatchObject([
        { dependsOn: source.data.identifier, type: 'relates' },
      ]);
      await caller.removeDependency({
        dependsOnId: legacyId,
        taskId: peer.data.identifier,
        type: 'relates',
      });
      expect((await caller.detail({ id: peer.data.identifier })).data.dependencies).toEqual([]);
    });

    it('removes a symmetric relation by opaque edge id from the other issue', async () => {
      const source = await caller.create({ instruction: 'Source' });
      const peer = await caller.create({ instruction: 'Peer' });
      await caller.addDependency({
        dependsOnId: peer.data.identifier,
        taskId: source.data.identifier,
        type: 'relates',
      });
      const related = (await caller.detail({ id: peer.data.identifier })).data.dependencies?.[0];
      expect(related).toMatchObject({ dependsOn: source.data.identifier, type: 'relates' });
      expect(related?.relationId).toBeTruthy();
      await caller.removeDependency({
        relationId: related!.relationId!,
        taskId: peer.data.identifier,
      });
      expect((await caller.detail({ id: source.data.identifier })).data.dependencies).toEqual([]);
      expect((await caller.detail({ id: peer.data.identifier })).data.dependencies).toEqual([]);
    });

    it('should create a task and retrieve it', async () => {
      const result = await caller.create({
        instruction: 'Write a book',
        name: 'Write Book',
      });

      expect(result.data.identifier).toBe('T-1');
      expect(result.data.name).toBe('Write Book');
      expect(result.data.status).toBe('backlog');

      // find
      const found = await caller.find({ id: 'T-1' });
      expect(found.data.id).toBe(result.data.id);

      // detail
      const detail = await caller.detail({ id: 'T-1' });
      expect(detail.data.identifier).toBe('T-1');
      expect(detail.data.subtasks).toHaveLength(0);
      // A "created" activity is auto-generated from task.createdAt
      expect(detail.data.activities).toHaveLength(1);
      expect(detail.data.activities![0].type).toBe('created');
      expect(detail.data.activities![0].author?.type).toBe('user');
    });

    it('should persist createdByAgentId when provided (agent-created task)', async () => {
      const result = await caller.create({
        createdByAgentId: testAgentId,
        instruction: 'Created by agent tool',
        name: 'Agent Task',
      });

      expect(result.data.createdByAgentId).toBe(testAgentId);
      expect(result.data.createdByUserId).toBe(userId);
    });

    it("rejects a createdByAgentId the caller cannot use, so no feed row can be forged in another agent's name", async () => {
      otherUserId = await createTestUser(serverDB);
      const foreignAgentId = await createTestAgent(serverDB, otherUserId);
      const parent = await caller.create({ instruction: 'Parent', name: 'Parent' });

      await expect(
        caller.create({
          createdByAgentId: foreignAgentId,
          instruction: 'Forged author',
          name: 'Forged',
          parentTaskId: parent.data.id,
        }),
      ).rejects.toThrow();

      // Nothing was created, and the parent's feed gained no sub-issue row.
      const model = new TaskModel(serverDB, userId);
      expect(await model.findSubtasks(parent.data.id)).toHaveLength(0);
      expect(await model.getActivities(parent.data.id)).toHaveLength(0);
    });

    it('replaces a claimed createdByAgentId with the trusted acting agent on both feed rows', async () => {
      const claimedAgentId = await createTestAgent(serverDB, userId, 'agt_claimed');
      const agentCaller = taskRouter.createCaller({
        ...createTestContext(userId),
        actingAgentId: testAgentId,
      });
      const parent = await caller.create({ instruction: 'Parent', name: 'Parent' });

      const child = await agentCaller.create({
        createdByAgentId: claimedAgentId,
        instruction: 'Child',
        name: 'Child',
        parentTaskId: parent.data.id,
      });

      // The new Issue's own "created" row reads from this column.
      expect(child.data.createdByAgentId).toBe(testAgentId);
      const [row] = await new TaskModel(serverDB, userId).getActivities(parent.data.id);
      expect(row).toMatchObject({
        actorAgentId: testAgentId,
        payload: { actorKind: 'agent', toId: child.data.id },
        type: 'sub_issue_added',
      });
    });

    it('credits the signed-in person on the parent when no agent is involved', async () => {
      const parent = await caller.create({ instruction: 'Parent', name: 'Parent' });
      const child = await caller.create({
        instruction: 'Child',
        name: 'Child',
        parentTaskId: parent.data.id,
      });

      expect(child.data.createdByAgentId).toBeNull();
      const [row] = await new TaskModel(serverDB, userId).getActivities(parent.data.id);
      expect(row).toMatchObject({
        actorAgentId: null,
        actorUserId: userId,
        payload: { actorKind: 'user' },
        type: 'sub_issue_added',
      });
    });

    it('should leave createdByAgentId null when omitted (UI-created task)', async () => {
      const result = await caller.create({
        instruction: 'Created via UI',
        name: 'UI Task',
      });

      expect(result.data.createdByAgentId).toBeNull();
      expect(result.data.createdByUserId).toBe(userId);
    });

    it('should reject assigneeAgentId from another user when creating', async () => {
      otherUserId = await createTestUser(serverDB);
      const otherAgentId = await createTestAgent(serverDB, otherUserId);

      await expect(
        caller.create({
          assigneeAgentId: otherAgentId,
          instruction: 'Cross-user assignment',
          name: 'Cross-user Task',
        }),
      ).rejects.toThrow('Assignee agent not found');
    });

    it('should reject assigneeAgentId from another user when updating', async () => {
      otherUserId = await createTestUser(serverDB);
      const otherAgentId = await createTestAgent(serverDB, otherUserId);
      const task = await caller.create({
        instruction: 'Created via UI',
        name: 'UI Task',
      });

      await expect(
        caller.update({
          assigneeAgentId: otherAgentId,
          expectedDomainRevision: await revisionOf(task.data.id),
          id: task.data.id,
        }),
      ).rejects.toThrow('Assignee agent not found');
    });

    it('should clear stale editorData for instruction-only updates', async () => {
      const task = await caller.create({
        editorData: { root: { children: [{ text: 'Old instruction' }] } },
        instruction: 'Old instruction',
        name: 'Editable task',
      });

      const instructionOnlyUpdate = await caller.update({
        id: task.data.id,
        instruction: 'New instruction',
      });

      expect(instructionOnlyUpdate.data.instruction).toBe('New instruction');
      expect(instructionOnlyUpdate.data.editorData).toBeNull();

      const nextEditorData = { root: { children: [{ text: 'Rich instruction' }] } };
      const richTextUpdate = await caller.update({
        editorData: nextEditorData,
        id: task.data.id,
        instruction: 'Rich instruction',
      });

      expect(richTextUpdate.data.instruction).toBe('Rich instruction');
      expect(richTextUpdate.data.editorData).toEqual(nextEditorData);
    });

    it('should apply field and status edits in one mutation', async () => {
      const task = await caller.create({ instruction: 'Original', name: 'Original' });

      const result = await caller.update({
        id: task.data.id,
        name: 'Updated',
        status: 'completed',
      });

      expect(result.data.name).toBe('Updated');
      expect(result.data.status).toBe('completed');
    });

    it('should roll back field edits when the status transition fails', async () => {
      const task = await caller.create({ instruction: 'Original', name: 'Original' });
      const statusError = vi
        .spyOn(TaskService.prototype, 'updateStatus')
        .mockRejectedValueOnce(new Error('status transition failed'));

      await expect(
        caller.update({ id: task.data.id, name: 'Updated', status: 'completed' }),
      ).rejects.toThrow('Failed to update task');

      statusError.mockRestore();
      const persisted = await new TaskModel(serverDB, userId).findById(task.data.id);
      expect(persisted?.name).toBe('Original');
      expect(persisted?.status).toBe('backlog');
    });

    it('should move a linked task to the exact mapped workflow state without changing execution', async () => {
      const workspaceId = 'task-workflow-board-workspace';
      const { workspaces, workspaceMembers } = await import('@/database/schemas');
      await serverDB.insert(workspaces).values({
        id: workspaceId,
        name: 'Workflow Board Workspace',
        primaryOwnerId: userId,
        slug: workspaceId,
      });
      await serverDB.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId });
      const wsCaller = taskRouter.createCaller({ ...createTestContext(userId), workspaceId });
      // Project creation provisions a coordinator via Prime inheritance;
      // strict admission requires an executable workspace-scoped runtime.
      await seedPrimeRuntime(serverDB, { userId, workspaceId });
      const project = await new ProjectModel(serverDB, userId, workspaceId).create({
        identifier: 'WFLOW',
        name: 'Workflow board project',
      });
      const created = await wsCaller.create({
        instruction: 'Move the business state only',
        projectId: project.id,
      });

      const linear = new LinearSyncModel(serverDB, workspaceId);
      const installation = await linear.upsertOAuthInstallation({
        accessTokenCiphertext: 'encrypted-access',
        accessTokenExpiresAt: null,
        appActorId: 'linear-app',
        installedByUserId: userId,
        oauthClientId: 'linear-client',
        organizationId: 'linear-org',
        refreshTokenCiphertext: 'encrypted-refresh',
        scopes: ['read', 'write'],
      });
      const binding = await linear.upsertBinding({
        defaultTeamId: 'linear-team',
        installationId: installation.id,
        linearProjectId: 'linear-project',
        projectId: project.id,
        settings: {
          statusMappings: [
            { linearStateId: 'linear-state-backlog', workflowCategory: 'backlog' },
            { linearStateId: 'linear-state-done', workflowCategory: 'done' },
          ],
          writeEnabled: true,
        },
        teamIds: ['linear-team'],
      });
      await linear.createIssueLink({
        bindingId: binding.id,
        installationId: installation.id,
        linearIdentifier: 'ENG-42',
        linearIssueId: 'linear-issue-42',
        organizationId: 'linear-org',
        remoteSnapshot: {
          id: 'linear-issue-42',
          identifier: 'ENG-42',
          projectId: 'linear-project',
          stateId: 'linear-state-backlog',
          teamId: 'linear-team',
          title: 'Move the business state only',
        },
        taskId: created.data.id,
      });
      await new TaskModel(serverDB, userId, workspaceId).update(
        created.data.id,
        { workflowCategory: 'backlog', workflowStateId: 'linear-state-backlog' },
        { source: 'linear', suppressLinearOutbox: true },
      );

      const moved = await wsCaller.update({
        id: created.data.id,
        workflowCategory: 'done',
      });

      expect(moved.data).toMatchObject({
        status: 'completed',
        workflowCategory: 'done',
        workflowStateId: 'linear-state-done',
      });
      const outbox = await linear.listOutbox();
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toMatchObject({
        operation: 'update_issue',
        payload: { stateId: 'linear-state-done' },
        taskId: created.data.id,
      });

      await expect(
        wsCaller.update({ id: created.data.id, workflowCategory: 'todo' }),
      ).rejects.toThrow('No Linear state is mapped to todo');
    });
  });

  describe('activity feed container names', () => {
    it('names a private team, its workflow state, a private project and its milestone only for a reader who can open them', async () => {
      otherUserId = await createTestUser(serverDB);
      const { projectMilestones, teams, teamWorkflowStates, workspaces, workspaceMembers } =
        await import('@/database/schemas');
      const workspaceId = 'activity-container-names-workspace';
      await serverDB.insert(workspaces).values({
        id: workspaceId,
        name: 'Container names',
        primaryOwnerId: userId,
        slug: workspaceId,
      });
      await serverDB.insert(workspaceMembers).values([
        { role: 'owner', userId, workspaceId },
        { role: 'member', userId: otherUserId, workspaceId },
      ]);
      const teamId = 'activity-container-private-team';
      await serverDB.insert(teams).values({
        id: teamId,
        key: 'SEC',
        name: 'Secret team',
        visibility: 'private',
        workspaceId,
      });
      const [state] = await serverDB
        .insert(teamWorkflowStates)
        .values({ category: 'in_progress', name: 'Secret review', teamId, workspaceId })
        .returning();
      const [project] = await serverDB
        .insert(projects)
        .values({
          identifier: 'SECRET',
          name: 'Secret project',
          userId,
          visibility: 'private',
          workspaceId,
        })
        .returning();
      const [milestone] = await serverDB
        .insert(projectMilestones)
        .values({ name: 'Secret milestone', projectId: project.id })
        .returning();

      const ownerCaller = taskRouter.createCaller({ ...createTestContext(userId), workspaceId });
      const memberCaller = taskRouter.createCaller({
        ...createTestContext(otherUserId),
        workspaceId,
      });
      const task = await ownerCaller.create({ instruction: 'Shared Issue', name: 'Shared Issue' });
      // The rows as the writers leave them: the name copied in next to the id.
      const model = new TaskModel(serverDB, userId, workspaceId);
      const row = { actorUserId: userId, taskId: task.data.id };
      await model.addActivity({
        ...row,
        payload: { actorKind: 'user', fromId: null, toId: teamId, toLabel: 'Secret team' },
        type: 'team',
      });
      await model.addActivity({
        ...row,
        payload: { actorKind: 'user', fromId: null, toId: project.id, toLabel: 'Secret project' },
        type: 'project',
      });
      await model.addActivity({
        ...row,
        payload: {
          actorKind: 'user',
          fromId: null,
          toId: milestone.id,
          toLabel: 'Secret milestone',
        },
        type: 'milestone',
      });
      await model.addActivity({
        ...row,
        payload: {
          actorKind: 'user',
          from: 'todo',
          fromId: null,
          to: 'in_progress',
          toId: state.id,
          toLabel: 'Secret review',
        },
        type: 'workflow_state',
      });

      const changes = async (caller: typeof ownerCaller) =>
        ((await caller.detail({ id: task.data.id })).data.activities ?? []).flatMap((activity) =>
          activity.type === 'property' ? [activity.propertyChange] : [],
        );

      // The owner administers the workspace and reads every team and project.
      expect(await changes(ownerCaller)).toEqual(
        expect.arrayContaining([
          { field: 'team', from: null, to: 'Secret team' },
          { field: 'project', from: null, to: 'Secret project' },
          { field: 'milestone', from: null, to: 'Secret milestone' },
          {
            field: 'workflow',
            from: { category: 'todo', name: null },
            to: { category: 'in_progress', name: 'Secret review' },
          },
        ]),
      );

      // A member outside the team and the project can read the Issue, and
      // learns that it moved — but not the names of what it moved to.
      const seen = await changes(memberCaller);
      expect(seen).toEqual(
        expect.arrayContaining([
          { field: 'team', from: null, to: '' },
          { field: 'project', from: null, to: '' },
          { field: 'milestone', from: null, to: '' },
          {
            field: 'workflow',
            from: { category: 'todo', name: null },
            to: { category: 'in_progress', name: null },
          },
        ]),
      );
      expect(JSON.stringify(seen)).not.toMatch(/Secret/);
    });
  });

  describe('coexisting assignees (agent + member)', () => {
    // The executing agent and the human owner are independent sides that can
    // coexist on one task — the tool layer and the UI both rely on the router
    // never cross-clearing them.
    const setupWorkspace = async () => {
      const workspaceId = 'task-assignee-coexist-workspace';
      const { agents, workspaces, workspaceMembers } = await import('@/database/schemas');
      await serverDB.insert(workspaces).values({
        id: workspaceId,
        name: 'Assignee Coexist Workspace',
        primaryOwnerId: userId,
        slug: workspaceId,
      });
      await serverDB.insert(workspaceMembers).values([
        { role: 'owner', userId, workspaceId },
        { role: 'member', userId: otherUserId!, workspaceId },
      ]);
      const wsAgentId = 'agt_assignee_coexist_ws';
      await serverDB
        .insert(agents)
        .values({ id: wsAgentId, slug: wsAgentId, userId, workspaceId })
        .onConflictDoNothing();
      return {
        workspaceId,
        wsAgentId,
        wsCaller: taskRouter.createCaller({ ...createTestContext(userId), workspaceId }),
      };
    };

    it('normalizes old private workspace requests and allows members and legacy-private parents', async () => {
      otherUserId = await createTestUser(serverDB);
      const { workspaceId, wsCaller } = await setupWorkspace();
      const parent = await wsCaller.create({
        instruction: 'Old private parent',
        visibility: 'private',
        assigneeUserId: otherUserId,
      });
      expect(parent.data.visibility).toBe('public');
      await serverDB
        .update(tasks)
        .set({ visibility: 'private' })
        .where(eq(tasks.id, parent.data.id));
      const child = await wsCaller.create({
        instruction: 'Old private child',
        visibility: 'private',
        parentTaskId: parent.data.id,
        assigneeUserId: otherUserId,
      });
      expect(child.data.visibility).toBe('public');
      const memberCaller = taskRouter.createCaller({
        ...createTestContext(otherUserId),
        workspaceId,
      });
      expect((await memberCaller.detail({ id: parent.data.id })).data.visibility).toBe('public');
      expect(
        (await memberCaller.updateVisibility({ id: parent.data.id, visibility: 'private' })).data
          .visibility,
      ).toBe('public');
    });

    it('rejects an Agent reassigned to private between member preflight and locked dispatch admission', async () => {
      otherUserId = await createTestUser(serverDB);
      const { workspaceId, wsAgentId, wsCaller } = await setupWorkspace();
      const { agents } = await import('@/database/schemas');
      const privateAgentId = 'agt_assignee_race_private';
      await serverDB.insert(agents).values({
        id: privateAgentId,
        slug: privateAgentId,
        userId,
        workspaceId,
        visibility: 'private',
      });
      const created = await wsCaller.create({
        assigneeAgentId: wsAgentId,
        instruction: 'Race executor',
      });
      const memberCaller = taskRouter.createCaller({
        ...createTestContext(otherUserId),
        workspaceId,
      });
      const { resourcePermissions } = await import('@/database/schemas');
      await serverDB.insert(resourcePermissions).values({
        accessLevel: 'use',
        createdBy: userId,
        resourceId: wsAgentId,
        resourceType: 'agent',
        userId: otherUserId!,
        workspaceId,
      });
      const originalPrepare = TaskDispatchService.prototype.prepare;
      const kickoff = vi.spyOn(TaskModel.prototype, 'claimRunKickoff');
      const provision = vi.spyOn(TaskWorkspaceService.prototype, 'provision');
      const prepare = vi
        .spyOn(TaskDispatchService.prototype, 'prepare')
        .mockImplementationOnce(async function (this: TaskDispatchService, input) {
          await wsCaller.update({
            id: created.data.id,
            assigneeAgentId: privateAgentId,
            expectedDomainRevision: await revisionOf(created.data.id),
          });
          return originalPrepare.call(this, input);
        });
      try {
        const generationBefore = created.data.executionGeneration;
        const result = await memberCaller.run({ id: created.data.id }).then(
          () => 'started',
          (error) => error,
        );
        expect(prepare).toHaveBeenCalledTimes(1);
        expect
          .soft(
            await serverDB
              .select()
              .from(taskDispatches)
              .where(eq(taskDispatches.taskId, created.data.id)),
          )
          .toHaveLength(0);
        const afterRun = await new TaskModel(serverDB, userId, workspaceId).findById(
          created.data.id,
        );
        expect.soft(afterRun?.executionGeneration).toBe(generationBefore);
        expect.soft(kickoff).not.toHaveBeenCalled();
        expect.soft(provision).not.toHaveBeenCalled();
        expect.soft(mockExecAgent).not.toHaveBeenCalled();
        expect.soft(result).toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        prepare.mockRestore();
        kickoff.mockRestore();
        provision.mockRestore();
      }
    });

    it('shares a task assigned to an owner personal Agent without granting teammate execution', async () => {
      otherUserId = await createTestUser(serverDB);
      const { workspaceId, wsAgentId, wsCaller } = await setupWorkspace();
      const { agents } = await import('@/database/schemas');
      await serverDB.update(agents).set({ visibility: 'private' }).where(eq(agents.id, wsAgentId));
      const created = await wsCaller.create({
        assigneeAgentId: wsAgentId,
        assigneeUserId: otherUserId,
        instruction: 'Shared outcome, personal executor',
      });
      expect(created.data.visibility).toBe('public');
      expect(created.data.assigneeUserId).toBe(otherUserId);
      const teammate = new TaskModel(serverDB, otherUserId!, workspaceId);
      expect(await teammate.findById(created.data.id)).toMatchObject({ id: created.data.id });
      const memberCaller = taskRouter.createCaller({
        ...createTestContext(otherUserId),
        workspaceId,
      });
      const beforeRun = await teammate.findById(created.data.id);

      await expect(memberCaller.run({ id: created.data.id })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(await teammate.findById(created.data.id)).toEqual(beforeRun);
      expect(
        await serverDB
          .select()
          .from(taskDispatches)
          .where(eq(taskDispatches.taskId, created.data.id)),
      ).toHaveLength(0);
      expect(mockExecAgent).not.toHaveBeenCalled();

      const normalized = await wsCaller.updateVisibility({
        id: created.data.id,
        visibility: 'private',
      });
      expect(normalized.data.visibility).toBe('public');
      expect(normalized.data.assigneeUserId).toBe(otherUserId);
      expect(await teammate.findById(created.data.id)).toMatchObject({ visibility: 'public' });
    });

    it('creates a task with an executing agent AND a human owner, notifying the member once', async () => {
      otherUserId = await createTestUser(serverDB);
      const { wsAgentId, wsCaller } = await setupWorkspace();

      const task = await wsCaller.create({
        assigneeAgentId: wsAgentId,
        assigneeUserId: otherUserId,
        instruction: 'Coexisting assignees',
      });

      expect(task.data.assigneeAgentId).toBe(wsAgentId);
      expect(task.data.assigneeUserId).toBe(otherUserId);
      await flushAfterResponse();
      expect(mockNotifyTaskAssigned).toHaveBeenCalledTimes(1);
      expect(mockNotifyTaskAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeUserId: otherUserId, taskId: task.data.id }),
      );
    });

    it('updating one assignee side never clears the other', async () => {
      otherUserId = await createTestUser(serverDB);
      const { wsAgentId, wsCaller } = await setupWorkspace();
      const task = await wsCaller.create({ assigneeAgentId: wsAgentId, instruction: 'Sides' });

      const withMember = await wsCaller.update({
        assigneeUserId: otherUserId,
        expectedDomainRevision: await revisionOf(task.data.id),
        id: task.data.id,
      });
      expect(withMember.data.assigneeAgentId).toBe(wsAgentId);
      expect(withMember.data.assigneeUserId).toBe(otherUserId);

      const agentCleared = await wsCaller.update({
        assigneeAgentId: null,
        expectedDomainRevision: await revisionOf(task.data.id),
        id: task.data.id,
      });
      expect(agentCleared.data.assigneeAgentId).toBeNull();
      expect(agentCleared.data.assigneeUserId).toBe(otherUserId);

      const memberCleared = await wsCaller.update({
        assigneeUserId: null,
        expectedDomainRevision: await revisionOf(task.data.id),
        id: task.data.id,
      });
      expect(memberCleared.data.assigneeUserId).toBeNull();
      expect(memberCleared.data.assigneeAgentId).toBeNull();
    });
  });

  describe('subtasks + dependencies', () => {
    it('should create subtasks and set dependencies', async () => {
      const parent = await caller.create({
        instruction: 'Write a book',
        name: 'Book',
      });

      const ch1 = await caller.create({
        instruction: 'Write chapter 1',
        name: 'Chapter 1',
        parentTaskId: parent.data.id,
      });
      const ch2 = await caller.create({
        instruction: 'Write chapter 2',
        name: 'Chapter 2',
        parentTaskId: parent.data.id,
      });

      // Add dependency: ch2 blocks on ch1
      await caller.addDependency({
        dependsOnId: ch1.data.id,
        taskId: ch2.data.id,
      });

      const detail = await caller.detail({ id: parent.data.identifier });
      expect(detail.data.subtasks).toHaveLength(2);
      // ch2 should have blockedBy pointing to ch1's identifier
      const ch2Sub = detail.data.subtasks!.find((s) => s.name === 'Chapter 2');
      expect(ch2Sub?.blockedBy).toBeTruthy();
    });

    it('should reparent tasks and allow moving them back to top level', async () => {
      const parent = await caller.create({ instruction: 'Parent', name: 'Parent' });
      const newParent = await caller.create({ instruction: 'New parent', name: 'New Parent' });
      const child = await caller.create({
        instruction: 'Child',
        name: 'Child',
        parentTaskId: parent.data.id,
      });

      const reparented = await caller.update({
        id: child.data.identifier,
        parentTaskId: newParent.data.identifier,
      });

      expect(reparented.data.parentTaskId).toBe(newParent.data.id);

      const topLevel = await caller.update({
        id: child.data.identifier,
        parentTaskId: null,
      });

      expect(topLevel.data.parentTaskId).toBeNull();
    });

    it('allows same-owner personal reparenting regardless of visibility flags', async () => {
      const privateParent = await caller.create({
        instruction: 'Private parent',
        name: 'Private Parent',
        visibility: 'private',
      });
      const publicChild = await caller.create({
        instruction: 'Public child',
        name: 'Public Child',
        visibility: 'public',
      });

      await expect(
        caller.update({
          id: publicChild.data.identifier,
          parentTaskId: privateParent.data.identifier,
        }),
      ).resolves.toMatchObject({ data: { parentTaskId: privateParent.data.id } });
    });

    it('should reject reparenting a task to itself or its descendant', async () => {
      const parent = await caller.create({ instruction: 'Parent', name: 'Parent' });
      const child = await caller.create({
        instruction: 'Child',
        name: 'Child',
        parentTaskId: parent.data.id,
      });

      await expect(
        caller.update({
          id: parent.data.identifier,
          parentTaskId: parent.data.identifier,
        }),
      ).rejects.toThrow('Task cannot be parented to itself');

      await expect(
        caller.update({
          id: parent.data.identifier,
          parentTaskId: child.data.identifier,
        }),
      ).rejects.toThrow('Task cannot be parented to its own descendant');
    });

    const seedProject = async (suffix: string) => {
      const projectId = `project-${suffix}-${userId}`;
      await serverDB
        .insert(projects)
        .values({ id: projectId, identifier: suffix.toUpperCase(), name: suffix, userId });
      return projectId;
    };

    /** The stable reason the error formatter forwards to clients as `errorData.code`. */
    const rejectionCode = async (write: Promise<unknown>) => {
      const error = await write.then(
        () => undefined,
        (failure: { cause?: { data?: { code?: string } } }) => failure,
      );
      return error?.cause?.data?.code;
    };

    it('puts several existing issues under one parent in a single write', async () => {
      const parent = await caller.create({ instruction: 'Parent', name: 'Parent' });
      const oldParent = await caller.create({ instruction: 'Old parent', name: 'Old Parent' });
      const first = await caller.create({ instruction: 'First', name: 'First' });
      const second = await caller.create({
        instruction: 'Second',
        name: 'Second',
        parentTaskId: oldParent.data.id,
      });

      const result = await caller.setParentBatch({
        parentTaskId: parent.data.identifier,
        taskIds: [first.data.identifier, second.data.id, first.data.id],
      });

      expect(result.data.map((task) => task.id)).toEqual([first.data.id, second.data.id]);
      const detail = await caller.detail({ id: parent.data.identifier });
      expect(detail.data.subtasks?.map((task) => task.name).sort()).toEqual(['First', 'Second']);
      // An issue that already had a parent is moved, not refused.
      expect((await caller.detail({ id: oldParent.data.identifier })).data.subtasks ?? []).toEqual(
        [],
      );
    });

    it('rolls the whole batch back when one issue cannot become a child', async () => {
      const grandparent = await caller.create({ instruction: 'Grandparent', name: 'Grandparent' });
      const parent = await caller.create({
        instruction: 'Parent',
        name: 'Parent',
        parentTaskId: grandparent.data.id,
      });
      const loose = await caller.create({ instruction: 'Loose', name: 'Loose' });

      // The grandparent is an ancestor of the target parent — a cycle.
      const write = caller.setParentBatch({
        parentTaskId: parent.data.id,
        taskIds: [loose.data.id, grandparent.data.id],
      });
      await expect(write).rejects.toThrow('Task cannot be parented to its own descendant');
      expect(
        await rejectionCode(
          caller.setParentBatch({
            parentTaskId: parent.data.id,
            taskIds: [loose.data.id, grandparent.data.id],
          }),
        ),
      ).toBe('CYCLE');

      expect((await caller.find({ id: loose.data.id })).data.parentTaskId).toBeNull();
    });

    it('refuses a cycle that runs through an issue the caller cannot read', async () => {
      otherUserId = await createTestUser(serverDB);
      const otherCaller = taskRouter.createCaller(createTestContext(otherUserId));
      const top = await caller.create({ instruction: 'Top', name: 'Top' });
      const hidden = await otherCaller.create({ instruction: 'Hidden', name: 'Hidden' });
      const bottom = await caller.create({ instruction: 'Bottom', name: 'Bottom' });
      const loose = await caller.create({ instruction: 'Loose', name: 'Loose' });
      // top → hidden → bottom, where the caller cannot read the middle Issue,
      // so a walk down from `top` through readable Issues never reaches `bottom`.
      await serverDB
        .update(tasks)
        .set({ parentTaskId: top.data.id })
        .where(eq(tasks.id, hidden.data.id));
      await serverDB
        .update(tasks)
        .set({ parentTaskId: hidden.data.id })
        .where(eq(tasks.id, bottom.data.id));

      expect(
        await rejectionCode(
          caller.setParentBatch({
            parentTaskId: bottom.data.id,
            taskIds: [loose.data.id, top.data.id],
          }),
        ),
      ).toBe('CYCLE');
      expect(
        await rejectionCode(caller.update({ id: top.data.id, parentTaskId: bottom.data.id })),
      ).toBe('CYCLE');
      expect((await caller.find({ id: loose.data.id })).data.parentTaskId).toBeNull();
      expect((await caller.find({ id: top.data.id })).data.parentTaskId).toBeNull();
    });

    it('never lets two concurrent parent writes close a loop', async () => {
      const left = await caller.create({ instruction: 'Left', name: 'Left' });
      const right = await caller.create({ instruction: 'Right', name: 'Right' });

      // Each write is legal alone; together they would make each the other's parent.
      const outcomes = await Promise.allSettled([
        caller.update({ id: left.data.id, parentTaskId: right.data.id }),
        caller.setParentBatch({ parentTaskId: left.data.id, taskIds: [right.data.id] }),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const parents = [
        (await caller.find({ id: left.data.id })).data.parentTaskId,
        (await caller.find({ id: right.data.id })).data.parentTaskId,
      ];
      expect(parents.filter(Boolean)).toHaveLength(1);
    });

    it('answers the same for an issue that is hidden and one that does not exist', async () => {
      otherUserId = await createTestUser(serverDB);
      const otherCaller = taskRouter.createCaller(createTestContext(otherUserId));
      const foreign = await otherCaller.create({ instruction: 'Foreign', name: 'Secret title' });
      const parent = await caller.create({ instruction: 'Parent', name: 'Parent' });
      const failure = (write: Promise<unknown>) =>
        write.then(
          () => undefined,
          (error: { code?: string; message?: string }) => ({
            code: error.code,
            message: error.message,
          }),
        );

      const hidden = await failure(
        caller.setParentBatch({ parentTaskId: parent.data.id, taskIds: [foreign.data.id] }),
      );
      const missing = await failure(
        caller.setParentBatch({ parentTaskId: parent.data.id, taskIds: ['task_does_not_exist'] }),
      );
      expect(hidden).toEqual({ code: 'NOT_FOUND', message: 'Task not found' });
      expect(hidden).toEqual(missing);
      expect(
        await failure(
          // By database id: identifiers are numbered per owner, so the other
          // user's `T-n` would resolve to one of the caller's own Issues.
          caller.setParentBatch({ parentTaskId: foreign.data.id, taskIds: [parent.data.id] }),
        ),
      ).toEqual(missing);
    });

    it('keeps hidden issues out of a relation search, as hits and as parent labels', async () => {
      otherUserId = await createTestUser(serverDB);
      const otherCaller = taskRouter.createCaller(createTestContext(otherUserId));
      const search = workAttentionRouter.createCaller(createTestContext(userId)).search;
      const foreign = await otherCaller.create({ instruction: 'Foreign', name: 'Scope foreign' });
      const anchor = await caller.create({ instruction: 'Anchor', name: 'Scope anchor' });
      const candidate = await caller.create({ instruction: 'Mine', name: 'Scope mine' });
      // The candidate hangs under an Issue the caller cannot read.
      await serverDB
        .update(tasks)
        .set({ parentTaskId: foreign.data.id })
        .where(eq(tasks.id, candidate.data.id));

      const hits = (
        await search({
          eligibleFor: { relation: 'child', taskId: anchor.data.id },
          limitPerType: 50,
          query: 'Scope',
          type: 'task',
        })
      ).data;
      expect(hits.map((hit) => hit.title)).toEqual(['Scope mine']);
      expect(hits[0]).toMatchObject({ parentIdentifier: null });
      expect(JSON.stringify(hits)).not.toContain(foreign.data.id);

      // Anchoring the search on a hidden Issue reads like anchoring it on nothing.
      const anchored = (taskId: string) =>
        search({ eligibleFor: { relation: 'child', taskId }, query: 'Scope', type: 'task' }).then(
          () => undefined,
          (error: { code?: string; message?: string }) => [error.code, error.message],
        );
      expect(await anchored(foreign.data.id)).toEqual(['NOT_FOUND', 'Task not found']);
      expect(await anchored(foreign.data.id)).toEqual(await anchored('task_does_not_exist'));
    });

    describe('scope of a parent link', () => {
      const workspaceId = 'task-parent-scope-workspace';
      let wsCaller: ReturnType<typeof taskRouter.createCaller>;
      const setParentRaw = (id: string, parentTaskId: string | null) =>
        serverDB.update(tasks).set({ parentTaskId }).where(eq(tasks.id, id));
      const parentOf = async (id: string) =>
        (await serverDB.select({ p: tasks.parentTaskId }).from(tasks).where(eq(tasks.id, id)))[0]
          ?.p;

      beforeEach(async () => {
        const { workspaces, workspaceMembers } = await import('@/database/schemas');
        await serverDB.insert(workspaces).values({
          id: workspaceId,
          name: 'Parent scope workspace',
          primaryOwnerId: userId,
          slug: workspaceId,
        });
        await serverDB.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId });
        wsCaller = taskRouter.createCaller({ ...createTestContext(userId), workspaceId });
      });

      it('refuses a new link between an unfiled issue and a workspace issue', async () => {
        const unfiled = await caller.create({ instruction: 'Unfiled', name: 'Unfiled' });
        const filed = await wsCaller.create({ instruction: 'Filed', name: 'Filed' });

        // The workspace context can read both, so only the scope rule stops it.
        expect(
          await rejectionCode(
            wsCaller.update({ id: filed.data.id, parentTaskId: unfiled.data.id }),
          ),
        ).toBe('CROSS_SCOPE');
        expect(
          await rejectionCode(
            wsCaller.update({ id: unfiled.data.id, parentTaskId: filed.data.id }),
          ),
        ).toBe('CROSS_SCOPE');
        expect(
          await rejectionCode(
            wsCaller.setParentBatch({ parentTaskId: filed.data.id, taskIds: [unfiled.data.id] }),
          ),
        ).toBe('CROSS_SCOPE');
        expect(
          await rejectionCode(
            wsCaller.setParentBatch({ parentTaskId: unfiled.data.id, taskIds: [filed.data.id] }),
          ),
        ).toBe('CROSS_SCOPE');
        expect(await parentOf(filed.data.id)).toBeNull();
        expect(await parentOf(unfiled.data.id)).toBeNull();
      });

      it('refuses to create a sub-issue under a parent filed elsewhere', async () => {
        const unfiled = await caller.create({ instruction: 'Unfiled', name: 'Unfiled' });

        expect(
          await rejectionCode(
            wsCaller.create({ instruction: 'Child', name: 'Child', parentTaskId: unfiled.data.id }),
          ),
        ).toBe('CROSS_SCOPE');
      });

      it('still links two issues of one scope, in a workspace and in personal mode', async () => {
        const wsParent = await wsCaller.create({ instruction: 'P', name: 'Workspace parent' });
        const wsChild = await wsCaller.create({ instruction: 'C', name: 'Workspace child' });
        const wsOther = await wsCaller.create({ instruction: 'O', name: 'Workspace other' });
        const parent = await caller.create({ instruction: 'P', name: 'Personal parent' });
        const child = await caller.create({ instruction: 'C', name: 'Personal child' });

        await wsCaller.update({ id: wsChild.data.id, parentTaskId: wsParent.data.id });
        await wsCaller.setParentBatch({
          parentTaskId: wsParent.data.id,
          taskIds: [wsOther.data.id],
        });
        await caller.update({ id: child.data.id, parentTaskId: parent.data.id });
        // Two unfiled issues link from the workspace context too: same scope.
        const second = await caller.create({ instruction: 'S', name: 'Personal second' });
        await wsCaller.update({ id: second.data.id, parentTaskId: parent.data.id });
        await wsCaller.create({ instruction: 'N', name: 'New', parentTaskId: wsParent.data.id });

        expect(await parentOf(wsChild.data.id)).toBe(wsParent.data.id);
        expect(await parentOf(wsOther.data.id)).toBe(wsParent.data.id);
        expect(await parentOf(child.data.id)).toBe(parent.data.id);
        expect(await parentOf(second.data.id)).toBe(parent.data.id);
      });

      it('lets an existing cross-scope parent be removed or replaced', async () => {
        const unfiled = await caller.create({ instruction: 'Unfiled', name: 'Unfiled' });
        const filed = await wsCaller.create({ instruction: 'Filed', name: 'Filed' });
        const sameScope = await wsCaller.create({ instruction: 'Same', name: 'Same scope' });
        // Written before the rule existed.
        await setParentRaw(filed.data.id, unfiled.data.id);

        const replaced = await wsCaller.update({
          id: filed.data.id,
          parentTaskId: sameScope.data.id,
        });
        expect(replaced.data.parentTaskId).toBe(sameScope.data.id);

        await setParentRaw(filed.data.id, unfiled.data.id);
        const removed = await wsCaller.update({ id: filed.data.id, parentTaskId: null });
        expect(removed.data.parentTaskId).toBeNull();
      });

      it('offers only same-scope issues as sub-issue or parent candidates', async () => {
        const search = workAttentionRouter.createCaller({
          ...createTestContext(userId),
          workspaceId,
        }).search;
        await caller.create({ instruction: 'Unfiled', name: 'Reach unfiled' });
        const anchor = await wsCaller.create({ instruction: 'Anchor', name: 'Reach anchor' });
        await wsCaller.create({ instruction: 'Filed', name: 'Reach filed' });
        const titles = async (relation: 'child' | 'parent') =>
          (
            await search({
              eligibleFor: { relation, taskId: anchor.data.id },
              limitPerType: 50,
              query: 'Reach',
              type: 'task',
            })
          ).data.map((hit) => hit.title);

        // The unfiled issue is readable here — an unscoped search returns it —
        // but it is never offered as a parent or a child.
        const unscoped = (await search({ limitPerType: 50, query: 'Reach', type: 'task' })).data;
        expect(unscoped.map((hit) => hit.title).sort()).toEqual([
          'Reach anchor',
          'Reach filed',
          'Reach unfiled',
        ]);
        expect(await titles('child')).toEqual(['Reach filed']);
        expect(await titles('parent')).toEqual(['Reach filed']);
      });

      it('refuses with CONFLICT when an issue changed scope after it was read', async () => {
        const parent = await wsCaller.create({ instruction: 'P', name: 'Parent' });
        const child = await wsCaller.create({ instruction: 'C', name: 'Child' });
        // The request reads both rows as workspace issues and picks its locks
        // from them. Right after its last read before the transaction (the
        // second time it resolves the parent), a transfer moves the child to
        // the caller's unfiled issues.
        const realResolve = TaskModel.prototype.resolve;
        let parentReads = 0;
        const resolve = vi.spyOn(TaskModel.prototype, 'resolve').mockImplementation(async function (
          this: TaskModel,
          id: string,
        ) {
          const row = await realResolve.call(this, id);
          if (row?.id === parent.data.id && ++parentReads === 2) {
            await serverDB
              .update(tasks)
              .set({ workspaceId: null })
              .where(eq(tasks.id, child.data.id));
          }
          return row;
        });

        try {
          await expect(
            wsCaller.update({ id: child.data.id, parentTaskId: parent.data.id }),
          ).rejects.toMatchObject({ code: 'CONFLICT' });
        } finally {
          resolve.mockRestore();
        }
        expect(await parentOf(child.data.id)).toBeNull();
      });

      it('returns from both tree reads on a tree whose parent pointers loop', async () => {
        const first = await caller.create({ instruction: 'First', name: 'First' });
        const second = await caller.create({ instruction: 'Second', name: 'Second' });
        const leaf = await caller.create({
          instruction: 'Leaf',
          name: 'Leaf',
          parentTaskId: second.data.id,
        });
        await setParentRaw(first.data.id, second.data.id);
        await setParentRaw(second.data.id, first.data.id);

        const tree = await caller.getTaskTree({ id: first.data.id });
        expect(tree.data.map((task) => task.id).sort()).toEqual(
          [first.data.id, second.data.id, leaf.data.id].sort(),
        );

        // The project move walks the same subtree. It only checks that the
        // root's parent is already in the target project, so file that one there.
        const projectId = await seedProject('loop');
        await serverDB.update(tasks).set({ projectId }).where(eq(tasks.id, second.data.id));
        const moved = await new ProjectModel(serverDB, userId).moveTaskTree(
          projectId,
          first.data.id,
        );
        expect(moved?.map((row) => row.id).sort()).toEqual(
          [first.data.id, second.data.id, leaf.data.id].sort(),
        );
      });

      it('leaves a normal tree read unchanged', async () => {
        const root = await caller.create({ instruction: 'Root', name: 'Root' });
        const a = await caller.create({ instruction: 'A', name: 'A', parentTaskId: root.data.id });
        const b = await caller.create({ instruction: 'B', name: 'B', parentTaskId: a.data.id });

        const tree = await caller.getTaskTree({ id: root.data.id });
        expect(tree.data.map((task) => task.id)).toEqual([root.data.id, a.data.id, b.data.id]);
      });
    });

    it('walks descendants of a looping tree once and stops', async () => {
      const first = await caller.create({ instruction: 'First', name: 'First' });
      const second = await caller.create({ instruction: 'Second', name: 'Second' });
      const third = await caller.create({
        instruction: 'Third',
        name: 'Third',
        parentTaskId: second.data.id,
      });
      // A corrupt legacy loop: first ⇄ second.
      await serverDB
        .update(tasks)
        .set({ parentTaskId: second.data.id })
        .where(eq(tasks.id, first.data.id));
      await serverDB
        .update(tasks)
        .set({ parentTaskId: first.data.id })
        .where(eq(tasks.id, second.data.id));

      const descendants = await new TaskModel(serverDB, userId).findAllDescendants(first.data.id);

      expect(descendants.map((task) => task.id).sort()).toEqual(
        [second.data.id, third.data.id].sort(),
      );
    });

    it('moves an issue out of a looping tree instead of hanging on it', async () => {
      const stuck = await caller.create({ instruction: 'Stuck', name: 'Stuck' });
      const partner = await caller.create({ instruction: 'Partner', name: 'Partner' });
      const parent = await caller.create({ instruction: 'Parent', name: 'Parent' });
      const batchParent = await caller.create({ instruction: 'Batch', name: 'Batch parent' });
      // `stuck` is its own descendant: stuck ⇄ partner.
      await serverDB
        .update(tasks)
        .set({ parentTaskId: partner.data.id })
        .where(eq(tasks.id, stuck.data.id));
      await serverDB
        .update(tasks)
        .set({ parentTaskId: stuck.data.id })
        .where(eq(tasks.id, partner.data.id));

      const moved = await caller.update({ id: stuck.data.id, parentTaskId: parent.data.id });
      expect(moved.data.parentTaskId).toBe(parent.data.id);

      // And through the batch write, from the same corrupt starting point.
      await serverDB
        .update(tasks)
        .set({ parentTaskId: partner.data.id })
        .where(eq(tasks.id, stuck.data.id));
      const batch = await caller.setParentBatch({
        parentTaskId: batchParent.data.id,
        taskIds: [stuck.data.id],
      });
      expect(batch.data.map((task) => task.parentTaskId)).toEqual([batchParent.data.id]);
    });

    it('names a parent whose own chain is unusable differently from a cycle', async () => {
      const first = await caller.create({ instruction: 'First', name: 'First' });
      const second = await caller.create({ instruction: 'Second', name: 'Second' });
      const loose = await caller.create({ instruction: 'Loose', name: 'Loose' });
      await serverDB
        .update(tasks)
        .set({ parentTaskId: second.data.id })
        .where(eq(tasks.id, first.data.id));
      await serverDB
        .update(tasks)
        .set({ parentTaskId: first.data.id })
        .where(eq(tasks.id, second.data.id));

      // `loose` is not in the loop, so this is not a cycle it would create.
      expect(
        await rejectionCode(
          caller.setParentBatch({ parentTaskId: first.data.id, taskIds: [loose.data.id] }),
        ),
      ).toBe('BROKEN_PARENT_CHAIN');
      expect(
        await rejectionCode(caller.update({ id: loose.data.id, parentTaskId: first.data.id })),
      ).toBe('BROKEN_PARENT_CHAIN');
      // An issue that is in the chain is still a cycle.
      expect(
        await rejectionCode(caller.update({ id: second.data.id, parentTaskId: first.data.id })),
      ).toBe('CYCLE');
    });

    it('sets a parent and an assignee in one update', async () => {
      const parent = await caller.create({ instruction: 'Parent', name: 'Parent' });
      const child = await caller.create({ instruction: 'Child', name: 'Child' });

      const updated = await caller.update({
        assigneeUserId: userId,
        expectedDomainRevision: await revisionOf(child.data.id),
        id: child.data.id,
        parentTaskId: parent.data.id,
      });

      expect(updated.data).toMatchObject({
        assigneeUserId: userId,
        parentTaskId: parent.data.id,
      });
    });

    it('refuses to extend a parent chain that never reaches a root', async () => {
      const first = await caller.create({ instruction: 'First', name: 'First' });
      const second = await caller.create({ instruction: 'Second', name: 'Second' });
      const loose = await caller.create({ instruction: 'Loose', name: 'Loose' });
      // A corrupt legacy loop: first ⇄ second.
      await serverDB
        .update(tasks)
        .set({ parentTaskId: second.data.id })
        .where(eq(tasks.id, first.data.id));
      await serverDB
        .update(tasks)
        .set({ parentTaskId: first.data.id })
        .where(eq(tasks.id, second.data.id));

      await expect(
        caller.setParentBatch({ parentTaskId: first.data.id, taskIds: [loose.data.id] }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect((await caller.find({ id: loose.data.id })).data.parentTaskId).toBeNull();
    });

    it('bounds the batch and the ids it accepts', async () => {
      const parent = await caller.create({ instruction: 'Parent', name: 'Parent' });
      await expect(
        caller.setParentBatch({ parentTaskId: parent.data.id, taskIds: [] }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(
        caller.setParentBatch({
          parentTaskId: parent.data.id,
          taskIds: Array.from({ length: 51 }, (_, index) => `task-${index}`),
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(
        caller.setParentBatch({ parentTaskId: parent.data.id, taskIds: ['x'.repeat(129)] }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('rejects a batch that crosses a project boundary with a stable reason', async () => {
      const projectId = await seedProject('pa');
      const parent = await caller.create({ instruction: 'Parent', name: 'Parent', projectId });
      const outsider = await caller.create({ instruction: 'Outsider', name: 'Outsider' });

      expect(
        await rejectionCode(
          caller.setParentBatch({ parentTaskId: parent.data.id, taskIds: [outsider.data.id] }),
        ),
      ).toBe('CROSS_PROJECT');
      expect(
        await rejectionCode(
          caller.setParentBatch({ parentTaskId: parent.data.id, taskIds: [parent.data.id] }),
        ),
      ).toBe('SELF');
    });

    it('refuses a batch parent write for an issue the caller cannot read', async () => {
      otherUserId = await createTestUser(serverDB);
      const otherCaller = taskRouter.createCaller(createTestContext(otherUserId));
      const foreign = await otherCaller.create({ instruction: 'Foreign', name: 'Foreign' });
      const parent = await caller.create({ instruction: 'Parent', name: 'Parent' });

      await expect(
        caller.setParentBatch({ parentTaskId: parent.data.id, taskIds: [foreign.data.id] }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        caller.setParentBatch({ parentTaskId: foreign.data.id, taskIds: [parent.data.id] }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('searches only the issues that can legally take the requested link', async () => {
      const projectId = await seedProject('pc');
      const search = workAttentionRouter.createCaller(createTestContext(userId)).search;
      const make = (name: string, extra: { parentTaskId?: string; projectId?: string } = {}) =>
        caller.create({ instruction: name, name: `Pick ${name}`, projectId, ...extra });
      const grandparent = await make('grandparent');
      const anchor = await make('anchor', { parentTaskId: grandparent.data.id });
      const child = await make('child', { parentTaskId: anchor.data.id });
      // Two levels down: the exclusion follows the whole subtree, not one level.
      await make('grandchild', { parentTaskId: child.data.id });
      const otherParent = await make('other parent');
      await make('adopted', { parentTaskId: otherParent.data.id });
      await make('free');
      await caller.create({ instruction: 'Elsewhere', name: 'Pick elsewhere' });

      const names = async (relation: 'child' | 'dependency' | 'parent') =>
        (
          await search({
            eligibleFor: { relation, taskId: anchor.data.identifier },
            limitPerType: 50,
            query: 'Pick',
            type: 'task',
          })
        ).data
          .map((hit) => hit.title)
          .sort();

      // Not itself, its ancestor, its existing child, or another project's issue.
      expect(await names('child')).toEqual(['Pick adopted', 'Pick free', 'Pick other parent']);
      // Not itself, its descendant, or the parent it already has.
      expect(await names('parent')).toEqual(['Pick adopted', 'Pick free', 'Pick other parent']);
      expect(await names('dependency')).toEqual([
        'Pick adopted',
        'Pick child',
        'Pick free',
        'Pick grandchild',
        'Pick grandparent',
        'Pick other parent',
      ]);

      const hits = (
        await search({
          eligibleFor: { relation: 'child', taskId: anchor.data.id },
          limitPerType: 50,
          query: 'Pick adopted',
          type: 'task',
        })
      ).data;
      // A candidate under another parent says where it would be moved from.
      expect(hits).toEqual([
        expect.objectContaining({ parentIdentifier: otherParent.data.identifier }),
      ]);
      // The lookup id is bounded like any other client-supplied reference.
      await expect(
        search({
          eligibleFor: { relation: 'child', taskId: 'x'.repeat(129) },
          query: 'Pick',
          type: 'task',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      // An unscoped search is unchanged: every project, the anchor included.
      const unscoped = (await search({ limitPerType: 50, query: 'Pick', type: 'task' })).data;
      expect(unscoped).toHaveLength(8);
    });

    it('names why a dependency was refused with a stable reason code', async () => {
      const projectId = await seedProject('pb');
      const inProject = await caller.create({ instruction: 'In', name: 'In', projectId });
      const outside = await caller.create({ instruction: 'Out', name: 'Out' });
      const first = await caller.create({ instruction: 'First', name: 'First' });
      const second = await caller.create({ instruction: 'Second', name: 'Second' });
      await caller.addDependency({ dependsOnId: first.data.id, taskId: second.data.id });

      expect(
        await rejectionCode(
          caller.addDependency({ dependsOnId: outside.data.id, taskId: inProject.data.id }),
        ),
      ).toBe('CROSS_PROJECT');
      // Related links stay inside one project too.
      expect(
        await rejectionCode(
          caller.addDependency({
            dependsOnId: outside.data.id,
            taskId: inProject.data.id,
            type: 'relates',
          }),
        ),
      ).toBe('CROSS_PROJECT');
      expect(
        await rejectionCode(
          caller.addDependency({ dependsOnId: second.data.id, taskId: first.data.id }),
        ),
      ).toBe('CYCLE');
    });
  });

  describe('handoff from an agent the caller cannot use', () => {
    // The incumbent belongs to the workspace owner; neither member holds Use on it.
    const setup = async (phase: 'outcome_unknown' | 'running' = 'running') => {
      const workspaceId = 'task-handoff-takeover-workspace';
      const { agents, workspaces, workspaceMembers } = await import('@/database/schemas');
      otherUserId = await createTestUser(serverDB);
      const creatorId = otherUserId;
      const memberId = await createTestUser(serverDB);
      await serverDB.insert(workspaces).values({
        id: workspaceId,
        name: 'Handoff Takeover Workspace',
        primaryOwnerId: userId,
        slug: workspaceId,
      });
      await serverDB.insert(workspaceMembers).values([
        { role: 'owner', userId, workspaceId },
        { role: 'member', userId: creatorId, workspaceId },
        { role: 'member', userId: memberId, workspaceId },
      ]);
      const agent = async (id: string, ownerId: string) => {
        await serverDB.insert(agents).values({ id, slug: id, userId: ownerId, workspaceId });
        return id;
      };
      const incumbent = await agent('agt_takeover_incumbent', userId);
      const creatorAgent = await agent('agt_takeover_creator', creatorId);
      const memberAgent = await agent('agt_takeover_member', memberId);
      const callerFor = (id: string) =>
        taskRouter.createCaller({ ...createTestContext(id), workspaceId });
      const created = await callerFor(creatorId).create({ instruction: 'Held by another agent' });
      await serverDB
        .update(tasks)
        // A start whose outcome was lost parks the Issue while its dispatch
        // stays live, so the Issue reads as paused and not as running.
        .set({
          assigneeAgentId: incumbent,
          ...(phase === 'running'
            ? {}
            : { context: { execution: { parked: { reason: 'outcome_unknown' } } } }),
        })
        .where(eq(tasks.id, created.data.id));
      // Execution truth is a live dispatch row, not the status column.
      await serverDB.insert(taskDispatches).values({
        agentId: incumbent,
        generation: 1,
        id: 'dispatch-handoff-takeover',
        idempotencyKey: 'manual:handoff:takeover',
        phase,
        policyRevision: 1,
        requestedBy: `user:${userId}`,
        requirementRevision: 1,
        taskId: created.data.id,
        taskRevision: 1,
        workspaceId,
      });
      const handoff = async (as: string, toAgentId: string) =>
        callerFor(as).handoff({
          expectedDomainRevision: (await revisionOf(created.data.id))!,
          taskId: created.data.id,
          toAgentId,
        });
      return { creatorAgent, creatorId, handoff, memberAgent, memberId, taskId: created.data.id };
    };

    it('refuses a member who neither created the Issue nor may use the incumbent', async () => {
      const { handoff, memberAgent, memberId } = await setup();
      try {
        await expect(handoff(memberId, memberAgent)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        await cleanupTestUser(serverDB, memberId);
      }
    });

    it('lets the creator take the Issue over, to an agent the creator may use only', async () => {
      const { creatorAgent, creatorId, handoff, memberAgent, memberId, taskId } = await setup();
      try {
        await expect(handoff(creatorId, memberAgent)).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await handoff(creatorId, creatorAgent);
        const [row] = await serverDB
          .select({ assigneeAgentId: tasks.assigneeAgentId })
          .from(tasks)
          .where(eq(tasks.id, taskId));
        expect(row.assigneeAgentId).toBe(creatorAgent);
      } finally {
        await cleanupTestUser(serverDB, memberId);
      }
    });

    it('says the last run is unconfirmed when there is no running process to fence', async () => {
      const { creatorAgent, creatorId, handoff, memberId } = await setup('outcome_unknown');
      try {
        await expect(handoff(creatorId, creatorAgent)).rejects.toMatchObject({
          code: 'CONFLICT',
          message: expect.stringMatching(/^EXECUTION_UNSETTLED/),
        });
      } finally {
        await cleanupTestUser(serverDB, memberId);
      }
    });
  });

  describe('status transitions', () => {
    it('should transition backlog → running → paused → completed', async () => {
      const task = await caller.create({ instruction: 'Test' });

      // backlog → running — execution truth is a live dispatch row; no status
      // write can synthesize it.
      await serverDB.insert(taskDispatches).values({
        generation: 1,
        id: 'dispatch-transition-running',
        idempotencyKey: 'manual:transition:running',
        phase: 'running',
        policyRevision: 1,
        requestedBy: `user:${userId}`,
        requirementRevision: 1,
        taskId: task.data.id,
        taskRevision: 1,
        workspaceId: null,
      });
      const running = await caller.find({ id: task.data.id });
      expect(running.data.status).toBe('running');

      // running → paused
      const paused = await caller.updateStatus({
        id: task.data.id,
        status: 'paused',
      });
      expect(paused.data.status).toBe('paused');

      // paused → completed
      const completed = await caller.updateStatus({
        id: task.data.id,
        status: 'completed',
      });
      expect(completed.data.status).toBe('completed');
    });

    it('resolves a task identifier to its row when changing status', async () => {
      const task = await caller.create({ instruction: 'Test identifier resolution' });

      const paused = await caller.updateStatus({
        id: task.data.identifier,
        status: 'paused',
      });

      expect(paused.data).toMatchObject({ id: task.data.id, status: 'paused' });
    });
  });

  describe('builtin task edit concurrency', () => {
    it('lets the builtin task tool view and edit owner, Agent and project with the observed revision', async () => {
      const task = await caller.create({ instruction: 'Test fenced tool edit' });
      const projectId = `project-tool-${userId}`;
      await serverDB
        .insert(projects)
        .values({ id: projectId, identifier: 'PT', name: 'Tool project', userId });
      const model = new TaskModel(serverDB, userId);
      const before = await model.findById(task.data.id);
      const runtime = createTaskRuntime({
        agentModel: { existsById: async (id: string) => id === testAgentId } as never,
        taskCaller: caller,
        taskModel: model,
        taskService: new TaskService(serverDB, userId),
        db: serverDB,
        userId,
      });
      const view = await runtime.viewTask({ identifier: task.data.identifier });
      expect(view.content).toContain(`Domain revision: ${before?.domainRevision}`);
      await runtime.editTask({
        identifier: task.data.identifier,
        assigneeUserId: userId,
        assigneeAgentId: testAgentId,
        projectId,
        expectedDomainRevision: before!.domainRevision,
      });
      const after = await model.findById(task.data.id);
      expect(after).toMatchObject({
        assigneeUserId: userId,
        assigneeAgentId: testAgentId,
        projectId,
      });
      const dependency = await caller.create({ instruction: 'Dependency' });
      await expect(
        runtime.editTask({
          identifier: task.data.identifier,
          assigneeAgentId: null,
          addDependencies: [dependency.data.identifier],
          expectedDomainRevision: before!.domainRevision,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect((await model.findById(task.data.id))?.assigneeAgentId).toBe(testAgentId);
      expect(await model.getDependencies(task.data.id)).toHaveLength(0);
      await expect(
        runtime.editTask({
          identifier: task.data.identifier,
          assigneeUserId: 'foreign-user',
          expectedDomainRevision: after!.domainRevision,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const missingAgent = await runtime.editTask({
        identifier: task.data.identifier,
        assigneeAgentId: 'foreign-agent',
        expectedDomainRevision: after!.domainRevision,
      });
      expect(missingAgent.success).toBe(false);
      otherUserId = await createTestUser(serverDB);
      const foreignProjectId = `foreign-project-${otherUserId}`;
      await serverDB.insert(projects).values({
        id: foreignProjectId,
        identifier: 'FP',
        name: 'Foreign project',
        userId: otherUserId,
      });
      await expect(
        runtime.editTask({
          identifier: task.data.identifier,
          projectId: foreignProjectId,
          expectedDomainRevision: after!.domainRevision,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect((await model.findById(task.data.id))?.domainRevision).toBe(after!.domainRevision);
    });
  });

  describe('comments', () => {
    it('rejects a workspace owner editing or deleting another member comment', async () => {
      otherUserId = await createTestUser(serverDB);
      const workspaceId = `comment-author-${userId}`;
      const { workspaces, workspaceMembers } = await import('@/database/schemas');
      await serverDB
        .insert(workspaces)
        .values({ id: workspaceId, name: workspaceId, slug: workspaceId, primaryOwnerId: userId });
      await serverDB.insert(workspaceMembers).values([
        { workspaceId, userId, role: 'owner' },
        { workspaceId, userId: otherUserId, role: 'member' },
      ]);
      const owner = taskRouter.createCaller({ ...createTestContext(userId), workspaceId });
      const author = taskRouter.createCaller({ ...createTestContext(otherUserId), workspaceId });
      const task = await owner.create({ instruction: 'Shared comments' });
      const comment = await author.addComment({ id: task.data.id, content: 'Member original' });
      const model = new TaskModel(serverDB, userId, workspaceId);
      const before = await model.findById(task.data.id);
      await expect(
        owner.updateComment({ commentId: comment.data.id, content: 'Owner edit' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(owner.deleteComment({ commentId: comment.data.id })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect((await model.findCommentById(comment.data.id))?.content).toBe('Member original');
      expect((await model.findById(task.data.id))?.domainRevision).toBe(before?.domainRevision);
      await author.updateComment({ commentId: comment.data.id, content: 'Member edit' });
      await author.deleteComment({ commentId: comment.data.id });
    });

    it('does not let an Agent edit its user owner comment or another Agent comment', async () => {
      const task = await caller.create({ instruction: 'Distinct actors' });
      const human = await caller.addComment({ id: task.data.id, content: 'Human original' });
      const secondAgentId = await createTestAgent(serverDB, userId, 'agt_second_author');
      const otherAgent = await caller.addComment({
        id: task.data.id,
        authorAgentId: secondAgentId,
        content: 'Other Agent original',
      });
      const agentCaller = taskRouter.createCaller({
        ...createTestContext(userId),
        actingAgentId: testAgentId,
      });
      for (const comment of [human.data, otherAgent.data]) {
        await expect(
          agentCaller.updateComment({ commentId: comment.id, content: 'Wrong actor' }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(agentCaller.deleteComment({ commentId: comment.id })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
        expect((await new TaskModel(serverDB, userId).findCommentById(comment.id))?.content).toBe(
          comment.content,
        );
      }
    });

    it('preserves the requirement fence for client-first agent comment edits and deletes', async () => {
      const task = await caller.create({ instruction: 'Test' });
      const model = new TaskModel(serverDB, userId);
      const before = await model.findById(task.data.id);
      const comment = await caller.addComment({
        authorAgentId: testAgentId,
        content: 'Progress',
        id: task.data.id,
      });
      await caller.updateComment({
        actorAgentId: testAgentId,
        commentId: comment.data.id,
        content: 'Updated progress',
      });
      expect((await model.findById(task.data.id))?.requirementRevision).toBe(
        before?.requirementRevision,
      );
      await caller.deleteComment({ actorAgentId: testAgentId, commentId: comment.data.id });
      expect((await model.findById(task.data.id))?.requirementRevision).toBe(
        before?.requirementRevision,
      );
    });

    it('rejects foreign actor claims before mutating a comment', async () => {
      const task = await caller.create({ instruction: 'Test' });
      const comment = await caller.addComment({ content: 'Original', id: task.data.id });
      otherUserId = await createTestUser(serverDB);
      const foreignAgentId = await createTestAgent(serverDB, otherUserId);
      await expect(
        caller.updateComment({
          actorAgentId: foreignAgentId,
          commentId: comment.data.id,
          content: 'Changed',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        caller.deleteComment({
          actorAgentId: foreignAgentId,
          commentId: comment.data.id,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(
        (await new TaskModel(serverDB, userId).findCommentById(comment.data.id))?.content,
      ).toBe('Original');
    });

    it('should add and retrieve comments', async () => {
      const task = await caller.create({ instruction: 'Test' });

      await caller.addComment({
        content: 'First comment',
        id: task.data.id,
      });
      await caller.addComment({
        content: 'Second comment',
        id: task.data.id,
      });

      const detail = await caller.detail({ id: task.data.identifier });
      const commentActivities = detail.data.activities?.filter((a) => a.type === 'comment');
      expect(commentActivities).toHaveLength(2);
      expect(commentActivities?.[0].content).toBe('First comment');
    });

    it('attributes trusted server comments to the running Agent and preserves its requirement fence', async () => {
      const task = await caller.create({ instruction: 'Test' });
      const before = await new TaskModel(serverDB, userId).findById(task.data.id);
      const agentCaller = taskRouter.createCaller({
        ...createTestContext(userId),
        actingAgentId: testAgentId,
      });

      const comment = await agentCaller.addComment({
        content: 'Ready for review',
        id: task.data.id,
      });

      expect(comment.data.authorAgentId).toBe(testAgentId);
      expect(comment.data.authorUserId).toBeNull();
      expect(
        (await new TaskModel(serverDB, userId).findById(task.data.id))?.requirementRevision,
      ).toBe(before?.requirementRevision);
      await agentCaller.updateComment({
        actorAgentId: 'unusable-agent-claim',
        commentId: comment.data.id,
        content: 'Agent updates progress',
      });
      expect(
        (await new TaskModel(serverDB, userId).findById(task.data.id))?.requirementRevision,
      ).toBe(before?.requirementRevision);
      const extraComment = await agentCaller.addComment({
        content: 'Extra progress',
        id: task.data.id,
      });
      await agentCaller.deleteComment({
        actorAgentId: 'unusable-agent-claim',
        commentId: extraComment.data.id,
      });
      expect(
        (await new TaskModel(serverDB, userId).findById(task.data.id))?.requirementRevision,
      ).toBe(before?.requirementRevision);
      await expect(
        caller.updateComment({
          commentId: comment.data.id,
          content: 'Human changes the requirement',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(caller.deleteComment({ commentId: comment.data.id })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      const human = await caller.addComment({ id: task.data.id, content: 'Human requirement' });
      await caller.updateComment({
        commentId: human.data.id,
        content: 'Human edits own requirement',
      });
      expect(
        (await new TaskModel(serverDB, userId).findById(task.data.id))?.requirementRevision,
      ).toBe((before?.requirementRevision ?? 0) + 2);
      await caller.deleteComment({ commentId: human.data.id });
      expect(
        (await new TaskModel(serverDB, userId).findById(task.data.id))?.requirementRevision,
      ).toBe((before?.requirementRevision ?? 0) + 3);
    });

    it('should add agent-authored comments and support update/delete', async () => {
      const task = await caller.create({ instruction: 'Test' });

      const added = await caller.addComment({
        authorAgentId: testAgentId,
        content: 'Agent progress note',
        id: task.data.id,
      });

      expect(added.data.authorAgentId).toBe(testAgentId);
      expect(added.data.authorUserId).toBeNull();

      await caller.updateComment({
        actorAgentId: testAgentId,
        commentId: added.data.id,
        content: 'Updated progress note',
      });

      const updatedDetail = await caller.detail({ id: task.data.identifier });
      const updatedComment = updatedDetail.data.activities?.find((a) => a.id === added.data.id);
      expect(updatedComment?.content).toBe('Updated progress note');
      expect(updatedComment?.agentId).toBe(testAgentId);

      await caller.deleteComment({ actorAgentId: testAgentId, commentId: added.data.id });

      const deletedDetail = await caller.detail({ id: task.data.identifier });
      expect(deletedDetail.data.activities?.some((a) => a.id === added.data.id)).toBe(false);
    });

    it('should clear stale editorData for content-only comment updates', async () => {
      const task = await caller.create({ instruction: 'Test' });
      const comment = await caller.addComment({
        content: 'Old comment',
        editorData: { root: { children: [{ text: 'Old comment' }] } },
        id: task.data.id,
      });

      const contentOnlyUpdate = await caller.updateComment({
        commentId: comment.data.id,
        content: 'New comment',
      });

      expect(contentOnlyUpdate.data.content).toBe('New comment');
      expect(contentOnlyUpdate.data.editorData).toBeNull();

      const nextEditorData = { root: { children: [{ text: 'Rich comment' }] } };
      const richTextUpdate = await caller.updateComment({
        commentId: comment.data.id,
        content: 'Rich comment',
        editorData: nextEditorData,
      });

      expect(richTextUpdate.data.content).toBe('Rich comment');
      expect(richTextUpdate.data.editorData).toEqual(nextEditorData);
    });
  });

  describe('comment notifications', () => {
    const mentionNode = (userId: string) => ({
      label: 'Member',
      metadata: { id: userId, type: 'member' },
      type: 'mention',
    });
    const editorDataWith = (...userIds: string[]) => ({
      root: { children: [{ children: userIds.map(mentionNode), type: 'paragraph' }] },
    });

    const setupWorkspace = async () => {
      const workspaceId = 'task-comment-notify-workspace';
      const { workspaces, workspaceMembers } = await import('@/database/schemas');
      await serverDB.insert(workspaces).values({
        id: workspaceId,
        name: 'Task Comment Notify Workspace',
        primaryOwnerId: userId,
        slug: workspaceId,
      });
      await serverDB.insert(workspaceMembers).values([
        { role: 'owner', userId, workspaceId },
        { role: 'member', userId: otherUserId!, workspaceId },
      ]);
      return {
        wsCaller: taskRouter.createCaller({ ...createTestContext(userId), workspaceId }),
        wsOtherCaller: taskRouter.createCaller({
          ...createTestContext(otherUserId!),
          workspaceId,
        }),
        workspaceId,
      };
    };

    it('should ping the task creator and @mentioned members on a new member comment', async () => {
      otherUserId = await createTestUser(serverDB);
      const { wsCaller, wsOtherCaller, workspaceId } = await setupWorkspace();
      const task = await wsCaller.create({ instruction: 'Discuss', name: 'Discuss' });

      // The creator commenting on their own task with no mentions pings nobody.
      await wsCaller.addComment({ content: 'note to self', id: task.data.id });
      await flushAfterResponse();
      expect(mockNotifyTaskCommentActivity).not.toHaveBeenCalled();

      // Another member commenting pings the creator as ambient activity.
      const comment = await wsOtherCaller.addComment({ content: 'hello', id: task.data.id });
      await flushAfterResponse();
      expect(mockNotifyTaskCommentActivity).toHaveBeenCalledTimes(1);
      expect(mockNotifyTaskCommentActivity).toHaveBeenCalledWith({
        actorUserId: otherUserId,
        commentId: comment.data.id,
        recipients: [{ kind: 'commented', userId }],
        taskId: task.data.id,
        workspaceId,
      });

      // The creator @mentioning the other member pings them as mentioned;
      // unknown ids and self-mentions are dropped.
      const mentioned = await wsCaller.addComment({
        content: '@Member look',
        editorData: editorDataWith(otherUserId!, userId, 'not-a-member'),
        id: task.data.id,
      });
      await flushAfterResponse();
      expect(mockNotifyTaskCommentActivity).toHaveBeenLastCalledWith({
        actorUserId: userId,
        commentId: mentioned.data.id,
        recipients: [{ kind: 'mentioned', userId: otherUserId }],
        taskId: task.data.id,
        workspaceId,
      });
    });

    it('should upgrade the assignee to mentioned and skip agent-authored comments', async () => {
      otherUserId = await createTestUser(serverDB);
      const { wsCaller, workspaceId } = await setupWorkspace();
      const task = await wsCaller.create({
        assigneeUserId: otherUserId,
        instruction: 'Assigned',
      });
      await flushAfterResponse();
      mockNotifyTaskCommentActivity.mockClear();

      await wsCaller.addComment({ content: 'ping', id: task.data.id });
      await flushAfterResponse();
      expect(mockNotifyTaskCommentActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({
          recipients: [{ kind: 'commented', userId: otherUserId }],
          workspaceId,
        }),
      );

      await wsCaller.addComment({
        content: '@Member',
        editorData: editorDataWith(otherUserId!),
        id: task.data.id,
      });
      await flushAfterResponse();
      expect(mockNotifyTaskCommentActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ recipients: [{ kind: 'mentioned', userId: otherUserId }] }),
      );

      // Agent-authored progress notes never ping members, even with mentions.
      const { agents } = await import('@/database/schemas');
      const wsAgentId = 'agt_task_comment_ws';
      await serverDB
        .insert(agents)
        .values({ id: wsAgentId, slug: wsAgentId, userId, workspaceId })
        .onConflictDoNothing();
      const { resourcePermissions } = await import('@/database/schemas');
      await serverDB.insert(resourcePermissions).values({
        accessLevel: 'use',
        createdBy: userId,
        resourceId: wsAgentId,
        resourceType: 'agent',
        userId,
        workspaceId,
      });
      await flushAfterResponse();
      mockNotifyTaskCommentActivity.mockClear();
      await wsCaller.addComment({
        authorAgentId: wsAgentId,
        content: 'Agent progress note',
        editorData: editorDataWith(otherUserId!),
        id: task.data.id,
      });
      await flushAfterResponse();
      expect(mockNotifyTaskCommentActivity).not.toHaveBeenCalled();
    });

    it('should only ping newly added mentions when a comment is edited', async () => {
      otherUserId = await createTestUser(serverDB);
      const thirdUserId = await createTestUser(serverDB);
      const { wsCaller, workspaceId } = await setupWorkspace();
      const { workspaceMembers } = await import('@/database/schemas');
      await serverDB
        .insert(workspaceMembers)
        .values({ role: 'member', userId: thirdUserId, workspaceId });
      const task = await wsCaller.create({ instruction: 'Edit mentions' });
      const comment = await wsCaller.addComment({
        content: '@Member',
        editorData: editorDataWith(otherUserId!),
        id: task.data.id,
      });
      await flushAfterResponse();
      mockNotifyTaskCommentActivity.mockClear();

      // Keeping the same mention does not re-notify.
      await wsCaller.updateComment({
        commentId: comment.data.id,
        content: '@Member edited',
        editorData: editorDataWith(otherUserId!),
      });
      await flushAfterResponse();
      expect(mockNotifyTaskCommentActivity).not.toHaveBeenCalled();

      // Adding a new mention pings only the new member.
      await wsCaller.updateComment({
        commentId: comment.data.id,
        content: '@Member @Third',
        editorData: editorDataWith(otherUserId!, thirdUserId),
      });
      await flushAfterResponse();
      expect(mockNotifyTaskCommentActivity).toHaveBeenCalledTimes(1);
      expect(mockNotifyTaskCommentActivity).toHaveBeenCalledWith({
        actorUserId: userId,
        commentId: comment.data.id,
        recipients: [{ kind: 'mentioned', userId: thirdUserId }],
        taskId: task.data.id,
        workspaceId,
      });

      // Content-only edits never notify.
      await wsCaller.updateComment({ commentId: comment.data.id, content: 'plain' });
      await flushAfterResponse();
      expect(mockNotifyTaskCommentActivity).toHaveBeenCalledTimes(1);
    });

    it('notifies active workspace readers of private-team Issues and excludes inactive recipients', async () => {
      otherUserId = await createTestUser(serverDB);
      const thirdUserId = await createTestUser(serverDB);
      const { wsCaller, workspaceId } = await setupWorkspace();
      const { workspaceMembers, teams } = await import('@/database/schemas');
      await serverDB
        .insert(workspaceMembers)
        .values({ role: 'member', userId: thirdUserId, workspaceId });
      const teamId = 'task-notification-private-team';
      await serverDB.insert(teams).values({
        id: teamId,
        key: 'SEC',
        name: 'Private team',
        visibility: 'private',
        workspaceId,
      });
      const task = await wsCaller.create({
        instruction: 'Secret',
        teamId,
        name: 'Secret',
        visibility: 'private',
      });

      // Workspace Issue read is independent of private Team participation.
      const comment = await wsCaller.addComment({
        content: '@Member',
        editorData: editorDataWith(otherUserId!),
        id: task.data.id,
      });
      await flushAfterResponse();
      expect(mockNotifyTaskCommentActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ recipients: [{ kind: 'mentioned', userId: otherUserId }] }),
      );

      await wsCaller.updateComment({
        commentId: comment.data.id,
        content: '@Member @Third',
        editorData: editorDataWith(otherUserId!, thirdUserId),
      });
      await flushAfterResponse();
      expect(mockNotifyTaskCommentActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ recipients: [{ kind: 'mentioned', userId: thirdUserId }] }),
      );

      mockNotifyTaskCommentActivity.mockClear();
      await serverDB
        .update(workspaceMembers)
        .set({ suspendedAt: new Date() })
        .where(eq(workspaceMembers.userId, otherUserId!));
      await serverDB
        .update(workspaceMembers)
        .set({ deletedAt: new Date() })
        .where(eq(workspaceMembers.userId, thirdUserId));
      const foreignId = await createTestUser(serverDB);
      try {
        await wsCaller.addComment({
          content: '@Suspended @Removed @Foreign',
          editorData: editorDataWith(otherUserId!, thirdUserId, foreignId),
          id: task.data.id,
        });
        await flushAfterResponse();
        expect(mockNotifyTaskCommentActivity).not.toHaveBeenCalled();
      } finally {
        await cleanupTestUser(serverDB, foreignId);
        await cleanupTestUser(serverDB, thirdUserId);
      }
    });

    it('should never notify in personal mode', async () => {
      const task = await caller.create({ instruction: 'Personal' });
      await caller.addComment({
        content: '@someone',
        editorData: editorDataWith('someone'),
        id: task.data.id,
      });
      await flushAfterResponse();
      expect(mockNotifyTaskCommentActivity).not.toHaveBeenCalled();
    });
  });

  describe('review config', () => {
    it('should set and retrieve review rubrics', async () => {
      const task = await caller.create({ instruction: 'Test' });

      await caller.updateReview({
        id: task.data.id,
        review: {
          autoRetry: true,
          enabled: true,
          maxIterations: 3,
          rubrics: [
            {
              config: { criteria: '内容准确性' },
              id: 'r1',
              name: '准确性',
              threshold: 0.8,
              type: 'llm-rubric',
              weight: 1,
            },
            {
              config: { value: '```' },
              id: 'r2',
              name: '包含代码',
              type: 'contains',
              weight: 1,
            },
          ],
        },
      });

      const review = await caller.getReview({ id: task.data.id });
      expect(review.data!.enabled).toBe(true);
      expect(review.data!.rubrics).toHaveLength(2);
      expect(review.data!.rubrics[0].type).toBe('llm-rubric');
    });
  });

  describe('verify config', () => {
    it('moves verify config supplied at task creation into Acceptance', async () => {
      const task = await caller.create({
        config: {
          model: 'test-model',
          verify: { enabled: true, maxIterations: 2, requirement: 'Ship the artifact' },
        },
        instruction: 'Test',
      });

      const storedTask = await new TaskModel(serverDB, userId).findById(task.data.id);
      const acceptance = await new AcceptanceModel(serverDB, userId).findBySubject(
        'task',
        task.data.id,
      );

      expect(storedTask?.config).toEqual({ model: 'test-model' });
      expect(acceptance).toMatchObject({
        config: { enabled: true, maxIterations: 2 },
        requirement: 'Ship the artifact',
      });
    });

    it('should set and retrieve verify config (round-trip)', async () => {
      const task = await caller.create({ instruction: 'Test' });

      await caller.updateVerifyConfig({
        id: task.data.id,
        verify: {
          enabled: true,
          maxIterations: 3,
          verifierAgentId: 'agt_codex',
          verifyCriteriaIds: ['c1', 'c2'],
          verifyRubricId: 'rub_1',
        },
      });

      const verify = await caller.getVerifyConfig({ id: task.data.id });
      expect(verify.data).toEqual({
        enabled: true,
        maxIterations: 3,
        verifierAgentId: 'agt_codex',
        verifyCriteriaIds: ['c1', 'c2'],
        verifyRubricId: 'rub_1',
      });

      // task.detail must surface the saved verify config (not leave it undefined).
      const detail = await caller.detail({ id: task.data.id });
      expect(detail.data!.verify).toEqual({
        enabled: true,
        maxIterations: 3,
        verifierAgentId: 'agt_codex',
        verifyCriteriaIds: ['c1', 'c2'],
        verifyRubricId: 'rub_1',
      });

      const storedTask = await new TaskModel(serverDB, userId).findById(task.data.id);
      const acceptance = await new AcceptanceModel(serverDB, userId).findBySubject(
        'task',
        task.data.id,
      );
      expect(storedTask?.config).not.toHaveProperty('verify');
      expect(acceptance).toMatchObject({
        config: {
          enabled: true,
          maxIterations: 3,
          verifierAgentId: 'agt_codex',
          verifyCriteriaIds: ['c1', 'c2'],
          verifyRubricId: 'rub_1',
        },
      });
    });

    it('should clear a saved field when passed null', async () => {
      const task = await caller.create({ instruction: 'Test' });

      await caller.updateVerifyConfig({
        id: task.data.id,
        verify: { enabled: true, verifierAgentId: 'agt_codex', verifyRubricId: 'rub_1' },
      });

      // Switch the verifier back to default + drop the rubric.
      await caller.updateVerifyConfig({
        id: task.data.id,
        verify: { verifierAgentId: null, verifyRubricId: null },
      });

      const verify = await caller.getVerifyConfig({ id: task.data.id });
      expect(verify.data).toEqual({ enabled: true });
    });

    it('getVerifyConfig falls back to the legacy review key', async () => {
      const task = await caller.create({ instruction: 'Test' });

      await caller.updateReview({
        id: task.data.id,
        review: { autoRetry: true, enabled: true, maxIterations: 4, rubrics: [] },
      });

      const verify = await caller.getVerifyConfig({ id: task.data.id });
      expect(verify.data).toEqual({ enabled: true, maxIterations: 4 });
    });

    it('preserves legacy verify fields when applying a partial Acceptance patch', async () => {
      const task = await caller.create({ instruction: 'Test' });
      await new TaskModel(serverDB, userId).updateVerifyConfig(task.data.id, {
        enabled: true,
        maxIterations: 4,
        verifierAgentId: 'legacy-verifier',
      });

      await caller.updateVerifyConfig({
        id: task.data.id,
        verify: { maxIterations: 2 },
      });

      const verify = await caller.getVerifyConfig({ id: task.data.id });
      expect(verify.data).toEqual({
        enabled: true,
        maxIterations: 2,
        verifierAgentId: 'legacy-verifier',
      });
    });
  });

  describe('run idempotency', () => {
    it('resolves a task identifier to its row when starting a run', async () => {
      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Test',
      });

      await caller.run({ id: task.data.identifier });

      const updated = await caller.detail({ id: task.data.id });
      expect(updated.data?.status).toBe('running');
    });

    it('should reject run when a topic is already running', async () => {
      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Test',
      });

      // First run succeeds
      await caller.run({ id: task.data.id });

      // Second run should fail with CONFLICT
      await expect(caller.run({ id: task.data.id })).rejects.toThrow(/active dispatch/);
    });

    it('should reject continue on already running topic', async () => {
      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Test',
      });

      await caller.run({ id: task.data.id });

      await expect(caller.run({ continueTopicId: 'tpc_test', id: task.data.id })).rejects.toThrow(
        /active dispatch/,
      );
    });
  });

  describe('run error rollback', () => {
    it('should rollback task status to paused on run failure', async () => {
      mockExecAgent.mockRejectedValueOnce(new Error('LLM failed'));

      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Test',
      });

      await expect(caller.run({ id: task.data.id })).rejects.toThrow();

      // Task should be rolled back to paused with error
      const found = await caller.find({ id: task.data.id });
      expect(found.data.status).toBe('paused');
      expect(found.data.error).toContain('LLM failed');
    });

    it('does not book a running topic when execAgent reports a dispatch failure', async () => {
      // A heterogeneous dispatch or operation startup failure comes back as a
      // result (`success: false`) rather than a throw: the topic and its error
      // bubble already exist. Booking that dead operation as a running run left
      // the Task in flight forever, with a goal coordinator recording a start.
      mockExecAgent.mockResolvedValueOnce({
        error:
          'Heterogeneous agent provider binding is only supported for Desktop local execution.',
        message: 'Heterogeneous agent provider binding requires Desktop local execution',
        operationId: 'op_dead',
        status: 'error',
        success: false,
        topicId: testTopicId,
      });

      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Test',
      });

      await expect(caller.run({ id: task.data.id })).rejects.toThrow();

      const found = await caller.find({ id: task.data.id });
      expect(found.data.status).toBe('paused');
      expect(found.data.error).toContain('Desktop local execution');

      // The attempt stays visible, but as a failed run — never a running one.
      const runs = await new TaskTopicModel(serverDB, userId).findByTaskId(task.data.id);
      expect(runs.map((run) => [run.topicId, run.operationId, run.status])).toEqual([
        [testTopicId, 'op_dead', 'failed'],
      ]);
      // ...so a fresh run is allowed instead of "already has a running topic".
      await caller.run({ id: task.data.id });
      expect((await caller.detail({ id: task.data.id })).data?.status).toBe('running');
    });
  });

  describe('guarded deletion cleanup', () => {
    it('rejects a blocked delete with an actionable error before touching worktrees', async () => {
      const upstream = await caller.create({ instruction: 'Upstream' });
      const dependent = await caller.create({ instruction: 'Dependent' });
      await caller.addDependency({ taskId: dependent.data.id, dependsOnId: upstream.data.id });
      const cleanup = vi
        .spyOn(TaskIntegrationService.prototype, 'cleanupTaskWorktrees')
        .mockResolvedValue(true);
      try {
        await expect(caller.delete({ id: upstream.data.id })).rejects.toMatchObject({
          code: 'BAD_REQUEST',
        });
        expect(cleanup).not.toHaveBeenCalled();
        expect((await caller.find({ id: upstream.data.id })).data.id).toBe(upstream.data.id);
      } finally {
        cleanup.mockRestore();
      }
    });

    it('uses a pre-delete snapshot but performs cleanup only after the deletion commits', async () => {
      const task = await caller.create({ instruction: 'Removable' });
      const cleanup = vi
        .spyOn(TaskIntegrationService.prototype, 'cleanupTaskWorktrees')
        .mockImplementation(async (id, snapshot) => {
          expect(await new TaskModel(serverDB, userId).findById(id)).toBeNull();
          expect(Array.isArray(snapshot)).toBe(true);
          return true;
        });
      try {
        await caller.delete({ id: task.data.id });
        expect(cleanup).toHaveBeenCalledTimes(1);
      } finally {
        cleanup.mockRestore();
      }
    });
  });

  describe('clearAll', () => {
    it('should delete all tasks for user', async () => {
      await caller.create({ instruction: 'Task 1' });
      await caller.create({ instruction: 'Task 2' });
      await caller.create({ instruction: 'Task 3' });

      const result = await caller.clearAll();
      expect(result.count).toBe(3);

      const list = await caller.list({});
      expect(list.data).toHaveLength(0);
    });

    it('deletes every task even when one workspace cleanup is incomplete', async () => {
      await caller.create({ instruction: 'Task 1' });
      await caller.create({ instruction: 'Task 2' });
      const cleanup = vi
        .spyOn(TaskIntegrationService.prototype, 'cleanupTaskWorktrees')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      try {
        const result = await caller.clearAll();
        expect(result.count).toBe(2);
        expect(cleanup).toHaveBeenCalledTimes(2);
        expect((await caller.list({})).data).toHaveLength(0);
      } finally {
        cleanup.mockRestore();
      }
    });
  });

  describe('delete', () => {
    it('commits the delete before reporting an incomplete workspace cleanup', async () => {
      const task = await caller.create({ instruction: 'Task 1' });
      const cleanup = vi
        .spyOn(TaskIntegrationService.prototype, 'cleanupTaskWorktrees')
        .mockResolvedValue(false);

      try {
        const result = await caller.delete({ id: task.data.id });
        expect(result.success).toBe(true);
        expect(cleanup).toHaveBeenCalledWith(task.data.id, expect.any(Array));
        expect((await caller.list({})).data).toHaveLength(0);
      } finally {
        cleanup.mockRestore();
      }
    });
  });

  describe('cancelTopic', () => {
    it('should cancel a running topic and pause task', async () => {
      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Test',
      });

      await caller.run({ id: task.data.id });

      // Cancel the topic
      await caller.cancelTopic({ topicId: 'tpc_test' });

      // Task should be paused
      const found = await caller.find({ id: task.data.id });
      expect(found.data.status).toBe('paused');
    });

    it('should reject cancel on non-running topic', async () => {
      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Test',
      });

      await caller.run({ id: task.data.id });
      await caller.cancelTopic({ topicId: 'tpc_test' });

      // Try to cancel again — should fail
      await expect(caller.cancelTopic({ topicId: 'tpc_test' })).rejects.toThrow(/not running/);
    });
  });

  describe('workspace documents', () => {
    it('should pin and show documents in detail', async () => {
      const task = await caller.create({ instruction: 'Test' });

      // Create a document via the documents table directly
      const { documents } = await import('@/database/schemas');
      const [doc] = await serverDB
        .insert(documents)
        .values({
          content: 'Test content',
          fileType: 'markdown',
          source: 'test',
          sourceType: 'api',
          title: 'Test Doc',
          totalCharCount: 12,
          totalLineCount: 1,
          userId,
        })
        .returning();

      // Pin to task
      await caller.pinDocument({
        documentId: doc.id,
        pinnedBy: 'user',
        taskId: task.data.id,
      });

      // Check detail workspace
      const detail = await caller.detail({ id: task.data.identifier });
      expect(detail.data.workspace).toBeDefined();
      // Document should appear somewhere in the workspace tree
      const allDocs = detail.data.workspace!.flatMap((f) => [
        { documentId: f.documentId, title: f.title },
        ...(f.children ?? []),
      ]);
      expect(allDocs.find((d) => d.documentId === doc.id)?.title).toBe('Test Doc');

      // Unpin
      await caller.unpinDocument({
        documentId: doc.id,
        taskId: task.data.id,
      });

      const detail2 = await caller.detail({ id: task.data.identifier });
      expect(detail2.data.workspace).toBeUndefined();
    });
  });

  describe('updateStatus cascade cancels running topics', () => {
    it('should cancel running topics when task transitions out of running', async () => {
      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Test cascade',
      });

      // Start running — creates a running topic
      await caller.run({ id: task.data.id });

      // Transition task from running → paused via updateStatus
      const result = await caller.updateStatus({
        id: task.data.id,
        status: 'paused',
      });
      expect(result.data.status).toBe('paused');

      // The running topic should have been interrupted
      expect(mockInterruptTask).toHaveBeenCalledWith({ operationId: 'op_test' });

      // Running again should succeed (no CONFLICT) because the topic was canceled
      mockExecAgent.mockResolvedValueOnce({
        operationId: 'op_test_2',
        success: true,
        topicId: testTopicId,
      });

      // Need to set back to a runnable status first
      await caller.updateStatus({ id: task.data.id, status: 'backlog' });
      await expect(caller.run({ id: task.data.id })).resolves.toBeDefined();
    });

    it('should not interrupt topics when task is not currently running', async () => {
      const task = await caller.create({
        instruction: 'Test no cascade',
      });

      // Task is in backlog, transition to paused — no topics to cancel
      await caller.updateStatus({ id: task.data.id, status: 'paused' });
      expect(mockInterruptTask).not.toHaveBeenCalled();
    });

    it('rejects the status change and retains running work when interrupt fails', async () => {
      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Test interrupt failure',
      });

      await caller.run({ id: task.data.id });

      // Make interruptTask fail
      mockInterruptTask.mockRejectedValueOnce(new Error('network error'));

      await expect(caller.updateStatus({ id: task.data.id, status: 'paused' })).rejects.toThrow(
        'Failed to update status',
      );
      expect((await caller.find({ id: task.data.id })).data.status).toBe('running');
      const runningTopics = await new TaskTopicModel(serverDB, userId).findByTaskId(task.data.id);
      expect(runningTopics.some((topic) => topic.status === 'running')).toBe(true);
    });
  });

  describe('updateStatusCascade', () => {
    it('updates the task family atomically without rewriting failed subtasks', async () => {
      const parent = await caller.create({ instruction: 'Parent' });
      const open = await caller.create({
        instruction: 'Open',
        parentTaskId: parent.data.id,
      });
      const failed = await caller.create({
        instruction: 'Failed',
        parentTaskId: parent.data.id,
      });
      await caller.updateStatus({ error: 'Needs attention', id: failed.data.id, status: 'failed' });

      const result = await caller.updateStatusCascade({
        id: parent.data.identifier,
        status: 'completed',
      });

      expect(result.data.updatedSubtasks).toEqual([open.data.identifier]);
      expect((await caller.find({ id: parent.data.id })).data.status).toBe('completed');
      expect((await caller.find({ id: open.data.id })).data.status).toBe('completed');
      expect((await caller.find({ id: failed.data.id })).data).toMatchObject({
        error: 'Needs attention',
        status: 'failed',
      });
    });

    it('rejects bulk completion when a sibling prerequisite is unfinished', async () => {
      const parent = await caller.create({ instruction: 'Parent' });
      const first = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'First',
        parentTaskId: parent.data.id,
      });
      const dependent = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Dependent',
        parentTaskId: parent.data.id,
      });
      await caller.addDependency({ dependsOnId: first.data.id, taskId: dependent.data.id });
      mockExecAgent.mockClear();

      await expect(
        caller.updateStatusCascade({ id: parent.data.id, status: 'completed' }),
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

      expect(mockExecAgent).not.toHaveBeenCalled();
      expect((await caller.find({ id: first.data.id })).data.status).toBe('backlog');
      expect((await caller.find({ id: dependent.data.id })).data.status).toBe('backlog');
    });

    it('starts an external dependent unlocked by the family completion', async () => {
      const parent = await caller.create({ instruction: 'Parent' });
      const sub = await caller.create({ instruction: 'Sub', parentTaskId: parent.data.id });
      const external = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'External',
      });
      await caller.addDependency({ dependsOnId: sub.data.id, taskId: external.data.id });
      mockExecAgent.mockClear();

      const result = await caller.updateStatusCascade({ id: parent.data.id, status: 'completed' });

      expect(result.data.unlocked).toEqual([external.data.identifier]);
      expect(mockExecAgent).toHaveBeenCalledTimes(1);
      expect((await caller.find({ id: external.data.id })).data.status).toBe('running');
    });

    it('persists successful interrupts before surfacing a partial interrupt failure', async () => {
      const parent = await caller.create({ instruction: 'Parent' });
      const subA = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'A',
        parentTaskId: parent.data.id,
      });
      const subB = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'B',
        parentTaskId: parent.data.id,
      });

      const topicA = await createTestTopic(serverDB, userId, 'tpc_cascade_a');
      const topicB = await createTestTopic(serverDB, userId, 'tpc_cascade_b');
      mockExecAgent.mockResolvedValueOnce({
        operationId: 'op_cascade_a',
        success: true,
        topicId: topicA,
      });
      mockExecAgent.mockResolvedValueOnce({
        operationId: 'op_cascade_b',
        success: true,
        topicId: topicB,
      });
      await caller.run({ id: subA.data.id });
      await caller.run({ id: subB.data.id });

      mockInterruptTask.mockImplementation(async ({ operationId }: { operationId: string }) => {
        if (operationId === 'op_cascade_a') throw new Error('gateway unreachable');
        return { success: true };
      });

      await expect(
        caller.updateStatusCascade({ id: parent.data.id, status: 'canceled' }),
      ).rejects.toThrow('Failed to update task family status');

      // No status was cascaded — the family is untouched.
      expect((await caller.find({ id: parent.data.id })).data.status).toBe('backlog');
      expect((await caller.find({ id: subA.data.id })).data.status).toBe('running');
      expect((await caller.find({ id: subB.data.id })).data.status).toBe('running');

      // But the interrupt that did succeed is persisted: B's topic is no
      // longer recorded as running, while A's (failed interrupt) still is.
      const topicModel = new TaskTopicModel(serverDB, userId);
      const [aTopic] = await topicModel.findByTaskId(subA.data.id);
      const [bTopic] = await topicModel.findByTaskId(subB.data.id);
      expect(aTopic!.status).toBe('running');
      expect(bTopic!.status).toBe('canceled');

      // clearAllMocks does not restore implementations — undo the override.
      mockInterruptTask.mockImplementation(async () => ({ success: true }));
    });
  });

  describe('list participants', () => {
    it('should populate participants from assignee agent', async () => {
      const { agents } = await import('@/database/schemas');
      const { eq } = await import('drizzle-orm');
      await serverDB
        .update(agents)
        .set({ avatar: 'avatar.png', title: 'Agent One' })
        .where(eq(agents.id, testAgentId));

      await caller.create({ assigneeAgentId: testAgentId, instruction: 'Task A' });
      await caller.create({ instruction: 'Task without assignee' });

      const list = await caller.list({});
      expect(list.data).toHaveLength(2);

      const assigned = list.data.find((t) => t.assigneeAgentId === testAgentId)!;
      expect(assigned.participants).toEqual([
        {
          avatar: 'avatar.png',
          backgroundColor: null,
          id: testAgentId,
          title: 'Agent One',
          type: 'agent',
        },
      ]);

      const unassigned = list.data.find((t) => !t.assigneeAgentId)!;
      expect(unassigned.participants).toEqual([]);
    });
  });

  describe('heartbeat timeout detection', () => {
    it('should auto-detect timeout on detail and pause task', async () => {
      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Test',
      });

      // Start running with very short timeout
      await caller.update({
        heartbeatTimeout: 1,
        id: task.data.id,
      });

      await caller.run({ id: task.data.id });

      // Wait for timeout
      await new Promise((r) => setTimeout(r, 1500));

      // detail should auto-detect timeout and pause
      const detail = await caller.detail({ id: task.data.identifier });
      expect(detail.data.status).toBe('paused');
      // Verify stale timeout error gets cleared via find
      const found = await caller.find({ id: task.data.id });
      expect(found.data.error).toBeNull();
    });
  });

  describe('subtask layers + batch run', () => {
    it('previewSubtaskLayers groups subtasks by dependency level', async () => {
      const parent = await caller.create({ instruction: 'Book' });
      const ch1 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 1',
        parentTaskId: parent.data.id,
      });
      const ch2 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 2',
        parentTaskId: parent.data.id,
      });
      const ch3 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 3',
        parentTaskId: parent.data.id,
      });
      // ch3 depends on ch1 and ch2
      await caller.addDependency({ dependsOnId: ch1.data.id, taskId: ch3.data.id });
      await caller.addDependency({ dependsOnId: ch2.data.id, taskId: ch3.data.id });

      const result = await caller.previewSubtaskLayers({ id: parent.data.id });
      expect(result.data.layers).toHaveLength(2);
      expect(result.data.layers[0].sort()).toEqual([ch1.data.identifier, ch2.data.identifier]);
      expect(result.data.layers[1]).toEqual([ch3.data.identifier]);
      expect(result.data.totalRunnable).toBe(3);
      expect(result.data.cycles).toEqual([]);
    });

    it('rejects cycle creation and preserves the valid execution layers', async () => {
      const parent = await caller.create({ instruction: 'Cyclic' });
      const a = await caller.create({
        instruction: 'A',
        parentTaskId: parent.data.id,
      });
      const b = await caller.create({
        instruction: 'B',
        parentTaskId: parent.data.id,
      });
      await caller.addDependency({ dependsOnId: a.data.id, taskId: b.data.id });
      await expect(
        caller.addDependency({ dependsOnId: b.data.id, taskId: a.data.id }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      const result = await caller.previewSubtaskLayers({ id: parent.data.id });
      expect(result.data.layers).toEqual([[a.data.identifier], [b.data.identifier]]);
      expect(result.data.cycles).toEqual([]);
    });

    it('runReadySubtasks kicks off the first layer only', async () => {
      const parent = await caller.create({ instruction: 'Book' });
      const ch1 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 1',
        parentTaskId: parent.data.id,
      });
      const ch2 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 2',
        parentTaskId: parent.data.id,
      });
      const ch3 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 3',
        parentTaskId: parent.data.id,
      });
      await caller.addDependency({ dependsOnId: ch1.data.id, taskId: ch3.data.id });
      await caller.addDependency({ dependsOnId: ch2.data.id, taskId: ch3.data.id });

      const result = await caller.runReadySubtasks({ id: parent.data.id });
      expect(result.success).toBe(true);
      expect(result.data.kickedOff?.sort()).toEqual([ch1.data.identifier, ch2.data.identifier]);
      // ch3 stays in backlog because layer 2 only fires after layer 1 completes
      const ch3After = await caller.find({ id: ch3.data.id });
      expect(ch3After.data.status).toBe('backlog');
      // The kicked-off tasks should now be running
      const ch1After = await caller.find({ id: ch1.data.id });
      expect(ch1After.data.status).toBe('running');
    });

    it('runReadySubtasks returns noop when nothing is runnable', async () => {
      const parent = await caller.create({ instruction: 'Empty' });
      const result = await caller.runReadySubtasks({ id: parent.data.id });
      expect(result.success).toBe(true);
      expect(result.data.kickedOff).toEqual([]);
      expect(result.data.skipped).toEqual({ reason: 'nothing-runnable' });
    });

    it('previewSubtaskLayers holds back dependents of in-flight subtasks (does not free them)', async () => {
      const parent = await caller.create({ instruction: 'Inflight blocker' });
      const ch1 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 1',
        parentTaskId: parent.data.id,
      });
      const ch2 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 2',
        parentTaskId: parent.data.id,
      });
      await caller.addDependency({ dependsOnId: ch1.data.id, taskId: ch2.data.id });

      // Kick ch1 off — now in `running` state
      await caller.run({ id: ch1.data.id });

      const result = await caller.previewSubtaskLayers({ id: parent.data.id });
      // ch1 is in flight (ineligible). ch2 must NOT appear in layers — its
      // upstream is still running.
      expect(result.data.layers).toEqual([]);
      expect(result.data.ineligible).toEqual([ch1.data.identifier]);
      expect(result.data.blockedExternally).toEqual([ch2.data.identifier]);
    });

    it('runReadySubtasks does not start a subtask whose blocker is still running', async () => {
      const parent = await caller.create({ instruction: 'Inflight runReady' });
      const ch1 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 1',
        parentTaskId: parent.data.id,
      });
      const ch2 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 2',
        parentTaskId: parent.data.id,
      });
      await caller.addDependency({ dependsOnId: ch1.data.id, taskId: ch2.data.id });

      await caller.run({ id: ch1.data.id });
      mockExecAgent.mockClear();

      const result = await caller.runReadySubtasks({ id: parent.data.id });
      // No layers ⇒ runReadySubtasks falls through to the "nothing-runnable" branch.
      expect(result.data.kickedOff).toEqual([]);
      expect(mockExecAgent).not.toHaveBeenCalled();
      const ch2After = await caller.find({ id: ch2.data.id });
      expect(ch2After.data.status).toBe('backlog');
    });

    it('previewSubtaskLayers respects a cross-scope blocker (dep outside the subtree)', async () => {
      // External blocker lives outside `parent`'s descendant tree
      const externalBlocker = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'External blocker',
      });
      const parent = await caller.create({ instruction: 'Cross-scope' });
      const ch1 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 1',
        parentTaskId: parent.data.id,
      });
      // ch1 depends on a task that is NOT a descendant of parent
      await caller.addDependency({ dependsOnId: externalBlocker.data.id, taskId: ch1.data.id });

      // External is still backlog → blocks ch1
      const blocked = await caller.previewSubtaskLayers({ id: parent.data.id });
      expect(blocked.data.layers).toEqual([]);
      expect(blocked.data.blockedExternally).toEqual([ch1.data.identifier]);

      // Mark external completed → cascade fires → ch1 is auto-kicked off.
      // This proves the blocker classification *and* the existing cascade hook
      // co-operate end-to-end across the scope boundary.
      await caller.updateStatus({ id: externalBlocker.data.id, status: 'completed' });
      const ch1After = await caller.find({ id: ch1.data.id });
      expect(ch1After.data.status).toBe('running');
    });

    it('updateStatus(completed) triggers cascade kickoff for unlocked downstream', async () => {
      const parent = await caller.create({ instruction: 'Cascade' });
      const ch1 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 1',
        parentTaskId: parent.data.id,
      });
      const ch2 = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Chapter 2',
        parentTaskId: parent.data.id,
      });
      await caller.addDependency({ dependsOnId: ch1.data.id, taskId: ch2.data.id });

      // Kick off layer 1 (just ch1)
      await caller.run({ id: ch1.data.id });

      // Mark ch1 completed → ch2 should auto-run (status 'running' + topic created)
      const completed = await caller.updateStatus({ id: ch1.data.id, status: 'completed' });
      expect(completed.unlocked).toEqual([ch2.data.identifier]);

      const ch2After = await caller.find({ id: ch2.data.id });
      expect(ch2After.data.status).toBe('running');
      // Verify the runner was actually invoked, not just the status flipped
      expect(mockExecAgent).toHaveBeenCalled();
    });
  });

  describe('agent model snapshot', () => {
    const setAgentModel = async (model: string | null, provider: string | null) => {
      const { agents } = await import('@/database/schemas');
      const { eq } = await import('drizzle-orm');
      await serverDB.update(agents).set({ model, provider }).where(eq(agents.id, testAgentId));
    };

    it('snapshots the agent model into task.config at create time', async () => {
      await setAgentModel('claude-sonnet-4-6', 'anthropic');

      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Snapshot at create',
      });

      expect(task.data.config).toMatchObject({
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
      });
    });

    it('skips snapshot when the agent has no model configured', async () => {
      await setAgentModel(null, null);

      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'No snapshot when agent has none',
      });

      expect(task.data.config).toEqual({});
    });

    it('skips snapshot when the task has no assignee', async () => {
      await setAgentModel('claude-sonnet-4-6', 'anthropic');

      const task = await caller.create({ instruction: 'Unassigned task' });

      expect(task.data.config).toEqual({});
    });

    it('preserves the snapshotted model when the agent default changes later', async () => {
      await setAgentModel('claude-sonnet-4-6', 'anthropic');
      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Snapshot then drift',
      });

      // User flips the agent to an expensive chat model.
      await setAgentModel('gpt-5.4-pro', 'openai');

      await caller.run({ id: task.data.id });

      expect(mockExecAgent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6', provider: 'anthropic' }),
      );
    });

    it('backfills the snapshot on first run for tasks without config.model', async () => {
      // Simulate a task that pre-dates this fix: no snapshot yet.
      await setAgentModel(null, null);
      const task = await caller.create({
        assigneeAgentId: testAgentId,
        instruction: 'Pre-fix task',
      });
      expect(task.data.config).toEqual({});

      // User later configures the agent model.
      await setAgentModel('claude-sonnet-4-6', 'anthropic');

      await caller.run({ id: task.data.id });

      const after = await caller.find({ id: task.data.id });
      expect(after.data.config).toMatchObject({
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
      });
      expect(mockExecAgent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6', provider: 'anthropic' }),
      );
    });
  });

  describe('list scope (my tasks)', () => {
    it('should narrow the list to tasks assigned to or created by the caller', async () => {
      otherUserId = await createTestUser(serverDB);
      const workspaceId = 'task-list-scope-workspace';
      const { workspaces, workspaceMembers } = await import('@/database/schemas');
      await serverDB.insert(workspaces).values({
        id: workspaceId,
        name: 'Task List Scope Workspace',
        primaryOwnerId: userId,
        slug: workspaceId,
      });
      await serverDB.insert(workspaceMembers).values([
        { role: 'owner', userId, workspaceId },
        { role: 'member', userId: otherUserId!, workspaceId },
      ]);
      const wsCaller = taskRouter.createCaller({ ...createTestContext(userId), workspaceId });
      const wsOtherCaller = taskRouter.createCaller({
        ...createTestContext(otherUserId),
        workspaceId,
      });

      const mineForOther = await wsCaller.create({
        assigneeUserId: otherUserId,
        instruction: 'Mine for other',
        name: 'Mine for other',
      });
      const othersForMe = await wsOtherCaller.create({
        assigneeUserId: userId,
        instruction: 'Others for me',
        name: 'Others for me',
      });
      await wsOtherCaller.create({ instruction: 'Others unassigned', name: 'Others unassigned' });

      const assigned = await wsCaller.list({ scope: 'assigned' });
      expect(assigned.total).toBe(1);
      expect(assigned.data.map((t) => t.id)).toEqual([othersForMe.data.id]);

      const created = await wsCaller.list({ scope: 'created' });
      expect(created.total).toBe(1);
      expect(created.data.map((t) => t.id)).toEqual([mineForOther.data.id]);

      const all = await wsCaller.list({});
      expect(all.total).toBe(3);
    });

    it('should narrow the grouped board to the same slice as the list', async () => {
      otherUserId = await createTestUser(serverDB);
      const workspaceId = 'task-group-scope-workspace';
      const { workspaces, workspaceMembers } = await import('@/database/schemas');
      await serverDB.insert(workspaces).values({
        id: workspaceId,
        name: 'Task Group Scope Workspace',
        primaryOwnerId: userId,
        slug: workspaceId,
      });
      await serverDB.insert(workspaceMembers).values([
        { role: 'owner', userId, workspaceId },
        { role: 'member', userId: otherUserId!, workspaceId },
      ]);
      const wsCaller = taskRouter.createCaller({ ...createTestContext(userId), workspaceId });
      const wsOtherCaller = taskRouter.createCaller({
        ...createTestContext(otherUserId),
        workspaceId,
      });

      const mineForOther = await wsCaller.create({
        assigneeUserId: otherUserId,
        instruction: 'Mine for other',
        name: 'Mine for other',
      });
      const othersForMe = await wsOtherCaller.create({
        assigneeUserId: userId,
        instruction: 'Others for me',
        name: 'Others for me',
      });
      await wsOtherCaller.create({ instruction: 'Others unassigned', name: 'Others unassigned' });

      const groups = () => ({ groups: [{ key: 'backlog', statuses: ['backlog' as const] }] });
      const idsIn = (result: { data: Array<{ tasks: Array<{ id: string }> }> }) =>
        result.data.flatMap((group) => group.tasks.map((task) => task.id));

      // The board is the same rows as the list, only grouped — a scope the
      // board ignored would quietly widen "My tasks" on the view switch.
      expect(idsIn(await wsCaller.groupList({ ...groups(), scope: 'assigned' }))).toEqual([
        othersForMe.data.id,
      ]);
      expect(idsIn(await wsCaller.groupList({ ...groups(), scope: 'created' }))).toEqual([
        mineForOther.data.id,
      ]);
      expect(idsIn(await wsCaller.groupList(groups()))).toHaveLength(3);
    });
  });

  describe('human assignee (assigneeUserId)', () => {
    it('should persist agent and member assignments independently', async () => {
      const created = await caller.create({
        assigneeAgentId: testAgentId,
        assigneeUserId: userId,
        instruction: 'Dual-assigned task',
      });

      expect(created.data.assigneeAgentId).toBe(testAgentId);
      expect(created.data.assigneeUserId).toBe(userId);

      const memberCleared = await caller.update({
        assigneeUserId: null,
        expectedDomainRevision: await revisionOf(created.data.id),
        id: created.data.id,
      });
      expect(memberCleared.data.assigneeAgentId).toBe(testAgentId);
      expect(memberCleared.data.assigneeUserId).toBeNull();

      const memberRestored = await caller.update({
        assigneeUserId: userId,
        expectedDomainRevision: await revisionOf(created.data.id),
        id: created.data.id,
      });
      const agentCleared = await caller.update({
        assigneeAgentId: null,
        expectedDomainRevision: await revisionOf(memberRestored.data.id),
        id: memberRestored.data.id,
      });
      expect(agentCleared.data.assigneeAgentId).toBeNull();
      expect(agentCleared.data.assigneeUserId).toBe(userId);
    });

    it('should notify the assignee only on an actual assignment to someone else', async () => {
      otherUserId = await createTestUser(serverDB);
      const workspaceId = 'task-assign-notify-workspace';
      const { workspaces, workspaceMembers } = await import('@/database/schemas');
      await serverDB.insert(workspaces).values({
        id: workspaceId,
        name: 'Task Assign Notify Workspace',
        primaryOwnerId: userId,
        slug: workspaceId,
      });
      await serverDB.insert(workspaceMembers).values([
        { role: 'owner', userId, workspaceId },
        { role: 'member', userId: otherUserId!, workspaceId },
      ]);
      const wsCaller = taskRouter.createCaller({ ...createTestContext(userId), workspaceId });

      // Create without assignee, then assign another member → notifies once.
      const task = await wsCaller.create({ instruction: 'Notify target', name: 'Notify target' });
      await flushAfterResponse();
      expect(mockNotifyTaskAssigned).not.toHaveBeenCalled();

      await wsCaller.update({
        assigneeUserId: otherUserId,
        expectedDomainRevision: await revisionOf(task.data.id),
        id: task.data.id,
      });
      await flushAfterResponse();
      expect(mockNotifyTaskAssigned).toHaveBeenCalledTimes(1);
      expect(mockNotifyTaskAssigned).toHaveBeenCalledWith({
        actorUserId: userId,
        assigneeUserId: otherUserId,
        taskId: task.data.id,
        taskIdentifier: task.data.identifier,
        taskName: 'Notify target',
        workspaceId,
      });

      // Re-saving the same assignee is a no-op → no second notification.
      await wsCaller.update({
        assigneeUserId: otherUserId,
        expectedDomainRevision: await revisionOf(task.data.id),
        id: task.data.id,
      });
      await flushAfterResponse();
      expect(mockNotifyTaskAssigned).toHaveBeenCalledTimes(1);

      // Self-assignment never notifies.
      await wsCaller.update({
        assigneeUserId: userId,
        expectedDomainRevision: await revisionOf(task.data.id),
        id: task.data.id,
      });
      await flushAfterResponse();
      expect(mockNotifyTaskAssigned).toHaveBeenCalledTimes(1);

      // Clearing the assignee never notifies.
      await wsCaller.update({
        assigneeUserId: null,
        expectedDomainRevision: await revisionOf(task.data.id),
        id: task.data.id,
      });
      await flushAfterResponse();
      expect(mockNotifyTaskAssigned).toHaveBeenCalledTimes(1);

      // Creating a task already assigned to another member notifies too.
      const created = await wsCaller.create({
        assigneeUserId: otherUserId,
        instruction: 'Assigned at creation',
      });
      await flushAfterResponse();
      expect(mockNotifyTaskAssigned).toHaveBeenCalledTimes(2);
      expect(mockNotifyTaskAssigned).toHaveBeenLastCalledWith(
        expect.objectContaining({
          actorUserId: userId,
          assigneeUserId: otherUserId,
          taskId: created.data.id,
          workspaceId,
        }),
      );
    });

    it('should allow assigning to self in personal mode', async () => {
      const created = await caller.create({
        assigneeUserId: userId,
        instruction: 'Self-assigned task',
      });
      expect(created.data.assigneeUserId).toBe(userId);

      const cleared = await caller.update({
        assigneeUserId: null,
        expectedDomainRevision: await revisionOf(created.data.id),
        id: created.data.id,
      });
      expect(cleared.data.assigneeUserId).toBeNull();
    });

    it('should reject assigning to another user in personal mode', async () => {
      otherUserId = await createTestUser(serverDB);

      await expect(
        caller.create({ assigneeUserId: otherUserId, instruction: 'Cross-user assignment' }),
      ).rejects.toThrow('Assignee user not found');

      const task = await caller.create({ instruction: 'Reassign target' });
      await expect(
        caller.update({
          assigneeUserId: otherUserId,
          expectedDomainRevision: await revisionOf(task.data.id),
          id: task.data.id,
        }),
      ).rejects.toThrow('Assignee user not found');
    });

    it('should validate workspace membership when assigning in workspace mode', async () => {
      otherUserId = await createTestUser(serverDB);
      const outsiderId = await createTestUser(serverDB);
      const removedId = await createTestUser(serverDB);
      const workspaceId = 'task-assignee-workspace';
      const { workspaces, workspaceMembers } = await import('@/database/schemas');
      await serverDB.insert(workspaces).values({
        id: workspaceId,
        name: 'Task Assignee Workspace',
        primaryOwnerId: userId,
        slug: workspaceId,
      });
      await serverDB.insert(workspaceMembers).values([
        { role: 'owner', userId, workspaceId },
        { role: 'member', userId: otherUserId!, workspaceId },
        { deletedAt: new Date(), role: 'member', userId: removedId, workspaceId },
      ]);
      const wsCaller = taskRouter.createCaller({ ...createTestContext(userId), workspaceId });

      const assigned = await wsCaller.create({
        assigneeUserId: otherUserId,
        instruction: 'Assigned to a member',
      });
      expect(assigned.data.assigneeUserId).toBe(otherUserId);

      await expect(
        wsCaller.create({ assigneeUserId: outsiderId, instruction: 'Assigned to an outsider' }),
      ).rejects.toThrow('Assignee user is not a member of this workspace');

      await expect(
        wsCaller.update({
          assigneeUserId: removedId,
          expectedDomainRevision: await revisionOf(assigned.data.id),
          id: assigned.data.id,
        }),
      ).rejects.toThrow('Assignee user is not a member of this workspace');

      try {
        await cleanupTestUser(serverDB, outsiderId);
        await cleanupTestUser(serverDB, removedId);
      } catch {
        /* cascade cleanup is best-effort */
      }
    });

    it('should serialize assignments against concurrent membership removal', async () => {
      otherUserId = await createTestUser(serverDB);
      const memberId = otherUserId;
      const workspaceId = 'task-assignee-removal-race-workspace';
      const { tasks, workspaces, workspaceMembers } = await import('@/database/schemas');
      const { and, eq } = await import('drizzle-orm');
      await serverDB.insert(workspaces).values({
        id: workspaceId,
        name: 'Task Assignee Removal Race Workspace',
        primaryOwnerId: userId,
        slug: workspaceId,
      });
      await serverDB.insert(workspaceMembers).values([
        { role: 'owner', userId, workspaceId },
        { role: 'member', userId: memberId, workspaceId },
      ]);
      const wsCaller = taskRouter.createCaller({ ...createTestContext(userId), workspaceId });
      const existingTask = await wsCaller.create({ instruction: 'Concurrent update target' });
      // Fetch the CAS before `removal` grabs the pool connection: resolving it
      // inside the update call below would wait on the held connection and
      // deadlock the test.
      const existingTaskRevision = await revisionOf(existingTask.data.id);

      let signalMemberLocked: () => void = () => {};
      const memberLocked = new Promise<void>((resolve) => {
        signalMemberLocked = resolve;
      });
      let releaseRemoval: () => void = () => {};
      const removalReleased = new Promise<void>((resolve) => {
        releaseRemoval = resolve;
      });

      const removal = serverDB.transaction(async (tx) => {
        await tx
          .update(workspaceMembers)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.userId, memberId),
            ),
          );
        signalMemberLocked();
        await removalReleased;
      });
      await memberLocked;

      let updateSettled = false;
      const update = wsCaller
        .update({
          assigneeUserId: memberId,
          expectedDomainRevision: existingTaskRevision,
          id: existingTask.data.id,
        })
        .then(
          (value) => ({ error: null, value }),
          (error: Error) => ({ error, value: null }),
        )
        .finally(() => {
          updateSettled = true;
        });
      let createSettled = false;
      const create = wsCaller
        .create({ assigneeUserId: memberId, instruction: 'Concurrent create target' })
        .then(
          (value) => ({ error: null, value }),
          (error: Error) => ({ error, value: null }),
        )
        .finally(() => {
          createSettled = true;
        });

      // Both writes have started while removal owns the membership row. They
      // must wait for that row lock instead of committing from a stale read.
      await new Promise((resolve) => setTimeout(resolve, 100));
      const updateWaitedForRemoval = !updateSettled;
      const createWaitedForRemoval = !createSettled;

      releaseRemoval();
      await removal;
      const [updateResult, createResult] = await Promise.all([update, create]);
      expect(updateWaitedForRemoval).toBe(true);
      expect(createWaitedForRemoval).toBe(true);
      expect(updateResult.error?.message).toContain(
        'Assignee user is not a member of this workspace',
      );
      expect(createResult.error?.message).toContain(
        'Assignee user is not a member of this workspace',
      );

      const [afterUpdate] = await serverDB
        .select({ assigneeUserId: tasks.assigneeUserId })
        .from(tasks)
        .where(eq(tasks.id, existingTask.data.id));
      expect(afterUpdate.assigneeUserId).toBeNull();
      const strandedCreate = await serverDB
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.instruction, 'Concurrent create target'));
      expect(strandedCreate).toHaveLength(0);
    });

    it('keeps workspace human assignment usable despite old private requests', async () => {
      otherUserId = await createTestUser(serverDB);
      const workspaceId = 'task-private-assignee-workspace';
      const { workspaces, workspaceMembers } = await import('@/database/schemas');
      await serverDB.insert(workspaces).values({
        id: workspaceId,
        name: 'Task Private Assignee Workspace',
        primaryOwnerId: userId,
        slug: workspaceId,
      });
      await serverDB.insert(workspaceMembers).values([
        { role: 'owner', userId, workspaceId },
        { role: 'member', userId: otherUserId!, workspaceId },
      ]);
      const wsCaller = taskRouter.createCaller({ ...createTestContext(userId), workspaceId });

      const created = await wsCaller.create({
        assigneeUserId: otherUserId,
        instruction: 'Old private cross-member request',
        visibility: 'private',
      });
      expect(created.data).toMatchObject({ visibility: 'public', assigneeUserId: otherUserId });
      const normalized = await wsCaller.updateVisibility({
        id: created.data.id,
        visibility: 'private',
      });
      expect(normalized.data).toMatchObject({ visibility: 'public', assigneeUserId: otherUserId });
      const assigned = await wsCaller.update({
        id: created.data.id,
        assigneeUserId: userId,
        expectedDomainRevision: await revisionOf(created.data.id),
      });
      expect(assigned.data).toMatchObject({ visibility: 'public', assigneeUserId: userId });
    });

    it('should preserve the responsible assignee independently of automation', async () => {
      const createdScheduled = await caller.create({
        assigneeUserId: userId,
        automationMode: 'schedule',
        instruction: 'Automated assigned task',
        schedulePattern: '0 9 * * *',
      });
      expect(createdScheduled.data.assigneeUserId).toBe(userId);
      expect(createdScheduled.data.automationMode).toBe('schedule');

      const automated = await caller.create({
        automationMode: 'schedule',
        instruction: 'Automated task',
        schedulePattern: '0 9 * * *',
      });
      const assignedAutomated = await caller.update({
        assigneeUserId: userId,
        expectedDomainRevision: await revisionOf(automated.data.id),
        id: automated.data.id,
      });
      expect(assignedAutomated.data.assigneeUserId).toBe(userId);
      expect(assignedAutomated.data.automationMode).toBe('schedule');

      const humanTask = await caller.create({
        assigneeUserId: userId,
        instruction: 'Human task',
      });
      const scheduled = await caller.update({
        automationMode: 'schedule',
        id: humanTask.data.id,
        schedulePattern: '0 9 * * *',
      });
      expect(scheduled.data.automationMode).toBe('schedule');
      expect(scheduled.data.assigneeUserId).toBe(userId);
    });

    it('should keep inbox fallback ephemeral without clearing an explicit inbox assignment', async () => {
      // Seed the builtin inbox agent so the runner's fallback path can resolve it.
      const inboxAgentId = await createTestAgent(serverDB, userId, 'inbox');

      const humanTask = await caller.create({
        assigneeUserId: userId,
        instruction: 'Human-assigned task',
      });
      await caller.run({ id: humanTask.data.id });

      const afterHumanRun = await caller.find({ id: humanTask.data.id });
      expect(afterHumanRun.data.assigneeUserId).toBe(userId);
      expect(afterHumanRun.data.assigneeAgentId).toBeNull();

      // Inbox is also a valid explicit agent assignment. Once a member and an
      // agent can be selected independently, the persisted pair must survive
      // execution because it is indistinguishable from any historical fallback.
      const dualAssignedTask = await caller.create({
        assigneeUserId: userId,
        instruction: 'Inbox-and-member-assigned task',
      });
      await caller.update({
        assigneeAgentId: inboxAgentId,
        expectedDomainRevision: await revisionOf(dualAssignedTask.data.id),
        id: dualAssignedTask.data.id,
      });
      await caller.run({ id: dualAssignedTask.data.id });

      const afterDualAssignedRun = await caller.find({ id: dualAssignedTask.data.id });
      expect(afterDualAssignedRun.data.assigneeUserId).toBe(userId);
      expect(afterDualAssignedRun.data.assigneeAgentId).toBe(inboxAgentId);

      // Control: a fully unassigned task still gets the fallback persisted.
      const unassignedTask = await caller.create({ instruction: 'Unassigned task' });
      await caller.run({ id: unassignedTask.data.id });

      const afterUnassignedRun = await caller.find({ id: unassignedTask.data.id });
      expect(afterUnassignedRun.data.assigneeAgentId).toBe(inboxAgentId);
    });

    it('should populate a user participant in list', async () => {
      const { users } = await import('@/database/schemas');
      const { eq } = await import('drizzle-orm');
      await serverDB
        .update(users)
        .set({ avatar: 'user-avatar.png', fullName: 'User One' })
        .where(eq(users.id, userId));

      await caller.create({ assigneeUserId: userId, instruction: 'Human task' });

      const list = await caller.list({});
      const assigned = list.data.find((t) => t.assigneeUserId === userId)!;
      expect(assigned.participants).toEqual([
        {
          avatar: 'user-avatar.png',
          backgroundColor: null,
          id: userId,
          title: 'User One',
          type: 'user',
        },
      ]);
    });
  });
});
