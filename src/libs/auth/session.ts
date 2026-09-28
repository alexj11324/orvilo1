'use client';

import type { SSOProvider } from '@orvilo/types';
import useSWR from 'swr';

export interface AuthSessionUser {
  avatar?: string | null;
  email?: string | null;
  id: string;
  name?: string | null;
  username?: string | null;
}

export interface AuthSessionData {
  user: AuthSessionUser;
}

/** Mirrors the fields the better-auth client error carried (callers read `.status`). */
export class AuthSessionError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthSessionError';
    this.status = status;
  }
}

const fetchAuthSession = async (): Promise<AuthSessionData> => {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new AuthSessionError('Failed to fetch session', response.status);
  }
  return (await response.json()) as AuthSessionData;
};

/**
 * `useSession` equivalent for the Clerk-era web session: reads the
 * `orvilo_auth` cookie via `/api/auth/session` and revalidates on tab focus
 * (the better-auth client did the same on visibilitychange). SWR retries are
 * off — callers apply their own backoff (see `UserUpdater`).
 */
export const useAuthSession = () => {
  const { data, error, isLoading, isValidating, mutate } = useSWR<
    AuthSessionData,
    AuthSessionError
  >('/api/auth/session', fetchAuthSession, {
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  return {
    data,
    error,
    isPending: isLoading,
    isRefetching: isValidating && !isLoading,
    refetch: mutate,
  };
};

export interface AuthAccountsData {
  hasPasswordAccount: boolean;
  providers: SSOProvider[];
}

/** Linked sign-in methods (Clerk external accounts + password flag). */
export const fetchAuthAccounts = async (): Promise<AuthAccountsData> => {
  const response = await fetch('/api/auth/accounts', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new AuthSessionError('Failed to fetch linked accounts', response.status);
  }
  return (await response.json()) as AuthAccountsData;
};

/**
 * Destroy the app-side session (cookie + row). The caller should then redirect
 * to the accounts portal's `sign_out` flow so the Clerk session ends too.
 */
export const signOutWebSession = async (): Promise<void> => {
  await fetch('/api/auth/signout', { method: 'POST' });
};
