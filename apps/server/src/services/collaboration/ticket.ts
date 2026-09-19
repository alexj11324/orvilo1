import { randomUUID } from 'node:crypto';

import {
  COLLABORATION_TICKET_AUDIENCE,
  COLLABORATION_TICKET_ISSUER,
  COLLABORATION_TICKET_PURPOSE,
  type RoomTicketClaims,
} from '@orvilo/types';
import { importJWK, jwtVerify, SignJWT } from 'jose';

/**
 * Room tickets reuse the repo's internal-JWT key pair (JWKS_KEY, RS256) with a
 * distinct purpose + audience, so a collaboration ticket can never be
 * replayed as a hetero-operation or device token, and vice versa. The gateway
 * verifies signature + claims only — the ticket IS the room grant, which is
 * why its TTL stays short and `authorize` re-checks on every mint.
 *
 * `process.env.JWKS_KEY` is read lazily (not via the authEnv module) so the
 * service can be imported in contexts where the auth env isn't configured —
 * signing simply fails at call time there.
 */
const getJwksKey = () => {
  const jwksString = process.env.JWKS_KEY;
  if (!jwksString) throw new Error('JWKS_KEY environment variable is not set');

  const jwks = JSON.parse(jwksString);
  const rsaKey = jwks.keys.find((key: any) => key.alg === 'RS256' && key.kty === 'RSA');
  if (!rsaKey) throw new Error('No RS256 RSA key found in JWKS');
  return rsaKey;
};

const getSigningKey = async () => {
  const rsaKey = getJwksKey();
  return { key: await importJWK(rsaKey, 'RS256'), kid: rsaKey.kid as string };
};

const getVerificationKey = async () => {
  const rsaKey = getJwksKey();
  const publicKeyJwk = {
    alg: rsaKey.alg,
    e: rsaKey.e,
    kid: rsaKey.kid,
    kty: rsaKey.kty,
    n: rsaKey.n,
    use: rsaKey.use,
  };
  Object.keys(publicKeyJwk).forEach(
    (key) => (publicKeyJwk as any)[key] === undefined && delete (publicKeyJwk as any)[key],
  );
  return importJWK(publicKeyJwk, 'RS256');
};

export const ROOM_TICKET_TTL_SECONDS = 120;

/**
 * Mint a short-lived, single-room ticket. `claims` arrives fully
 * server-derived (actor from session, authzVersion from the membership row) —
 * nothing in here trusts client input.
 */
export const signRoomTicket = async (
  claims: RoomTicketClaims,
  ttlSeconds = ROOM_TICKET_TTL_SECONDS,
): Promise<{ expiresAt: number; token: string }> => {
  const { key, kid } = await getSigningKey();

  const token = await new SignJWT({
    actor: claims.actor,
    ...(claims.authzVersion !== undefined ? { authz_version: claims.authzVersion } : {}),
    ...(claims.projectId !== undefined ? { project_id: claims.projectId } : {}),
    purpose: COLLABORATION_TICKET_PURPOSE,
    room: claims.room,
    workspace_id: claims.workspaceId,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(COLLABORATION_TICKET_ISSUER)
    .setAudience(COLLABORATION_TICKET_AUDIENCE)
    .setSubject(claims.actor.id)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);

  return { expiresAt: Date.now() + ttlSeconds * 1000, token };
};

export interface VerifiedRoomTicket extends RoomTicketClaims {
  connectionKey: string;
  expiresAt: number;
  userId: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isActor = (value: unknown): value is RoomTicketClaims['actor'] =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  ['human', 'agent', 'system'].includes(value.kind as string);

/**
 * Verify a ticket's signature and claims. Returns null on any failure — the
 * gateway treats an invalid ticket exactly like a missing one.
 */
export const verifyRoomTicket = async (token: string): Promise<VerifiedRoomTicket | null> => {
  try {
    const publicKey = await getVerificationKey();
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['RS256'],
      audience: COLLABORATION_TICKET_AUDIENCE,
      issuer: COLLABORATION_TICKET_ISSUER,
    });

    if (
      payload.purpose !== COLLABORATION_TICKET_PURPOSE ||
      typeof payload.sub !== 'string' ||
      typeof payload.room !== 'string' ||
      typeof payload.workspace_id !== 'string' ||
      !isActor(payload.actor) ||
      (payload.authz_version !== undefined && typeof payload.authz_version !== 'number') ||
      (payload.project_id !== undefined && typeof payload.project_id !== 'string') ||
      typeof payload.jti !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    return {
      actor: {
        id: payload.actor.id,
        kind: payload.actor.kind,
        ...(payload.actor.avatar ? { avatar: payload.actor.avatar } : {}),
        ...(payload.actor.color ? { color: payload.actor.color } : {}),
        ...(payload.actor.name ? { name: payload.actor.name } : {}),
        ...(payload.actor.onBehalfOfUserId
          ? { onBehalfOfUserId: payload.actor.onBehalfOfUserId }
          : {}),
      },
      authzVersion: payload.authz_version as number | undefined,
      connectionKey: payload.jti,
      expiresAt: payload.exp * 1000,
      projectId: payload.project_id as string | undefined,
      room: payload.room,
      userId: payload.sub,
      workspaceId: payload.workspace_id,
    };
  } catch {
    return null;
  }
};

export const GATEWAY_PUBLISH_PURPOSE = 'collaboration-gateway-publish' as const;

/**
 * Short-lived proof that a publisher is this deployment's server side — the
 * outbox worker signs one per publish batch; the gateway accepts only this
 * purpose for its `/internal/publish` hook.
 */
export const signGatewayPublishToken = async (ttlSeconds = 30): Promise<string> => {
  const { key, kid } = await getSigningKey();
  return new SignJWT({ purpose: GATEWAY_PUBLISH_PURPOSE })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(COLLABORATION_TICKET_ISSUER)
    .setAudience(COLLABORATION_TICKET_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
};
