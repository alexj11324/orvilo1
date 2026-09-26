import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGitHubMcpConnect } from './useGitHubMcpConnect';

const { connectGitHubMcp, status, toastError } = vi.hoisted(() => ({
  connectGitHubMcp: vi.fn(),
  status: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@lobehub/ui/base-ui', () => ({ toast: { error: toastError } }));
vi.mock('@orvilo/const', () => ({ isDesktop: false }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/services/githubOAuth', () => ({ githubOAuthService: { status } }));
vi.mock('@/store/electron', () => ({ useElectronStore: { getState: vi.fn() } }));
vi.mock('@/store/electron/selectors', () => ({ electronSyncSelectors: {} }));
vi.mock('@/store/tool', () => ({
  useToolStore: (selector: (state: { connectGitHubMcp: typeof connectGitHubMcp }) => unknown) =>
    selector({ connectGitHubMcp }),
}));

describe('useGitHubMcpConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status.mockResolvedValue({ data: { connected: false } });
  });

  it('stops waiting and reports an activation failure after OAuth succeeds', async () => {
    connectGitHubMcp
      .mockResolvedValueOnce({
        authorizationUrl: 'https://github.com/login/oauth/authorize?state=once',
        status: 'authorization_required',
      })
      .mockRejectedValueOnce(new Error('hosted MCP unavailable'));
    const popup = { closed: false, close: vi.fn(), location: { href: '' } };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const { result } = renderHook(() => useGitHubMcpConnect(vi.fn()));

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.connecting).toBe(true);

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { success: true, type: 'orvilo-github-oauth' },
          origin: window.location.origin,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastError).toHaveBeenCalledWith('connector.actionFailed');
    expect(result.current.connecting).toBe(false);
  });
});
