// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { LinearSyncModel } from '@/database/models/linearSync';
import { ProjectModel } from '@/database/models/project';
import { tasks, users, workspaces } from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';

import { LinearSyncWorker } from './worker';

const db: LobeChatDatabase = await getTestDB();
const userId = 'linear-inbound-user';
const workspaceId = 'linear-inbound-workspace';

const cleanup = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values({ id: userId });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Linear Inbound Workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
});

afterEach(cleanup);

describe('LinearSyncWorker inbound ordering', () => {
  it('does not let an older remote update roll a task back', async () => {
    const model = new LinearSyncModel(db, workspaceId);
    const project = await new ProjectModel(db, userId, workspaceId).create({
      identifier: 'INB',
      name: 'Inbound Project',
    });
    const installation = await model.upsertInstallation({
      installedByUserId: userId,
      organizationId: 'linear-org-inbound',
    });
    const binding = await model.upsertBinding({
      defaultTeamId: 'linear-team-1',
      installationId: installation.id,
      linearProjectId: 'linear-project-inbound',
      projectId: project.id,
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
        updatedAt: '2026-09-16T11:59:59.000Z',
      }),
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
});
