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

/** Only locally seeded authenticated runs depend on our mock Clerk Backend. */
export const assertLocalClerkFixture = async (options: {
  baseUrl?: string;
  port: string;
  sessionToken: string | null | undefined;
  userId: string;
}) => {
  if (options.baseUrl || !options.sessionToken) return;
  const fixture = clerkFixtureForUser(options.userId);
  const response = await fetch(
    `http://localhost:${options.port}/v1/sessions/${fixture.sessionId}`,
    {
      headers: { authorization: `Bearer ${MOCK_CLERK_SECRET_KEY}` },
      signal: AbortSignal.timeout(3000),
    },
  );
  if (!response.ok) throw new Error('E2E Clerk Backend fixture is unavailable');
};
