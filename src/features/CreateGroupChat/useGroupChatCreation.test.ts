import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGroupChatCreation } from './useGroupChatCreation';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  add: vi.fn(),
  refresh: vi.fn(),
  refreshHome: vi.fn(),
}));
vi.mock('@/services/chatGroup', () => ({
  chatGroupService: { createGroup: mocks.create, addAgentsToGroup: mocks.add },
}));
vi.mock('@/store/agentGroup', () => ({
  useAgentGroupStore: { getState: () => ({ refreshGroupDetail: mocks.refresh }) },
}));
vi.mock('@/store/home', () => ({
  useHomeStore: { getState: () => ({ refreshAgentList: mocks.refreshHome }) },
}));

describe('group chat creation checkpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ group: { id: 'created' } });
    mocks.add.mockResolvedValue(undefined);
    mocks.refresh.mockResolvedValue(undefined);
    mocks.refreshHome.mockResolvedValue(undefined);
  });

  it('finishes refreshing the same atomically created Group after a read fails', async () => {
    mocks.refresh.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useGroupChatCreation());
    let id: string | undefined;
    await act(async () => {
      id = await result.current.create(
        {
          coordinatorAgentId: 'participant',
          title: 'Team',
          content: 'Instructions',
          visibility: 'private',
        },
        ['participant'],
      );
    });
    expect(id).toBeUndefined();
    expect(result.current.createdId).toBe('created');
    expect(result.current.error).toBeInstanceOf(Error);
    await act(async () => {
      id = await result.current.create(
        {
          coordinatorAgentId: 'participant',
          title: 'Team',
          content: 'Instructions',
          visibility: 'public',
        },
        ['participant'],
      );
    });
    expect(id).toBe('created');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentIds: ['participant'],
        coordinatorAgentId: 'participant',
        visibility: 'private',
      }),
    );
    expect(result.current.error).toBeUndefined();
    expect(result.current.pending).toBe(false);
  });

  it('prevents two submissions while the create request is in flight', async () => {
    let resolve: (value: { group: { id: string } }) => void = () => {};
    mocks.create.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { result } = renderHook(() => useGroupChatCreation());
    await act(async () => {
      const first = result.current.create({ coordinatorAgentId: 'participant', title: 'Team' }, []);
      expect(
        await result.current.create({ coordinatorAgentId: 'participant', title: 'Team' }, []),
      ).toBeUndefined();
      resolve({ group: { id: 'created' } });
      expect(await first).toBe('created');
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
