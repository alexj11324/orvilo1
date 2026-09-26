import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGitHubConnection } from './useGitHubConnection';

const { start, status, toastError } = vi.hoisted(() => ({
  start: vi.fn(),
  status: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@lobehub/ui/base-ui', () => ({ toast: { error: toastError } }));
vi.mock('@orvilo/const', () => ({ isDesktop: false }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/services/githubOAuth', () => ({ githubOAuthService: { start, status } }));
vi.mock('@/store/electron', () => ({ useElectronStore: { getState: vi.fn() } }));
vi.mock('@/store/electron/selectors', () => ({ electronSyncSelectors: {} }));

describe('useGitHubConnection', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('opens the authorization window before waiting for network responses', async () => {
    let resolveStatus!: (value: { data: { connected: false } }) => void;
    status.mockReturnValue(new Promise((resolve) => (resolveStatus = resolve)));
    const authorizationUrl = 'https://github.com/login/oauth/authorize?client_id=example';
    start.mockResolvedValue({ data: { authorizationUrl } });
    const popup = { closed: false, close: vi.fn(), location: { href: '' } };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const { result } = renderHook(() => useGitHubConnection(vi.fn()));

    let connection!: Promise<void>;
    act(() => {
      connection = result.current.connect();
    });

    expect(open).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();

    await act(async () => {
      resolveStatus({ data: { connected: false } });
      await connection;
    });
    expect(popup.location.href).toBe(authorizationUrl);
    expect(result.current.waiting).toBe(true);
  });

  it('reports a blocked authorization window without starting OAuth or waiting', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => useGitHubConnection(vi.fn()));

    await act(async () => {
      await result.current.connect();
    });

    expect(open).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('reviews.connectGitHubFailed');
    expect(result.current.waiting).toBe(false);
  });

  it('keeps reconciling on focus after the fast poll timeout expires', async () => {
    vi.useFakeTimers();
    const authorizationUrl = 'https://github.com/login/oauth/authorize?client_id=example';
    start.mockResolvedValue({ data: { authorizationUrl } });
    status.mockResolvedValue({ data: { connected: false } });
    const popup = { closed: false, close: vi.fn(), location: { href: '' } };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const onConnected = vi.fn();
    const { result } = renderHook(() => useGitHubConnection(onConnected));

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.waiting).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(130_000);
    });
    // The watch is still on — only the fast cadence stopped.
    expect(result.current.waiting).toBe(true);

    status.mockResolvedValue({ data: { connected: true, grantRevision: 'r2' } });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(onConnected).toHaveBeenCalledOnce();
    expect(result.current.waiting).toBe(false);
    vi.useRealTimers();
  });

  it('stops waiting when the authorization popup is closed', async () => {
    vi.useFakeTimers();
    const authorizationUrl = 'https://github.com/login/oauth/authorize?client_id=example';
    start.mockResolvedValue({ data: { authorizationUrl } });
    status.mockResolvedValue({ data: { connected: false } });
    const popup = { closed: false, close: vi.fn(), location: { href: '' } };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const { result } = renderHook(() => useGitHubConnection(vi.fn()));

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.waiting).toBe(true);

    popup.closed = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current.waiting).toBe(false);
    vi.useRealTimers();
  });
});
