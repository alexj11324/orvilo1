import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGitHubMcpConnect } from './useGitHubMcpConnect';

const { connectGitHubMcp, remoteServerUrl, status } = vi.hoisted(() => ({
  connectGitHubMcp: vi.fn(),
  remoteServerUrl: vi.fn(() => 'https://orvilo.test'),
  status: vi.fn(),
}));

vi.mock('@/components/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('@orvilo/const', () => ({ isDesktop: true }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/services/githubOAuth', () => ({ githubOAuthService: { status } }));
vi.mock('@/store/electron', () => ({ useElectronStore: { getState: vi.fn(() => ({})) } }));
vi.mock('@/store/electron/selectors', () => ({ electronSyncSelectors: { remoteServerUrl } }));
vi.mock('@/store/tool', () => ({
  useToolStore: (selector: (state: { connectGitHubMcp: typeof connectGitHubMcp }) => unknown) =>
    selector({ connectGitHubMcp }),
}));

describe('useGitHubMcpConnect desktop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status.mockResolvedValue({ data: { connected: false } });
  });

  it('activates an existing Reviews grant without opening a hosted OAuth route', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const onConnected = vi.fn();
    connectGitHubMcp.mockResolvedValue({ connectorId: 'github-connector', status: 'connected' });
    const { result } = renderHook(() => useGitHubMcpConnect(onConnected));

    await act(async () => {
      await result.current.connect();
    });

    expect(connectGitHubMcp).toHaveBeenCalledOnce();
    expect(onConnected).toHaveBeenCalledWith('github-connector');
    expect(open).not.toHaveBeenCalled();
    expect(result.current.connecting).toBe(false);
  });

  it('opens the hosted OAuth start route only when activation requires authorization', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    connectGitHubMcp.mockResolvedValue({
      authorizationUrl: 'https://github.com/login/oauth/authorize?state=once',
      status: 'authorization_required',
    });
    const { result } = renderHook(() => useGitHubMcpConnect(vi.fn()));

    await act(async () => {
      await result.current.connect();
    });

    expect(connectGitHubMcp).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/orvilo\.test\/oauth\/github\/start\?attempt=[0-9a-f-]+$/),
      '_blank',
    );
    expect(result.current.connecting).toBe(true);
  });
});
