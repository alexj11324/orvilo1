import { describe, expect, it, vi } from 'vitest';

import { acceptInviteAndResolvePath } from './acceptInvite';

const deps = () => ({
  accept: vi.fn(async () => ({ workspaceId: 'ws-1' })),
  listWorkspaces: vi.fn(async () => [{ id: 'ws-1', slug: 'acme' }]),
  refreshUserState: vi.fn(async () => {}),
});

describe('acceptInviteAndResolvePath', () => {
  it('reloads the user state after accepting and before resolving the workspace', async () => {
    const d = deps();

    await expect(acceptInviteAndResolvePath('tok', d)).resolves.toBe('/acme');

    expect(d.accept).toHaveBeenCalledWith('tok');
    expect(d.refreshUserState).toHaveBeenCalledTimes(1);
    expect(d.accept.mock.invocationCallOrder[0]!).toBeLessThan(
      d.refreshUserState.mock.invocationCallOrder[0]!,
    );
    expect(d.refreshUserState.mock.invocationCallOrder[0]!).toBeLessThan(
      d.listWorkspaces.mock.invocationCallOrder[0]!,
    );
  });

  it('does not reload the user state or navigate when the accept fails', async () => {
    const d = deps();
    d.accept.mockRejectedValueOnce(new Error('Invitation expired'));

    await expect(acceptInviteAndResolvePath('tok', d)).rejects.toThrow('Invitation expired');

    expect(d.refreshUserState).not.toHaveBeenCalled();
    expect(d.listWorkspaces).not.toHaveBeenCalled();
  });

  it('still lands in the workspace when the user state reload fails', async () => {
    const d = deps();
    d.refreshUserState.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});

    await expect(acceptInviteAndResolvePath('tok', d)).resolves.toBe('/acme');
  });

  it('falls back to home when the joined workspace cannot be resolved', async () => {
    const d = deps();
    d.listWorkspaces.mockRejectedValueOnce(new Error('offline'));

    await expect(acceptInviteAndResolvePath('tok', d)).resolves.toBe('/');
  });
});
