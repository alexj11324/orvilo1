// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  linearInstallations,
  linearIssueLinks,
  linearProjectBindings,
  linearSyncInbox,
  linearSyncOutbox,
  taskDomainEvents,
  taskPlanningRevisions,
  taskPlanningScopes,
  tasks,
  users,
  workspaces,
} from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { LinearSyncModel } from '../linearSync';
import { ProjectModel } from '../project';

const db: LobeChatDatabase = await getTestDB();
const userId = 'linear-sync-model-user';
const workspaceId = 'linear-sync-model-workspace';
const installationId = '00000000-0000-4000-8000-000000000001';

const cleanup = async () => {
  await db.delete(linearSyncOutbox);
  await db.delete(linearSyncInbox);
  await db.delete(taskPlanningRevisions);
  await db.delete(taskPlanningScopes);
  await db.delete(taskDomainEvents);
  await db.delete(linearProjectBindings);
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
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
    const [first] = await model.claimInbox(1, 60_000, installationId, 'worker-a');
    expect(first).toMatchObject({ attempts: 1, leaseFence: 1, status: 'processing' });

    await db
      .update(linearSyncInbox)
      .set({ lockedUntil: new Date(0) })
      .where(eq(linearSyncInbox.id, captured.row!.id));
    const [reclaimed] = await model.claimInbox(1, 60_000, installationId, 'worker-b');
    expect(reclaimed).toMatchObject({ attempts: 2, leaseFence: 2, leaseOwner: 'worker-b' });

    await expect(
      model.updateInbox(
        first.id,
        { lockedUntil: null, processedAt: new Date(), status: 'processed' },
        { fence: first.leaseFence, owner: 'worker-a' },
      ),
    ).resolves.toBeNull();
    await expect(
      model.updateInbox(
        reclaimed.id,
        { availableAt: new Date(0), lockedUntil: null, status: 'failed' },
        { fence: reclaimed.leaseFence, owner: 'worker-b' },
      ),
    ).resolves.toMatchObject({ status: 'failed' });

    const [retry] = await model.claimInbox(1, 60_000, installationId, 'worker-c');
    expect(retry).toMatchObject({ attempts: 3, leaseFence: 3, status: 'processing' });
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

    const claimed = await model.claimOutbox(2, 60_000, installationId, 'worker-new');
    expect(claimed).toHaveLength(2);
    expect(claimed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ leaseFence: 2, leaseOwner: 'worker-new', status: 'sending' }),
        expect.objectContaining({ leaseFence: 4, leaseOwner: 'worker-new', status: 'sending' }),
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
    const [claimed] = await model.claimOutbox(1, 60_000, installationId, 'worker-v12');
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
      { fence: claimed.leaseFence, owner: 'worker-v12' },
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
});
