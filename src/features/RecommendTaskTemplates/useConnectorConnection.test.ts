/**
 * @vitest-environment happy-dom
 */
import type { TaskTemplateConnectorReference } from '@orvilo/const';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConnectorConnectionMarketAuthRequiredError,
  useConnectorConnection,
} from './useConnectorConnection';

const mocks = vi.hoisted(() => ({
  marketAuth: {
    isAuthenticated: false,
    signIn: vi.fn(),
  },
  toolState: {
    checkOrviloSkillStatus: vi.fn(),
    composioServers: [],
    createComposioConnection: vi.fn(),
    getOrviloSkillAuthorizeUrl: vi.fn(),
    orviloSkillServers: [],
    refreshComposioConnectionStatus: vi.fn(),
  },
}));

vi.mock('@/layout/AuthProvider/MarketAuth', () => ({
  useMarketAuth: () => mocks.marketAuth,
}));

vi.mock('@/store/tool', () => ({
  useToolStore: <T>(selector: (state: typeof mocks.toolState) => T): T => selector(mocks.toolState),
}));

vi.mock('@/store/user', () => ({
  useUserStore: {
    getState: () => ({ user: { id: 'user-id' } }),
  },
}));

const orviloSpec: TaskTemplateConnectorReference = { identifier: 'linear', source: 'orvilo' };

describe('useConnectorConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.marketAuth.isAuthenticated = false;
    mocks.marketAuth.signIn.mockResolvedValue(null);
    mocks.toolState.composioServers = [];
    mocks.toolState.orviloSkillServers = [];
    mocks.toolState.getOrviloSkillAuthorizeUrl.mockResolvedValue({
      authorizeUrl: 'https://market.example.com/oauth/authorize',
      code: 'code',
      expiresIn: 600,
    });
    vi.spyOn(window, 'open').mockReturnValue({
      close: vi.fn(),
      closed: false,
    } as unknown as Window);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the user to sign in to Market before requesting Orvilo connector OAuth', async () => {
    const { result } = renderHook(() => useConnectorConnection([orviloSpec]));

    let error: unknown;
    await act(async () => {
      try {
        await result.current.connect();
      } catch (caughtError) {
        error = caughtError;
      }
    });

    expect(error).toBeInstanceOf(ConnectorConnectionMarketAuthRequiredError);
    expect(mocks.marketAuth.signIn).toHaveBeenCalledWith('connector');
    expect(mocks.toolState.getOrviloSkillAuthorizeUrl).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('opens provider OAuth directly when Market is authenticated', async () => {
    mocks.marketAuth.isAuthenticated = true;
    const { result, unmount } = renderHook(() => useConnectorConnection([orviloSpec]));

    await act(async () => {
      await result.current.connect();
    });

    expect(mocks.marketAuth.signIn).not.toHaveBeenCalled();
    expect(mocks.toolState.getOrviloSkillAuthorizeUrl).toHaveBeenCalledWith('linear', {
      redirectUri: expect.stringContaining('/oauth/callback/success?provider=linear'),
    });
    expect(window.open).toHaveBeenCalledWith(
      'https://market.example.com/oauth/authorize',
      '_blank',
      'width=600,height=700',
    );

    unmount();
  });

  it('turns Market 401 from the authorize URL request into a silent auth interruption', async () => {
    mocks.marketAuth.isAuthenticated = true;
    mocks.toolState.getOrviloSkillAuthorizeUrl.mockRejectedValue({
      data: { code: 'UNAUTHORIZED', httpStatus: 401 },
    });
    const { result } = renderHook(() => useConnectorConnection([orviloSpec]));

    let error: unknown;
    await act(async () => {
      try {
        await result.current.connect();
      } catch (caughtError) {
        error = caughtError;
      }
    });

    expect(error).toBeInstanceOf(ConnectorConnectionMarketAuthRequiredError);
    expect(window.open).not.toHaveBeenCalled();
  });
});
