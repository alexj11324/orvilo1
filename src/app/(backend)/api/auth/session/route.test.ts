// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), findUser: vi.fn() }));
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: async () => ({}) }));
vi.mock('@/database/models/user', () => ({ UserModel: { findById: mocks.findUser } }));
vi.mock('@/server/services/auth', () => ({ resolveAuthSessionFromHeaders: mocks.resolve }));
const request = new Request('https://product.example.test/api/auth/session');
beforeEach(() => vi.clearAllMocks());
it('returns infrastructure failure and preserves cookies on upstream outage', async () => {
  mocks.resolve.mockRejectedValue(new Error('upstream unavailable'));
  const response = await GET(request);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'session_verification_unavailable' });
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(mocks.findUser).not.toHaveBeenCalled();
});
it('returns unauthorized for invalid authentication', async () => {
  mocks.resolve.mockResolvedValue(null);
  expect((await GET(request)).status).toBe(401);
});
it('returns the verified canonical user', async () => {
  mocks.resolve.mockResolvedValue({ userId: 'canonical' });
  mocks.findUser.mockResolvedValue({ id: 'canonical', fullName: 'Fixture' });
  const response = await GET(request);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ user: { id: 'canonical' } });
});
