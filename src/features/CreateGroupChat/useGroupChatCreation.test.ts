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

  it('finishes the same group and scope after participant setup fails', async () => {
    mocks.add.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useGroupChatCreation());
    let id: string | undefined;
    await act(async () => {
      id = await result.current.create(
        { title: 'Team', content: 'Instructions', visibility: 'private' },
        ['participant'],
      );
    });
    expect(id).toBeUndefined();
    expect(result.current.createdId).toBe('created');
    expect(result.current.error).toBeInstanceOf(Error);
    await act(async () => {
      id = await result.current.create(
        { title: 'Team', content: 'Instructions', visibility: 'public' },
        ['participant'],
      );
    });
    expect(id).toBe('created');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.add).toHaveBeenLastCalledWith('created', ['participant']);
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
      const first = result.current.create({ title: 'Team' }, []);
      expect(await result.current.create({ title: 'Team' }, [])).toBeUndefined();
      resolve({ group: { id: 'created' } });
      expect(await first).toBe('created');
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
