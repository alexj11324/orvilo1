import { NextResponse } from 'next/server';

import { getServerDB } from '@/database/core/db-adaptor';
import { fetchClerkUser, resolveAuthSessionFromHeaders } from '@/server/services/auth';

const normalizeProvider = (provider: string) =>
  provider.startsWith('oauth_') ? provider.slice('oauth_'.length) : provider;

/**
 * GET /api/auth/accounts
 *
 * Linked sign-in methods for the current user, sourced from Clerk (the sole
 * IdP). Account linking/unlinking is managed on the accounts portal.
 */
export const GET = async (request: Request) => {
  const db = await getServerDB();
  const session = await resolveAuthSessionFromHeaders(db, request.headers);
  if (!session?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const clerkUser = await fetchClerkUser(session.userId);

    return NextResponse.json({
      hasPasswordAccount: !!clerkUser.password_enabled,
      providers: (clerkUser.external_accounts ?? []).map((account) => ({
        email: account.email_address,
        provider: normalizeProvider(account.provider ?? ''),
        providerAccountId: account.provider_user_id ?? '',
      })),
    });
  } catch (error) {
    // Without CLERK_SECRET_KEY the linked-accounts surface is unavailable —
    // degrade to an empty list instead of breaking the settings page.
    console.error('[auth/accounts] Clerk user fetch failed:', error);
    return NextResponse.json({ hasPasswordAccount: false, providers: [] });
  }
};
