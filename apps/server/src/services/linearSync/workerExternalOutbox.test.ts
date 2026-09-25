import { describe, expect, it, vi } from 'vitest';

import { LinearSyncWorker } from './worker';

const mocks = vi.hoisted(() => ({
  claimOutbox: vi.fn(),
  findBindingById: vi.fn(),
  findExternalCommentById: vi.fn(),
  findExternalRelationById: vi.fn(),
  findInstallationById: vi.fn(),
  findIssueLinkById: vi.fn(),
  findIssueLinkByTaskId: vi.fn(),
  findPublicTask: vi.fn(),
  hasCurrentOutboxLease: vi.fn(),
  settleExternalCommentOutbox: vi.fn(),
  settleExternalRelationOutbox: vi.fn(),
  updateOutbox: vi.fn(),
}));

vi.mock('@/database/models/linearSync', () => ({
  LINEAR_SYNC_DEFAULT_LEASE_MS: 60_000,
  LINEAR_SYNC_MAX_ATTEMPTS: 5,
  LinearSyncModel: class {
    claimOutbox = mocks.claimOutbox;
    findBindingById = mocks.findBindingById;
    findExternalCommentById = mocks.findExternalCommentById;
    findExternalRelationById = mocks.findExternalRelationById;
    findInstallationById = mocks.findInstallationById;
    findIssueLinkById = mocks.findIssueLinkById;
    findIssueLinkByTaskId = mocks.findIssueLinkByTaskId;
    hasCurrentOutboxLease = mocks.hasCurrentOutboxLease;
    settleExternalCommentOutbox = mocks.settleExternalCommentOutbox;
    settleExternalRelationOutbox = mocks.settleExternalRelationOutbox;
    updateOutbox = mocks.updateOutbox;
  },
  linearBindingReadEnabled: vi.fn(() => true),
  linearBindingWriteEnabled: vi.fn(() => true),
  linearSyncRetryDelayMs: vi.fn(() => 1_000),
}));
vi.mock('@/database/models/task', () => ({ TaskModel: class {} }));
vi.mock('@/database/schemas/task', () => ({ tasks: { id: 'id' } }));
vi.mock('./integrationTask', () => ({
  LinearIntegrationTaskService: class {
    findPublicTask = mocks.findPublicTask;
    validateIssueScope = vi.fn(async () => true);
  },
}));

const configureScope = () => {
  mocks.findBindingById.mockReset().mockResolvedValue({
    id: 'binding-1',
    installationId: 'installation-1',
    linearProjectId: 'linear-project-1',
    projectId: 'project-1',
    teamIds: ['team-1'],
  });
  mocks.findInstallationById.mockReset().mockResolvedValue({
    id: 'installation-1',
    organizationId: 'org-1',
    status: 'active',
  });
  mocks.findPublicTask.mockReset().mockResolvedValue({
    id: 'task-1',
    projectId: 'project-1',
    visibility: 'public',
  });
};

const remoteIssue = (id: string) => ({
  id,
  identifier: id,
  projectId: 'linear-project-1',
  teamId: 'team-1',
  title: id,
});

const commentRow = (attempts = 1) => ({
  attempts,
  id: 'outbox-comment-1',
  installationId: 'installation-1',
  leaseFence: attempts,
  leaseOwner: 'worker-1',
  linkId: 'link-1',
  operation: 'linear-comment:create:local-comment-1',
  payload: {
    action: 'create',
    body: 'A durable comment',
    commentId: 'local-comment-1',
    kind: 'comment',
    mappingId: 'mapping-1',
    remoteCommentId: '550e8400-e29b-41d4-a716-446655440001',
  },
  taskId: 'task-1',
});

const relationRow = (attempts = 1) => ({
  attempts,
  id: 'outbox-relation-1',
  installationId: 'installation-1',
  leaseFence: attempts,
  leaseOwner: 'worker-1',
  linkId: 'link-1',
  operation: 'linear-relation:upsert:blocks:task-1:task-2',
  payload: {
    action: 'upsert',
    kind: 'relation',
    mappingId: 'mapping-relation-1',
    relation: {
      kind: 'blocks',
      localRelationKey: 'blocks:task-1:task-2',
      sourceTaskId: 'task-1',
      targetTaskId: 'task-2',
    },
    remoteRelationId: '550e8400-e29b-41d4-a716-446655440002',
  },
  taskId: 'task-1',
});

const relationRemovalRow = () => ({
  ...relationRow(),
  linkId: 'link-task-linked',
  operation: 'linear-relation:remove:relates:task-linked:task-unlinked',
  payload: {
    action: 'remove',
    kind: 'relation',
    mappingId: 'mapping-relation-1',
    relation: {
      kind: 'relates',
      localRelationKey: 'relates:task-linked:task-unlinked',
      sourceTaskId: 'task-unlinked',
      targetTaskId: 'task-linked',
    },
    remoteRelationId: '550e8400-e29b-41d4-a716-446655440002',
  },
  taskId: 'task-linked',
});

describe('LinearSyncWorker external create recovery', () => {
  it('reuses a preallocated comment UUID after a lost create response', async () => {
    configureScope();
    mocks.claimOutbox.mockReset().mockResolvedValueOnce([commentRow()]);
    mocks.findExternalCommentById.mockReset().mockResolvedValue({
      id: 'mapping-1',
      issueLinkId: 'link-1',
      linearCommentId: '550e8400-e29b-41d4-a716-446655440001',
    });
    mocks.findIssueLinkById.mockReset().mockResolvedValue({
      bindingId: 'binding-1',
      id: 'link-1',
      installationId: 'installation-1',
      linearIssueId: 'issue-1',
      organizationId: 'org-1',
      taskId: 'task-1',
    });
    mocks.hasCurrentOutboxLease.mockReset().mockResolvedValue(true);
    mocks.settleExternalCommentOutbox.mockReset().mockResolvedValue({ mapping: {}, outbox: {} });
    mocks.updateOutbox.mockReset().mockResolvedValue({ id: 'outbox-comment-1' });

    const provider = {
      createComment: vi.fn().mockRejectedValue(new Error('response lost')),
      findCommentById: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        body: 'A durable comment',
        id: '550e8400-e29b-41d4-a716-446655440001',
        issueId: 'issue-1',
      }),
      getIssue: vi.fn().mockResolvedValue(remoteIssue('issue-1')),
    };
    const worker = new LinearSyncWorker({} as never, 'workspace-1');

    await expect(worker.processOutbox(provider as never)).resolves.toEqual({ failed: 1, sent: 0 });
    mocks.claimOutbox.mockResolvedValueOnce([commentRow(2)]);
    await expect(worker.processOutbox(provider as never)).resolves.toEqual({ failed: 0, sent: 1 });

    expect(provider.findCommentById).toHaveBeenNthCalledWith(
      2,
      '550e8400-e29b-41d4-a716-446655440001',
    );
    expect(provider.createComment).toHaveBeenCalledTimes(1);
    expect(provider.createComment).toHaveBeenCalledWith({
      body: 'A durable comment',
      id: '550e8400-e29b-41d4-a716-446655440001',
      issueId: 'issue-1',
    });
  });

  it('reuses a preallocated relation UUID after a lost create response', async () => {
    configureScope();
    mocks.claimOutbox.mockReset().mockResolvedValueOnce([relationRow()]);
    mocks.findExternalRelationById.mockReset().mockResolvedValue({
      id: 'mapping-relation-1',
      issueLinkId: 'link-1',
      linearRelationId: '550e8400-e29b-41d4-a716-446655440002',
    });
    mocks.findIssueLinkByTaskId.mockReset().mockImplementation(async (taskId: string) => ({
      bindingId: 'binding-1',
      id: `link-${taskId}`,
      installationId: 'installation-1',
      linearIssueId: `issue-${taskId}`,
      organizationId: 'org-1',
      taskId,
    }));
    mocks.hasCurrentOutboxLease.mockReset().mockResolvedValue(true);
    mocks.settleExternalRelationOutbox.mockReset().mockResolvedValue({ mapping: {}, outbox: {} });
    mocks.updateOutbox.mockReset().mockResolvedValue({ id: 'outbox-relation-1' });

    const provider = {
      createRelation: vi.fn().mockRejectedValue(new Error('response lost')),
      findRelationById: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: '550e8400-e29b-41d4-a716-446655440002',
        kind: 'blocks',
        sourceIssueId: 'issue-task-1',
        targetIssueId: 'issue-task-2',
      }),
      getIssue: vi.fn(async (id: string) => remoteIssue(id)),
    };
    const worker = new LinearSyncWorker({} as never, 'workspace-1');

    await expect(worker.processOutbox(provider as never)).resolves.toEqual({ failed: 1, sent: 0 });
    mocks.claimOutbox.mockResolvedValueOnce([relationRow(2)]);
    await expect(worker.processOutbox(provider as never)).resolves.toEqual({ failed: 0, sent: 1 });

    expect(provider.findRelationById).toHaveBeenNthCalledWith(
      2,
      '550e8400-e29b-41d4-a716-446655440002',
    );
    expect(provider.createRelation).toHaveBeenCalledTimes(1);
    expect(provider.createRelation).toHaveBeenCalledWith({
      id: '550e8400-e29b-41d4-a716-446655440002',
      kind: 'blocks',
      sourceIssueId: 'issue-task-1',
      targetIssueId: 'issue-task-2',
    });
  });

  it('does not mutate a comment after its lease fence is lost', async () => {
    configureScope();
    mocks.claimOutbox.mockReset().mockResolvedValueOnce([commentRow()]);
    mocks.findExternalCommentById.mockReset().mockResolvedValue({
      id: 'mapping-1',
      issueLinkId: 'link-1',
      linearCommentId: '550e8400-e29b-41d4-a716-446655440001',
    });
    mocks.findIssueLinkById.mockReset().mockResolvedValue({
      bindingId: 'binding-1',
      id: 'link-1',
      installationId: 'installation-1',
      linearIssueId: 'issue-1',
      organizationId: 'org-1',
      taskId: 'task-1',
    });
    mocks.hasCurrentOutboxLease.mockReset().mockResolvedValue(false);
    const provider = {
      createComment: vi.fn(),
      findCommentById: vi.fn().mockResolvedValue(null),
      getIssue: vi.fn().mockResolvedValue(remoteIssue('issue-1')),
    };

    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processOutbox(provider as never),
    ).resolves.toEqual({ failed: 0, sent: 0 });
    expect(provider.createComment).not.toHaveBeenCalled();
  });

  it('settles a related removal through its durable anchor after a peer loses its link', async () => {
    configureScope();
    mocks.claimOutbox.mockReset().mockResolvedValueOnce([relationRemovalRow()]);
    mocks.findExternalRelationById.mockReset().mockResolvedValue({
      id: 'mapping-relation-1',
      issueLinkId: 'link-task-linked',
      linearRelationId: '550e8400-e29b-41d4-a716-446655440002',
    });
    mocks.findIssueLinkByTaskId.mockReset().mockImplementation(async (taskId: string) =>
      taskId === 'task-linked'
        ? {
            bindingId: 'binding-1',
            id: 'link-task-linked',
            installationId: 'installation-1',
            linearIssueId: 'issue-task-linked',
            organizationId: 'org-1',
            taskId,
          }
        : null,
    );
    mocks.findIssueLinkById.mockReset().mockResolvedValue({
      bindingId: 'binding-1',
      id: 'link-task-linked',
      installationId: 'installation-1',
      linearIssueId: 'issue-task-linked',
      organizationId: 'org-1',
      taskId: 'task-linked',
    });
    mocks.hasCurrentOutboxLease.mockReset().mockResolvedValue(true);
    mocks.settleExternalRelationOutbox.mockReset().mockResolvedValue({
      mapping: {},
      outbox: {},
    });
    mocks.updateOutbox.mockReset().mockResolvedValue({ id: 'outbox-relation-1' });
    const provider = {
      deleteRelation: vi.fn().mockResolvedValue(undefined),
      getIssue: vi.fn().mockResolvedValue(remoteIssue('issue-task-linked')),
    };

    await expect(
      new LinearSyncWorker({} as never, 'workspace-1').processOutbox(provider as never),
    ).resolves.toEqual({ failed: 0, sent: 1 });
    expect(mocks.findIssueLinkById).toHaveBeenCalledWith('link-task-linked');
    expect(mocks.findIssueLinkByTaskId).not.toHaveBeenCalled();
    expect(provider.deleteRelation).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440002');
    expect(mocks.settleExternalRelationOutbox).toHaveBeenCalledWith(
      'outbox-relation-1',
      expect.objectContaining({ fence: 1 }),
      expect.objectContaining({
        mappingId: 'mapping-relation-1',
        tombstone: expect.objectContaining({ kind: 'deleted' }),
      }),
    );
  });
});
