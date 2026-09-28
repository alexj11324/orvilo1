import { NextResponse } from 'next/server';

import { getServerDB } from '@/database/core/db-adaptor';
import { UserModel } from '@/database/models/user';
import { resolveAuthSessionFromHeaders } from '@/server/services/auth';

/**
 * GET /api/auth/session
 *
 * Session probe for the SPA (replaces better-auth `get-session`). Returns the
 * signed-in user's profile fields the client renders before trpc state
 * initializes. 401 when no valid `orvilo_auth` cookie is present.
 */
export const GET = async (request: Request) => {
  const db = await getServerDB();
  const session = await resolveAuthSessionFromHeaders(db, request.headers);
  if (!session?.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const user = await UserModel.findById(db, session.userId);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      avatar: user.avatar,
      email: user.email,
      id: user.id,
      name: user.fullName,
      username: user.username,
    },
  });
};
