import { beforeEach, describe, expect, it, vi } from 'vitest';

import { issueRelationsWithParent, LinearSyncWorker, projectLinearRelation } from './worker';

const mocks = vi.hoisted(() => ({
  addComment: vi.fn(),
  capture: vi.fn(),
  claimInbox: vi.fn(),
  deleteComment: vi.fn(),
  findExternalCommentByRemoteId: vi.fn(),
  findExternalRelationByRemoteId: vi.fn(),
  findCommentById: vi.fn(),
  getDependencies: vi.fn(),
  getDependents: vi.fn(),
  findBindingById: vi.fn(),
  findInstallationById: vi.fn(),
  findIssueLinkByExternalId: vi.fn(),
  findIssueLinkById: vi.fn(),
  removeDependency: vi.fn(),
  taskUpdate: vi.fn(),
  transaction: vi.fn(),
  updateInbox: vi.fn(),
  upsertExternalComment: vi.fn(),
  upsertExternalRelation: vi.fn(),
  updateComment: vi.fn(),
}));

vi.mock('@/database/models/linearSync', () => ({
  LINEAR_SYNC_DEFAULT_LEASE_MS: 60_000,
  LINEAR_SYNC_MAX_ATTEMPTS: 5,
  LinearSyncModel: class {
    claimInbox = mocks.claimInbox;
    findExternalCommentByRemoteId = mocks.findExternalCommentByRemoteId;
    findExternalRelationByRemoteId = mocks.findExternalRelationByRemoteId;
    findCommentById = mocks.findCommentById;
    findBindingById = mocks.findBindingById;
    findInstallationById = mocks.findInstallationById;
    findIssueLinkByExternalId = mocks.findIssueLinkByExternalId;
    findIssueLinkById = mocks.findIssueLinkById;
    upsertExternalRelation = mocks.upsertExternalRelation;
    transaction = mocks.transaction;
    updateInbox = mocks.updateInbox;
    upsertExternalComment = mocks.upsertExternalComment;
  },
  linearBindingReadEnabled: vi.fn(() => true),
  linearBindingWriteEnabled: vi.fn(() => true),
  linearSyncRetryDelayMs: vi.fn(() => 1_000),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: class {
    addComment = mocks.addComment;
    deleteComment = mocks.deleteComment;
    findCommentById = mocks.findCommentById;
    getDependencies = mocks.getDependencies;
    getDependents = mocks.getDependents;
    removeDependency = mocks.removeDependency;
    update = mocks.taskUpdate;
    updateComment = mocks.updateComment;
  },
}));
vi.mock('@/database/schemas/task', () => ({ tasks: { id: 'id', workspaceId: 'workspaceId' } }));
vi.mock('@/server/services/task', () => ({ TaskService: class {} }));

const integrationTasks = () => ({
  addPublicDependency: mocks.capture,
  getPublicDependencies: mocks.getDependencies,
  getPublicDependents: mocks.getDependents,
  removePublicDependency: mocks.removeDependency,
  updatePublicTask: mocks.taskUpdate,
});

describe('LinearSyncWorker Comment replay', () => {
  beforeEach(() => {
    mocks.claimInbox.mockReset().mockResolvedValue([
      {
        attempts: 1,
        eventType: 'Comment',
        id: 'inbox-comment-1',
        installationId: 'installation-1',
        leaseFence: 1,
        leaseOwner: 'worker-1',
        subjectId: 'comment-1',
      },
    ]);
    mocks.findExternalCommentByRemoteId.mockReset().mockResolvedValue(null);
    mocks.findExternalRelationByRemoteId.mockReset().mockResolvedValue(null);
    mocks.findBindingById.mockReset().mockResolvedValue({ syncEnabled: true });
    mocks.findInstallationById.mockReset().mockResolvedValue({
      id: 'installation-1',
      installedByUserId: 'user-1',
      status: 'active',
    });
    mocks.findIssueLinkByExternalId.mockReset().mockResolvedValue({
      bindingId: 'binding-1',
      id: 'link-1',
      linearIssueId: 'issue-1',
      taskId: 'task-1',
    });
    mocks.findIssueLinkById.mockReset().mockResolvedValue({
      bindingId: 'binding-1',
      id: 'link-1',
    });
    mocks.addComment.mockReset().mockResolvedValue({ id: 'local-comment-1' });
    mocks.findCommentById.mockReset().mockResolvedValue(undefined);
    mocks.deleteComment.mockReset().mockResolvedValue(true);
    mocks.upsertExternalComment.mockReset().mockResolvedValue({ id: 'mapping-1' });
    mocks.upsertExternalRelation.mockReset().mockResolvedValue({ id: 'relation-mapping-1' });
    mocks.removeDependency.mockReset();
    mocks.getDependencies.mockReset().mockResolvedValue([]);
    mocks.getDependents.mockReset().mockResolvedValue([]);
    mocks.taskUpdate.mockReset();
    mocks.updateComment.mockReset();
    mocks.updateInbox.mockReset().mockResolvedValue({ id: 'inbox-comment-1' });
    mocks.transaction.mockImplementation(
      async (callback: (model: unknown, db: unknown) => unknown) =>
        callback(
          new (class {
            findExternalCommentByRemoteId = mocks.findExternalCommentByRemoteId;
            findBindingById = mocks.findBindingById;
            findInstallationById = mocks.findInstallationById;
            findIssueLinkByExternalId = mocks.findIssueLinkByExternalId;
            findIssueLinkById = mocks.findIssueLinkById;
            findExternalRelationByRemoteId = mocks.findExternalRelationByRemoteId;
            upsertExternalComment = mocks.upsertExternalComment;
            upsertExternalRelation = mocks.upsertExternalRelation;
          })(),
          {},
        ),
    );
  });

  it('replays a captured comment into one local comment mapping', async () => {
    const provider = {
      getComment: vi.fn().mockResolvedValue({
        body: 'A remote comment',
        id: 'comment-1',
        issueId: 'issue-1',
      }),
    };

    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processPending(provider as never),
    ).resolves.toMatchObject({ failed: 0, processed: 1 });
    expect(provider.getComment).toHaveBeenCalledWith('comment-1');
    expect(mocks.addComment).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'A remote comment', taskId: 'task-1' }),
      expect.objectContaining({ source: 'linear', suppressLinearOutbox: true }),
    );
    expect(mocks.upsertExternalComment).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmationState: 'confirmed',
        linearCommentId: 'comment-1',
        localCommentId: 'local-comment-1',
        source: 'linear',
      }),
    );
  });

  it('leaves a comment delivery retryable until its issue link exists', async () => {
    mocks.findIssueLinkByExternalId.mockResolvedValue(null);
    const provider = {
      getComment: vi
        .fn()
        .mockResolvedValue({ body: 'Waiting', id: 'comment-1', issueId: 'issue-1' }),
    };

    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processPending(provider as never),
    ).resolves.toMatchObject({ failed: 0, pendingBinding: 1, processed: 0 });
    expect(mocks.addComment).not.toHaveBeenCalled();
    expect(mocks.updateInbox).toHaveBeenCalledWith(
      'inbox-comment-1',
      expect.objectContaining({ processedAt: null, status: 'pending_binding' }),
      expect.anything(),
    );
  });

  it('maps an outbound comment echo by its preallocated remote UUID without a new domain event', async () => {
    mocks.findExternalCommentByRemoteId.mockResolvedValue({
      confirmationState: 'unconfirmed',
      id: 'mapping-1',
      issueLinkId: 'link-1',
      lastOutboundOperationId: 'outbox-comment-1',
      linearCommentId: 'comment-1',
      linearIssueId: 'issue-1',
      localCommentId: 'local-comment-1',
      origin: 'orvilo',
    });
    mocks.findCommentById.mockResolvedValue({
      content: 'A remote comment',
      id: 'local-comment-1',
    });
    const provider = {
      getComment: vi.fn().mockResolvedValue({
        body: 'A remote comment',
        id: 'comment-1',
        issueId: 'issue-1',
      }),
    };

    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processPending(provider as never),
    ).resolves.toMatchObject({ failed: 0, processed: 1 });
    expect(mocks.addComment).not.toHaveBeenCalled();
    expect(mocks.updateComment).not.toHaveBeenCalled();
    expect(mocks.upsertExternalComment).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmationState: 'confirmed',
        id: 'mapping-1',
        linearCommentId: 'comment-1',
        localCommentId: 'local-comment-1',
      }),
    );
  });

  it('tombstones a remove webhook from its signed delivery without refetching the comment', async () => {
    const mapping = {
      confirmationState: 'confirmed',
      id: 'mapping-1',
      issueLinkId: 'link-1',
      lastConfirmedSnapshot: { body: 'Gone', id: 'comment-1', issueId: 'issue-1' },
      linearCommentId: 'comment-1',
      linearIssueId: 'issue-1',
      localCommentId: 'local-comment-1',
      remoteSnapshot: { body: 'Gone', id: 'comment-1', issueId: 'issue-1' },
    };
    mocks.claimInbox.mockResolvedValueOnce([
      {
        attempts: 1,
        action: 'remove',
        eventType: 'Comment',
        id: 'inbox-comment-remove-1',
        installationId: 'installation-1',
        leaseFence: 1,
        leaseOwner: 'worker-1',
        subjectId: 'comment-1',
      },
    ]);
    mocks.findExternalCommentByRemoteId.mockResolvedValueOnce(mapping).mockResolvedValueOnce({
      ...mapping,
      confirmationState: 'tombstoned',
    });
    const provider = { getComment: vi.fn() };

    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processPending(provider as never),
    ).resolves.toMatchObject({ failed: 0, processed: 1 });
    expect(provider.getComment).not.toHaveBeenCalled();
    expect(mocks.deleteComment).toHaveBeenCalledWith(
      'local-comment-1',
      expect.objectContaining({ source: 'linear', suppressLinearOutbox: true }),
    );
    expect(mocks.upsertExternalComment).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmationState: 'tombstoned',
        id: 'mapping-1',
        tombstone: expect.objectContaining({ kind: 'deleted' }),
      }),
    );

    mocks.claimInbox.mockResolvedValueOnce([
      {
        attempts: 2,
        action: 'remove',
        eventType: 'Comment',
        id: 'inbox-comment-remove-2',
        installationId: 'installation-1',
        leaseFence: 2,
        leaseOwner: 'worker-1',
        subjectId: 'comment-1',
      },
    ]);
    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processPending(provider as never),
    ).resolves.toMatchObject({ failed: 0, processed: 1 });
    expect(mocks.deleteComment).toHaveBeenCalledTimes(1);
  });

  it('keeps a forbidden comment local while a confirmed 404 deletes it', async () => {
    const worker = new LinearSyncWorker({} as never, 'workspace-1');
    mocks.findExternalCommentByRemoteId.mockResolvedValue({
      id: 'mapping-1',
      issueLinkId: 'link-1',
      lastConfirmedSnapshot: { body: 'Keep this', id: 'comment-1', issueId: 'issue-1' },
      linearCommentId: 'comment-1',
      linearIssueId: 'issue-1',
      localCommentId: 'local-comment-1',
      remoteSnapshot: { body: 'Keep this', id: 'comment-1', issueId: 'issue-1' },
    });

    const { LinearRemoteResourceError } = await import('./provider');
    await (worker as any).handleRemoteTombstone(
      {
        eventType: 'Comment',
        id: 'delivery-403',
        installationId: 'installation-1',
        subjectId: 'comment-1',
      },
      new LinearRemoteResourceError('comment', 'forbidden', 'comment-1'),
    );
    expect(mocks.deleteComment).not.toHaveBeenCalled();
    expect(mocks.upsertExternalComment).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmationState: 'unresolved',
        tombstone: expect.objectContaining({ kind: 'forbidden' }),
      }),
    );

    await (worker as any).handleRemoteTombstone(
      {
        eventType: 'Comment',
        id: 'delivery-404',
        installationId: 'installation-1',
        subjectId: 'comment-1',
      },
      new LinearRemoteResourceError('comment', 'not_found', 'comment-1'),
    );
    expect(mocks.deleteComment).toHaveBeenCalledWith(
      'local-comment-1',
      expect.objectContaining({ source: 'linear' }),
    );
    expect(mocks.upsertExternalComment).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmationState: 'tombstoned',
        tombstone: expect.objectContaining({ kind: 'deleted' }),
      }),
    );
  });

  it('tombstones a relation remove webhook from its signed delivery without refetching it', async () => {
    mocks.claimInbox.mockResolvedValueOnce([
      {
        attempts: 1,
        action: 'remove',
        eventType: 'IssueRelation',
        id: 'inbox-relation-remove-1',
        installationId: 'installation-1',
        leaseFence: 1,
        leaseOwner: 'worker-1',
        subjectId: 'relation-1',
      },
    ]);
    mocks.findExternalRelationByRemoteId.mockResolvedValue({
      confirmationState: 'confirmed',
      id: 'relation-mapping-1',
      kind: 'blocks',
      lastConfirmedSnapshot: {
        id: 'relation-1',
        kind: 'blocks',
        sourceIssueId: 'issue-a',
        targetIssueId: 'issue-b',
      },
      linearRelationId: 'relation-1',
      localRelationKey: 'blocks:task-a:task-b',
      localSourceTaskId: 'task-a',
      localTargetTaskId: 'task-b',
      resolutionState: 'resolved',
      remoteSnapshot: {
        id: 'relation-1',
        kind: 'blocks',
        sourceIssueId: 'issue-a',
        targetIssueId: 'issue-b',
      },
    });
    const provider = { getRelation: vi.fn() };

    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processPending(provider as never),
    ).resolves.toMatchObject({ failed: 0, processed: 1 });
    expect(provider.getRelation).not.toHaveBeenCalled();
    expect(mocks.removeDependency).toHaveBeenCalledWith(
      'task-b',
      'task-a',
      expect.objectContaining({ source: 'linear', suppressLinearOutbox: true }),
    );
    expect(mocks.upsertExternalRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmationState: 'tombstoned',
        resolutionState: 'resolved',
        tombstone: expect.objectContaining({ kind: 'deleted' }),
      }),
    );
  });

  it('projects relation direction and keeps cross-project parents unresolved', () => {
    expect(
      projectLinearRelation({
        kind: 'blocks',
        sameProject: true,
        sourceTaskId: 'blocker-a',
        targetTaskId: 'blocked-b',
      }),
    ).toMatchObject({
      dependency: { dependsOnTaskId: 'blocker-a', taskId: 'blocked-b', type: 'blocks' },
      resolutionState: 'resolved',
    });
    expect(
      projectLinearRelation({
        kind: 'relates',
        sameProject: true,
        sourceTaskId: 'task-a',
        targetTaskId: 'task-b',
      }),
    ).toMatchObject({
      dependency: { dependsOnTaskId: 'task-b', taskId: 'task-a', type: 'relates' },
    });
    expect(
      projectLinearRelation({
        kind: 'parent',
        sameProject: false,
        sourceTaskId: 'child',
        targetTaskId: 'parent',
      }),
    ).toEqual({ dependency: null, parentTaskId: null, resolutionState: 'unresolved' });
  });

  it('synthesizes the Issue.parentId relation and clears a removed parent', () => {
    const parent = issueRelationsWithParent(
      {
        id: 'issue-child',
        identifier: 'ENG-1',
        parentId: 'issue-parent',
        title: 'Child',
      },
      [],
    );
    expect(parent).toEqual([
      {
        id: 'parent:issue-child',
        kind: 'parent',
        sourceIssueId: 'issue-child',
        targetIssueId: 'issue-parent',
      },
    ]);
    expect(
      issueRelationsWithParent(
        { id: 'issue-child', identifier: 'ENG-1', parentId: null, title: 'Child' },
        parent,
      ),
    ).toEqual([]);
  });

  it('does not tombstone unrelated relations of the opposite endpoint', async () => {
    const worker = new LinearSyncWorker({} as never, 'workspace-1');
    const relation = {
      id: 'relation-a-b',
      kind: 'relates',
      sourceIssueId: 'issue-a',
      targetIssueId: 'issue-b',
    };
    const model = {
      listExternalRelationsForIssue: vi.fn().mockResolvedValue([]),
    };
    (worker as any).reconcileOneRelation = vi.fn().mockResolvedValue(undefined);
    (worker as any).tombstoneRelationMapping = vi.fn().mockResolvedValue(undefined);

    await (worker as any).reconcileRelationsForIssue(
      model,
      {},
      integrationTasks(),
      null,
      'task-a',
      'issue-a',
      [relation],
      'delivery-1',
    );

    expect(model.listExternalRelationsForIssue).toHaveBeenCalledTimes(1);
    expect(model.listExternalRelationsForIssue).toHaveBeenCalledWith('issue-a');
  });

  it('clears a cross-project dependency before applying a remote project move', async () => {
    const worker = new LinearSyncWorker({} as never, 'workspace-1');
    const relation = {
      id: 'relation-a-b',
      kind: 'blocks' as const,
      sourceIssueId: 'issue-a',
      targetIssueId: 'issue-b',
    };
    const model = {
      findExternalRelationByRemoteId: vi.fn().mockResolvedValue({
        id: 'mapping-1',
        kind: 'blocks',
        localRelationKey: 'blocks:task-a:task-b',
        localSourceTaskId: 'task-a',
        localTargetTaskId: 'task-b',
        resolutionState: 'resolved',
      }),
      findIssueLinkByExternalId: vi.fn((issueId: string) =>
        Promise.resolve(
          issueId === 'issue-a'
            ? { id: 'link-a', taskId: 'task-a' }
            : { id: 'link-b', taskId: 'task-b' },
        ),
      ),
      upsertExternalRelation: mocks.upsertExternalRelation,
    };
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [{ projectId: 'old-project' }] }),
        }),
      }),
    };

    await (worker as any).reconcileOneRelation(
      model,
      db,
      integrationTasks(),
      relation,
      'delivery-move-1',
      false,
      { projectId: 'new-project', taskId: 'task-a' },
    );

    expect(mocks.removeDependency).toHaveBeenCalledWith(
      'task-b',
      'task-a',
      expect.objectContaining({ source: 'linear', suppressLinearOutbox: true }),
    );
    expect(mocks.upsertExternalRelation).toHaveBeenCalledWith(
      expect.objectContaining({ resolutionState: 'unresolved', source: 'linear' }),
    );
  });

  it('clears every pre-existing cross-project edge with a distinct mutation key', async () => {
    mocks.getDependencies.mockResolvedValue([{ dependsOnId: 'task-b' }]);
    mocks.getDependents.mockResolvedValue([{ taskId: 'task-c' }]);
    const db = { select: vi.fn() };
    // The helper only needs the project lookup result; keep the fake query
    // chain small while returning all three old-project endpoints.
    db.select.mockImplementation(() => {
      const queryNumber = db.select.mock.calls.length;
      return {
        from: () => ({
          where: () =>
            queryNumber === 1
              ? { limit: async () => [{ id: 'task-parent', projectId: 'old-project' }] }
              : Promise.resolve([
                  { id: 'task-parent', projectId: 'old-project' },
                  { id: 'task-b', projectId: 'old-project' },
                  { id: 'task-c', projectId: 'old-project' },
                ]),
        }),
      };
    });
    const worker = new LinearSyncWorker({} as never, 'workspace-1');

    await (worker as any).clearCrossProjectEdgesBeforeMove(
      db,
      integrationTasks(),
      { id: 'task-a', parentTaskId: 'task-parent' },
      'new-project',
      'delivery-move-edges',
      false,
    );

    expect(mocks.taskUpdate).toHaveBeenCalledWith(
      'task-a',
      { parentTaskId: null },
      expect.objectContaining({
        idempotencyKey: 'linear:project-move:delivery-move-edges:parent:task-a:task-parent',
      }),
    );
    expect(mocks.removeDependency).toHaveBeenCalledTimes(2);
    expect(
      new Set(mocks.removeDependency.mock.calls.map(([, , mutation]) => mutation.idempotencyKey)),
    ).toEqual(
      new Set([
        'linear:project-move:delivery-move-edges:dependency:task-a:task-b',
        'linear:project-move:delivery-move-edges:dependency:task-c:task-a',
      ]),
    );
  });
});
