/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ComposioServerStatus } from '@/store/tool/slices/composioStore';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';

import { useSkillConnect } from './useSkillConnect';

const mocks = vi.hoisted(() => {
  const toolState = {
    checkOrviloSkillStatus: vi.fn(),
    composioServers: [] as Array<{ identifier: string; status: string }>,
    createComposioConnection: vi.fn(),
    getOrviloSkillAuthorizeUrl: vi.fn(),
    orviloSkillServers: [] as Array<{
      identifier: string;
      isConnected: boolean;
      name: string;
      status: string;
    }>,
    refreshComposioConnectionStatus: vi.fn(),
    removeComposioConnection: vi.fn(),
    revokeOrviloSkill: vi.fn(),
  };

  const useToolStore = Object.assign(
    vi.fn(<T>(selector: (state: typeof toolState) => T): T => selector(toolState)),
    {
      getState: vi.fn(() => toolState),
    },
  );

  return {
    toolState,
    useToolStore,
    userState: { userId: 'user-id' },
  };
});

vi.mock('@/store/tool', () => ({
  useToolStore: mocks.useToolStore,
}));

vi.mock('@/store/tool/selectors', () => ({
  composioStoreSelectors: {
    getServerByIdentifier:
      (identifier: string) =>
      (
        state: typeof mocks.toolState,
      ): (typeof mocks.toolState.composioServers)[number] | undefined =>
        state.composioServers.find((server) => server.identifier === identifier),
  },
  orviloSkillStoreSelectors: {
    getServerByIdentifier:
      (identifier: string) =>
      (
        state: typeof mocks.toolState,
      ): (typeof mocks.toolState.orviloSkillServers)[number] | undefined =>
        state.orviloSkillServers.find((server) => server.identifier === identifier),
  },
}));

vi.mock('@/store/user', () => ({
  useUserStore: <T>(selector: (state: typeof mocks.userState) => T): T => selector(mocks.userState),
}));

vi.mock('@/store/user/selectors', () => ({
  userProfileSelectors: {
    userId: (state: typeof mocks.userState) => state.userId,
  },
}));

describe('useSkillConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.toolState.composioServers = [];
    mocks.toolState.orviloSkillServers = [];
  });

  it('keeps a Orvilo connector selected when revoke does not change its connected status', async () => {
    mocks.toolState.orviloSkillServers = [
      {
        identifier: 'notion',
        isConnected: true,
        name: 'Notion',
        status: OrviloSkillStatus.CONNECTED,
      },
    ];
    mocks.toolState.revokeOrviloSkill.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSkillConnect({ identifier: 'notion', type: 'orvilo' }));

    let disconnected = true;
    await act(async () => {
      disconnected = await result.current.handleDisconnect();
    });

    expect(mocks.toolState.revokeOrviloSkill).toHaveBeenCalledWith('notion');
    expect(disconnected).toBe(false);
  });

  it('reports a Orvilo connector as disconnected after revoke updates the latest store state', async () => {
    mocks.toolState.orviloSkillServers = [
      {
        identifier: 'notion',
        isConnected: true,
        name: 'Notion',
        status: OrviloSkillStatus.CONNECTED,
      },
    ];
    mocks.toolState.revokeOrviloSkill.mockImplementation(async () => {
      mocks.toolState.orviloSkillServers[0].status = OrviloSkillStatus.NOT_CONNECTED;
      mocks.toolState.orviloSkillServers[0].isConnected = false;
    });

    const { result } = renderHook(() => useSkillConnect({ identifier: 'notion', type: 'orvilo' }));

    let disconnected = false;
    await act(async () => {
      disconnected = await result.current.handleDisconnect();
    });

    expect(disconnected).toBe(true);
  });

  it('keeps a Composio connector selected when removal leaves the latest account active', async () => {
    mocks.toolState.composioServers = [
      {
        identifier: 'slack',
        status: ComposioServerStatus.ACTIVE,
      },
    ];
    mocks.toolState.removeComposioConnection.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSkillConnect({ identifier: 'slack', type: 'composio' }));

    let disconnected = true;
    await act(async () => {
      disconnected = await result.current.handleDisconnect();
    });

    expect(mocks.toolState.removeComposioConnection).toHaveBeenCalledWith('slack');
    expect(disconnected).toBe(false);
  });

  it('reports a Composio connector as disconnected once the active account is gone', async () => {
    mocks.toolState.composioServers = [
      {
        identifier: 'slack',
        status: ComposioServerStatus.ACTIVE,
      },
    ];
    mocks.toolState.removeComposioConnection.mockImplementation(async () => {
      mocks.toolState.composioServers = [];
    });

    const { result } = renderHook(() => useSkillConnect({ identifier: 'slack', type: 'composio' }));

    let disconnected = false;
    await act(async () => {
      disconnected = await result.current.handleDisconnect();
    });

    expect(disconnected).toBe(true);
  });
});
