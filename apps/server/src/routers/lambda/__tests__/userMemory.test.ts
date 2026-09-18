import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  UserPersonaVersionNotFoundError,
  UserPersonaVersionSnapshotMissingError,
} from '@/database/models/userMemory/persona';
import { userMemoryRouter } from '@/server/routers/lambda/userMemory';
import { AsyncTaskErrorType, AsyncTaskStatus, AsyncTaskType } from '@/types/asyncTask';

const mockFindActiveByType = vi.fn();
const mockUpdate = vi.fn();

const mockDeleteAll = vi.fn();
const mockDeletePersona = vi.fn();
const mockListPersonaVersions = vi.fn();
const mockRestorePersonaVersion = vi.fn();
const { mockCancelHatchetWorkflow, mockDisableUserMemoryExtraction } = vi.hoisted(() => ({
  mockCancelHatchetWorkflow: vi.fn(),
  mockDisableUserMemoryExtraction: vi.fn(),
}));

vi.mock('@/database/models/asyncTask', () => ({
  AsyncTaskModel: vi.fn(function () {
    return {
      findActiveByType: mockFindActiveByType,
      update: mockUpdate,
    };
  }),
  initUserMemoryExtractionMetadata: vi.fn(function (metadata) {
    return metadata;
  }),
}));

vi.mock('@/database/models/userMemory', () => ({
  UserMemoryActivityModel: vi.fn(function () {
    return {};
  }),
  UserMemoryContextModel: vi.fn(function () {
    return {};
  }),
  UserMemoryExperienceModel: vi.fn(function () {
    return {};
  }),
  UserMemoryIdentityModel: vi.fn(function () {
    return {};
  }),
  UserMemoryModel: vi.fn(function () {
    return {
      deleteAll: mockDeleteAll,
    };
  }),
  UserMemoryPreferenceModel: vi.fn(function () {
    return {};
  }),
}));

vi.mock('@/database/models/userMemory/persona', () => ({
  UserPersonaVersionNotFoundError: class UserPersonaVersionNotFoundError extends Error {},
  UserPersonaVersionSnapshotMissingError: class UserPersonaVersionSnapshotMissingError extends Error {},
  UserPersonaModel: vi.fn(function () {
    return {
      deletePersona: mockDeletePersona,
      listVersions: mockListPersonaVersions,
      restoreVersion: mockRestorePersonaVersion,
    };
  }),
}));

vi.mock('@/server/services/hatchet/workflows', () => ({
  cancelHatchetWorkflow: mockCancelHatchetWorkflow,
}));

vi.mock('@/server/services/memory/userMemory/gate', () => ({
  disableUserMemoryExtraction: mockDisableUserMemoryExtraction,
}));

const createCaller = (ctxOverrides: Partial<any> = {}) => {
  const ctx = {
    serverDB: {} as any,
    userId: 'user-1',
    ...ctxOverrides,
  };

  return userMemoryRouter.createCaller(ctx);
};

describe('userMemoryRouter retired bulk extraction entries', () => {
  it.each(['requestMemoryFromChatTopic', 'getMemoryExtractionTask'])(
    'does not expose %s',
    (procedure) => {
      expect(procedure in userMemoryRouter._def.procedures).toBe(false);
    },
  );
});

describe('userMemoryRouter.deleteAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('purges all user memories through the aggregate model', async () => {
    mockDeleteAll.mockResolvedValue(undefined);
    mockDeletePersona.mockResolvedValue(undefined);
    mockFindActiveByType.mockResolvedValue(undefined);

    const caller = createCaller();
    const result = await caller.deleteAll();

    expect(mockDeleteAll).toHaveBeenCalledOnce();
    expect(mockDeletePersona).toHaveBeenCalledOnce();
    expect(result).toEqual({ success: true });
  });

  it('opts the user out of memory production so in-flight workflows cannot rebuild the profile', async () => {
    mockDeleteAll.mockResolvedValue(undefined);
    mockDeletePersona.mockResolvedValue(undefined);
    mockFindActiveByType.mockResolvedValue(undefined);
    mockDisableUserMemoryExtraction.mockResolvedValue(undefined);

    const caller = createCaller();
    await caller.deleteAll();

    // Hourly fan-out and persona-update steps are owned by the service user,
    // so the ownership-scoped task lookup below can never see them. Flipping
    // `memory.enabled` — the flag every production stage already checks — is
    // what actually stops an already-running step from re-materializing the
    // purged memories.
    expect(mockDisableUserMemoryExtraction).toHaveBeenCalledWith('user-1', {});
  });

  it('does not re-open topics for re-extraction after purge', async () => {
    mockDeleteAll.mockResolvedValue(undefined);
    mockDeletePersona.mockResolvedValue(undefined);
    mockFindActiveByType.mockResolvedValue(undefined);

    const caller = createCaller();
    await caller.deleteAll();

    // The former resetMemoryExtractStatus loophole is gone: nothing in the
    // purge path may mark historical topics as pending again, otherwise the
    // hourly workflow would silently rebuild the deleted profile.
    expect(mockFindActiveByType).toHaveBeenCalledWith(
      AsyncTaskType.UserMemoryExtractionWithChatTopic,
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCancelHatchetWorkflow).not.toHaveBeenCalled();
  });

  it('cancels an in-flight extraction task and its workflow runs', async () => {
    mockDeleteAll.mockResolvedValue(undefined);
    mockDeletePersona.mockResolvedValue(undefined);
    mockFindActiveByType.mockResolvedValue({
      id: 'task-1',
      metadata: {
        control: {
          hatchet: { workflowRunIds: ['run-1', 'run-2'] },
        },
        progress: { completedTopics: 1, totalTopics: 3 },
        source: 'chat_topic',
      },
      status: AsyncTaskStatus.Processing,
    });
    mockCancelHatchetWorkflow.mockResolvedValue(undefined);

    const caller = createCaller();
    const result = await caller.deleteAll();

    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        error: expect.objectContaining({
          name: AsyncTaskErrorType.TaskCancelled,
        }),
        metadata: expect.objectContaining({
          control: expect.objectContaining({
            cancelledBy: 'user',
            cancelRequestedAt: expect.any(String),
          }),
        }),
        status: AsyncTaskStatus.Error,
      }),
    );
    expect(mockCancelHatchetWorkflow).toHaveBeenCalledTimes(2);
    expect(mockCancelHatchetWorkflow).toHaveBeenCalledWith('run-1');
    expect(mockCancelHatchetWorkflow).toHaveBeenCalledWith('run-2');
  });

  it('still succeeds when workflow cancellation fails', async () => {
    mockDeleteAll.mockResolvedValue(undefined);
    mockDeletePersona.mockResolvedValue(undefined);
    mockFindActiveByType.mockResolvedValue({
      id: 'task-1',
      metadata: {
        control: { hatchet: { workflowRunIds: ['run-1'] } },
      },
      status: AsyncTaskStatus.Processing,
    });
    mockCancelHatchetWorkflow.mockRejectedValue(new Error('cancel failed'));

    const caller = createCaller();
    await expect(caller.deleteAll()).resolves.toEqual({ success: true });
  });
});

describe('userMemoryRouter persona versions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the caller persona history projection', async () => {
    const versions = [
      {
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
        id: 'history-1',
        nextVersion: 2,
        previousVersion: 1,
        snapshotPersona: '# Persona',
        snapshotTagline: 'Tagline',
      },
    ];
    mockListPersonaVersions.mockResolvedValue(versions);

    await expect(createCaller().listPersonaVersions()).resolves.toEqual(versions);
    expect(mockListPersonaVersions).toHaveBeenCalledWith();
  });

  it('restores a historical snapshot as a new persona version', async () => {
    mockRestorePersonaVersion.mockResolvedValue({ document: { version: 4 } });

    await expect(createCaller().restorePersonaVersion({ historyId: 'history-1' })).resolves.toEqual(
      { historyId: 'history-1', personaVersion: 4 },
    );
    expect(mockRestorePersonaVersion).toHaveBeenCalledWith('history-1');
  });

  it('maps an unavailable persona version to not found', async () => {
    mockRestorePersonaVersion.mockRejectedValue(new UserPersonaVersionNotFoundError());

    await expect(
      createCaller().restorePersonaVersion({ historyId: 'history-missing' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('maps a missing persona snapshot to a failed precondition', async () => {
    mockRestorePersonaVersion.mockRejectedValue(new UserPersonaVersionSnapshotMissingError());

    await expect(
      createCaller().restorePersonaVersion({ historyId: 'history-incomplete' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it.each(['listPersonaVersions', 'restorePersonaVersion'] as const)(
    'rejects %s in workspace scope',
    async (procedure) => {
      const caller = createCaller({ workspaceId: 'workspace-1' });
      const operation =
        procedure === 'listPersonaVersions'
          ? caller.listPersonaVersions()
          : caller.restorePersonaVersion({ historyId: 'history-1' });

      await expect(operation).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );
});
