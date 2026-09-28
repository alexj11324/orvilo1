// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  model: {
    lockBindingByLinearProjectId: vi.fn(),
    lockBindingByProjectId: vi.fn(),
    lockIssueConflictContext: vi.fn(),
    replaceIssueConflictOutbox: vi.fn(),
    updateIssueLink: vi.fn(),
  },
  updatePublicTask: vi.fn(),
}));

vi.mock('@/database/models/linearSync', () => ({
  LinearSyncModel: vi.fn(function () {
    return mocks.model;
  }),
  linearBindingReadEnabled: (binding: any) => binding.settings.readEnabled ?? binding.syncEnabled,
  linearBindingWriteEnabled: (binding: any) => binding.settings.writeEnabled ?? binding.syncEnabled,
}));

vi.mock('./integrationTask', () => ({
  LinearIntegrationTaskService: vi.fn(function () {
    return { updatePublicTask: mocks.updatePublicTask };
  }),
}));

const { LinearConflictResolutionService } = await import('./conflictResolution');

const binding = {
  id: 'binding-1',
  installationId: 'installation-1',
  linearProjectId: 'linear-project-1',
  projectId: 'project-1',
  settings: { readEnabled: true, writeEnabled: true },
  syncEnabled: true,
};
const conflict = {
  base: { title: 'Base title' },
  detectedAt: '2026-09-17T10:01:00.000Z',
  fields: ['title'],
  local: { title: 'Local title' },
  localRevision: 7,
  remote: { title: 'Remote title' },
  remoteUpdatedAt: '2026-09-17T10:00:00.000Z',
};
const remoteSnapshot = {
  description: '',
  id: 'issue-1',
  identifier: 'ENG-1',
  priority: 0,
  projectId: 'linear-project-1',
  title: 'Remote title',
  updatedAt: '2026-09-17T10:00:00.000Z',
};
const task = {
  assigneeAgentId: null,
  assigneeUserId: null,
  domainRevision: 7,
  id: 'task-1',
  identifier: 'TASK-1',
  instruction: '',
  name: 'Local title',
  priority: 0,
  projectId: 'project-1',
  status: 'pending',
  visibility: 'public',
  workflowCategory: 'backlog',
  workflowStateId: null,
};
const context = () => ({
  binding,
  installation: { id: 'installation-1', status: 'active' },
  issueLink: {
    conflict,
    id: 'link-1',
    lastConfirmedSnapshot: {
      ...remoteSnapshot,
      title: 'Base title',
      updatedAt: '2026-09-17T09:00:00.000Z',
    },
    remoteSnapshot,
    remoteUpdatedAt: new Date(remoteSnapshot.updatedAt),
    syncState: 'conflict',
  },
  task,
});
const input = {
  expectedDetectedAt: conflict.detectedAt,
  expectedLocalRevision: 7,
  expectedRemoteUpdatedAt: remoteSnapshot.updatedAt,
  issueLinkId: 'link-1',
  strategy: 'keep_local' as const,
};

describe('LinearConflictResolutionService', () => {
  const db = {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.model.lockIssueConflictContext.mockResolvedValue(context());
    mocks.model.replaceIssueConflictOutbox.mockResolvedValue({ id: 'outbox-2' });
    mocks.model.updateIssueLink.mockResolvedValue({ id: 'link-1', syncState: 'pending' });
    mocks.updatePublicTask.mockResolvedValue({ ...task, domainRevision: 8, name: 'Remote title' });
  });

  it('rejects a stale local revision before changing the Task or Outbox', async () => {
    await expect(
      new LinearConflictResolutionService(db, 'workspace-1').resolve({
        ...input,
        expectedLocalRevision: 6,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'CONFLICT' }));

    expect(mocks.updatePublicTask).not.toHaveBeenCalled();
    expect(mocks.model.replaceIssueConflictOutbox).not.toHaveBeenCalled();
  });

  it('rebases keep-local onto the remote snapshot and replaces the failed payload exactly', async () => {
    const result = await new LinearConflictResolutionService(db, 'workspace-1').resolve(input);

    expect(mocks.updatePublicTask).not.toHaveBeenCalled();
    expect(mocks.model.replaceIssueConflictOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedLocalRevision: 7,
        linkId: 'link-1',
        payload: { title: 'Local title' },
        taskId: 'task-1',
      }),
    );
    expect(mocks.model.updateIssueLink).toHaveBeenCalledWith(
      'link-1',
      expect.objectContaining({
        conflict: null,
        lastConfirmedSnapshot: remoteSnapshot,
        syncState: 'pending',
      }),
    );
    expect(result.outboxQueued).toBe(true);
  });

  it('applies keep-Linear through the Task command and clears the failed outbox', async () => {
    mocks.model.replaceIssueConflictOutbox.mockResolvedValue(null);
    mocks.model.updateIssueLink.mockResolvedValue({ id: 'link-1', syncState: 'synced' });

    const result = await new LinearConflictResolutionService(db, 'workspace-1').resolve({
      ...input,
      strategy: 'keep_linear',
    });

    expect(mocks.updatePublicTask).toHaveBeenCalledWith(
      'task-1',
      { name: 'Remote title' },
      expect.objectContaining({ source: 'linear', suppressLinearOutbox: true }),
    );
    expect(mocks.model.replaceIssueConflictOutbox).toHaveBeenCalledWith(
      expect.objectContaining({ expectedLocalRevision: 8, payload: {} }),
    );
    expect(mocks.model.updateIssueLink).toHaveBeenCalledWith(
      'link-1',
      expect.objectContaining({ conflict: null, syncState: 'synced' }),
    );
    expect(result.outboxQueued).toBe(false);
  });
});
