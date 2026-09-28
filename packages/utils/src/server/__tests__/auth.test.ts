import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractBearerToken, getUserAuth } from '../auth';

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
}));

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/server/services/auth', () => ({
  resolveAuthSessionFromHeaders: vi.fn().mockResolvedValue({
    userId: 'session-user-id',
  }),
}));

describe('getUserAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return the resolved cookie session', async () => {
    const auth = await getUserAuth();

    expect(auth).toEqual({
      session: {
        userId: 'session-user-id',
      },
      userId: 'session-user-id',
    });
  });

  it('should return no userId when there is no session', async () => {
    const { resolveAuthSessionFromHeaders } = await import('@/server/services/auth');
    vi.mocked(resolveAuthSessionFromHeaders).mockResolvedValueOnce(null);

    await expect(getUserAuth()).resolves.toEqual({ session: null, userId: undefined });
  });
});

describe('extractBearerToken', () => {
  it('should return the token when authHeader is valid', () => {
    const token = 'test-token';
    const authHeader = `Bearer ${token}`;
    expect(extractBearerToken(authHeader)).toBe(token);
  });

  it('should return null when authHeader is missing', () => {
    expect(extractBearerToken()).toBeNull();
  });

  it('should return null when authHeader is null', () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  it('should return null when authHeader does not start with "Bearer "', () => {
    const authHeader = 'Invalid format';
    expect(extractBearerToken(authHeader)).toBeNull();
  });

  it('should return null when authHeader is only "Bearer"', () => {
    const authHeader = 'Bearer';
    expect(extractBearerToken(authHeader)).toBeNull();
  });

  it('should return null when authHeader is an empty string', () => {
    const authHeader = '';
    expect(extractBearerToken(authHeader)).toBeNull();
  });

  it('should handle extra spaces correctly', () => {
    const token = 'test-token-with-spaces';
    const authHeaderWithExtraSpaces = ` Bearer   ${token}  `;
    const authHeaderLeadingSpace = ` Bearer ${token}`;
    const authHeaderTrailingSpace = `Bearer ${token} `;
    const authHeaderMultipleSpacesBetween = `Bearer    ${token}`;

    expect(extractBearerToken(authHeaderWithExtraSpaces)).toBe(token);
    expect(extractBearerToken(authHeaderLeadingSpace)).toBe(token);
    expect(extractBearerToken(authHeaderTrailingSpace)).toBe(token);
    expect(extractBearerToken(authHeaderMultipleSpacesBetween)).toBe(token);
  });
});
