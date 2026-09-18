import { type OAuthDeviceFlowConfig } from '@/types/aiProvider';

export interface TokenResponse {
  accessToken: string;
  accountId?: string;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
  tokenType: string;
}

/**
 * Thrown by `refreshAccessToken` when the authorization server rejects the
 * refresh_token as invalid/expired/already-consumed (`invalid_grant`).
 * Callers use this signal to re-read persisted credentials (another instance
 * may have rotated the token) before treating the grant as truly dead.
 */
export class OAuthInvalidGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthInvalidGrantError';
  }
}

/**
 * Parse the `exp` claim (ms timestamp) from a JWT access token WITHOUT
 * verifying the signature. Only used to decide when to proactively refresh —
 * never for trust decisions. Returns undefined for opaque / non-JWT tokens.
 */
export const parseJwtExpiry = (token: string | undefined): number | undefined => {
  if (!token) return undefined;

  const parts = token.split('.');
  if (parts.length < 2) return undefined;

  try {
    const payload = Buffer.from(parts[1].replaceAll('-', '+').replaceAll('_', '/'), 'base64');
    const claims = JSON.parse(payload.toString('utf8'));

    if (typeof claims?.exp !== 'number') return undefined;

    return claims.exp * 1000;
  } catch {
    return undefined;
  }
};

export class OAuthDeviceFlowService {
  /**
   * Exchange a refresh_token for a new access token (RFC 6749 §6).
   *
   * The provider may rotate the refresh_token: when the response carries a new
   * one the old one is invalidated server-side, so callers MUST persist
   * `refreshToken` from the returned tokens before relying on them.
   */
  async refreshAccessToken(
    config: OAuthDeviceFlowConfig,
    refreshToken: string,
  ): Promise<TokenResponse> {
    const response = await fetch(config.tokenEndpoint, {
      body: new URLSearchParams({
        client_id: config.clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.error) {
      // invalid_grant = refresh token expired / revoked / already consumed
      if (data.error === 'invalid_grant') {
        throw new OAuthInvalidGrantError(data.error_description || 'invalid_grant');
      }

      throw new Error(
        `Failed to refresh access token: ${response.status} ${data.error || ''} ${data.error_description || ''}`.trim(),
      );
    }

    if (!data.access_token) throw new Error('Unexpected response from token endpoint');

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      // Rotation is optional per RFC 6749 — keep the old token when the
      // provider doesn't rotate.
      refreshToken: data.refresh_token || refreshToken,
      scope: data.scope,
      tokenType: data.token_type || 'bearer',
    };
  }
}
