import { headers } from 'next/headers';

import { type TrustedClientUserInfo } from './index';

/**
 * Get user info from the current session for trusted client authentication
 *
 * @returns User info or undefined if not authenticated
 */
export const getSessionUser = async (): Promise<TrustedClientUserInfo | undefined> => {
  try {
    // Dynamic import to avoid validator ESM/CJS issue during sitemap generation
    const { getServerDB } = await import('@/database/core/db-adaptor');
    const { UserModel } = await import('@/database/models/user');
    const { resolveAuthSessionFromHeaders } = await import('@/server/services/auth');

    const headersList = await headers();
    const db = await getServerDB();
    const session = await resolveAuthSessionFromHeaders(db, headersList);
    if (!session?.userId) return undefined;

    const user = await UserModel.findById(db, session.userId);
    if (!user?.email) return undefined;

    return {
      email: user.email,
      name: user.fullName || undefined,
      userId: user.id,
    };
  } catch {
    return undefined;
  }
};
