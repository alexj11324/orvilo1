// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OAuthDeviceFlowService, OAuthInvalidGrantError, parseJwtExpiry } from '../index';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OAuthDeviceFlowService', () => {
  let service: OAuthDeviceFlowService;

  const mockConfig = {
    clientId: 'test-client-id',
    deviceCodeEndpoint: 'https://example.com/device/code',
    scopes: ['read:user'],
    tokenEndpoint: 'https://example.com/oauth/token',
  };

  beforeEach(() => {
    service = new OAuthDeviceFlowService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('refreshAccessToken', () => {
    it('should exchange the refresh token with a refresh_token grant', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            access_token: 'new-access',
            expires_in: 3600,
            refresh_token: 'new-refresh',
            token_type: 'bearer',
          }),
        ok: true,
      });

      const result = await service.refreshAccessToken(mockConfig, 'old-refresh');

      expect(mockFetch).toHaveBeenCalledWith(
        mockConfig.tokenEndpoint,
        expect.objectContaining({
          body: expect.stringContaining('grant_type=refresh_token'),
          method: 'POST',
        }),
      );
      expect(result).toEqual({
        accessToken: 'new-access',
        expiresIn: 3600,
        refreshToken: 'new-refresh',
        scope: undefined,
        tokenType: 'bearer',
      });
    });

    it('should fall back to the old refresh token when the provider does not rotate', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ access_token: 'new-access' }),
        ok: true,
      });

      const result = await service.refreshAccessToken(mockConfig, 'old-refresh');

      expect(result.refreshToken).toBe('old-refresh');
    });

    it('should throw OAuthInvalidGrantError on invalid_grant', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 'invalid_grant' }),
        ok: false,
        status: 400,
      });

      await expect(service.refreshAccessToken(mockConfig, 'dead-refresh')).rejects.toBeInstanceOf(
        OAuthInvalidGrantError,
      );
    });

    it('should throw a generic error on other failures', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 'server_error' }),
        ok: false,
        status: 500,
      });

      await expect(service.refreshAccessToken(mockConfig, 'refresh')).rejects.toThrow(
        'Failed to refresh access token',
      );
    });
  });
});

describe('parseJwtExpiry', () => {
  const buildJwt = (claims: object) => {
    const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    return `${encode({ alg: 'none' })}.${encode(claims)}.sig`;
  };

  it('should parse the exp claim as a ms timestamp', () => {
    expect(parseJwtExpiry(buildJwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
  });

  it('should return undefined for opaque tokens', () => {
    expect(parseJwtExpiry('gho_notajwt')).toBeUndefined();
  });

  it('should return undefined when exp is missing or malformed', () => {
    expect(parseJwtExpiry(buildJwt({ sub: 'user' }))).toBeUndefined();
    expect(parseJwtExpiry(buildJwt({ exp: 'soon' }))).toBeUndefined();
    expect(parseJwtExpiry(undefined)).toBeUndefined();
    expect(parseJwtExpiry('')).toBeUndefined();
  });
});
