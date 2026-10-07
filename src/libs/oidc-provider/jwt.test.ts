// @vitest-environment node
import { TRPCError } from '@trpc/server';
import type { JWTPayload } from 'jose';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { signHeteroOperationJWT, signUserJWT } from '@/libs/trpc/utils/internalJwt';

import { validateOIDCJWT } from './jwt';

const { authEnv } = vi.hoisted(() => ({ authEnv: { JWKS_KEY: '' } }));
vi.mock('@/envs/auth', () => ({ authEnv }));
vi.mock('@/envs/app', () => ({ appEnv: { APP_URL: 'https://orvilo.example' } }));

describe('validateOIDCJWT', () => {
  let privateKey: CryptoKey;
  let jwks: string;
  const issuer = 'https://orvilo.example/oidc';
  const audience = 'urn:orvilo:chat';
  const now = Math.floor(Date.now() / 1000);
  const accessClaims = {
    aud: audience,
    client_id: 'orvilo-desktop',
    exp: now + 300,
    iat: now,
    iss: issuer,
    jti: 'access-token-id',
    scope: 'profile email offline_access',
    sub: 'user-123',
  };
  const sign = (payload: JWTPayload, typ?: string, key = privateKey) =>
    new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ }).sign(key);

  beforeAll(async () => {
    ({ privateKey } = await generateKeyPair('RS256', { extractable: true }));
    jwks = JSON.stringify({
      keys: [{ ...(await exportJWK(privateKey)), alg: 'RS256', kid: 'test-key', use: 'sig' }],
    });
  });
  beforeEach(() => {
    authEnv.JWKS_KEY = jwks;
  });

  it('accepts the native OAuth API contract without openid or user:read scopes', async () => {
    await expect(validateOIDCJWT(await sign(accessClaims, 'at+jwt'))).resolves.toMatchObject({
      clientId: 'orvilo-desktop',
      userId: 'user-123',
    });
  });

  it.each([
    [
      'same-provider RP ID token',
      { aud: 'orvilo-desktop', iss: issuer, sub: 'user-123', exp: now + 300 },
      'JWT',
    ],
    ['wrong issuer', { ...accessClaims, iss: 'https://another.example/oidc' }, 'at+jwt'],
    ['wrong audience', { ...accessClaims, aud: 'another-api' }, 'at+jwt'],
    ['missing client identity', { ...accessClaims, client_id: undefined }, 'at+jwt'],
    ['missing access type', accessClaims, undefined],
    ['ID token type at API audience', accessClaims, 'JWT'],
    ['unknown purpose', { ...accessClaims, purpose: 'unknown' }, 'at+jwt'],
    [
      'workspace device recipient',
      {
        sub: 'workspace-123',
        purpose: 'workspace-device-connect',
        workspace_id: 'workspace-123',
        iat: now,
        exp: now + 300,
      },
      undefined,
    ],
    [
      'internal call recipient',
      { sub: 'user-123', purpose: 'orvilo-internal-call', iat: now, exp: now + 300 },
      undefined,
    ],
  ])('rejects %s before yielding API user identity', async (_, payload, typ) => {
    await expect(validateOIDCJWT(await sign(payload, typ))).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('preserves the current sandbox producer and rejects another recipient using its purpose', async () => {
    await expect(validateOIDCJWT(await signUserJWT('user-123'))).resolves.toMatchObject({
      userId: 'user-123',
    });
    await expect(
      validateOIDCJWT(await sign({ ...accessClaims, purpose: 'cli-sandbox' }, 'at+jwt')),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('accepts the current operation producer only for an explicit operation caller', async () => {
    const token = await signHeteroOperationJWT({
      capabilities: ['hetero:finish'],
      operationId: 'operation-123',
      userId: 'user-123',
    });
    await expect(validateOIDCJWT(token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(validateOIDCJWT(token, { allowHeteroOperation: true })).resolves.toMatchObject({
      userId: 'user-123',
    });
    await expect(
      validateOIDCJWT(
        await sign({ sub: 'user-123', purpose: 'hetero-operation', iat: now, exp: now + 300 }),
        { allowHeteroOperation: true },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      validateOIDCJWT(await sign({ ...accessClaims, purpose: 'hetero-operation' }), {
        allowHeteroOperation: true,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('preserves real JOSE expiration errors and rejects an unrelated signing key', async () => {
    await expect(
      validateOIDCJWT(await sign({ ...accessClaims, exp: now - 30 }, 'at+jwt')),
    ).rejects.toMatchObject({ cause: { code: 'ERR_JWT_EXPIRED' }, code: 'UNAUTHORIZED' });
    const other = await generateKeyPair('RS256');
    await expect(
      validateOIDCJWT(await sign(accessClaims, 'at+jwt', other.privateKey)),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('does not wrap JWKS infrastructure failures as unauthorized', async () => {
    authEnv.JWKS_KEY = JSON.stringify({ keys: [] });
    const error = await validateOIDCJWT('header.payload.signature').catch(
      (error_: unknown) => error_,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TRPCError);
  });
});
