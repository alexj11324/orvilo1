import { type SSOProvider } from '@orvilo/types';

import { clearActiveScopeKey } from '@/libs/swr/useCacheScope';
import { type StoreSetter } from '@/store/types';

import { clearUserDisplaySnapshot } from '../../displaySnapshot';
import { type UserStore } from '../../store';

interface AuthProvidersData {
  hasPasswordAccount: boolean;
  providers: SSOProvider[];
}

const fetchAuthProvidersData = async (): Promise<AuthProvidersData> => {
  const { fetchAuthAccounts } = await import('@/libs/auth/session');
  return fetchAuthAccounts();
};

type Setter = StoreSetter<UserStore>;
export const createAuthSlice = (set: Setter, get: () => UserStore, _api?: unknown) =>
  new UserAuthActionImpl(set, get, _api);

export class UserAuthActionImpl {
  readonly #get: () => UserStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => UserStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  fetchAuthProviders = async (): Promise<void> => {
    // Skip if already loaded
    if (this.#get().isLoadedAuthProviders) return;

    try {
      const { hasPasswordAccount, providers } = await fetchAuthProvidersData();
      this.#set({ authProviders: providers, hasPasswordAccount, isLoadedAuthProviders: true });
    } catch (error) {
      console.error('Failed to fetch auth providers:', error);
      this.#set({ isLoadedAuthProviders: true });
    }
  };

  logout = async (options?: { redirectTo?: string }): Promise<void> => {
    // Capture the owner before any async work. The store may be updated by a
    // concurrent session event before Better Auth confirms this sign-out.
    const signingOutUserId = this.#get().user?.id;

    // Clear the OIDC Provider session for the current browser *before*
    // destroying the web session. This prevents a stale OIDC session
    // from silently issuing tokens for the old account after the user signs
    // in as someone else.
    try {
      await fetch('/oidc/clear-session', { method: 'POST' });
    } catch {
      // Best-effort: don't block sign-out if the cleanup request fails
    }

    const { signOutWebSession } = await import('@/libs/auth/session');
    await signOutWebSession();

    // Drop the persisted active scope so the next boot doesn't hydrate the
    // signed-out user's cache (localStorage survives the reload below).
    clearActiveScopeKey();
    clearUserDisplaySnapshot(signingOutUserId);
    // Use window.location.href to trigger a full page reload
    // This ensures all client-side state (React, Zustand, cache) is cleared
    // signed_out marks an explicit sign-out: the /signin bounce forwards it
    // to the accounts portal as sign_out=1, which ends the upstream Clerk
    // session too.
    window.location.href = options?.redirectTo || '/signin?signed_out=1';
  };

  openLogin = async (reason?: 'sessionExpired'): Promise<void> => {
    // Skip if already on a login page (/signin, /signup)
    const pathname = location.pathname;
    if (pathname.startsWith('/signin') || pathname.startsWith('/signup')) {
      return;
    }

    const currentUrl = location.toString();
    const params = new URLSearchParams({ callbackUrl: currentUrl });
    if (reason) params.set('reason', reason);
    window.location.href = `/signin?${params.toString()}`;
  };

  refreshAuthProviders = async (): Promise<void> => {
    try {
      const { hasPasswordAccount, providers } = await fetchAuthProvidersData();
      this.#set({ authProviders: providers, hasPasswordAccount });
    } catch (error) {
      console.error('Failed to refresh auth providers:', error);
    }
  };
}

export type UserAuthAction = Pick<UserAuthActionImpl, keyof UserAuthActionImpl>;
