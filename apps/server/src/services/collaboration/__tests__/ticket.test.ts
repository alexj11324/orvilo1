import { generateKeyPair, exportJWK } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signRoomTicket, verifyRoomTicket } from '../ticket';

const ORIGINAL_JWKS = process.env.JWKS_KEY;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  const jwk = { ...privateJwk, ...publicJwk, alg: 'RS256', kid: 'test-collab-key', kty: 'RSA' };
  process.env.JWKS_KEY = JSON.stringify({ keys: [jwk] });
});

afterAll(() => {
  if (ORIGINAL_JWKS === undefined) delete process.env.JWKS_KEY;
  else process.env.JWKS_KEY = ORIGINAL_JWKS;
});

const claims = {
  actor: { color: '#1677ff', id: 'user-1', kind: 'human' as const, name: 'Ada' },
  authzVersion: 3,
  room: 'task:task_1',
  workspaceId: 'ws-1',
};

describe('room tickets', () => {
  it('signs and verifies a ticket roundtrip', async () => {
    const { token, expiresAt } = await signRoomTicket(claims);
    expect(typeof token).toBe('string');
    expect(expiresAt).toBeGreaterThan(Date.now());

    const verified = await verifyRoomTicket(token);
    expect(verified).not.toBeNull();
    expect(verified?.room).toBe('task:task_1');
    expect(verified?.workspaceId).toBe('ws-1');
    expect(verified?.userId).toBe('user-1');
    expect(verified?.actor).toMatchObject({ id: 'user-1', kind: 'human', name: 'Ada' });
    expect(verified?.authzVersion).toBe(3);
  });

  it('rejects a tampered ticket', async () => {
    const { token } = await signRoomTicket(claims);
    const [head, payload, signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), room: 'workspace:ws-evil' }),
    ).toString('base64url');
    const forged = `${head}.${forgedPayload}.${signature}`;
    expect(await verifyRoomTicket(forged)).toBeNull();
  });

  it('rejects garbage and empty tokens', async () => {
    expect(await verifyRoomTicket('not-a-jwt')).toBeNull();
    expect(await verifyRoomTicket('')).toBeNull();
  });

  it('rejects a token signed by a different key', async () => {
    const { token } = await signRoomTicket(claims);

    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = {
      ...(await exportJWK(privateKey)),
      ...(await exportJWK(publicKey)),
      alg: 'RS256',
      kid: 'other-key',
      kty: 'RSA',
    };
    process.env.JWKS_KEY = JSON.stringify({ keys: [jwk] });

    expect(await verifyRoomTicket(token)).toBeNull();
  });
});
