import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getServerDB } from '@/database/core/db-adaptor';
import { account } from '@/database/schemas';
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
    const bindings = await db.query.account.findMany({
      columns: { accountId: true },
      where: and(eq(account.userId, session.userId), eq(account.providerId, 'clerk')),
    });
    if (bindings.length === 0)
      return NextResponse.json({ error: 'linked_accounts_unavailable' }, { status: 503 });
    const clerkUsers = await Promise.all(
      bindings.map(async ({ accountId }) => {
        const user = await fetchClerkUser(accountId);
        if (user.id !== accountId) throw new Error('Clerk user does not match account binding');
        return user;
      }),
    );

    return NextResponse.json({
      hasPasswordAccount: clerkUsers.some((user) => !!user.password_enabled),
      providers: clerkUsers.flatMap((user) =>
        (user.external_accounts ?? []).map((account) => ({
          email: account.email_address,
          provider: normalizeProvider(account.provider ?? ''),
          providerAccountId: account.provider_user_id ?? '',
        })),
      ),
    });
  } catch (error) {
    console.error('[auth/accounts] Clerk user fetch failed:', error);
    return NextResponse.json({ error: 'linked_accounts_unavailable' }, { status: 503 });
  }
};
