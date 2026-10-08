import { TRPCError } from '@trpc/server';
import debug from 'debug';
import urlJoin from 'url-join';

import { getServerDB } from '@/database/core/db-adaptor';
import { appEnv } from '@/envs/app';
import { authEnv } from '@/envs/auth';
import {
  isLegacyHeteroOperationClaims,
  validateHeteroOperationClaims,
} from '@/libs/trpc/utils/internalJwt';

import { assertOIDCGrantActive } from './access-control';

export const API_AUDIENCE = 'urn:orvilo:chat';

const log = debug('oidc-jwt');

/**
 * Get JWKS key string from environment
 * Uses JWKS_KEY which already has fallback to OIDC_JWKS_KEY in authEnv
 */
const getJwksKeyString = () => {
  return authEnv.JWKS_KEY;
};

/**
 * Get JWKS from environment variables
 * This JWKS is a JSON object containing RS256 private keys
 */
export const getJWKS = (): object => {
  try {
    const jwksString = getJwksKeyString();

    if (!jwksString) {
      throw new Error(
        'JWKS_KEY environment variable is required. Please use scripts/generate-oidc-jwk.mjs to generate JWKS.',
      );
    }

    // Attempt to parse JWKS JSON string
    const jwks = JSON.parse(jwksString);

    // Check if JWKS format is valid
    if (!jwks.keys || !Array.isArray(jwks.keys) || jwks.keys.length === 0) {
      throw new Error('Invalid JWKS format: missing or empty keys array');
    }

    // Check if there is an RS256 algorithm key
    const hasRS256Key = jwks.keys.some((key: any) => key.alg === 'RS256' && key.kty === 'RSA');
    if (!hasRS256Key) {
      throw new Error('No RSA key with RS256 algorithm found in JWKS');
    }

    return jwks;
  } catch (error) {
    console.error('Failed to parse JWKS:', error);
    throw new Error(`JWKS_KEY parse error: ${(error as Error).message}`, { cause: error });
  }
};

const getVerificationKey = async () => {
  try {
    const jwksString = getJwksKeyString();

    if (!jwksString) {
      throw new Error('JWKS_KEY environment variable is not set');
    }

    const jwks = JSON.parse(jwksString);

    if (!jwks.keys || !Array.isArray(jwks.keys) || jwks.keys.length === 0) {
      throw new Error('Invalid JWKS format: missing or empty keys array');
    }

    const privateRsaKey = jwks.keys.find((key: any) => key.alg === 'RS256' && key.kty === 'RSA');
    if (!privateRsaKey) {
      throw new Error('No RSA key with RS256 algorithm found in JWKS');
    }

    // Create a “clean” JWK object containing only public key components.
    // The key fields of an RSA public key are kty, n, e. Others like kid, alg, use are also public.
    const publicKeyJwk = {
      alg: privateRsaKey.alg,
      e: privateRsaKey.e,
      kid: privateRsaKey.kid,
      kty: privateRsaKey.kty,
      n: privateRsaKey.n,
      use: privateRsaKey.use,
    };

    // Remove any undefined fields to keep the object clean
    Object.keys(publicKeyJwk).forEach(
      (key) => (publicKeyJwk as any)[key] === undefined && delete (publicKeyJwk as any)[key],
    );

    const { importJWK } = await import('jose');

    // Now, in any environment, `importJWK` will correctly identify this object as a public key.
    return await importJWK(publicKeyJwk, 'RS256');
  } catch (error) {
    log('Failed to get JWKS public key: %O', error);
    throw new Error(`JWKS_KEY public key retrieval failed: ${(error as Error).message}`, {
      cause: error,
    });
  }
};

/**
 * Validate OIDC JWT Access Token
 * @param token - JWT access token
 * @returns Parsed token payload and user information
 */
export const validateOIDCJWT = async (
  token: string,
  { allowHeteroOperation = false }: { allowHeteroOperation?: boolean } = {},
) => {
  log('Starting OIDC JWT token validation');

  // JWKS / signing key retrieval is an infrastructure concern (misconfigured
  // env, malformed JWKS, key import failure). Let these errors propagate as
  // plain Error so upstream middleware maps them to 500 and triggers ops
  // alerts — treating them as 401 would incorrectly ask clients to re-auth
  // while the real problem is server-side.
  const publicKey = await getVerificationKey();

  const validate = async () => {
    try {
      const { decodeJwt, jwtVerify } = await import('jose');
      // Select the contract before verification; only the verified claims below
      // can authorize a token. Unknown purposes never use an internal fallback.
      const purpose = decodeJwt(token).purpose;
      const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'iat', 'exp'],
        ...(purpose === undefined
          ? {
              audience: API_AUDIENCE,
              issuer: urlJoin(appEnv.APP_URL!, '/oidc'),
              requiredClaims: ['sub', 'iat', 'exp', 'jti', 'client_id', 'grantId'],
              typ: 'at+jwt',
            }
          : {}),
      });

      if (
        (purpose === undefined &&
          (typeof payload.client_id !== 'string' ||
            !payload.client_id ||
            typeof payload.grantId !== 'string' ||
            !payload.grantId)) ||
        (purpose === 'cli-sandbox' &&
          (payload.iss !== undefined ||
            payload.aud !== undefined ||
            payload.client_id !== undefined ||
            protectedHeader.typ !== undefined)) ||
        (purpose === 'hetero-operation' &&
          (!allowHeteroOperation ||
            (!validateHeteroOperationClaims(payload) &&
              !isLegacyHeteroOperationClaims(payload)))) ||
        (purpose !== undefined && purpose !== 'cli-sandbox' && purpose !== 'hetero-operation')
      ) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid API access token contract' });
      }

      log('JWT validation successful');

      const userId = payload.sub;
      const clientId = payload.client_id;
      const aud = payload.aud;

      if (typeof userId !== 'string' || !userId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'JWT token is missing user ID (sub)',
        });
      }

      return {
        clientId,
        payload,
        tokenData: {
          aud,
          client_id: clientId,
          exp: payload.exp,
          iat: payload.iat,
          jti: payload.jti,
          purpose: payload.purpose as string | undefined,
          scope: payload.scope,
          sub: userId,
        },
        userId,
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      log('JWT validation failed (%s)', error instanceof Error ? error.name : 'unknown');

      // Preserve the original jose error via `cause` so upstream middleware
      // can still inspect specific codes like `ERR_JWT_EXPIRED`.
      throw new TRPCError({
        cause: error,
        code: 'UNAUTHORIZED',
        message: `JWT token validation failed: ${(error as Error).message}`,
      });
    }
  };
  const result = await validate();
  // Keep database failures outside the JOSE error wrapper: callers must report an outage.
  if (result.payload.purpose === undefined) {
    await assertOIDCGrantActive(await getServerDB(), {
      clientId: result.clientId as string,
      grantId: result.payload.grantId as string,
      userId: result.userId,
    });
  }
  return result;
};
