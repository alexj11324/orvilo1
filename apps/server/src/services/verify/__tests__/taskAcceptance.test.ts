// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveTaskAcceptance } from '../taskAcceptance';

const mocks = vi.hoisted(() => ({
  acceptanceEnsure: vi.fn(),
  acceptanceFindPolicyBySubject: vi.fn(),
  acceptanceUpdatePolicy: vi.fn(),
  taskFindById: vi.fn(),
  projectFindById: vi.fn(),
}));

vi.mock('@/database/models/acceptance', () => ({
  AcceptanceModel: vi.fn(function () {
    return {
      ensureForSubject: mocks.acceptanceEnsure,
      findPolicyBySubject: mocks.acceptanceFindPolicyBySubject,
      updatePolicy: mocks.acceptanceUpdatePolicy,
    };
  }),
}));

vi.mock('@/database/models/project', () => ({
  ProjectModel: class {
    findById = mocks.projectFindById;
  },
}));

vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return {
      findById: mocks.taskFindById,
      getVerifyConfig: (task: { verify?: unknown }) => task.verify,
    };
  }),
}));

const db = {} as never;

describe('resolveTaskAcceptance', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('uses Acceptance as the authoritative completion contract', async () => {
    mocks.acceptanceFindPolicyBySubject.mockResolvedValue({
      config: { maxIterations: 3 },
      id: 'acceptance-1',
      requirement: 'Acceptance requirement',
    });
    mocks.taskFindById.mockResolvedValue({ id: 'task-1', verify: { enabled: true } });

    const resolved = await resolveTaskAcceptance(db, 'user-1', 'task-1');

    expect(resolved).toMatchObject({
      acceptance: { id: 'acceptance-1' },
      config: { maxIterations: 3 },
      requirement: 'Acceptance requirement',
    });
  });

  it('does not materialize legacy task verify config while reading', async () => {
    mocks.acceptanceFindPolicyBySubject.mockResolvedValue(null);
    mocks.taskFindById.mockResolvedValue({
      id: 'task-1',
      verify: {
        enabled: true,
        maxIterations: 2,
        requirement: 'Legacy requirement',
        verifyRubricId: 'rubric-1',
      },
    });
    mocks.acceptanceEnsure.mockResolvedValue({
      config: { enabled: true, maxIterations: 2, verifyRubricId: 'rubric-1' },
      id: 'acceptance-1',
      requirement: 'Legacy requirement',
    });

    const resolved = await resolveTaskAcceptance(db, 'user-1', 'task-1');

    expect(mocks.acceptanceEnsure).not.toHaveBeenCalled();
    expect(mocks.acceptanceUpdatePolicy).not.toHaveBeenCalled();
    expect(resolved).toBeUndefined();
  });

  it('reads an inherited Acceptance without snapshotting it onto the child', async () => {
    mocks.taskFindById
      .mockResolvedValueOnce({ id: 'child', parentTaskId: 'parent' })
      .mockResolvedValueOnce({ id: 'parent', parentTaskId: null });
    mocks.acceptanceFindPolicyBySubject.mockResolvedValueOnce(null).mockResolvedValueOnce({
      config: { enabled: true },
      id: 'parent-acceptance',
      requirement: 'Parent contract',
    });
    mocks.acceptanceEnsure.mockResolvedValue({
      config: { enabled: true },
      id: 'child-acceptance',
      requirement: 'Parent contract',
    });

    const resolved = await resolveTaskAcceptance(db, 'user-1', 'child', 'workspace-1');

    expect(mocks.acceptanceEnsure).not.toHaveBeenCalled();
    expect(mocks.acceptanceUpdatePolicy).not.toHaveBeenCalled();
    expect(resolved?.acceptance.id).toBe('parent-acceptance');
  });

  it('prefers a child legacy policy over a parent Acceptance', async () => {
    mocks.acceptanceFindPolicyBySubject.mockResolvedValue(null);
    mocks.taskFindById.mockResolvedValue({
      id: 'child',
      parentTaskId: 'parent',
      verify: { enabled: true, maxIterations: 1 },
    });
    mocks.acceptanceEnsure.mockResolvedValue({
      config: { enabled: true, maxIterations: 1 },
      id: 'child-acceptance',
    });

    const resolved = await resolveTaskAcceptance(db, 'user-1', 'child');

    expect(mocks.acceptanceFindPolicyBySubject).toHaveBeenCalledTimes(1);
    expect(resolved).toBeUndefined();
    expect(mocks.acceptanceEnsure).not.toHaveBeenCalled();
  });
});

it('does not expose inherited historical policy across a private Project boundary', async () => {
  mocks.taskFindById.mockResolvedValue({ id: 'task', projectId: 'private-project' });
  mocks.acceptanceFindPolicyBySubject.mockResolvedValue({
    id: 'policy',
    config: { enabled: true },
  });
  mocks.projectFindById.mockResolvedValue(undefined);
  await expect(resolveTaskAcceptance(db, 'teammate', 'task', 'workspace')).resolves.toBeUndefined();
  expect(mocks.acceptanceEnsure).not.toHaveBeenCalled();
});
