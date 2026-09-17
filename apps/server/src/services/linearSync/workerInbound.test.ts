// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { LinearSyncModel } from '@/database/models/linearSync';
import { ProjectModel } from '@/database/models/project';
import {
  agents,
  linearInstallations,
  linearSyncOutbox,
  tasks,
  users,
  workspaces,
} from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';

import { LinearSyncWorker } from './worker';

const db: LobeChatDatabase = await getTestDB();
const userId = 'linear-inbound-user';
const installerId = 'linear-inbound-installer';
const workspaceId = 'linear-inbound-workspace';

const cleanup = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, installerId));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values([{ id: userId }, { id: installerId }]);
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Linear Inbound Workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
});

afterEach(cleanup);

describe('LinearSyncWorker inbound ordering', () => {
  it('tombstones an issue from the signed remove payload when the remote issue is gone', async () => {
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'DEL',
      name: 'Removal Project',
    });
    const [installation] = await db
      .insert(linearInstallations)
      .values({ organizationId: 'linear-org-remove', workspaceId })
      .returning();
    const binding = await model.upsertBinding({
      defaultTeamId: 'linear-team-remove',
      installationId: installation.id,
      linearProjectId: 'linear-project-remove',
      projectId: project.id,
      teamIds: ['linear-team-remove'],
    });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'DEL-1',
        instruction: 'Keep local tombstone',
        name: 'Removed issue',
        projectId: project.id,
        seq: 1,
        visibility: 'public',
        workspaceId,
      })
      .returning();
    const issue = {
      id: 'linear-issue-removed',
      identifier: 'DEL-1',
      projectId: binding.linearProjectId,
      teamId: 'linear-team-remove',
      title: 'Removed issue',
      updatedAt: '2026-09-16T12:01:00.000Z',
    };
    const link = await model.createIssueLink({
      bindingId: binding.id,
      installationId: installation.id,
      linearIdentifier: issue.identifier,
      linearIssueId: issue.id,
      organizationId: installation.organizationId,
      remoteSnapshot: issue,
      taskId: task.id,
    });
    await model.captureDelivery({
      action: 'remove',
      deliveryId: 'signed-remove-delivery',
      eventType: 'Issue',
      installationId: installation.id,
      organizationId: installation.organizationId,
      payload: {
        action: 'remove',
        data: issue,
        organizationId: installation.organizationId,
        type: 'Issue',
      },
      subjectId: issue.id,
    });
    const provider = {
      getIssue: vi.fn(),
    };

    await expect(
      new LinearSyncWorker(db, workspaceId).processPending(provider as never, 20, installation.id),
    ).resolves.toMatchObject({ failed: 0, processed: 1 });

    const removed = await model.findIssueLinkByExternalId(issue.id);
    expect(removed).toMatchObject({
      id: link.id,
      lastInboundDeliveryId: expect.any(String),
      syncState: 'removed',
    });
    expect(provider.getIssue).not.toHaveBeenCalled();
  });

  it('does not let an older remote update roll a task back', async () => {
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'INB',
      name: 'Inbound Project',
    });
    const [installation] = await db
      .insert(linearInstallations)
      .values({
        installedByUserId: installerId,
        organizationId: 'linear-org-inbound',
        workspaceId,
      })
      .returning();
    const binding = await model.upsertBinding({
      defaultTeamId: 'linear-team-1',
      installationId: installation.id,
      linearProjectId: 'linear-project-inbound',
      projectId: project.id,
      teamIds: ['linear-team-1'],
    });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'INBOUND-1',
        instruction: 'Newest requirement',
        name: 'Newest title',
        projectId: project.id,
        seq: 1,
        workspaceId,
      })
      .returning();
    await model.createIssueLink({
      bindingId: binding.id,
      installationId: installation.id,
      linearIdentifier: 'ENG-1',
      linearIssueId: 'linear-issue-inbound',
      organizationId: installation.organizationId,
      remoteSnapshot: {
        id: 'linear-issue-inbound',
        identifier: 'ENG-1',
        projectId: binding.linearProjectId,
        title: 'Newest title',
        updatedAt: '2026-09-16T12:00:00.000Z',
      },
      taskId: task.id,
    });
    await model.captureDelivery({
      action: 'update',
      deliveryId: 'older-delivery',
      eventType: 'Issue',
      installationId: installation.id,
      organizationId: installation.organizationId,
      payload: { id: 'linear-issue-inbound' },
      subjectId: 'linear-issue-inbound',
    });
    const provider = {
      getIssue: vi.fn().mockResolvedValue({
        id: 'linear-issue-inbound',
        identifier: 'ENG-1',
        projectId: binding.linearProjectId,
        title: 'Older title',
        teamId: 'linear-team-1',
        updatedAt: '2026-09-16T11:59:59.000Z',
      }),
      listRelations: vi.fn().mockResolvedValue([]),
    };

    await expect(
      new LinearSyncWorker(db, workspaceId).processPending(provider as never, 20, installation.id),
    ).resolves.toMatchObject({ failed: 0, processed: 1 });

    const [unchanged] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(unchanged).toMatchObject({
      domainRevision: 1,
      instruction: 'Newest requirement',
      name: 'Newest title',
    });
    const link = await model.findIssueLinkByExternalId('linear-issue-inbound');
    expect(link?.lastConfirmedSnapshot).toMatchObject({ title: 'Newest title' });
    expect(link?.lastInboundDeliveryId).toBeTruthy();
  });

  it('C05 preserves human-locked fields and queues their local values back to Linear', async () => {
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'LCK',
      name: 'Locked Fields Project',
    });
    const [installation] = await db
      .insert(linearInstallations)
      .values({ organizationId: 'linear-org-locked', workspaceId })
      .returning();
    const agentId = 'linear-locked-agent';
    await db.insert(agents).values({ id: agentId, userId, workspaceId });
    const binding = await model.upsertBinding({
      defaultTeamId: 'linear-team-locked',
      installationId: installation.id,
      linearProjectId: 'linear-project-locked',
      projectId: project.id,
      settings: {
        assignmentMappings: [{ linearUserId: 'linear-assignee-local', orviloAgentId: agentId }],
        writeEnabled: true,
      },
      teamIds: ['linear-team-locked'],
    });
    const [task] = await db
      .insert(tasks)
      .values({
        assigneeAgentId: agentId,
        assigneeLocked: true,
        createdByUserId: userId,
        identifier: 'LCK-1',
        instruction: 'Locked requirement',
        name: 'Locked title',
        priority: 2,
        priorityLocked: true,
        projectId: project.id,
        requirementLocked: true,
        seq: 1,
        visibility: 'public',
        workspaceId,
      })
      .returning();
    const base = {
      assigneeId: 'linear-assignee-local',
      description: 'Locked requirement',
      id: 'linear-issue-locked',
      identifier: 'LCK-1',
      priority: 2,
      projectId: binding.linearProjectId,
      teamId: 'linear-team-locked',
      title: 'Locked title',
      updatedAt: '2026-09-16T12:00:00.000Z',
    };
    const link = await model.createIssueLink({
      bindingId: binding.id,
      installationId: installation.id,
      linearIdentifier: base.identifier,
      linearIssueId: base.id,
      organizationId: installation.organizationId,
      remoteSnapshot: base,
      taskId: task.id,
    });
    await model.captureDelivery({
      action: 'update',
      deliveryId: 'locked-fields-delivery',
      eventType: 'Issue',
      installationId: installation.id,
      organizationId: installation.organizationId,
      payload: { id: base.id },
      subjectId: base.id,
    });
    const provider = {
      getIssue: vi.fn().mockResolvedValue({
        ...base,
        assigneeId: null,
        description: 'Remote replacement requirement',
        priority: 4,
        title: 'Remote replacement title',
        updatedAt: '2026-09-16T12:01:00.000Z',
      }),
      listRelations: vi.fn().mockResolvedValue([]),
    };

    await expect(
      new LinearSyncWorker(db, workspaceId).processPending(provider as never, 20, installation.id),
    ).resolves.toMatchObject({ failed: 0, processed: 1 });

    await expect(db.select().from(tasks).where(eq(tasks.id, task.id))).resolves.toMatchObject([
      expect.objectContaining({
        assigneeAgentId: agentId,
        instruction: 'Locked requirement',
        name: 'Locked title',
        priority: 2,
      }),
    ]);
    const [outbox] = await db
      .select({ payload: linearSyncOutbox.payload })
      .from(linearSyncOutbox)
      .where(eq(linearSyncOutbox.linkId, link.id));
    expect(outbox.payload).toMatchObject({
      assigneeId: 'linear-assignee-local',
      description: 'Locked requirement',
      priority: 2,
      title: 'Locked title',
    });
    expect((await model.findIssueLinkByExternalId(base.id))?.syncState).toBe('pending');
  });

  it('keeps unknown remote labels in the baseline while exporting unrelated local changes', async () => {
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'LBL',
      name: 'Label Preservation Project',
    });
    const [installation] = await db
      .insert(linearInstallations)
      .values({ organizationId: 'linear-org-labels', workspaceId })
      .returning();
    const binding = await model.upsertBinding({
      defaultTeamId: 'linear-team-labels',
      installationId: installation.id,
      linearProjectId: 'linear-project-labels',
      projectId: project.id,
      teamIds: ['linear-team-labels'],
    });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'LBL-1',
        instruction: 'Local description',
        name: 'Local title',
        projectId: project.id,
        seq: 1,
        visibility: 'public',
        workspaceId,
      })
      .returning();
    const base = {
      description: 'Base description',
      id: 'linear-issue-labels',
      identifier: 'LBL-1',
      labelIds: ['remote-label-uuid'],
      projectId: binding.linearProjectId,
      teamId: 'linear-team-labels',
      title: 'Base title',
      updatedAt: '2026-09-16T12:00:00.000Z',
    };
    await model.createIssueLink({
      bindingId: binding.id,
      installationId: installation.id,
      linearIdentifier: base.identifier,
      linearIssueId: base.id,
      organizationId: installation.organizationId,
      remoteSnapshot: base,
      taskId: task.id,
    });
    await model.captureDelivery({
      action: 'update',
      deliveryId: 'label-preservation-delivery',
      eventType: 'Issue',
      installationId: installation.id,
      organizationId: installation.organizationId,
      payload: { id: base.id },
      subjectId: base.id,
    });
    const provider = {
      getIssue: vi.fn().mockResolvedValue({
        ...base,
        labelIds: ['new-remote-label-uuid'],
        updatedAt: '2026-09-16T12:01:00.000Z',
      }),
      listRelations: vi.fn().mockResolvedValue([]),
    };

    await expect(
      new LinearSyncWorker(db, workspaceId).processPending(provider as never, 20, installation.id),
    ).resolves.toMatchObject({ failed: 0, processed: 1 });

    const [outbox] = await db
      .select({ payload: linearSyncOutbox.payload })
      .from(linearSyncOutbox)
      .where(eq(linearSyncOutbox.linkId, (await model.findIssueLinkByExternalId(base.id))!.id));
    expect(outbox.payload).toMatchObject({
      description: 'Local description',
      title: 'Local title',
    });
    expect(outbox.payload).not.toHaveProperty('labelIds');
    expect((await model.findIssueLinkByExternalId(base.id))?.lastConfirmedSnapshot).toMatchObject({
      labelIds: ['new-remote-label-uuid'],
    });
  });

  it('imports with a service subject after the installer is deleted', async () => {
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'OWN',
      name: 'Installer Independent Project',
    });
    const [installation] = await db
      .insert(linearInstallations)
      .values({
        installedByUserId: installerId,
        organizationId: 'linear-org-installer',
        workspaceId,
      })
      .returning();
    const binding = await model.upsertBinding({
      defaultTeamId: 'linear-team-1',
      installationId: installation.id,
      linearProjectId: 'linear-project-installer',
      projectId: project.id,
      teamIds: ['linear-team-1'],
    });
    await db.delete(users).where(eq(users.id, installerId));

    await model.captureDelivery({
      action: 'create',
      deliveryId: 'installer-deleted-delivery',
      eventType: 'Issue',
      installationId: installation.id,
      organizationId: installation.organizationId,
      payload: { id: 'linear-issue-installer' },
      subjectId: 'linear-issue-installer',
    });
    const provider = {
      getIssue: vi.fn().mockResolvedValue({
        description: 'Imported without installer authority',
        id: 'linear-issue-installer',
        identifier: 'ENG-2',
        projectId: binding.linearProjectId,
        teamId: 'linear-team-1',
        title: 'Service-authored task',
      }),
      listRelations: vi.fn().mockResolvedValue([]),
    };

    await expect(
      new LinearSyncWorker(db, workspaceId).processPending(provider as never, 20, installation.id),
    ).resolves.toMatchObject({ failed: 0, imported: 1 });

    const [imported] = await db.select().from(tasks).where(eq(tasks.identifier, 'OWN-1'));
    expect(imported).toMatchObject({
      createdBySubjectId: `linear-installation:${installation.id}`,
      createdBySubjectKind: 'integration',
      createdByUserId: null,
      visibility: 'public',
    });
    const [storedInstallation] = await db
      .select({ installedByUserId: linearInstallations.installedByUserId })
      .from(linearInstallations)
      .where(eq(linearInstallations.id, installation.id));
    expect(storedInstallation.installedByUserId).toBeNull();
  });

  it('does not read or update a private task through the integration principal', async () => {
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'PRV',
      name: 'Private Boundary Project',
    });
    const [installation] = await db
      .insert(linearInstallations)
      .values({ organizationId: 'linear-org-private', workspaceId })
      .returning();
    const binding = await model.upsertBinding({
      defaultTeamId: 'linear-team-1',
      installationId: installation.id,
      linearProjectId: 'linear-project-private',
      projectId: project.id,
      teamIds: ['linear-team-1'],
    });
    const [privateTask] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'PRV-1',
        instruction: 'Private instruction must remain untouched',
        name: 'Private task',
        projectId: project.id,
        seq: 1,
        visibility: 'private',
        workspaceId,
      })
      .returning();
    await model.createIssueLink({
      bindingId: binding.id,
      installationId: installation.id,
      linearIdentifier: 'ENG-3',
      linearIssueId: 'linear-issue-private',
      organizationId: installation.organizationId,
      remoteSnapshot: {
        id: 'linear-issue-private',
        identifier: 'ENG-3',
        projectId: binding.linearProjectId,
        teamId: 'linear-team-1',
        title: 'Base title',
      },
      taskId: privateTask.id,
    });
    await model.captureDelivery({
      action: 'update',
      deliveryId: 'private-task-delivery',
      eventType: 'Issue',
      installationId: installation.id,
      organizationId: installation.organizationId,
      payload: { id: 'linear-issue-private' },
      subjectId: 'linear-issue-private',
    });
    const provider = {
      getIssue: vi.fn().mockResolvedValue({
        id: 'linear-issue-private',
        identifier: 'ENG-3',
        projectId: binding.linearProjectId,
        teamId: 'linear-team-1',
        title: 'Remote title must not enter private task',
      }),
      listRelations: vi.fn().mockResolvedValue([]),
    };

    await expect(
      new LinearSyncWorker(db, workspaceId).processPending(provider as never, 20, installation.id),
    ).resolves.toMatchObject({ failed: 0, processed: 1 });

    const [unchanged] = await db.select().from(tasks).where(eq(tasks.id, privateTask.id));
    expect(unchanged).toMatchObject({
      instruction: 'Private instruction must remain untouched',
      name: 'Private task',
      visibility: 'private',
    });
  });

  it('projects a mapped Linear state into workflow fields without changing execution status', async () => {
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'WFN',
      name: 'Workflow Project',
    });
    const [installation] = await db
      .insert(linearInstallations)
      .values({ organizationId: 'linear-org-workflow', workspaceId })
      .returning();
    const binding = await model.upsertBinding({
      defaultTeamId: 'linear-team-workflow',
      installationId: installation.id,
      linearProjectId: 'linear-project-workflow',
      projectId: project.id,
      settings: {
        statusMappings: [{ linearStateId: 'linear-state-done', workflowCategory: 'done' }],
      },
      teamIds: ['linear-team-workflow'],
    });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'WFN-1',
        instruction: 'Keep execution separate',
        name: 'Workflow task',
        projectId: project.id,
        seq: 1,
        status: 'running',
        visibility: 'public',
        workflowCategory: 'in_progress',
        workflowStateId: 'linear-state-todo',
        workspaceId,
      })
      .returning();
    await model.createIssueLink({
      bindingId: binding.id,
      installationId: installation.id,
      linearIdentifier: 'WFN-1',
      linearIssueId: 'linear-issue-workflow',
      organizationId: installation.organizationId,
      remoteSnapshot: {
        id: 'linear-issue-workflow',
        identifier: 'WFN-1',
        projectId: binding.linearProjectId,
        stateId: 'linear-state-todo',
        teamId: 'linear-team-workflow',
        title: 'Workflow task',
        updatedAt: '2026-09-16T12:00:00.000Z',
      },
      taskId: task.id,
    });
    await model.captureDelivery({
      action: 'update',
      deliveryId: 'workflow-delivery',
      eventType: 'Issue',
      installationId: installation.id,
      organizationId: installation.organizationId,
      payload: { id: 'linear-issue-workflow' },
      subjectId: 'linear-issue-workflow',
    });
    const provider = {
      getIssue: vi.fn().mockResolvedValue({
        id: 'linear-issue-workflow',
        identifier: 'WFN-1',
        projectId: binding.linearProjectId,
        stateId: 'linear-state-done',
        teamId: 'linear-team-workflow',
        title: 'Workflow task',
        updatedAt: '2026-09-16T12:01:00.000Z',
      }),
      listRelations: vi.fn().mockResolvedValue([]),
    };

    await expect(
      new LinearSyncWorker(db, workspaceId).processPending(provider as never, 20, installation.id),
    ).resolves.toMatchObject({ failed: 0, processed: 1 });

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updated).toMatchObject({
      status: 'running',
      workflowCategory: 'done',
      workflowStateId: 'linear-state-done',
    });
  });
});
