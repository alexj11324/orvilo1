import { beforeEach, describe, expect, it, vi } from 'vitest';

import { lambdaClient } from '@/libs/trpc/client';

import { resolveOnboardingWorkspace } from './workspaceResolution';

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    workspace: {
      create: { mutate: vi.fn() },
      list: { query: vi.fn() },
    },
  },
}));

const values = { workspaceName: '  Acme Inc.  ', workspaceSlug: '  acme-inc  ' };
const ref = () => ({ current: null as { id: string; slug: string } | null });
const noopCheckpoint = vi.fn(async () => {});

const createMutate = vi.mocked(lambdaClient.workspace.create.mutate);
const listQuery = vi.mocked(lambdaClient.workspace.list.query);

/** The candidate id the resolver handed to `create` — captured per call. */
const createdIds = () => createMutate.mock.calls.map(([input]) => (input as { id: string }).id);

beforeEach(() => {
  vi.clearAllMocks();
  noopCheckpoint.mockClear();
  listQuery.mockResolvedValue([]);
});

describe('resolveOnboardingWorkspace', () => {
  it('reuses the in-memory ref for same-mount retries without any API call', async () => {
    const created = { current: { id: 'ws-1', slug: 'acme-inc' } };

    const result = await resolveOnboardingWorkspace(values, undefined, created);

    expect(result).toEqual({ id: 'ws-1', slug: 'acme-inc' });
    expect(createMutate).not.toHaveBeenCalled();
    expect(listQuery).not.toHaveBeenCalled();
  });

  it('checkpoints a caller-chosen id before creating the workspace', async () => {
    createMutate.mockResolvedValue({ id: 'ws-new', slug: 'acme-inc' } as never);

    const result = await resolveOnboardingWorkspace(values, undefined, ref(), noopCheckpoint);

    expect(result).toEqual({ id: 'ws-new', slug: 'acme-inc' });
    const input = createMutate.mock.calls[0]?.[0] as {
      id: string;
      name: string;
      slug: string;
    };
    expect(input).toMatchObject({ name: 'Acme Inc.', slug: 'acme-inc' });
    expect(input.id).toEqual(expect.any(String));
    expect(noopCheckpoint).toHaveBeenCalledWith({ id: input.id, slug: 'acme-inc' });
    expect(noopCheckpoint.mock.invocationCallOrder[0]!).toBeLessThan(
      createMutate.mock.invocationCallOrder[0]!,
    );
  });

  it('resumes the server-persisted workspace checkpoint after a reload', async () => {
    listQuery.mockResolvedValue([{ id: 'ws-saved', slug: 'acme-inc' }] as never);

    const result = await resolveOnboardingWorkspace(values, 'ws-saved', ref(), noopCheckpoint);

    expect(result).toEqual({ id: 'ws-saved', slug: 'acme-inc' });
    expect(createMutate).not.toHaveBeenCalled();
    expect(noopCheckpoint).not.toHaveBeenCalled();
  });

  it('reuses the checkpointed id as the create key when the row vanished', async () => {
    listQuery.mockResolvedValue([{ id: 'ws-other', slug: 'other' }] as never);
    createMutate.mockResolvedValue({ id: 'ws-deleted', slug: 'acme-inc' } as never);

    const result = await resolveOnboardingWorkspace(values, 'ws-deleted', ref(), noopCheckpoint);

    expect(result).toEqual({ id: 'ws-deleted', slug: 'acme-inc' });
    expect(createMutate).toHaveBeenCalledWith({
      id: 'ws-deleted',
      name: 'Acme Inc.',
      slug: 'acme-inc',
    });
  });

  it('propagates a checkpoint lookup failure instead of risking a duplicate create', async () => {
    listQuery.mockRejectedValue(new Error('network down'));

    await expect(
      resolveOnboardingWorkspace(values, 'ws-saved', ref(), noopCheckpoint),
    ).rejects.toThrow('network down');
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('adopts the committed row by candidate id when the create response was lost', async () => {
    createMutate.mockRejectedValue(new Error('response lost'));
    // The list returns the row OUR create committed — same id we checkpointed.
    listQuery.mockImplementation(async () => [{ id: createdIds()[0], slug: 'acme-inc' }] as never);

    const result = await resolveOnboardingWorkspace(values, undefined, ref(), noopCheckpoint);

    expect(result).toEqual({ id: createdIds()[0], slug: 'acme-inc' });
    expect(createMutate).toHaveBeenCalledTimes(1);
  });

  it('does not adopt a foreign workspace that merely shares the slug', async () => {
    const conflict = new Error('Workspace slug is already taken');
    createMutate.mockRejectedValue(conflict);
    // Someone else owns the slug — their id is not our candidate id.
    listQuery.mockResolvedValue([{ id: 'ws-foreign', slug: 'acme-inc' }] as never);

    await expect(resolveOnboardingWorkspace(values, undefined, ref(), noopCheckpoint)).rejects.toBe(
      conflict,
    );
  });

  it('propagates the checkpoint write failure before any create attempt', async () => {
    const checkpoint = vi.fn(async () => {
      throw new Error('onboarding write failed');
    });

    await expect(resolveOnboardingWorkspace(values, undefined, ref(), checkpoint)).rejects.toThrow(
      'onboarding write failed',
    );
    expect(createMutate).not.toHaveBeenCalled();
  });
});
