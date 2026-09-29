import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGitHubMcpConnect } from './useGitHubMcpConnect';

const mocks = vi.hoisted(() => ({
  connectGitHubMcp: vi.fn(),
  status: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@orvilo/const', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isDesktop: false,
}));

vi.mock('@lobehub/ui/base-ui', () => ({
  toast: { error: mocks.toastError, warning: mocks.toastWarning },
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
});
