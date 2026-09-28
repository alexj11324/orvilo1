// @vitest-environment node
import { exportJWK, generateKeyPair } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';

import { gatewayConnectUrl } from '../roomPublisher';
import { CollaborationService } from '../service';
import { verifyRoomTicket } from '../ticket';

const ORIGINAL_JWKS = process.env.JWKS_KEY;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = {
    ...(await exportJWK(privateKey)),
    ...(await exportJWK(publicKey)),
    alg: 'RS256',
    kid: 'test-collab-service-key',
    kty: 'RSA',
  };
  process.env.JWKS_KEY = JSON.stringify({ keys: [jwk] });
});

afterAll(() => {
  if (ORIGINAL_JWKS === undefined) delete process.env.JWKS_KEY;
  else process.env.JWKS_KEY = ORIGINAL_JWKS;
});

describe('gatewayConnectUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('prefers the public URL, then the internal URL', () => {
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', 'wss://gw.example.com/collab');
    vi.stubEnv('COLLABORATION_GATEWAY_URL', 'http://gateway-internal:3012');
    expect(gatewayConnectUrl()).toBe('wss://gw.example.com/collab');

    // An empty-string env counts as unset, not as a URL — and the internal
    // http publish base is never dialable by browsers, so it fails closed.
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', '');
    expect(gatewayConnectUrl()).toBeNull();
  });

  it('falls back to localhost only in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', '');
    vi.stubEnv('COLLABORATION_GATEWAY_URL', '');
    expect(gatewayConnectUrl()).toBe('ws://localhost:3012/collaboration');
  });

  it('returns null when unconfigured outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', '');
    vi.stubEnv('COLLABORATION_GATEWAY_URL', '');
    expect(gatewayConnectUrl()).toBeNull();
  });
});

describe('CollaborationService.authorize', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('fails closed when no gateway is configured', async () => {
    // Regression: the old localhost fallback would mint a ticket that sends a
    // production browser to a WebSocket on the user's own machine. The check
    // precedes any authz work, so the stub db is never touched.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', '');
    vi.stubEnv('COLLABORATION_GATEWAY_URL', '');
    const service = new CollaborationService({} as OrviloDatabase, 'user-1', 'ws-1');
    await expect(service.authorize({ id: 'ws-1', scope: 'workspace' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: 'collaboration gateway not configured',
    });
  });

  it('signs a hidden human preference into the room ticket', async () => {
    vi.stubEnv('COLLABORATION_GATEWAY_PUBLIC_URL', 'wss://gateway.example/collaboration');
    let selectCall = 0;
    const db = {
      query: {
        workspaceMembers: {
          findFirst: vi.fn(async () => ({ authzVersion: 4, role: 'member' })),
        },
      },
      select: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  limit: async () => [{ primaryOwnerId: 'owner-1', role: 'member' }],
                }),
              }),
            }),
          };
        }
        return {
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  avatar: null,
                  fullName: 'Hidden User',
                  preference: {
                    collaborationVisibilityEpoch: 'hidden-epoch',
                    showInCollaboration: false,
                  },
                },
              ],
            }),
          }),
        };
      }),
    } as unknown as OrviloDatabase;

    const authorization = await new CollaborationService(db, 'user-1', 'ws-1').authorize({
      id: 'ws-1',
      scope: 'workspace',
    });

    await expect(verifyRoomTicket(authorization.token)).resolves.toMatchObject({
      presenceVisible: false,
      presenceVisibilityEpoch: 'hidden-epoch',
      userId: 'user-1',
    });
  });
});
