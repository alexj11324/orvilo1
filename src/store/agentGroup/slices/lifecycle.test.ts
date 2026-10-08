import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chatGroupService } from '@/services/chatGroup';

import { useAgentGroupStore } from '../store';

// Mock dependencies
vi.mock('@/services/chatGroup', () => ({
  chatGroupService: {
    addAgentsToGroup: vi.fn(),
    createGroup: vi.fn(),
    getGroupDetail: vi.fn(),
    getGroups: vi.fn(),
  },
}));

vi.mock('@/store/home', () => ({
  getHomeStoreState: vi.fn(() => ({
    refreshAgentList: vi.fn(),
    switchToGroup: vi.fn(),
  })),
}));

vi.mock('@/store/agent', () => ({
  getAgentStoreState: vi.fn(() => ({
    internal_dispatchAgentMap: vi.fn(),
    setActiveAgentId: vi.fn(),
  })),
}));

vi.mock('@/store/chat', () => ({
  useChatStore: {
    setState: vi.fn(),
  },
}));

describe('ChatGroupLifecycleSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    act(() => {
      useAgentGroupStore.setState({
        groupMap: {},
        groups: [],
        groupsInit: false,
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createGroup', () => {
    it('should create a new group and switch to it', async () => {
      const mockGroup = {
        id: 'new-group-id',
        title: 'Test Group',
        userId: 'user-1',
      };
      const mockGroupDetail = {
        ...mockGroup,
        agents: [],
        supervisorAgentId: 'supervisor-1',
      };

      vi.mocked(chatGroupService.createGroup).mockResolvedValue({
        group: mockGroup as any,
        supervisorAgentId: 'supervisor-1',
      });
      vi.mocked(chatGroupService.getGroupDetail).mockResolvedValue(mockGroupDetail as any);

      const { result } = renderHook(() => useAgentGroupStore());

      let groupId: string = '';
      await act(async () => {
        groupId = await result.current.createGroup({
          title: 'Test Group',
          coordinatorAgentId: 'agent-1',
        });
      });

      expect(groupId).toBe('new-group-id');
      expect(chatGroupService.createGroup).toHaveBeenCalledWith({
        title: 'Test Group',
        coordinatorAgentId: 'agent-1',
        agentIds: [],
      });
    });

    it('atomically creates the Group with selected member IDs', async () => {
      const mockGroup = {
        id: 'new-group-id',
        title: 'Test Group',
        userId: 'user-1',
      };
      const mockGroupDetail = {
        ...mockGroup,
        agents: [],
        supervisorAgentId: 'supervisor-1',
      };

      vi.mocked(chatGroupService.createGroup).mockResolvedValue({
        group: mockGroup as any,
        supervisorAgentId: 'supervisor-1',
      });
      vi.mocked(chatGroupService.addAgentsToGroup).mockResolvedValue({ added: [], existing: [] });
      vi.mocked(chatGroupService.getGroupDetail).mockResolvedValue(mockGroupDetail as any);

      const { result } = renderHook(() => useAgentGroupStore());

      await act(async () => {
        await result.current.createGroup({ title: 'Test Group', coordinatorAgentId: 'agent-1' }, [
          'agent-1',
          'agent-2',
        ]);
      });

      expect(chatGroupService.addAgentsToGroup).not.toHaveBeenCalled();
      expect(chatGroupService.createGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          agentIds: ['agent-1', 'agent-2'],
          coordinatorAgentId: 'agent-1',
        }),
      );
    });

    it('should fetch group detail and store supervisorAgentId for tools injection', async () => {
      const mockGroup = {
        id: 'new-group-id',
        title: 'Test Group',
        userId: 'user-1',
      };
      const mockSupervisorAgentId = 'supervisor-agent-123';
      const mockGroupDetail = {
        ...mockGroup,
        agents: [],
        supervisorAgentId: mockSupervisorAgentId,
      };

      vi.mocked(chatGroupService.createGroup).mockResolvedValue({
        group: mockGroup as any,
        supervisorAgentId: mockSupervisorAgentId,
      });
      vi.mocked(chatGroupService.getGroupDetail).mockResolvedValue(mockGroupDetail as any);

      const { result } = renderHook(() => useAgentGroupStore());

      await act(async () => {
        await result.current.createGroup({ title: 'Test Group', coordinatorAgentId: 'agent-1' });
      });

      // Verify getGroupDetail was called to fetch full group info
      expect(chatGroupService.getGroupDetail).toHaveBeenCalledWith('new-group-id');

      // Verify supervisorAgentId is stored in groupMap for tools injection
      const groupDetail = result.current.groupMap['new-group-id'];
      expect(groupDetail).toBeDefined();
      expect(groupDetail.supervisorAgentId).toBe(mockSupervisorAgentId);
    });

    it('should not switch to group when silent is true', async () => {
      const mockSwitchToGroup = vi.fn();
      const { getHomeStoreState } = await import('@/store/home');
      vi.mocked(getHomeStoreState).mockReturnValue({
        refreshAgentList: vi.fn(),
        switchToGroup: mockSwitchToGroup,
      } as any);

      const mockGroup = {
        id: 'new-group-id',
        title: 'Test Group',
        userId: 'user-1',
      };
      const mockGroupDetail = {
        ...mockGroup,
        agents: [],
        supervisorAgentId: 'supervisor-1',
      };

      vi.mocked(chatGroupService.createGroup).mockResolvedValue({
        group: mockGroup as any,
        supervisorAgentId: 'supervisor-1',
      });
      vi.mocked(chatGroupService.getGroupDetail).mockResolvedValue(mockGroupDetail as any);

      const { result } = renderHook(() => useAgentGroupStore());

      await act(async () => {
        await result.current.createGroup(
          { title: 'Test Group', coordinatorAgentId: 'agent-1' },
          [],
          true,
        );
      });

      expect(mockSwitchToGroup).not.toHaveBeenCalled();
    });
  });
});
