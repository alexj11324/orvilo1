import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LinearSyncWorker } from './worker';

const mocks = vi.hoisted(() => ({
  binding: null as any,
  recordDomainEvent: vi.fn(),
  recordImportReceipt: vi.fn(),
  updateBindingImportState: vi.fn(),
}));

vi.mock('@/database/models/linearSync', () => ({
  LINEAR_SYNC_DEFAULT_LEASE_MS: 60_000,
  LINEAR_SYNC_MAX_ATTEMPTS: 5,
  LinearSyncModel: class {
    findBindingById = vi.fn(async () => mocks.binding);
    findInstallationById = vi.fn(async () => ({ id: 'installation-1' }));
    recordDomainEvent = mocks.recordDomainEvent;
    recordImportReceipt = mocks.recordImportReceipt;
    transaction = vi.fn(async (callback: (model: unknown, db: unknown) => unknown) =>
      callback(this, {}),
    );
    updateBindingImportState = mocks.updateBindingImportState;
  },
  linearBindingReadEnabled: (binding: any) =>
    binding.settings?.readEnabled ?? binding.syncEnabled ?? true,
  linearBindingWriteEnabled: (binding: any) =>
    binding.settings?.writeEnabled ?? binding.syncEnabled ?? true,
  linearSyncRetryDelayMs: vi.fn(() => 1_000),
}));
vi.mock('@/database/models/task', () => ({ TaskModel: class {} }));
vi.mock('@/database/schemas/task', () => ({ tasks: { id: 'id', workspaceId: 'workspaceId' } }));
vi.mock('@/server/services/task', () => ({ TaskService: class {} }));

const issue = (id: string, updatedAt?: string) => ({
  id,
  identifier: `ENG-${id}`,
  projectId: 'linear-project-1',
  title: id,
  updatedAt,
});

const newBinding = () => ({
  id: 'binding-1',
  importCompletedAt: null,
  importCursor: null,
  importPhase: 'initial',
  importReconciliationCursor: null,
  importStartedAt: null,
  installationId: 'installation-1',
  linearProjectId: 'linear-project-1',
  projectId: 'project-1',
});

describe('LinearSyncWorker.importBinding', () => {
  beforeEach(() => {
    mocks.binding = newBinding();
    mocks.recordDomainEvent.mockReset();
    mocks.recordImportReceipt.mockReset();
    mocks.updateBindingImportState.mockReset().mockImplementation(async (_id, patch) => {
      mocks.binding = { ...mocks.binding, ...patch };
      return mocks.binding;
    });
  });

  it('holds the page cursor when one issue fails, then resumes the same page', async () => {
    const provider = {
      listIssues: vi.fn().mockResolvedValue({
        endCursor: 'cursor-1',
        hasNextPage: true,
        issues: [issue('1'), issue('2')],
      }),
    };
    const worker = new LinearSyncWorker({} as never, 'workspace-1');
    const processIssue = vi
      .spyOn(worker as any, 'processImportIssue')
      .mockResolvedValueOnce('processed')
      .mockRejectedValueOnce(new Error('link write failed'))
      .mockResolvedValue('processed');

    const first = await worker.importBinding(provider as never, 'binding-1', 2);
    expect(first.completed).toBe(false);
    expect(first.failed).toBe(1);
    expect(mocks.binding.importCursor).toBeNull();

    const second = await worker.importBinding(provider as never, 'binding-1', 2);
    expect(second.completed).toBe(false);
    expect(mocks.binding.importCursor).toBe('cursor-1');
    expect(processIssue).toHaveBeenCalledTimes(4);
  });

  it('does not contact Linear while inbound reads are disabled', async () => {
    mocks.binding = { ...newBinding(), settings: { readEnabled: false }, syncEnabled: true };
    const provider = { listIssues: vi.fn() };
    const result = await new LinearSyncWorker({} as never, 'workspace-1').importBinding(
      provider as never,
      'binding-1',
      2,
    );

    expect(result).toMatchObject({ completed: false, nextCursor: null });
    expect(provider.listIssues).not.toHaveBeenCalled();
  });

  it('runs an overlap reconciliation page and records one scope completion fact', async () => {
    const changedDuringImport = issue('1', new Date(Date.now() + 60_000).toISOString());
    const provider = {
      listIssues: vi
        .fn()
        .mockResolvedValueOnce({ endCursor: 'cursor-1', hasNextPage: true, issues: [issue('1')] })
        .mockResolvedValueOnce({ endCursor: null, hasNextPage: false, issues: [issue('2')] })
        .mockResolvedValueOnce({
          endCursor: null,
          hasNextPage: false,
          issues: [changedDuringImport, changedDuringImport],
        }),
    };
    const worker = new LinearSyncWorker({} as never, 'workspace-1');
    const processIssue = vi
      .spyOn(worker as any, 'processImportIssue')
      .mockResolvedValue('processed');

    await worker.importBinding(provider as never, 'binding-1', 1);
    await worker.importBinding(provider as never, 'binding-1', 1);
    const result = await worker.importBinding(provider as never, 'binding-1', 1);

    expect(result.completed).toBe(true);
    expect(provider.listIssues).toHaveBeenNthCalledWith(1, 'linear-project-1', 1, null);
    expect(provider.listIssues).toHaveBeenNthCalledWith(2, 'linear-project-1', 1, 'cursor-1');
    expect(provider.listIssues).toHaveBeenNthCalledWith(3, 'linear-project-1', 1, null);
    expect(processIssue.mock.calls.map(([row, remote]) => [row.subjectId, remote.id])).toEqual([
      ['1', '1'],
      ['2', '2'],
      ['1', '1'],
    ]);
    expect(mocks.recordDomainEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', type: 'linear.import.completed' }),
    );
  });
});
