/** Test-only Clerk Backend fixture served by the existing local mock process. */
export const MOCK_CLERK_SECRET_KEY = 'e2e-mock-clerk-secret';

export const clerkFixtureForUser = (userId: string) => ({
  sessionId: `sess_e2e_${userId}`,
  upstreamUserId: `clerk_e2e_${userId}`,
});

export const clerkFixtureForSession = (sessionId: string) => {
  const userId = sessionId.replace(/^sess_e2e_/, '');
  if (!sessionId.startsWith('sess_e2e_') || !/^user_e2e_test_user_[\w-]+$/.test(userId))
    return null;
  return {
    expire_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
    id: sessionId,
    status: 'active',
    user_id: clerkFixtureForUser(userId).upstreamUserId,
  };
};
