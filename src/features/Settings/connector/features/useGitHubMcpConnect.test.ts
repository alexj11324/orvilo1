import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGitHubMcpConnect } from './useGitHubMcpConnect';

const mocks = vi.hoisted(() => ({
  capability: vi.fn(),
  connectGitHubMcp: vi.fn(),
  status: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock('@orvilo/const', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isDesktop: false,
}));

vi.mock('@/components/toast', () => ({
  toast: { error: mocks.toastError, info: mocks.toastInfo, warning: mocks.toastWarning },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/services/githubOAuth', () => ({
  githubOAuthService: { status: mocks.status },
}));

vi.mock('@/store/tool', () => ({
  useToolStore: (selector: (s: unknown) => unknown) =>
    selector({ connectGitHubMcp: mocks.connectGitHubMcp }),
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    connector: { githubMcpCapability: { query: mocks.capability } },
  },
}));

vi.mock('@/store/electron', () => ({ useElectronStore: { getState: () => ({}) } }));
vi.mock('@/store/electron/selectors', () => ({
  electronSyncSelectors: { remoteServerUrl: () => 'https://server.example' },
}));

const popupWindow = () => {
  const popup = { close: vi.fn(), closed: false, location: { href: '' } };
  return popup as unknown as Window & { close: ReturnType<typeof vi.fn>; closed: boolean };
};

const dispatchResult = (popup: Window, data: unknown) => {
  const event = new MessageEvent('message', { data, origin: window.location.origin });
  Object.defineProperty(event, 'source', { configurable: true, value: popup });
  window.dispatchEvent(event);
};

describe('useGitHubMcpConnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.status.mockResolvedValue({ data: { connected: false } });
    mocks.capability.mockResolvedValue({ capability: 'app_oauth_configured' });
  });
  afterEach(() => vi.useRealTimers());

  it('exits the connecting state at the authorization deadline', async () => {
    const popup = popupWindow();
    vi.spyOn(window, 'open').mockReturnValue(popup);
    mocks.connectGitHubMcp.mockResolvedValue({
      authorizationUrl: 'https://github.example/authorize',
      status: 'authorization_required',
    });

    const onConnected = vi.fn();
    const { result } = renderHook(() => useGitHubMcpConnect(onConnected));

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.connecting).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(125_000);
    });

    expect(result.current.connecting).toBe(false);
    expect(result.current.timedOut).toBe(true);
    expect(mocks.toastWarning).toHaveBeenCalled();
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('ignores a result message from another attempt', async () => {
    const popup = popupWindow();
    vi.spyOn(window, 'open').mockReturnValue(popup);
    mocks.connectGitHubMcp.mockResolvedValue({
      authorizationUrl: 'https://github.example/authorize',
      status: 'authorization_required',
    });

    const onConnected = vi.fn();
    const { result } = renderHook(() => useGitHubMcpConnect(onConnected));
    await act(async () => {
      await result.current.connect();
    });

    // A stale/forged message without this attempt's nonce must not settle.
    dispatchResult(popup, { success: true, type: 'orvilo-github-oauth' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.connecting).toBe(true);
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('clears connecting when the user closes the popup', async () => {
    const popup = popupWindow();
    vi.spyOn(window, 'open').mockReturnValue(popup);
    mocks.connectGitHubMcp.mockResolvedValue({
      authorizationUrl: 'https://github.example/authorize',
      status: 'authorization_required',
    });

    const { result } = renderHook(() => useGitHubMcpConnect(vi.fn()));
    await act(async () => {
      await result.current.connect();
    });

    popup.closed = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(result.current.connecting).toBe(false);
  });

  it('routes to the PAT setup instead of opening a dead popup when OAuth is unconfigured', async () => {
    mocks.capability.mockResolvedValue({ capability: 'pat_available' });
    const onTokenSetup = vi.fn();
    const open = vi.spyOn(window, 'open');
    const { result } = renderHook(() => useGitHubMcpConnect(vi.fn(), onTokenSetup));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(onTokenSetup).toHaveBeenCalledTimes(1);
    expect(mocks.toastInfo).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(mocks.connectGitHubMcp).not.toHaveBeenCalled();
  });

  it('falls back to PAT setup when the mutation reports pat_available', async () => {
    mocks.capability.mockResolvedValue({ capability: 'app_oauth_configured' });
    mocks.connectGitHubMcp.mockResolvedValue({ status: 'pat_available' });
    const popup = popupWindow();
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const onTokenSetup = vi.fn();
    const { result } = renderHook(() => useGitHubMcpConnect(vi.fn(), onTokenSetup));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(onTokenSetup).toHaveBeenCalledTimes(1);
    expect(popup.close).toHaveBeenCalled();
    expect(result.current.capability).toBe('pat_available');
    expect(result.current.connecting).toBe(false);
  });

  it('reports not_configurable without opening any flow', async () => {
    mocks.capability.mockResolvedValue({ capability: 'not_configurable' });
    const open = vi.spyOn(window, 'open');
    const { result } = renderHook(() => useGitHubMcpConnect(vi.fn()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(mocks.toastError).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(mocks.connectGitHubMcp).not.toHaveBeenCalled();
  });
});
