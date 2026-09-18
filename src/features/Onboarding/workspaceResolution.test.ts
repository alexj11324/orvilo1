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

const createMutate = vi.mocked(lambdaClient.workspace.create.mutate);
const listQuery = vi.mocked(lambdaClient.workspace.list.query);

beforeEach(() => {
  vi.clearAllMocks();
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

  it('creates a workspace when no checkpoint exists', async () => {
    createMutate.mockResolvedValue({ id: 'ws-new', slug: 'acme-inc' } as never);

    const result = await resolveOnboardingWorkspace(values, undefined, ref());

    expect(result).toEqual({ id: 'ws-new', slug: 'acme-inc' });
    expect(createMutate).toHaveBeenCalledWith({ name: 'Acme Inc.', slug: 'acme-inc' });
  });

  it('resumes the server-persisted workspace checkpoint after a reload', async () => {
    listQuery.mockResolvedValue([{ id: 'ws-saved', slug: 'acme-inc' }] as never);

    const result = await resolveOnboardingWorkspace(values, 'ws-saved', ref());

    expect(result).toEqual({ id: 'ws-saved', slug: 'acme-inc' });
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('creates fresh when the checkpointed workspace no longer exists', async () => {
    listQuery.mockResolvedValue([{ id: 'ws-other', slug: 'other' }] as never);
    createMutate.mockResolvedValue({ id: 'ws-new', slug: 'acme-inc' } as never);

    const result = await resolveOnboardingWorkspace(values, 'ws-deleted', ref());

    expect(result).toEqual({ id: 'ws-new', slug: 'acme-inc' });
    expect(createMutate).toHaveBeenCalledTimes(1);
  });

  it('propagates a checkpoint lookup failure instead of risking a duplicate create', async () => {
    listQuery.mockRejectedValue(new Error('network down'));

    await expect(resolveOnboardingWorkspace(values, 'ws-saved', ref())).rejects.toThrow(
      'network down',
    );
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('adopts the caller-owned slug match when the create response was lost', async () => {
    createMutate.mockRejectedValue(new Error('response lost'));
    listQuery.mockResolvedValue([{ id: 'ws-committed', slug: 'acme-inc' }] as never);

    const result = await resolveOnboardingWorkspace(values, undefined, ref());

    expect(result).toEqual({ id: 'ws-committed', slug: 'acme-inc' });
    expect(createMutate).toHaveBeenCalledTimes(1);
  });

  it('rethrows the create error when no owned workspace matches the slug', async () => {
    const conflict = new Error('Workspace slug is already taken');
    createMutate.mockRejectedValue(conflict);
    listQuery.mockResolvedValue([{ id: 'ws-other', slug: 'someone-else' }] as never);

    await expect(resolveOnboardingWorkspace(values, undefined, ref())).rejects.toBe(conflict);
  });
});
