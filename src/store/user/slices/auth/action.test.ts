import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mutate } from '@/libs/swr';
import { userKeys } from '@/libs/swr/keys';
import { useUserStore } from '@/store/user';
import { readUserDisplaySnapshot, writeUserDisplaySnapshot } from '@/store/user/displaySnapshot';

// Mock @/libs/swr mutate
vi.mock('@/libs/swr', async () => {
  const actual = await vi.importActual('@/libs/swr');
  return {
    ...actual,
    mutate: vi.fn(),
  };
});

const mockSessionApi = vi.hoisted(() => ({
  fetchAuthAccounts: vi.fn().mockResolvedValue({ hasPasswordAccount: false, providers: [] }),
  signOutWebSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/libs/auth/session', () => mockSessionApi);

beforeEach(() => {
  localStorage.clear();
  // /oidc/clear-session is best-effort inside logout; keep it inert in tests.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();

  // Reset store state
  useUserStore.setState({
    isLoadedAuthProviders: false,
    authProviders: [],
    hasPasswordAccount: false,
  });
});

describe('createAuthSlice', () => {
  describe('refreshUserState', () => {
    it('should refresh user config', async () => {
      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.refreshUserState();
      });

      expect(mutate).toHaveBeenCalledWith(userKeys.initState());
    });
  });

  describe('logout', () => {
    it('clears the captured user snapshot after successful sign-out', async () => {
      writeUserDisplaySnapshot('user-a', { avatar: 'avatar-a' });
      writeUserDisplaySnapshot('user-b', { avatar: 'avatar-b' });
      localStorage.setItem('orvilo:active-scope', 'user-a:personal');
      useUserStore.setState({ user: { id: 'user-a' } });

      mockSessionApi.signOutWebSession.mockImplementationOnce(async () => {
        // A concurrent session update must not change which snapshot this
        // sign-out is allowed to clear.
        useUserStore.setState({ user: { id: 'user-b' } });
      });

      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.logout();
      });

      expect(mockSessionApi.signOutWebSession).toHaveBeenCalled();
      expect(readUserDisplaySnapshot('user-a')).toBeUndefined();
      expect(readUserDisplaySnapshot('user-b')).toEqual({ avatar: 'avatar-b' });
      expect(localStorage.getItem('orvilo:active-scope')).toBeNull();
    });

    it('preserves the signing-out user snapshot when sign-out fails', async () => {
      writeUserDisplaySnapshot('user-a', { avatar: 'avatar-a' });
      localStorage.setItem('orvilo:active-scope', 'user-a:personal');
      useUserStore.setState({ user: { id: 'user-a' } });
      mockSessionApi.signOutWebSession.mockRejectedValueOnce(new Error('sign-out failed'));

      const { result } = renderHook(() => useUserStore());
      const logoutPromise = result.current.logout();

      await expect(logoutPromise).rejects.toThrow('sign-out failed');

      expect(readUserDisplaySnapshot('user-a')).toEqual({ avatar: 'avatar-a' });
      expect(localStorage.getItem('orvilo:active-scope')).toBe('user-a:personal');
    });
  });

  describe('openLogin', () => {
    it('should redirect to signin page', async () => {
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...originalLocation,
          href: '',
          pathname: '/chat',
          toString: () => 'http://localhost/chat',
        },
        writable: true,
      });

      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.openLogin();
      });

      expect(window.location.href).toContain('/signin');
      expect(window.location.href).toContain('callbackUrl');

      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
        writable: true,
      });
    });

    it('should explain an expired session on the signin page', async () => {
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...originalLocation,
          href: '',
          pathname: '/chat',
          toString: () => 'http://localhost/chat',
        },
        writable: true,
      });

      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.openLogin('sessionExpired');
      });

      expect(window.location.href).toContain('reason=sessionExpired');

      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
        writable: true,
      });
    });

    it('should not redirect when already on signin page', async () => {
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...originalLocation,
          href: '',
          pathname: '/signin',
          toString: () => 'http://localhost/signin',
        },
        writable: true,
      });

      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.openLogin();
      });

      expect(window.location.href).toBe('');

      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
        writable: true,
      });
    });
  });

  describe('fetchAuthProviders', () => {
    it('should skip fetching if already loaded', async () => {
      useUserStore.setState({ isLoadedAuthProviders: true });

      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.fetchAuthProviders();
      });

      expect(mockSessionApi.fetchAuthAccounts).not.toHaveBeenCalled();
    });

    it('should fetch providers from the accounts endpoint', async () => {
      mockSessionApi.fetchAuthAccounts.mockResolvedValueOnce({
        hasPasswordAccount: true,
        providers: [{ provider: 'github', providerAccountId: 'gh-123' }],
      });

      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.fetchAuthProviders();
      });

      expect(mockSessionApi.fetchAuthAccounts).toHaveBeenCalled();
      expect(result.current.isLoadedAuthProviders).toBe(true);
      expect(result.current.hasPasswordAccount).toBe(true);
      expect(result.current.authProviders).toEqual([
        { provider: 'github', providerAccountId: 'gh-123' },
      ]);
    });

    it('should handle fetch error gracefully', async () => {
      mockSessionApi.fetchAuthAccounts.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.fetchAuthProviders();
      });

      expect(result.current.isLoadedAuthProviders).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe('refreshAuthProviders', () => {
    it('should refresh providers from the accounts endpoint', async () => {
      mockSessionApi.fetchAuthAccounts.mockResolvedValueOnce({
        hasPasswordAccount: false,
        providers: [{ email: 'user@gmail.com', provider: 'google', providerAccountId: 'g-1' }],
      });

      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.refreshAuthProviders();
      });

      expect(mockSessionApi.fetchAuthAccounts).toHaveBeenCalled();
      expect(result.current.authProviders).toEqual([
        { provider: 'google', email: 'user@gmail.com', providerAccountId: 'g-1' },
      ]);
    });

    it('should handle refresh error gracefully', async () => {
      mockSessionApi.fetchAuthAccounts.mockRejectedValueOnce(new Error('Refresh failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.refreshAuthProviders();
      });

      // Should not throw
      consoleSpy.mockRestore();
    });
  });
});
