import { randomBytes, randomUUID } from 'node:crypto';

import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { githubUserConnections } from '@/database/schemas/githubOAuth';
import type { OrviloDatabase } from '@/database/type';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

import {
  createPkce,
  exchangeCode,
  getConfig,
  getGitHubUser,
  GitHubOAuthTokenError,
  refreshToken,
} from './provider';
import { consumeState, saveState } from './state';

const REFRESH_SKEW_MS = 60_000;
const REFRESH_LEASE_MS = 120_000;

const expiresAt = (seconds: number | undefined): Date | null =>
  seconds ? new Date(Date.now() + seconds * 1000) : null;

const decrypt = async (ciphertext: string): Promise<string> => {
  const result = await (await KeyVaultsGateKeeper.initWithEnvKey()).decrypt(ciphertext);
  if (!result.wasAuthentic || !result.plaintext)
    throw new Error('GitHub credential is unavailable');
  return result.plaintext;
};

export const startGitHubOAuth = async (userId: string): Promise<string> => {
  const config = getConfig();
  const state = randomBytes(32).toString('base64url');
  const { verifier, challenge } = createPkce();
  await saveState(state, {
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    userId,
    verifier,
  });
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
};

export const completeGitHubOAuth = async (input: {
  code: string;
  db: OrviloDatabase;
  sessionUserId: string;
  state: string;
}): Promise<void> => {
  const payload = await consumeState(input.state);
  if (!payload) throw new Error('Invalid or expired OAuth state');
  if (!input.sessionUserId || input.sessionUserId !== payload.userId) {
    throw new Error('GitHub OAuth session does not match authorization owner');
  }
  const config = getConfig();
  if (payload.clientId !== config.clientId || payload.redirectUri !== config.redirectUri) {
    throw new Error('GitHub OAuth configuration changed');
  }
  const tokens = await exchangeCode({
    code: input.code,
    verifier: payload.verifier,
    redirectUri: payload.redirectUri,
  });
  const user = await getGitHubUser(tokens.access_token);
  const grantRevision = randomUUID();
  const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
  const accessTokenCiphertext = await gateKeeper.encrypt(tokens.access_token);
  const refreshTokenCiphertext = tokens.refresh_token
    ? await gateKeeper.encrypt(tokens.refresh_token)
    : null;
  const accessTokenExpiresAt = expiresAt(tokens.expires_in);
  const refreshTokenExpiresAt = expiresAt(tokens.refresh_token_expires_in);
  await input.db
    .insert(githubUserConnections)
    .values({
      userId: payload.userId,
      clientId: config.clientId,
      githubUserId: user.id,
      grantRevision,
      login: user.login,
      avatarUrl: user.avatarUrl,
      accessTokenCiphertext,
      refreshTokenCiphertext,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    })
    .onConflictDoUpdate({
      target: githubUserConnections.userId,
      set: {
        clientId: config.clientId,
        githubUserId: user.id,
        grantRevision,
        login: user.login,
        avatarUrl: user.avatarUrl,
        accessTokenCiphertext,
        refreshTokenCiphertext,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        tokenVersion: sql`${githubUserConnections.tokenVersion} + 1`,
        refreshOwner: null,
        refreshLeaseUntil: null,
        updatedAt: new Date(),
      },
    });
};

export const getGitHubOAuthStatus = async (input: { db: OrviloDatabase; userId: string }) => {
  const [row] = await input.db
    .select({
      clientId: githubUserConnections.clientId,
      login: githubUserConnections.login,
      avatarUrl: githubUserConnections.avatarUrl,
      grantRevision: githubUserConnections.grantRevision,
      accessTokenExpiresAt: githubUserConnections.accessTokenExpiresAt,
      refreshTokenCiphertext: githubUserConnections.refreshTokenCiphertext,
      refreshTokenExpiresAt: githubUserConnections.refreshTokenExpiresAt,
    })
    .from(githubUserConnections)
    .where(eq(githubUserConnections.userId, input.userId))
    .limit(1);
  if (!row || row.clientId !== getConfig().clientId) return { connected: false as const };
  if (
    row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt.getTime() <= Date.now() &&
    (!row.refreshTokenCiphertext ||
      (row.refreshTokenExpiresAt && row.refreshTokenExpiresAt.getTime() <= Date.now()))
  )
    return { connected: false as const };
  return {
    connected: true as const,
    login: row.login,
    avatarUrl: row.avatarUrl ?? undefined,
    grantRevision: row.grantRevision,
  };
};

export const disconnectGitHubOAuth = async (input: { db: OrviloDatabase; userId: string }) => {
  await input.db
    .delete(githubUserConnections)
    .where(eq(githubUserConnections.userId, input.userId));
};

/** Returns plaintext only inside the server process; never expose this through tRPC. */
export const getValidGitHubAccessToken = async (input: {
  db: OrviloDatabase;
  userId: string;
}): Promise<string | null> => {
  const [row] = await input.db
    .select()
    .from(githubUserConnections)
    .where(eq(githubUserConnections.userId, input.userId))
    .limit(1);
  if (!row) return null;
  if (row.clientId !== getConfig().clientId) return null;
  if (
    !row.accessTokenExpiresAt ||
    row.accessTokenExpiresAt.getTime() > Date.now() + REFRESH_SKEW_MS
  ) {
    return decrypt(row.accessTokenCiphertext);
  }
  if (
    !row.refreshTokenCiphertext ||
    (row.refreshTokenExpiresAt && row.refreshTokenExpiresAt.getTime() <= Date.now())
  ) {
    return null;
  }

  const owner = randomUUID();
  const [claimed] = await input.db
    .update(githubUserConnections)
    .set({
      refreshOwner: owner,
      refreshLeaseUntil: new Date(Date.now() + REFRESH_LEASE_MS),
    })
    .where(
      and(
        eq(githubUserConnections.userId, input.userId),
        eq(githubUserConnections.tokenVersion, row.tokenVersion),
        or(
          isNull(githubUserConnections.refreshLeaseUntil),
          lt(githubUserConnections.refreshLeaseUntil, new Date()),
        ),
      ),
    )
    .returning({ userId: githubUserConnections.userId });
  if (!claimed) {
    // Another worker owns the one-use refresh token. Give it a short window
    // to publish the rotated pair, then read its result instead of failing a
    // concurrent review request against credentials that are still valid.
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const [latest] = await input.db
        .select()
        .from(githubUserConnections)
        .where(eq(githubUserConnections.userId, input.userId))
        .limit(1);
      if (!latest) return null;
      if (latest.tokenVersion !== row.tokenVersion) {
        if (latest.clientId !== getConfig().clientId) return null;
        if (
          !latest.accessTokenExpiresAt ||
          latest.accessTokenExpiresAt.getTime() > Date.now() + REFRESH_SKEW_MS
        )
          return decrypt(latest.accessTokenCiphertext);
        return null;
      }
      if (!latest.refreshOwner) break;
    }
    throw new Error('GitHub token refresh is in progress');
  }

  try {
    const tokens = await refreshToken(await decrypt(row.refreshTokenCiphertext));
    const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
    const [saved] = await input.db
      .update(githubUserConnections)
      .set({
        accessTokenCiphertext: await gateKeeper.encrypt(tokens.access_token),
        accessTokenExpiresAt: expiresAt(tokens.expires_in),
        refreshTokenCiphertext: tokens.refresh_token
          ? await gateKeeper.encrypt(tokens.refresh_token)
          : row.refreshTokenCiphertext,
        refreshTokenExpiresAt: tokens.refresh_token_expires_in
          ? expiresAt(tokens.refresh_token_expires_in)
          : row.refreshTokenExpiresAt,
        tokenVersion: row.tokenVersion + 1,
        refreshOwner: null,
        refreshLeaseUntil: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(githubUserConnections.userId, input.userId),
          eq(githubUserConnections.tokenVersion, row.tokenVersion),
          eq(githubUserConnections.refreshOwner, owner),
        ),
      )
      .returning({ userId: githubUserConnections.userId });
    if (!saved) throw new Error('GitHub credential changed during refresh');
    return tokens.access_token;
  } catch (error) {
    // Only a grant-level rejection proves the user's authorization is gone.
    // A bare 401 here is a client-authentication failure (misconfigured or
    // rotating app secret) — deleting the row would force every connected
    // user to re-authorize once the app config recovers.
    if (
      error instanceof GitHubOAuthTokenError &&
      (error.code === 'invalid_grant' || error.code === 'bad_refresh_token')
    ) {
      await input.db
        .delete(githubUserConnections)
        .where(
          and(
            eq(githubUserConnections.userId, input.userId),
            eq(githubUserConnections.tokenVersion, row.tokenVersion),
            eq(githubUserConnections.refreshOwner, owner),
          ),
        );
      return null;
    }
    await input.db
      .update(githubUserConnections)
      .set({ refreshOwner: null, refreshLeaseUntil: null })
      .where(
        and(
          eq(githubUserConnections.userId, input.userId),
          eq(githubUserConnections.refreshOwner, owner),
        ),
      );
    throw error;
  }
};
