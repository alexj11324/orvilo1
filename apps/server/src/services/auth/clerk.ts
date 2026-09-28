import { type OrviloDatabase } from '@orvilo/database';
import debug from 'debug';
import { eq, or } from 'drizzle-orm';
import { createRemoteJWKSet, importSPKI, jwtVerify } from 'jose';

import { type UserItem, users } from '@/database/schemas';
import { authEnv } from '@/envs/auth';

import { UserService } from '../user';

const log = debug('orvilo-auth:clerk');

const DEFAULT_CLERK_API_URL = 'https://api.clerk.com';
const DEFAULT_CLERK_ISSUER = 'https://clerk.aspectlylabs.com';

export class ClerkAuthError extends Error {
  readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = 'ClerkAuthError';
    this.status = status;
  }
}

const clerkIssuer = () => (authEnv.CLERK_ISSUER || DEFAULT_CLERK_ISSUER).replace(/\/$/, '');

const authorizedParties = () =>
  (authEnv.CLERK_AUTHORIZED_PARTIES || '')
    .split(',')
    .map((party) => party.trim())
    .filter(Boolean);

let cachedJwtKey: CryptoKey | null = null;
let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const getVerificationKey = async (): Promise<CryptoKey | ReturnType<typeof createRemoteJWKSet>> => {
  // PEM-encoded public key from the Clerk dashboard enables fully offline
  // verification; otherwise pull the instance JWKS from the frontend API.
  if (authEnv.CLERK_JWT_KEY) {
    if (!cachedJwtKey) cachedJwtKey = await importSPKI(authEnv.CLERK_JWT_KEY, 'RS256');
    return cachedJwtKey;
  }
  if (!remoteJwks)
    remoteJwks = createRemoteJWKSet(new URL(`${clerkIssuer()}/.well-known/jwks.json`));
  return remoteJwks;
};

export type ClerkSessionClaims = {
  sessionId: string;
  userId: string;
};

/** Verify a Clerk session JWT (`__session` cookie / `getToken()` output). */
export const verifyClerkSessionToken = async (token: string): Promise<ClerkSessionClaims> => {
  let payload;
  try {
    const result = await jwtVerify(token, await getVerificationKey(), {
      issuer: clerkIssuer(),
    });
    payload = result.payload;
  } catch (error) {
    log('Session token signature/claims rejected: %O', error);
    throw new ClerkAuthError('Invalid Clerk session token');
  }

  const parties = authorizedParties();
  if (parties.length > 0) {
    const azp = typeof payload.azp === 'string' ? payload.azp : '';
    if (!parties.includes(azp)) {
      log('Rejected token from unauthorized party: %s', azp);
      throw new ClerkAuthError('Token azp is not an authorized party');
    }
  }

  if (typeof payload.sub !== 'string' || !payload.sub)
    throw new ClerkAuthError('Token is missing sub');
  if (typeof payload.sid !== 'string' || !payload.sid)
    throw new ClerkAuthError('Token is missing sid');
  if (payload.sts === 'pending') throw new ClerkAuthError('Session has pending tasks');

  return { sessionId: payload.sid, userId: payload.sub };
};

interface ClerkApiSession {
  actor?: unknown;
  expire_at?: number;
  id: string;
  status: string;
  user_id: string;
}

export interface ClerkApiUser {
  banned?: boolean;
  created_at?: number;
  email_addresses?: { email_address: string; id: string; verification?: { status?: string } }[];
  external_accounts?: {
    email_address?: string;
    provider?: string;
    provider_user_id?: string;
  }[];
  first_name?: string | null;
  id: string;
  image_url?: string;
  last_name?: string | null;
  locked?: boolean;
  password_enabled?: boolean;
  primary_email_address_id?: string | null;
  username?: string | null;
}

const clerkApiFetch = async <T>(path: string): Promise<T> => {
  const secretKey = authEnv.CLERK_SECRET_KEY;
  if (!secretKey) throw new ClerkAuthError('CLERK_SECRET_KEY is not configured', 500);

  const apiUrl = (authEnv.CLERK_API_URL || DEFAULT_CLERK_API_URL).replace(/\/$/, '');
  const response = await fetch(`${apiUrl}/v1/${path}`, {
    headers: { authorization: `Bearer ${secretKey}` },
  });
  if (!response.ok) {
    log('Backend API %s responded %d', path, response.status);
    throw new ClerkAuthError(`Clerk Backend API error: ${response.status}`, 502);
  }
  return (await response.json()) as T;
};

/** Belt-and-suspenders session check against the Clerk Backend API. */
export const assertClerkSessionActive = async (claims: ClerkSessionClaims) => {
  const session = await clerkApiFetch<ClerkApiSession>(`sessions/${claims.sessionId}`);
  if (session.id !== claims.sessionId || session.user_id !== claims.userId)
    throw new ClerkAuthError('Session does not match token claims');
  if (session.status !== 'active') throw new ClerkAuthError('Clerk session is not active');
  if (session.actor) throw new ClerkAuthError('Impersonated sessions cannot be exchanged');
};

const primaryEmail = (user: ClerkApiUser) => {
  const emails = user.email_addresses ?? [];
  return emails.find((entry) => entry.id === user.primary_email_address_id) ?? emails[0];
};

export const assertClerkUserUsable = (user: ClerkApiUser) => {
  if (user.banned || user.locked) throw new ClerkAuthError('User is banned or locked', 403);
  const email = primaryEmail(user);
  if (!email?.email_address) throw new ClerkAuthError('User has no email address');
};

/**
 * Map the Clerk user onto the `users` row, creating it (and running the new-user
 * bootstrap) on first sign-in. Identity fields (id, email) track Clerk; display
 * fields are only filled when empty so in-app edits survive.
 *
 * Accounts created before the Clerk switch carry a non-Clerk `users.id`, so the
 * lookup falls back to the (normalized) email and keeps that row's id — the row
 * is referenced by user data all over the schema, and re-keying it would orphan
 * it. Clerk's id never lands on the migrated row; every later sign-in re-takes
 * the email path.
 */
export const provisionClerkUser = async (
  db: OrviloDatabase,
  clerkUser: ClerkApiUser,
): Promise<UserItem> => {
  const email = primaryEmail(clerkUser);
  const emailVerified = email?.verification?.status === 'verified';
  const fullName =
    [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(' ').trim() || null;
  const normalizedEmail = email?.email_address?.toLowerCase() ?? null;

  const existing =
    (await db.query.users.findFirst({ where: eq(users.id, clerkUser.id) })) ??
    (normalizedEmail || email?.email_address
      ? await db.query.users.findFirst({
          where: or(
            normalizedEmail ? eq(users.normalizedEmail, normalizedEmail) : undefined,
            email?.email_address ? eq(users.email, email.email_address) : undefined,
          ),
        })
      : undefined);
  if (!existing) {
    const [created] = await db
      .insert(users)
      .values({
        avatar: clerkUser.image_url || null,
        clerkCreatedAt: clerkUser.created_at ? new Date(clerkUser.created_at) : null,
        email: email?.email_address ?? null,
        emailVerified,
        emailVerifiedAt: emailVerified ? new Date() : null,
        fullName,
        id: clerkUser.id,
        normalizedEmail: email?.email_address?.toLowerCase() ?? null,
        username: clerkUser.username || null,
      })
      .returning();

    const userService = new UserService(db);
    await userService.initUser({
      createdAt: created.createdAt,
      email: created.email,
      firstName: clerkUser.first_name ?? null,
      id: created.id,
      lastName: clerkUser.last_name ?? null,
      username: clerkUser.username ?? null,
    });

    return created;
  }

  const patch: Partial<typeof existing> = {};
  if (email?.email_address && existing.email !== email.email_address) {
    patch.email = email.email_address;
    patch.normalizedEmail = email.email_address.toLowerCase();
    patch.emailVerified = emailVerified;
    if (emailVerified && !existing.emailVerifiedAt) patch.emailVerifiedAt = new Date();
  }
  if (!existing.fullName && fullName) patch.fullName = fullName;
  if (!existing.avatar && clerkUser.image_url) patch.avatar = clerkUser.image_url;
  if (!existing.username && clerkUser.username) patch.username = clerkUser.username;
  if (!existing.emailVerified && emailVerified) {
    patch.emailVerified = true;
    patch.emailVerifiedAt = new Date();
  }
  if (!existing.clerkCreatedAt && clerkUser.created_at) {
    patch.clerkCreatedAt = new Date(clerkUser.created_at);
  }

  if (Object.keys(patch).length > 0) {
    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  return existing;
};

/** Fetch a Clerk user, rejecting banned/locked/email-less accounts. */
export const fetchClerkUser = async (userId: string): Promise<ClerkApiUser> => {
  const user = await clerkApiFetch<ClerkApiUser>(`users/${userId}`);
  assertClerkUserUsable(user);
  return user;
};
