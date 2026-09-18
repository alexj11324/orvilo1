import {
  COLLABORATION_TICKET_AUDIENCE,
  COLLABORATION_TICKET_ISSUER,
  COLLABORATION_TICKET_PURPOSE,
  type CollaborationActor,
} from '@orvilo/types';
import { importJWK, jwtVerify } from 'jose';

/**
 * Verified room-ticket claims as the gateway consumes them. The ticket IS the
 * room grant — the gateway never re-queries the app database; everything it
 * needs to trust a connection is in the signed claims.
 */
export interface GatewayTicket {
  actor: CollaborationActor;
  authzVersion?: number;
  /** Absolute expiry (ms epoch) from the JWT `exp` claim. */
  expiresAt: number;
  /** JWT id — unique per mint, used to correlate logs without payloads. */
  jti: string;
  /**
   * Project the room's resource belongs to (project rooms and their task
   * rooms). Project-scoped kicks match on this claim; tickets minted before
   * the claim existed simply lack it and die at expiry.
   */
  projectId?: string;
  /** Wire room key (`{scope}:{id}`) the ticket was minted for. */
  room: string;
  userId: string;
  workspaceId: string;
}

/**
 * Same key source as the server's internal JWTs: `JWKS_KEY` holds the RSA
 * keypair JWK; verification needs only the public components.
 */
const getVerificationKey = async () => {
  const jwksString = process.env.JWKS_KEY;
  if (!jwksString) throw new Error('JWKS_KEY environment variable is not set');

  const jwks = JSON.parse(jwksString);
  const rsaKey = jwks.keys.find((key: any) => key.alg === 'RS256' && key.kty === 'RSA');
  if (!rsaKey) throw new Error('No RS256 RSA key found in JWKS');

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isActor = (value: unknown): value is CollaborationActor =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  ['human', 'agent', 'system'].includes(value.kind as string);

/**
 * Signature + claim verification for client room tickets. Any failure → null;
 * an invalid ticket is indistinguishable from a missing one to clients.
 */
export const verifyRoomTicket = async (token: string): Promise<GatewayTicket | null> => {
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
      expiresAt: payload.exp * 1000,
      jti: payload.jti,
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
 * Guard for `/internal/*` hooks: only the deployment's own server side can
 * sign the `collaboration-gateway-publish` purpose (it holds the private key).
 */
export const verifyPublishToken = async (token: string): Promise<boolean> => {
  try {
    const publicKey = await getVerificationKey();
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['RS256'],
      audience: COLLABORATION_TICKET_AUDIENCE,
      issuer: COLLABORATION_TICKET_ISSUER,
    });
    return payload.purpose === GATEWAY_PUBLISH_PURPOSE;
  } catch {
    return false;
  }
};
