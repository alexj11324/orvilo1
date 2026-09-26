import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGitHubMcpConnect } from './useGitHubMcpConnect';

const { connectGitHubMcp, remoteServerUrl, status } = vi.hoisted(() => ({
  connectGitHubMcp: vi.fn(),
  remoteServerUrl: vi.fn(() => 'https://orvilo.test'),
  status: vi.fn(),
}));

vi.mock('@lobehub/ui/base-ui', () => ({ toast: { error: vi.fn() } }));
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

  it('opens the hosted OAuth start route without requiring a second Reviews click', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => useGitHubMcpConnect(vi.fn()));

    await act(async () => {
      await result.current.connect();
    });

    expect(open).toHaveBeenCalledWith('https://orvilo.test/oauth/github/start', '_blank');
    expect(connectGitHubMcp).not.toHaveBeenCalled();
    expect(result.current.connecting).toBe(true);
  });
});
