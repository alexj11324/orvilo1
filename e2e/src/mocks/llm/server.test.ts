import type { AddressInfo } from 'node:net';

import { expect, it } from 'vitest';

import { clerkFixtureForUser, MOCK_CLERK_SECRET_KEY } from '../../support/clerkFixture';
import { createMockLLMServer } from './server';

it('existing mock process serves only authenticated E2E SID/sub status fixtures', async () => {
  const server = createMockLLMServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const fixture = clerkFixtureForUser('user_e2e_test_user_001');
  try {
    const status = await fetch(`${origin}/v1/sessions/${fixture.sessionId}`, {
      headers: { authorization: `Bearer ${MOCK_CLERK_SECRET_KEY}` },
    });
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      id: fixture.sessionId,
      user_id: fixture.upstreamUserId,
      status: 'active',
    });
    expect((await fetch(`${origin}/v1/sessions/${fixture.sessionId}`)).status).toBe(401);
    expect(
      (
        await fetch(`${origin}/v1/sessions/foreign-session`, {
          headers: { authorization: `Bearer ${MOCK_CLERK_SECRET_KEY}` },
        })
      ).status,
    ).toBe(404);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
