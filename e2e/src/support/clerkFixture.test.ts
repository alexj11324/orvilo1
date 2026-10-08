import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertLocalClerkFixture } from './clerkFixture';

afterEach(() => vi.unstubAllGlobals());
describe('Clerk fixture scope', () => {
  it.each([
    { baseUrl: 'https://external.example', sessionToken: 'seeded' },
    { sessionToken: null },
  ])('does not impose a local fixture on external or unauthenticated runs', async (scope) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await assertLocalClerkFixture({ ...scope, port: '3406', userId: 'user_e2e_test_user_fixture' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('checks the locally seeded authenticated session and fails before scenario execution', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetch);
    await expect(
      assertLocalClerkFixture({
        port: '3406',
        sessionToken: 'seeded',
        userId: 'user_e2e_test_user_fixture',
      }),
    ).rejects.toThrow('fixture is unavailable');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3406/v1/sessions/sess_e2e_user_e2e_test_user_fixture',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
