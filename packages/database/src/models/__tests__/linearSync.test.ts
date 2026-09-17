// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  linearExternalRelations,
  linearInstallations,
  linearIssueLinks,
  linearProjectBindings,
  linearSyncInbox,
  linearSyncOutbox,
  projects,
  taskDomainEvents,
  taskPlanningRevisions,
  taskPlanningScopes,
  tasks,
  users,
  workspaces,
} from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { LinearSyncModel, sanitizeLinearSyncError } from '../linearSync';
import { ProjectModel } from '../project';
import { TaskModel } from '../task';

const db: LobeChatDatabase = await getTestDB();
const userId = 'linear-sync-model-user';
const workspaceId = 'linear-sync-model-workspace';
const otherWorkspaceId = 'linear-sync-model-other-workspace';
const installationId = '00000000-0000-4000-8000-000000000001';
const otherInstallationId = '00000000-0000-4000-8000-000000000002';
const installationId2 = otherInstallationId;

const cleanup = async () => {
  await db.delete(linearSyncOutbox);
  await db.delete(linearSyncInbox);
  await db.delete(taskPlanningRevisions);
  await db.delete(taskPlanningScopes);
  await db.delete(taskDomainEvents);
  await db.delete(linearProjectBindings);
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values({ id: userId });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Linear Sync Test Workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
});

afterEach(cleanup);

const createInstallation = () =>
  db.insert(linearInstallations).values({
    id: installationId,
    installedByUserId: userId,
    organizationId: 'linear-org-1',
    workspaceId,
  });

describe('LinearSyncModel', () => {
  it('pauses linkless create intent without attempts and requeues it on enable', async () => {
    await createInstallation();
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'FLAG',
      name: 'Rollout flags',
    });
    const binding = await model.upsertBinding({
      installationId,
      linearProjectId: 'linear-project-flag',
      projectId: project.id,
      settings: { readEnabled: true, writeEnabled: true },
    });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'FLAG-1',
        instruction: 'create remotely later',
        projectId: project.id,
        seq: 1,
        workspaceId,
      })
      .returning();
    await model.queueOutbox({
      expectedLocalRevision: 1,
      installationId,
      operation: 'linear-issue:create:FLAG-1',
      payload: { title: 'create later' },
      taskId: task.id,
    });

    const disabled = await model.updateBindingControls({
      expectedVersion: binding.version,
      id: binding.id,
      writeEnabled: false,
    });
    expect(disabled?.settings).toMatchObject({ writeEnabled: false });
    expect(
      await model.claimOutbox(1, 60_000, installationId, '00000000-0000-4000-8000-000000000101'),
    ).toHaveLength(0);
    const pausedOutbox = await model.listOutbox('paused');
    expect(pausedOutbox).toHaveLength(1);
    expect(pausedOutbox[0]).toMatchObject({ attempts: 0, status: 'paused' });

    const reenabled = await model.updateBindingControls({
      expectedVersion: disabled!.version,
      id: binding.id,
      writeEnabled: true,
    });
    expect(reenabled?.settings).toMatchObject({ writeEnabled: true });
    const resumedOutbox = await model.claimOutbox(
      1,
      60_000,
      installationId,
      '00000000-0000-4000-8000-000000000102',
    );
    expect(resumedOutbox).toHaveLength(1);
    expect(resumedOutbox[0]).toMatchObject({ attempts: 1, status: 'sending' });
  });

  it('pauses inbound work without attempts and requeues it on enable', async () => {
    await createInstallation();
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'READ',
      name: 'Read rollout',
    });
    const binding = await model.upsertBinding({
      installationId,
      linearProjectId: 'linear-project-read',
      projectId: project.id,
      settings: { readEnabled: true, writeEnabled: true },
    });
    await model.captureDelivery({
      action: 'update',
      deliveryId: 'read-rollout-delivery',
      eventType: 'Issue',
      installationId,
      organizationId: 'linear-org-1',
      payload: { data: { project: { id: binding.linearProjectId } } },
      subjectId: 'linear-read-issue',
    });

    await model.updateBindingControls({
      expectedVersion: binding.version,
      id: binding.id,
      readEnabled: false,
    });
    expect(
      await model.claimInbox(1, 60_000, installationId, '00000000-0000-4000-8000-000000000103'),
    ).toHaveLength(0);
    const pausedInbox = await db
      .select()
      .from(linearSyncInbox)
      .where(eq(linearSyncInbox.workspaceId, workspaceId));
    expect(pausedInbox).toHaveLength(1);
    expect(pausedInbox[0]).toMatchObject({ attempts: 0, status: 'paused' });

    const current = await model.findBindingById(binding.id);
    await model.updateBindingControls({
      expectedVersion: current!.version,
      id: binding.id,
      readEnabled: true,
    });
    const resumedInbox = await model.claimInbox(
      1,
      60_000,
      installationId,
      '00000000-0000-4000-8000-000000000104',
    );
    expect(resumedInbox).toHaveLength(1);
    expect(resumedInbox[0]).toMatchObject({ attempts: 1, status: 'processing' });
  });

  it('fences an in-flight write as outcome unknown across a fast disable-enable race', async () => {
    await createInstallation();
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'RACE',
      name: 'Write race',
    });
    const binding = await model.upsertBinding({
      installationId,
      linearProjectId: 'linear-project-race',
      projectId: project.id,
      settings: { readEnabled: true, writeEnabled: true },
    });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'RACE-1',
        instruction: 'uncertain remote write',
        projectId: project.id,
        seq: 1,
        workspaceId,
      })
      .returning();
    const [row] = await db
      .insert(linearSyncOutbox)
      .values({
        expectedLocalRevision: 2,
        installationId,
        leaseFence: 7,
        leaseOwner: 'active-writer',
        lockedUntil: new Date(Date.now() + 60_000),
        operation: 'linear-issue:create:RACE-1',
        payload: { title: 'uncertain' },
        status: 'sending',
        taskId: task.id,
        workspaceId,
      })
      .returning();

    const disabled = await model.updateBindingControls({
      expectedVersion: binding.version,
      id: binding.id,
      writeEnabled: false,
    });
    const fenced = (await model.listOutbox())[0];
    expect(fenced).toMatchObject({
      id: row.id,
      leaseFence: 8,
      leaseOwner: null,
      status: 'outcome_unknown',
    });
    expect(fenced.outcomeUnknownAt).toEqual(expect.any(Date));

    await model.updateBindingControls({
      expectedVersion: disabled!.version,
      id: binding.id,
      writeEnabled: true,
    });
    expect((await model.listOutbox())[0]).toMatchObject({ status: 'outcome_unknown' });
  });

  it('bounds task-scoped issue links and keeps the workspace scope', async () => {
    await createInstallation();
    await db.insert(workspaces).values({
      id: otherWorkspaceId,
      name: 'Other Linear Sync Test Workspace',
      primaryOwnerId: userId,
      slug: otherWorkspaceId,
    });
    await db.insert(linearInstallations).values({
      id: otherInstallationId,
      organizationId: 'linear-org-other',
      workspaceId: otherWorkspaceId,
    });

    const [taskOne, taskTwo, otherTask] = await db
      .insert(tasks)
      .values([
        {
          createdByUserId: userId,
          identifier: 'LINK-1',
          instruction: 'one',
          seq: 1,
          workspaceId,
        },
        {
          createdByUserId: userId,
          identifier: 'LINK-2',
          instruction: 'two',
          seq: 2,
          workspaceId,
        },
        {
          createdByUserId: userId,
          identifier: 'OTHER-1',
          instruction: 'other',
          seq: 1,
          workspaceId: otherWorkspaceId,
        },
      ])
      .returning();
    const linkSnapshot = (id: string, identifier: string) => ({
      id,
      identifier,
      title: identifier,
    });

    await new LinearSyncModel(db, workspaceId).createIssueLink({
      installationId,
      linearIdentifier: 'ENG-1',
      linearIssueId: 'linear-issue-1',
      organizationId: 'linear-org-1',
      remoteSnapshot: linkSnapshot('linear-issue-1', 'ENG-1'),
      taskId: taskOne.id,
    });
    await new LinearSyncModel(db, workspaceId).createIssueLink({
      installationId,
      linearIdentifier: 'ENG-2',
      linearIssueId: 'linear-issue-2',
      organizationId: 'linear-org-1',
      remoteSnapshot: linkSnapshot('linear-issue-2', 'ENG-2'),
      taskId: taskTwo.id,
    });
    await new LinearSyncModel(db, otherWorkspaceId).createIssueLink({
      installationId: otherInstallationId,
      linearIdentifier: 'OTHER-1',
      linearIssueId: 'linear-issue-other',
      organizationId: 'linear-org-other',
      remoteSnapshot: linkSnapshot('linear-issue-other', 'OTHER-1'),
      taskId: otherTask.id,
    });

    const model = new LinearSyncModel(db, workspaceId);
    await expect(model.listIssueLinks({ taskIds: [] })).rejects.toThrow(/taskIds/);
    await expect(
      model.listIssueLinks({ taskIds: Array.from({ length: 101 }, (_, i) => `task-${i}`) }),
    ).rejects.toThrow(/taskIds/);
    await expect(model.listIssueLinks({ taskIds: [otherTask.id] })).resolves.toEqual([]);
    await expect(
      model.listIssueLinks({ taskIds: [taskOne.id, taskTwo.id], limit: 1, offset: 1 }),
    ).resolves.toHaveLength(1);
    await expect(model.listIssueLinks({ taskIds: [taskOne.id] })).resolves.toMatchObject([
      { taskId: taskOne.id },
    ]);
  });

  it('coalesces planning wakeups while keeping the first domain event idempotent', async () => {
    const model = new LinearSyncModel(db, workspaceId);
    const first = await model.recordDomainEvent({
      action: 'update',
      eventId: 'delivery-1',
      idempotencyKey: 'linear:delivery-1',
      payload: { issueId: 'issue-1' },
      projectId: null,
      source: 'linear',
      taskId: null,
      type: 'linear.issue.changed',
    });
    const duplicate = await model.recordDomainEvent({
      action: 'update',
      eventId: 'delivery-1',
      idempotencyKey: 'linear:delivery-1',
      payload: { issueId: 'issue-1', changedAgain: true },
      projectId: null,
      source: 'linear',
      taskId: null,
      type: 'linear.issue.changed',
    });

    expect(duplicate.event.id).toBe(first.event.id);
    expect(duplicate.event.revision).toBe(first.event.revision);
    expect(duplicate.scope?.dirtyRevision).toBe(first.event.revision);

    const events = await db.select().from(taskDomainEvents);
    const scopes = await db.select().from(taskPlanningScopes);
    expect(events).toHaveLength(1);
    expect(scopes).toMatchObject([
      {
        dirtyRevision: first.event.revision,
        scopeId: workspaceId,
        scopeType: 'workspace',
        status: 'queued',
      },
    ]);
  });

  it('keeps a newer event queued when an older planning revision finishes', async () => {
    const model = new LinearSyncModel(db, workspaceId);
    const first = await model.recordDomainEvent({
      action: 'create',
      idempotencyKey: 'linear:delivery-1',
      payload: { issueId: 'issue-1' },
      projectId: null,
      source: 'linear',
      taskId: null,
      type: 'linear.issue.changed',
    });
    const [scope] = await model.claimPlanningScopes();
    expect(scope.id).toBe(first.scope?.id);

    const revision = await model.createPlanningRevision({
      eventIds: [first.event.id],
      inputRevision: first.event.revision,
      inputSnapshot: { revision: first.event.revision },
      scopeId: scope.id,
      trigger: first.scope!.lastTrigger!,
    });

    const second = await model.recordDomainEvent({
      action: 'update',
      idempotencyKey: 'linear:delivery-2',
      payload: { issueId: 'issue-1', title: 'Changed' },
      projectId: null,
      source: 'linear',
      taskId: null,
      type: 'linear.issue.changed',
    });
    await model.updatePlanningRevision(revision.id, {
      proposal: {
        actions: [{ action: 'noop', reason: 'test' }],
        explanation: 'test',
        requiresApproval: false,
      },
      status: 'proposed',
    });
    const finished = await model.finishPlanningScope(scope.id, first.event.revision, 'idle');

    expect(finished).toMatchObject({
      dirtyRevision: second.event.revision,
      plannedRevision: first.event.revision,
      status: 'queued',
    });
  });

  it('reclaims an expired inbox lease and rejects the stale worker fence', async () => {
    await createInstallation();
    const model = new LinearSyncModel(db, workspaceId);
    const captured = await model.captureDelivery({
      action: 'update',
      deliveryId: 'delivery-lease-1',
      eventType: 'Issue',
      installationId,
      organizationId: 'linear-org-1',
      payload: { id: 'issue-1' },
    });
    const [first] = await model.claimInbox(
      1,
      60_000,
      installationId,
      '00000000-0000-4000-8000-000000000105',
    );
    expect(first).toMatchObject({ attempts: 1, leaseFence: 1, status: 'processing' });

    await db
      .update(linearSyncInbox)
      .set({ lockedUntil: new Date(0) })
      .where(eq(linearSyncInbox.id, captured.row!.id));
    const [reclaimed] = await model.claimInbox(
      1,
      60_000,
      installationId,
      '00000000-0000-4000-8000-000000000106',
    );
    expect(reclaimed).toMatchObject({
      attempts: 2,
      leaseFence: 2,
      leaseOwner: '00000000-0000-4000-8000-000000000106',
    });

    await expect(
      model.updateInbox(
        first.id,
        { lockedUntil: null, processedAt: new Date(), status: 'processed' },
        { fence: first.leaseFence, owner: '00000000-0000-4000-8000-000000000105' },
      ),
    ).resolves.toBeNull();
    await expect(
      model.updateInbox(
        reclaimed.id,
        { availableAt: new Date(0), lockedUntil: null, status: 'failed' },
        { fence: reclaimed.leaseFence, owner: '00000000-0000-4000-8000-000000000106' },
      ),
    ).resolves.toMatchObject({ status: 'failed' });

    const [retry] = await model.claimInbox(
      1,
      60_000,
      installationId,
      '00000000-0000-4000-8000-000000000107',
    );
    expect(retry).toMatchObject({ attempts: 3, leaseFence: 3, status: 'processing' });
  });

  it('deduplicates the same webhook delivery across replayed captures', async () => {
    await createInstallation();
    const model = new LinearSyncModel(db, workspaceId);
    const captures = await Promise.all(
      Array.from({ length: 20 }, () =>
        model.captureDelivery({
          action: 'create',
          deliveryId: 'delivery-replay-20',
          eventType: 'Comment',
          installationId,
          organizationId: 'linear-org-1',
          payload: { data: { id: 'comment-1', issueId: 'issue-1' }, type: 'Comment' },
          subjectId: 'comment-1',
        }),
      ),
    );

    expect(captures.filter(({ inserted }) => inserted)).toHaveLength(1);
    expect(
      await db
        .select()
        .from(linearSyncInbox)
        .where(eq(linearSyncInbox.deliveryId, 'delivery-replay-20')),
    ).toHaveLength(1);
  });

  it('does not treat an unresolved external blocker as complete', async () => {
    const task = await new TaskModel(db, userId, workspaceId).create({
      instruction: 'Waiting on a remote blocker',
    });
    await db.insert(linearExternalRelations).values({
      confirmationState: 'unresolved',
      kind: 'blocks',
      localRelationKey: 'remote:blocks:blocked-task',
      localTargetTaskId: task.id,
      origin: 'inbound',
      resolutionState: 'unresolved',
      source: 'linear',
      targetIssueId: 'remote-blocked-1',
      workspaceId,
    });

    await expect(
      new TaskModel(db, userId, workspaceId).areAllDependenciesCompleted(task.id),
    ).resolves.toBe(false);
  });

  it('queues and atomically settles one stable create_issue intent for an app task', async () => {
    const projectId = 'linear-create-project';
    const agentId = 'linear-create-agent';
    await db.insert(agents).values({ id: agentId, slug: agentId, userId });
    await db.insert(projects).values({
      coordinatorAgentId: agentId,
      id: projectId,
      identifier: 'LCR',
      name: 'Linear create project',
      userId,
      visibility: 'public',
      workspaceId,
    });
    await createInstallation();
    const [binding] = await db
      .insert(linearProjectBindings)
      .values({
        defaultTeamId: 'linear-team-1',
        installationId,
        linearProjectId: 'linear-project-1',
        projectId,
        workspaceId,
      })
      .returning();

    const task = await new TaskModel(db, userId, workspaceId).create(
      { instruction: 'Create remotely', name: 'Create remotely', projectId },
      { mutation: { idempotencyKey: 'b01:create-task', source: 'user' } },
    );
    const model = new LinearSyncModel(db, workspaceId);
    const first = await model.listOutbox();
    const remoteIssueId = (first[0].payload as { remoteIssueId: string }).remoteIssueId;
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      operation: `linear-issue:create:${task.id}`,
      payload: {
        bindingId: binding.id,
        projectId: 'linear-project-1',
        remoteIssueId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
        teamId: 'linear-team-1',
      },
      taskId: task.id,
    });

    await model.recordTaskChangeInTransaction(db, {
      changedFields: ['created'],
      eventType: 'task.created',
      idempotencyKey: 'b01:create-task',
      source: 'user',
      task,
    });
    expect(await model.listOutbox()).toHaveLength(1);
    expect((await model.listOutbox())[0].payload).toMatchObject({ remoteIssueId });

    const [claimed] = await model.claimOutbox(
      1,
      60_000,
      installationId,
      '00000000-0000-4000-8000-000000000108',
    );
    const remoteSnapshot = {
      id: 'linear-created-issue-1',
      identifier: 'ENG-1',
      projectId: 'linear-project-1',
      title: 'Create remotely',
    };
    await expect(
      model.settleCreateIssueOutbox(
        claimed.id,
        { fence: claimed.leaseFence, owner: '00000000-0000-4000-8000-000000000108' },
        {
          bindingId: binding.id,
          installationId,
          linearIdentifier: remoteSnapshot.identifier,
          linearIssueId: remoteSnapshot.id,
          organizationId: 'linear-org-1',
          remoteSnapshot,
          taskId: task.id,
        },
      ),
    ).resolves.toMatchObject({
      link: { linearIssueId: remoteSnapshot.id, taskId: task.id },
      outbox: { status: 'sent' },
    });
    await expect(model.findIssueLinkByTaskId(task.id)).resolves.toMatchObject({
      linearIssueId: remoteSnapshot.id,
      syncState: 'synced',
    });
  });

  it('does not send a Linear workflow state for an execution-status-only event', async () => {
    await createInstallation();
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'STATE',
      name: 'Workflow state project',
    });
    const binding = await model.upsertBinding({
      installationId,
      linearProjectId: 'linear-project-state',
      projectId: project.id,
      settings: {
        statusMappings: [{ linearStateId: 'linear-state-backlog', workflowCategory: 'backlog' }],
      },
    });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'STATE-1',
        instruction: 'Keep the remote workflow unchanged',
        projectId: project.id,
        seq: 1,
        status: 'running',
        workflowCategory: 'backlog',
        workspaceId,
      })
      .returning();
    await model.createIssueLink({
      bindingId: binding.id,
      installationId,
      linearIdentifier: 'ENG-STATE',
      linearIssueId: 'linear-issue-state',
      organizationId: 'linear-org-1',
      remoteSnapshot: {
        id: 'linear-issue-state',
        identifier: 'ENG-STATE',
        projectId: binding.linearProjectId,
        stateId: 'linear-state-todo',
        title: task.name ?? task.identifier,
      },
      taskId: task.id,
    });

    const recorded = await model.recordTaskChangeInTransaction(db, {
      changedFields: ['status'],
      eventType: 'task.status.changed',
      idempotencyKey: 'state-only:running',
      source: 'system',
      task,
    });

    expect(recorded.outbox).toBeNull();
    await expect(model.listOutbox()).resolves.toHaveLength(0);
  });

  it('keeps forbidden and deleted issue tombstones distinct without deleting the task', async () => {
    await createInstallation();
    const task = await new TaskModel(db, userId, workspaceId).create({
      instruction: 'Keep history',
    });
    const model = new LinearSyncModel(db, workspaceId);
    const link = await model.createIssueLink({
      installationId,
      linearIdentifier: 'ENG-403',
      linearIssueId: 'linear-issue-403',
      organizationId: 'linear-org-1',
      taskId: task.id,
    });

    await model.recordIssueTombstone({
      idempotencyKey: 'b13:forbidden',
      issueLinkId: link.id,
      kind: 'forbidden',
      linearIssueId: 'linear-issue-403',
      origin: 'inbound',
      reason: '403 from Linear',
    });
    await model.recordIssueTombstone({
      idempotencyKey: 'b13:deleted',
      issueLinkId: link.id,
      kind: 'deleted',
      linearIssueId: 'linear-issue-403',
      origin: 'inbound',
      reason: '404 from Linear',
    });

    expect(await new TaskModel(db, userId, workspaceId).findById(task.id)).toBeTruthy();
    expect(await model.listIssueTombstones(link.id)).toMatchObject([
      { kind: 'forbidden', reason: '403 from Linear' },
      { kind: 'deleted', reason: '404 from Linear' },
    ]);
  });

  it('moves a pending local create intent before any remote create can run', async () => {
    const projectId = 'linear-move-project-a';
    const nextProjectId = 'linear-move-project-b';
    const agentId = 'linear-move-agent-a';
    const nextAgentId = 'linear-move-agent-b';
    await db.insert(agents).values([
      { id: agentId, slug: agentId, userId },
      { id: nextAgentId, slug: nextAgentId, userId },
    ]);
    await db.insert(projects).values([
      {
        coordinatorAgentId: agentId,
        id: projectId,
        identifier: 'LMA',
        name: 'Linear move A',
        userId,
        visibility: 'public',
        workspaceId,
      },
      {
        coordinatorAgentId: nextAgentId,
        id: nextProjectId,
        identifier: 'LMB',
        name: 'Linear move B',
        userId,
        visibility: 'public',
        workspaceId,
      },
    ]);
    await createInstallation();
    await db.insert(linearInstallations).values({
      id: installationId2,
      installedByUserId: userId,
      organizationId: 'linear-org-2',
      workspaceId,
    });
    await db.insert(linearProjectBindings).values([
      {
        defaultTeamId: 'linear-team-a',
        installationId,
        linearProjectId: 'linear-project-a',
        projectId,
        workspaceId,
      },
      {
        defaultTeamId: 'linear-team-b',
        installationId: installationId2,
        linearProjectId: 'linear-project-b',
        projectId: nextProjectId,
        workspaceId,
      },
    ]);

    const task = await new TaskModel(db, userId, workspaceId).create({
      instruction: 'Move before create',
      projectId,
    });
    await new TaskModel(db, userId, workspaceId).update(task.id, { projectId: nextProjectId });

    const [outbox] = await new LinearSyncModel(db, workspaceId).listOutbox();
    expect(outbox).toMatchObject({
      installationId: installationId2,
      payload: {
        bindingId: expect.any(String),
        projectId: 'linear-project-b',
        teamId: 'linear-team-b',
      },
      status: 'pending',
    });
    expect((outbox.payload as { remoteIssueId: string }).remoteIssueId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('reclaims sending and outcome_unknown outbox rows with a new fence', async () => {
    await createInstallation();
    await db.insert(linearSyncOutbox).values([
      {
        availableAt: new Date(0),
        expectedLocalRevision: 1,
        installationId,
        leaseFence: 1,
        leaseOwner: 'crashed-a',
        lockedUntil: new Date(0),
        operation: 'update',
        payload: { title: 'One' },
        status: 'sending',
        workspaceId,
      },
      {
        availableAt: new Date(0),
        expectedLocalRevision: 2,
        installationId,
        leaseFence: 3,
        leaseOwner: null,
        lockedUntil: null,
        operation: 'update',
        payload: { title: 'Two' },
        status: 'outcome_unknown',
        workspaceId,
      },
    ]);
    const model = new LinearSyncModel(db, workspaceId);

    const claimed = await model.claimOutbox(
      2,
      60_000,
      installationId,
      '00000000-0000-4000-8000-000000000109',
    );
    expect(claimed).toHaveLength(2);
    expect(claimed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          leaseFence: 2,
          leaseOwner: '00000000-0000-4000-8000-000000000109',
          status: 'sending',
        }),
        expect.objectContaining({
          leaseFence: 4,
          leaseOwner: '00000000-0000-4000-8000-000000000109',
          status: 'sending',
        }),
      ]),
    );
    await expect(
      model.updateOutbox(
        claimed[0].id,
        { lockedUntil: null, status: 'sent' },
        { fence: claimed[0].leaseFence - 1, owner: 'crashed-a' },
      ),
    ).resolves.toBeNull();
  });

  it('keeps a dead-lettered mutation as an ordering barrier for later writes', async () => {
    await createInstallation();
    const task = await new TaskModel(db, userId, workspaceId).create({
      instruction: 'Ordering barrier task',
    });
    const model = new LinearSyncModel(db, workspaceId);
    const link = await model.createIssueLink({
      installationId,
      linearIdentifier: 'LIN-ORDER',
      linearIssueId: 'linear-order',
      organizationId: 'linear-org-1',
      taskId: task.id,
    });
    await db.insert(linearSyncOutbox).values([
      {
        availableAt: new Date(0),
        expectedLocalRevision: 1,
        installationId,
        linkId: link.id,
        operation: 'update_issue:old',
        payload: { title: 'Old' },
        status: 'dead_letter',
        taskId: task.id,
        workspaceId,
      },
      {
        availableAt: new Date(0),
        expectedLocalRevision: 2,
        installationId,
        linkId: link.id,
        operation: 'update_issue:new',
        payload: { title: 'New' },
        status: 'pending',
        taskId: task.id,
        workspaceId,
      },
    ]);

    await expect(
      model.claimOutbox(2, 60_000, installationId, '00000000-0000-4000-8000-000000000110'),
    ).resolves.toEqual([]);
  });

  it('reports the next retry time for a durable continuation', async () => {
    await createInstallation();
    const availableAt = new Date('2030-01-01T00:00:30.000Z');
    await db.insert(linearSyncOutbox).values({
      availableAt,
      expectedLocalRevision: 1,
      installationId,
      operation: 'update',
      payload: { title: 'Later' },
      status: 'failed',
      workspaceId,
    });

    await expect(
      new LinearSyncModel(db, workspaceId).nextSyncWakeAt(installationId),
    ).resolves.toEqual(availableAt);
  });

  it('does not let an older outbox receipt clear a newer local revision', async () => {
    await createInstallation();
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'SYNC',
      name: 'Sync Project',
    });
    const binding = await model.upsertBinding({
      installationId,
      linearProjectId: 'linear-project-1',
      projectId: project.id,
    });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'SYNC-1',
        instruction: 'Newest local requirement',
        projectId: project.id,
        seq: 1,
        workspaceId,
      })
      .returning();
    const snapshot = {
      id: 'linear-issue-1',
      identifier: 'ENG-1',
      projectId: 'linear-project-1',
      title: 'Base title',
    };
    const link = await model.createIssueLink({
      bindingId: binding.id,
      installationId,
      linearIdentifier: snapshot.identifier,
      linearIssueId: snapshot.id,
      organizationId: 'linear-org-1',
      remoteSnapshot: snapshot,
      taskId: task.id,
    });
    await model.queueOutbox({
      expectedLocalRevision: 12,
      installationId,
      linkId: link.id,
      operation: 'update_issue',
      payload: { title: 'v12' },
      taskId: task.id,
    });
    const [claimed] = await model.claimOutbox(
      1,
      60_000,
      installationId,
      '00000000-0000-4000-8000-000000000111',
    );
    await model.queueOutbox({
      expectedLocalRevision: 13,
      installationId,
      linkId: link.id,
      operation: 'update_issue',
      payload: { title: 'v13' },
      taskId: task.id,
    });

    await model.settleOutbox(
      claimed.id,
      { fence: claimed.leaseFence, owner: '00000000-0000-4000-8000-000000000111' },
      {
        issueLinkId: link.id,
        remoteSnapshot: { ...snapshot, title: 'v12', updatedAt: '2026-09-16T12:00:00.000Z' },
      },
    );

    const [settledLink] = await db
      .select()
      .from(linearIssueLinks)
      .where(eq(linearIssueLinks.id, link.id));
    expect(settledLink).toMatchObject({
      lastOutboundRevision: 12,
      syncState: 'pending',
    });
    expect(settledLink.lastConfirmedSnapshot).toMatchObject({ title: 'v12' });
    const rows = await db
      .select()
      .from(linearSyncOutbox)
      .where(eq(linearSyncOutbox.linkId, link.id));
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ expectedLocalRevision: 12, status: 'sent' }),
        expect.objectContaining({ expectedLocalRevision: 13, status: 'pending' }),
      ]),
    );
  });

  it('replaces a conflicted update with the exact resolved payload', async () => {
    await createInstallation();
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'RES',
      name: 'Conflict Resolution Project',
    });
    const binding = await model.upsertBinding({
      installationId,
      linearProjectId: 'linear-project-resolution',
      projectId: project.id,
    });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'RES-1',
        instruction: 'Local body',
        projectId: project.id,
        seq: 1,
        workspaceId,
      })
      .returning();
    const link = await model.createIssueLink({
      bindingId: binding.id,
      installationId,
      linearIdentifier: 'ENG-RES',
      linearIssueId: 'linear-resolution',
      organizationId: 'linear-org-1',
      taskId: task.id,
    });
    await model.updateIssueLink(link.id, {
      conflict: {
        base: { title: 'Base' },
        detectedAt: '2026-09-17T10:00:00.000Z',
        fields: ['title'],
        local: { title: 'Local' },
        localRevision: 3,
        remote: { title: 'Remote' },
        remoteUpdatedAt: '2026-09-17T09:59:00.000Z',
      },
      syncState: 'conflict',
    });
    const failed = await model.queueOutbox({
      expectedLocalRevision: 3,
      installationId,
      linkId: link.id,
      operation: 'update_issue',
      payload: { description: 'stale body', title: 'Local' },
      taskId: task.id,
    });
    await model.updateOutbox(failed.id, { status: 'failed' });

    await expect(model.listIssueConflicts(binding.id, 10)).resolves.toHaveLength(1);
    await model.replaceIssueConflictOutbox({
      expectedLocalRevision: 3,
      initialStatus: 'pending',
      installationId,
      linkId: link.id,
      payload: { title: 'Local' },
      reason: 'resolved',
      taskId: task.id,
    });

    const rows = await db
      .select()
      .from(linearSyncOutbox)
      .where(eq(linearSyncOutbox.linkId, link.id));
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: failed.id, status: 'cancelled' }),
        expect.objectContaining({ payload: { title: 'Local' }, status: 'pending' }),
      ]),
    );
    expect(rows.find((row) => row.status === 'pending')?.payload).not.toHaveProperty('description');
  });

  it('fences Linear token refresh owners and rejects stale token versions', async () => {
    await db.insert(linearInstallations).values({
      accessTokenCiphertext: 'cipher:access-v1',
      accessTokenExpiresAt: new Date(0),
      appActorId: 'app-user-1',
      oauthClientId: 'linear-client-1',
      refreshTokenCiphertext: 'cipher:refresh-v1',
      scopes: ['read', 'write'],
      id: installationId,
      installedByUserId: userId,
      organizationId: 'linear-org-1',
      workspaceId,
    });
    const model = new LinearSyncModel(db, workspaceId);

    const first = await model.claimTokenRefresh(
      installationId,
      0,
      '00000000-0000-4000-8000-000000000105',
    );
    expect(first).toMatchObject({
      refreshFence: 1,
      refreshOwner: '00000000-0000-4000-8000-000000000105',
      tokenVersion: 0,
    });
    await expect(
      model.claimTokenRefresh(installationId, 0, '00000000-0000-4000-8000-000000000106'),
    ).resolves.toBeNull();
    await expect(
      model.persistTokenRefresh({
        accessTokenCiphertext: 'cipher:stale',
        accessTokenExpiresAt: new Date(),
        expectedTokenVersion: 0,
        id: installationId,
        owner: '00000000-0000-4000-8000-000000000106',
        refreshFence: first!.refreshFence,
        refreshTokenCiphertext: 'cipher:stale',
        scopes: ['read', 'write'],
      }),
    ).resolves.toBeNull();

    await expect(
      model.persistTokenRefresh({
        accessTokenCiphertext: 'cipher:access-v2',
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
        expectedTokenVersion: 0,
        id: installationId,
        owner: '00000000-0000-4000-8000-000000000105',
        refreshFence: first!.refreshFence,
        refreshTokenCiphertext: 'cipher:refresh-v2',
        scopes: ['read', 'write'],
      }),
    ).resolves.toMatchObject({ tokenVersion: 1 });

    const stored = await model.findInstallationForAuth(installationId);
    expect(stored).toMatchObject({
      accessTokenCiphertext: 'cipher:access-v2',
      refreshTokenCiphertext: 'cipher:refresh-v2',
      tokenVersion: 1,
    });
    const publicInstallation = await model.findInstallationById(installationId);
    expect(publicInstallation).not.toHaveProperty('accessTokenCiphertext');
    expect(publicInstallation).not.toHaveProperty('refreshTokenCiphertext');
    expect(publicInstallation).not.toHaveProperty('webhookSecretRef');
    await expect(model.listInstallationWebhookCandidates()).resolves.toEqual([
      expect.objectContaining({
        id: installationId,
        status: 'active',
        webhookSecretRef: null,
      }),
    ]);
  });

  it('lists sanitized recovery metadata and compare-and-set retries only idle failed rows', async () => {
    await createInstallation();
    const [inbox] = await db
      .insert(linearSyncInbox)
      .values({
        action: 'update',
        deliveryId: 'recovery-inbox',
        eventType: 'Issue',
        installationId,
        lastError: 'provider token=secret-value payload={"title":"private"}',
        organizationId: 'linear-org-1',
        payload: { private: 'do not return' },
        status: 'failed',
        workspaceId,
      })
      .returning();
    const [outbox] = await db
      .insert(linearSyncOutbox)
      .values({
        expectedLocalRevision: 1,
        installationId,
        lastError: 'remote outcome unknown',
        operation: 'update',
        payload: { private: 'do not return' },
        status: 'outcome_unknown',
        workspaceId,
      })
      .returning();
    await db.insert(taskPlanningScopes).values({
      dirtyRevision: 2,
      lastError: 'planner failed',
      plannedRevision: 1,
      scopeId: workspaceId,
      scopeType: 'workspace',
      status: 'failed',
      workspaceId,
    });

    const model = new LinearSyncModel(db, workspaceId);
    const rows = await model.listRecoveryRows();
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: inbox.id,
          kind: 'inbox',
          lastError: 'Linear synchronization failed',
          status: 'failed',
        }),
        expect.objectContaining({ id: outbox.id, kind: 'outbox', status: 'outcome_unknown' }),
        expect.objectContaining({ kind: 'planning', status: 'failed' }),
      ]),
    );
    expect(rows[0]).not.toHaveProperty('payload');

    const retried = await model.retryInbox(inbox.id, inbox.updatedAt);
    expect(retried).toMatchObject({ id: inbox.id, installationId });
    const [retriedInbox] = await db
      .select()
      .from(linearSyncInbox)
      .where(eq(linearSyncInbox.id, inbox.id));
    expect(retriedInbox).toMatchObject({ attempts: 0, leaseFence: 1, status: 'received' });
    expect(await model.retryInbox(inbox.id, inbox.updatedAt)).toBeNull();

    const [runningOutbox] = await db
      .update(linearSyncOutbox)
      .set({
        lockedUntil: new Date(Date.now() + 60_000),
        leaseOwner: '00000000-0000-4000-8000-000000000112',
        status: 'sending',
      })
      .where(eq(linearSyncOutbox.id, outbox.id))
      .returning();
    expect(await model.retryOutbox(outbox.id, runningOutbox.updatedAt)).toBeNull();
    const [eligibleOutbox] = await db
      .update(linearSyncOutbox)
      .set({ lockedUntil: null, leaseOwner: null, status: 'outcome_unknown' })
      .where(eq(linearSyncOutbox.id, outbox.id))
      .returning();
    expect(await model.retryOutbox(outbox.id, eligibleOutbox.updatedAt)).toMatchObject({
      id: outbox.id,
    });
    const [retriedOutbox] = await db
      .select()
      .from(linearSyncOutbox)
      .where(eq(linearSyncOutbox.id, outbox.id));
    expect(retriedOutbox).toMatchObject({ attempts: 0, leaseFence: 1, status: 'pending' });
  });

  it('never returns token, JWT, body, or URL-like provider details', () => {
    for (const error of [
      'access_token=secret-value',
      'Bearer fixture.jwt.signature',
      'body={"refresh_token":"secret-value"}',
      'https://linear.app/api?access_token=secret-value',
    ]) {
      expect(sanitizeLinearSyncError(error)).not.toContain('secret-value');
      expect(sanitizeLinearSyncError(error)).not.toContain('fixture.jwt.signature');
      expect(sanitizeLinearSyncError(error)).not.toContain('https://');
      expect(sanitizeLinearSyncError(error)).toBe('Linear authorization required');
    }
    expect(sanitizeLinearSyncError('unexpected provider response with private data')).toBe(
      'Linear synchronization failed',
    );
  });

  it('does not retry a later dead-letter outbox row ahead of an earlier same-link row', async () => {
    await createInstallation();
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'ORDER',
      name: 'Ordering Project',
    });
    const binding = await model.upsertBinding({
      installationId,
      linearProjectId: 'linear-order-project',
      projectId: project.id,
    });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'ORDER-1',
        instruction: 'Ordering task',
        projectId: project.id,
        seq: 1,
        workspaceId,
      })
      .returning();
    const link = await model.createIssueLink({
      bindingId: binding.id,
      installationId,
      linearIdentifier: 'ORD-1',
      linearIssueId: 'linear-order-issue',
      organizationId: 'linear-org-1',
      remoteSnapshot: { id: 'linear-order-issue', identifier: 'ORD-1', title: 'Order' },
      taskId: task.id,
    });
    const [earlier, later] = await db
      .insert(linearSyncOutbox)
      .values([
        {
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          expectedLocalRevision: 7,
          installationId,
          linkId: link.id,
          operation: 'comment',
          payload: { body: 'first' },
          status: 'dead_letter',
          workspaceId,
        },
        {
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
          expectedLocalRevision: 7,
          installationId,
          linkId: link.id,
          operation: 'relation',
          payload: { relation: 'second' },
          status: 'dead_letter',
          workspaceId,
        },
      ])
      .returning();

    expect(await model.retryOutbox(later.id, later.updatedAt)).toBeNull();
    expect(await model.retryOutbox(earlier.id, earlier.updatedAt)).toMatchObject({
      id: earlier.id,
    });

    const [firstCreate, secondCreate] = await db
      .insert(linearSyncOutbox)
      .values([
        {
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          expectedLocalRevision: 8,
          installationId,
          operation: 'create_comment',
          payload: { body: 'first create' },
          status: 'dead_letter',
          taskId: task.id,
          workspaceId,
        },
        {
          createdAt: new Date('2026-01-02T00:00:01.000Z'),
          expectedLocalRevision: 8,
          installationId,
          operation: 'create_relation',
          payload: { relation: 'second create' },
          status: 'dead_letter',
          taskId: task.id,
          workspaceId,
        },
      ])
      .returning();

    expect(await model.retryOutbox(secondCreate.id, secondCreate.updatedAt)).toBeNull();
    expect(await model.retryOutbox(firstCreate.id, firstCreate.updatedAt)).toMatchObject({
      id: firstCreate.id,
    });
  });
});
