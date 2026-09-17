import { randomUUID } from 'node:crypto';

import { LinearSyncModel } from '@/database/models/linearSync';
import type { LobeChatDatabase } from '@/database/type';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

import {
  getLinearOAuthConfig,
  LinearOAuthError,
  normalizeLinearScopes,
  refreshLinearAccessToken,
} from './oauth';

const EXPIRY_SKEW_MS = 60_000;
const REFRESH_LEASE_MS = 120_000;

export interface LinearCredentialGateKeeper {
  decrypt: (ciphertext: string) => Promise<{ plaintext: string; wasAuthentic?: boolean }>;
  encrypt: (plaintext: string) => Promise<string>;
}

export class LinearTokenRefreshInProgressError extends Error {
  constructor() {
    super('Linear installation token refresh is already owned by another worker');
    this.name = 'LinearTokenRefreshInProgressError';
  }
}

export class LinearInstallationCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinearInstallationCredentialError';
  }
}

export interface LinearInstallationAuthOptions {
  gateKeeper?: LinearCredentialGateKeeper;
  now?: () => number;
  refresh?: typeof refreshLinearAccessToken;
}

const expiresAfter = (expiresAt: Date | null, now: number) =>
  Boolean(expiresAt && expiresAt.getTime() - EXPIRY_SKEW_MS > now);

export class LinearInstallationAuth {
  private readonly model: LinearSyncModel;
  private readonly now: () => number;
  private readonly refresh: typeof refreshLinearAccessToken;
  private gateKeeperPromise: Promise<LinearCredentialGateKeeper> | undefined;

  constructor(
    db: LobeChatDatabase,
    private readonly workspaceId: string,
    private readonly installationId: string,
    options: LinearInstallationAuthOptions = {},
  ) {
    this.model = new LinearSyncModel(db, workspaceId);
    this.now = options.now ?? Date.now;
    this.refresh = options.refresh ?? refreshLinearAccessToken;
    if (options.gateKeeper) this.gateKeeperPromise = Promise.resolve(options.gateKeeper);
  }

  private getGateKeeper = async () => {
    this.gateKeeperPromise ??= KeyVaultsGateKeeper.initWithEnvKey();
    return this.gateKeeperPromise;
  };

  private decrypt = async (ciphertext: string, kind: 'access' | 'refresh'): Promise<string> => {
    const result = await (await this.getGateKeeper()).decrypt(ciphertext);
    if (result.wasAuthentic === false || !result.plaintext) {
      throw new LinearInstallationCredentialError(`Linear ${kind} token could not be decrypted`);
    }
    return result.plaintext;
  };

  private markRefreshFailure = async (error: unknown): Promise<never> => {
    const status = error instanceof LinearOAuthError ? error.status : undefined;
    const invalidGrant = error instanceof LinearOAuthError && error.errorCode === 'invalid_grant';
    const message = error instanceof Error ? error.message : 'Linear token refresh failed';
    if (invalidGrant || status === 401) {
      await this.model.markInstallationUnavailable(this.installationId, {
        message,
        reason: 'refresh_token_revoked',
        status: 'revoked',
      });
    } else if (status === 403) {
      // A provider-level forbidden response is a confirmed permission loss;
      // keep it distinct from a transient refresh transport failure.
      await this.model.markInstallationUnavailable(this.installationId, {
        message,
        reason: 'refresh_permission_denied',
        status: 'error',
      });
    }
    // Network errors, response loss, 5xx responses, and other unknown
    // failures deliberately leave the installation active. The caller has
    // already released the fenced refresh lease, so the durable worker can
    // retry the same refresh token during Linear's replay grace period.
    throw error;
  };

  async getAccessToken(): Promise<string> {
    const config = getLinearOAuthConfig();
    const installation = await this.model.findInstallationForAuth(this.installationId);
    if (!installation || installation.workspaceId !== this.workspaceId) {
      throw new LinearInstallationCredentialError('Linear installation not found');
    }
    if (installation.status !== 'active') {
      throw new LinearInstallationCredentialError(
        `Linear installation is ${installation.status} and cannot authenticate`,
      );
    }
    if (installation.actor !== 'app' || installation.oauthClientId !== config.clientId) {
      await this.model.markInstallationUnavailable(this.installationId, {
        message: 'Linear installation app identity no longer matches server configuration',
        reason: 'oauth_client_mismatch',
        status: 'error',
      });
      throw new LinearInstallationCredentialError('Linear installation app identity is invalid');
    }

    if (!installation.accessTokenCiphertext) {
      throw new LinearInstallationCredentialError('Linear installation has no access token');
    }

    const accessToken = await this.decrypt(installation.accessTokenCiphertext, 'access');
    const now = this.now();
    if (expiresAfter(installation.accessTokenExpiresAt, now)) return accessToken;

    if (!installation.refreshTokenCiphertext) {
      await this.model.markInstallationUnavailable(this.installationId, {
        message: 'Linear installation has no refresh token',
        reason: 'refresh_token_missing',
        status: 'error',
      });
      throw new LinearInstallationCredentialError('Linear installation has no refresh token');
    }
    const refreshToken = await this.decrypt(installation.refreshTokenCiphertext, 'refresh');
    const owner = randomUUID();
    const claim = await this.model.claimTokenRefresh(
      this.installationId,
      installation.tokenVersion,
      owner,
      REFRESH_LEASE_MS,
    );

    if (!claim) {
      const latest = await this.model.findInstallationForAuth(this.installationId);
      if (
        latest?.status === 'active' &&
        latest.tokenVersion !== installation.tokenVersion &&
        latest.accessTokenCiphertext &&
        expiresAfter(latest.accessTokenExpiresAt, this.now())
      ) {
        return this.decrypt(latest.accessTokenCiphertext, 'access');
      }
      throw new LinearTokenRefreshInProgressError();
    }

    let tokens;
    try {
      tokens = await this.refresh({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken,
      });
    } catch (error) {
      await this.model.releaseTokenRefresh(this.installationId, owner, claim.refreshFence);
      return this.markRefreshFailure(error);
    }

    const rotatedRefreshToken = tokens.refresh_token ?? refreshToken;
    const gateKeeper = await this.getGateKeeper();
    const persisted = await this.model.persistTokenRefresh({
      accessTokenCiphertext: await gateKeeper.encrypt(tokens.access_token),
      accessTokenExpiresAt: tokens.expires_in
        ? new Date(this.now() + tokens.expires_in * 1000)
        : null,
      expectedTokenVersion: installation.tokenVersion,
      id: this.installationId,
      owner,
      refreshFence: claim.refreshFence,
      refreshTokenCiphertext: await gateKeeper.encrypt(rotatedRefreshToken),
      scopes: normalizeLinearScopes(tokens.scope, installation.scopes),
    });
    if (!persisted) {
      await this.model.releaseTokenRefresh(this.installationId, owner, claim.refreshFence);
      throw new LinearTokenRefreshInProgressError();
    }
    return tokens.access_token;
  }

  async markProviderFailure(input: { message: string; status?: number }): Promise<void> {
    await this.model.markInstallationUnavailable(this.installationId, {
      message: input.message,
      reason: input.status === 401 ? 'provider_unauthorized' : 'provider_permission_denied',
      status: input.status === 401 ? 'revoked' : 'error',
    });
  }
}

export const createLinearInstallationAuth = (input: {
  db: LobeChatDatabase;
  installationId: string;
  options?: LinearInstallationAuthOptions;
  workspaceId: string;
}) => new LinearInstallationAuth(input.db, input.workspaceId, input.installationId, input.options);
