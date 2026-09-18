// @vitest-environment node
import { exportJWK, generateKeyPair, type KeyLike, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { GATEWAY_PUBLISH_PURPOSE, verifyPublishToken, verifyRoomTicket } from '../ticket';

let privateKey: KeyLike;
let kid: string;

const signTicket = async (
  claims: Record<string, unknown>,
  options: { audience?: string; expiresIn?: string; issuer?: string } = {},
) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(options.issuer ?? 'urn:lobehub:internal')
    .setAudience(options.audience ?? 'urn:orvilo:collaboration-gateway')
    .setSubject('user-1')
    .setJti('jti-1')
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '60s')
    .sign(privateKey);

const validClaims = {
  actor: { id: 'user-1', kind: 'human', name: 'Ada' },
  purpose: 'collaboration-room',
  room: 'task:task-1',
  workspace_id: 'ws-1',
};

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.privateKey);
  jwk.alg = 'RS256';
  jwk.kid = 'test-key';
  kid = 'test-key';
  process.env.JWKS_KEY = JSON.stringify({ keys: [jwk] });
});

describe('verifyRoomTicket', () => {
  it('round-trips a valid ticket into gateway claims', async () => {
    const token = await signTicket(validClaims);
    const ticket = await verifyRoomTicket(token);

    expect(ticket).toMatchObject({
      actor: { id: 'user-1', kind: 'human', name: 'Ada' },
      room: 'task:task-1',
      userId: 'user-1',
      workspaceId: 'ws-1',
    });
    expect(ticket?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects a tampered payload', async () => {
    const token = await signTicket(validClaims);
    const [header, payload, signature] = token.split('.');
    const forged = { ...JSON.parse(Buffer.from(payload, 'base64url').toString()), room: 'task:evil' };
    const tampered = `${header}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`;

    expect(await verifyRoomTicket(tampered)).toBeNull();
  });

  it('rejects a ticket for a different audience', async () => {
    const token = await signTicket(validClaims, { audience: 'urn:orvilo:other' });
    expect(await verifyRoomTicket(token)).toBeNull();
  });

  it('rejects an expired ticket', async () => {
    const token = await signTicket(validClaims, { expiresIn: '-1s' });
    expect(await verifyRoomTicket(token)).toBeNull();
  });

  it('rejects a wrong-purpose token', async () => {
    const token = await signTicket({ ...validClaims, purpose: GATEWAY_PUBLISH_PURPOSE });
    expect(await verifyRoomTicket(token)).toBeNull();
  });
});

describe('verifyPublishToken', () => {
  it('accepts the publish purpose and rejects room tickets', async () => {
    const publishToken = await signTicket({ purpose: GATEWAY_PUBLISH_PURPOSE });
    expect(await verifyPublishToken(publishToken)).toBe(true);

    const roomTicket = await signTicket(validClaims);
    expect(await verifyPublishToken(roomTicket)).toBe(false);
  });
});
