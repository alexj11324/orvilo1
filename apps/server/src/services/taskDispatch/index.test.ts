// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as TaskDispatchModelModule from '@/database/models/taskDispatch';

import { TaskDispatchConflictError, TaskDispatchService } from './index';

const mocks = vi.hoisted(() => ({
  claimForProvisioning: vi.fn(),
  isCaidDispatchAllowed: vi.fn(),
  request: vi.fn(),
  transition: vi.fn(),
}));

vi.mock('@/database/models/taskDispatch', async (importOriginal) => ({
  ...(await importOriginal<typeof TaskDispatchModelModule>()),
  TaskDispatchModel: vi.fn(function () {
    return {
      claimForProvisioning: mocks.claimForProvisioning,
      request: mocks.request,
      transition: mocks.transition,
    };
  }),
}));
vi.mock('@/server/featureFlags/caidAdmission', () => ({
  isCaidDispatchAllowed: mocks.isCaidDispatchAllowed,
}));

const pgError = (code: string) => ({
  code,
  message: `pg ${code}`,
  severity: 'ERROR',
});

const prepared = () => ({
  dispatch: { id: 'dispatch-1' },
  fence: 1,
  owner: 'task-runner:test',
  task: { id: 'task-1' },
});

const prepareInput = () => ({
  idempotencyKey: 'key-1',
  origin: 'external' as const,
  requestedBy: 'user-1',
  task: { id: 'task-1' },
  trigger: 'manual' as const,
});

describe('task dispatch admission contention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCaidDispatchAllowed.mockResolvedValue(true);
  });

  it('translates an admission deadlock into TaskDispatchConflictError', async () => {
    mocks.request.mockRejectedValue(pgError('40P01'));

    await expect(
      new TaskDispatchService({} as never, 'workspace-1').prepare(prepareInput() as never),
    ).rejects.toBeInstanceOf(TaskDispatchConflictError);
  });

  it('translates a serialization failure the same way', async () => {
    mocks.request.mockRejectedValue(pgError('40001'));

    await expect(
      new TaskDispatchService({} as never, 'workspace-1').prepare(prepareInput() as never),
    ).rejects.toBeInstanceOf(TaskDispatchConflictError);
  });

  it('translates a provisioning-claim deadlock into TaskDispatchConflictError', async () => {
    mocks.request.mockResolvedValue({
      dispatch: { agentId: 'agent-1', id: 'dispatch-1', phase: 'requested' },
      state: 'created',
      task: { id: 'task-1' },
    });
    mocks.claimForProvisioning.mockRejectedValue(pgError('40P01'));

    await expect(
      new TaskDispatchService({} as never, 'workspace-1').prepare(prepareInput() as never),
    ).rejects.toBeInstanceOf(TaskDispatchConflictError);
  });

  it('translates a transition deadlock into TaskDispatchConflictError', async () => {
    mocks.transition.mockRejectedValue(pgError('40P01'));

    await expect(
      new TaskDispatchService({} as never, 'workspace-1').transition(
        prepared() as never,
        {
          expected: ['provisioning'],
          phase: 'dispatched',
        } as never,
      ),
    ).rejects.toBeInstanceOf(TaskDispatchConflictError);
  });

  it('rethrows errors that are not admission contention', async () => {
    const failure = new Error('unrelated driver failure');
    mocks.request.mockRejectedValue(failure);

    await expect(
      new TaskDispatchService({} as never, 'workspace-1').prepare(prepareInput() as never),
    ).rejects.toBe(failure);
  });
});
