import querystring from 'node:querystring';
import { URL } from 'node:url';

import type { DataSyncConfig, DesktopBootstrapIdentity } from '@orvilo/electron-client-ipc';
import { safeStorage, session as electronSession } from 'electron';

import { OFFICIAL_CLOUD_SERVER } from '@/const/env';
import GatewayConnectionService from '@/services/gatewayConnectionSrv';
import { appendVercelCookie } from '@/utils/http-headers';
import { createLogger } from '@/utils/logger';
import { netFetch } from '@/utils/net-fetch';
import { setDesktopUserAgentHeader } from '@/utils/user-agent';

import { ControllerModule, IpcMethod } from './index';

/**
 * Non-retryable OIDC error codes
 * These errors indicate the refresh token is invalid and retry won't help
 */
const NON_RETRYABLE_OIDC_ERRORS = [
  'invalid_grant', // refresh token is invalid, expired, or revoked
  'invalid_client', // client configuration error
  'unauthorized_client', // client not authorized
  'access_denied', // user denied access
  'invalid_scope', // requested scope is invalid
];

/**
 * Deterministic failures that will never succeed on retry
 * These are permanent state issues that require user intervention
 */
const DETERMINISTIC_FAILURES = [
  'no refresh token available', // refresh token is missing from storage
  'remote server is not active or configured', // config is invalid or disabled
  'missing tokens in refresh response', // server returned incomplete response
];

// Create logger
const logger = createLogger('controllers:RemoteServerConfigCtr');

/**
 * Remote Server Configuration Controller
 * Used to manage custom remote Orvilo server configuration
 */
export default class RemoteServerConfigCtr extends ControllerModule {
  static override readonly groupName = 'remoteServer';
  /**
   * Key used to store encrypted tokens in electron-store.
   */
  private readonly encryptedTokensKey = 'encryptedTokens';

  /**
   * Normalize legacy config that used local storageMode.
   * Local mode has been removed; fall back to cloud.
   */
  private normalizeConfig = (config: DataSyncConfig): DataSyncConfig => {
    // Use type assertion to handle legacy 'local' value from stored data
    if ((config.storageMode as string) !== 'local') return config;

    const nextConfig: DataSyncConfig = {
      ...config,
      remoteServerUrl: config.remoteServerUrl || OFFICIAL_CLOUD_SERVER,
      storageMode: 'cloud',
    };

    this.app.storeManager.set('dataSyncConfig', nextConfig);

    return nextConfig;
  };

  /**
   * Get remote server configuration
   */
  @IpcMethod()
  async getRemoteServerConfig() {
    logger.debug('Getting remote server configuration');
    const { storeManager } = this.app;

    const config: DataSyncConfig = storeManager.get('dataSyncConfig');
    const normalized = this.normalizeConfig(config);

    logger.debug(
      `Remote server config: active=${normalized.active}, storageMode=${normalized.storageMode}, url=${normalized.remoteServerUrl}`,
    );

    return normalized;
  }

  /**
   * Check if remote server is properly configured and ready for use
   * For 'cloud' mode, only checks if active (remoteServerUrl is undefined, uses OFFICIAL_CLOUD_SERVER)
   * For 'selfHost' mode, checks if active AND remoteServerUrl is configured
   * @param config Optional config object, if not provided will fetch current config
   * @returns true if remote server is properly configured
   */
  @IpcMethod()
  async isRemoteServerConfigured(config?: DataSyncConfig): Promise<boolean> {
    const effectiveConfig = config ?? (await this.getRemoteServerConfig());
    const isActive = Boolean(effectiveConfig.active);
    const isSelfHostConfigured =
      effectiveConfig.storageMode !== 'selfHost' ||
      this.isValidSelfHostRemoteUrl(effectiveConfig.remoteServerUrl);

    return isActive && isSelfHostConfigured;
  }

  private isValidSelfHostRemoteUrl(remoteServerUrl?: string): boolean {
    if (!remoteServerUrl) return false;
    const normalizedUrl = remoteServerUrl.trim();

    if (!normalizedUrl) return false;

    try {
      const parsedUrl = new URL(normalizedUrl);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Set remote server configuration
   */
  @IpcMethod()
  async setRemoteServerConfig(config: Partial<DataSyncConfig>) {
    logger.info(
      `Setting remote server storageMode: active=${config.active}, storageMode=${config.storageMode}, url=${config.remoteServerUrl}`,
    );
    const { storeManager } = this.app;
    const prev: DataSyncConfig = storeManager.get('dataSyncConfig');

    // Save configuration with legacy local storage fallback
    const merged = this.normalizeConfig({ ...prev, ...config });
    storeManager.set('dataSyncConfig', merged);

    this.broadcastRemoteServerConfigUpdated();

    return true;
  }

  /**
   * Clear remote server configuration
   */
  @IpcMethod()
  async clearRemoteServerConfig() {
    logger.info('Clearing remote server configuration');
    const { storeManager } = this.app;

    this.loggingOut = true;
    let revocationFailed = false;
    try {
      // A refresh in flight may rotate the token; revoke the latest refresh token.
      if (this.refreshPromise) {
        const refresh = await this.refreshPromise;
        // A lost refresh response may leave an unknown rotated token on the server.
        revocationFailed = !refresh.success;
      }
      const refreshToken = await this.getRefreshToken();
      revocationFailed ||=
        !refreshToken &&
        Boolean(
          this.encryptedRefreshToken || storeManager.get(this.encryptedTokensKey)?.refreshToken,
        );
      if (refreshToken) {
        const remoteUrl = await this.getRemoteServerUrl();
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        appendVercelCookie(headers);
        setDesktopUserAgentHeader(headers);
        const response = await netFetch(new URL('/oidc/token/revocation', remoteUrl).toString(), {
          body: querystring.stringify({
            client_id: 'orvilo-desktop',
            token: refreshToken,
            token_type_hint: 'refresh_token',
          }),
          headers,
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
        });
        revocationFailed ||= !response.ok;
      }
    } catch {
      revocationFailed = true;
    } finally {
      try {
        storeManager.set('dataSyncConfig', { active: false, storageMode: 'cloud' });
        await this.clearTokens();
        this.broadcastRemoteServerConfigUpdated();
      } finally {
        this.loggingOut = false;
      }
    }
    if (revocationFailed) throw new Error('Local logout completed; remote grant revocation failed');

    return true;
  }

  private broadcastRemoteServerConfigUpdated() {
    logger.debug('Broadcasting remoteServerConfigUpdated event to all windows');
    this.app.browserManager.broadcastToAllWindows('remoteServerConfigUpdated', undefined);
  }

  /**
   * Encrypted tokens
   * Stored in memory for quick access, loaded from persistent storage on init.
   */
  private tokenEncoding: 'memory' | 'safeStorage' = 'safeStorage';

  private isProtectedStorageAvailable() {
    return (
      safeStorage.isEncryptionAvailable() &&
      safeStorage.getSelectedStorageBackend?.() !== 'basic_text'
    );
  }

  private readToken(token: string): string | null {
    if (this.tokenEncoding === 'memory') {
      if (
        this.isProtectedStorageAvailable() &&
        this.encryptedAccessToken &&
        this.encryptedRefreshToken
      ) {
        try {
          this.persistProtectedTokens(this.encryptedAccessToken, this.encryptedRefreshToken);
        } catch {
          logger.warn('Protected migration failed; existing credentials retained');
        }
      }
      return token;
    }
    if (!this.isProtectedStorageAvailable()) return null;
    try {
      return safeStorage.decryptString(Buffer.from(token, 'base64'));
    } catch {
      logger.error('Protected token could not be decrypted');
      return null;
    }
  }

  private encryptedAccessToken?: string;
  private encryptedRefreshToken?: string;

  /**
   * Token expiration time (timestamp in milliseconds)
   * Used for automatic token refresh
   */
  private tokenExpiresAt?: number;

  /**
   * Last token refresh time (timestamp in milliseconds)
   * Used to control refresh frequency on app startup/activate
   */
  private lastRefreshAt?: number;

  /**
   * Resolve the cache-partition identity synchronously for the renderer preload.
   * This deliberately avoids `getUserState()`: the encrypted OIDC token already
   * contains the stable subject required for local isolation.
   */
  getDesktopBootstrapIdentity(): DesktopBootstrapIdentity {
    if (!this.encryptedAccessToken) this.loadTokensFromStore();

    if (!this.encryptedAccessToken) return { isIdentityResolved: true };

    try {
      const accessToken = this.readToken(this.encryptedAccessToken);
      if (!accessToken) return { isIdentityResolved: false };
      const parts = accessToken.split('.');
      if (parts.length !== 3) return { isIdentityResolved: false };

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        sub?: unknown;
      };
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        return { isIdentityResolved: false };
      }

      return { isIdentityResolved: true, userId: payload.sub };
    } catch {
      logger.warn('Failed to resolve Desktop bootstrap identity from access token');
      return { isIdentityResolved: false };
    }
  }

  /**
   * Promise representing the ongoing token refresh operation.
   * Used to prevent concurrent refreshes and allow callers to wait.
   */
  private loggingOut = false;

  private refreshPromise: Promise<{ error?: string; success: boolean }> | null = null;

  /**
   * Encrypt and store tokens
   * @param accessToken Access token
   * @param refreshToken Refresh token
   * @param expiresIn Token expiration time in seconds (optional)
   */
  async saveTokens(accessToken: string, refreshToken: string, expiresIn?: number) {
    logger.info('Saving encrypted tokens');

    // Calculate expiration time if provided
    if (expiresIn) {
      this.tokenExpiresAt = Date.now() + expiresIn * 1000;
      logger.debug(`Token expires at: ${new Date(this.tokenExpiresAt).toISOString()}`);
    } else {
      this.tokenExpiresAt = undefined;
    }

    // Update last refresh time
    this.lastRefreshAt = Date.now();
    logger.debug(`Token last refreshed at: ${new Date(this.lastRefreshAt).toISOString()}`);

    if (!this.isProtectedStorageAvailable()) {
      logger.warn('Protected storage unavailable; credentials are memory-only');
      // A rotated memory-only pair supersedes any previously persisted refresh token.
      this.app.storeManager.delete(this.encryptedTokensKey);
      this.tokenEncoding = 'memory';
      this.encryptedAccessToken = accessToken;
      this.encryptedRefreshToken = refreshToken;
      return { persistent: false };
    }

    this.persistProtectedTokens(accessToken, refreshToken);
    return { persistent: true };
  }

  private persistProtectedTokens(accessToken: string, refreshToken: string) {
    const encryptedAccessToken = safeStorage.encryptString(accessToken);
    const encryptedRefreshToken = safeStorage.encryptString(refreshToken);
    if (
      safeStorage.decryptString(encryptedAccessToken) !== accessToken ||
      safeStorage.decryptString(encryptedRefreshToken) !== refreshToken
    ) {
      throw new Error('Protected credential verification failed');
    }
    const stored = {
      accessToken: Buffer.from(encryptedAccessToken).toString('base64'),
      encoding: 'safeStorage' as const,
      expiresAt: this.tokenExpiresAt,
      lastRefreshAt: this.lastRefreshAt,
      refreshToken: Buffer.from(encryptedRefreshToken).toString('base64'),
    };
    this.app.storeManager.set(this.encryptedTokensKey, stored);
    this.encryptedAccessToken = stored.accessToken;
    this.encryptedRefreshToken = stored.refreshToken;
    this.tokenEncoding = 'safeStorage';
  }

  /**
   * Get decrypted access token
   */
  async getAccessToken(): Promise<string | null> {
    // Try loading from memory first
    if (!this.encryptedAccessToken) {
      logger.debug('Access token not in memory, trying to load from store...');
      this.loadTokensFromStore(); // Attempt to load from persistent storage
    }

    if (!this.encryptedAccessToken) {
      logger.debug('No access token found in memory or store.');
      return null;
    }

    return this.readToken(this.encryptedAccessToken);
  }

  /**
   * Get decrypted refresh token
   */
  async getRefreshToken(): Promise<string | null> {
    // Try loading from memory first
    if (!this.encryptedRefreshToken) {
      logger.debug('Refresh token not in memory, trying to load from store...');
      this.loadTokensFromStore(); // Attempt to load from persistent storage
    }

    if (!this.encryptedRefreshToken) {
      logger.debug('No refresh token found in memory or store.');
      return null;
    }

    return this.readToken(this.encryptedRefreshToken);
  }

  /**
   * Clear tokens
   */
  async clearTokens() {
    logger.info('Clearing access and refresh tokens');
    this.encryptedAccessToken = undefined;
    this.encryptedRefreshToken = undefined;
    this.tokenExpiresAt = undefined;
    // Also clear from persistent storage
    logger.debug(`Deleting tokens from store key: ${this.encryptedTokensKey}`);
    this.app.storeManager.delete(this.encryptedTokensKey);

    // Disconnect gateway when tokens are cleared (logout / token refresh failure)
    const gatewaySrv = this.app.getService(GatewayConnectionService);
    if (gatewaySrv) {
      logger.debug('Disconnecting gateway due to token clear');
      await gatewaySrv.disconnect();
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiresAt(): number | undefined {
    return this.tokenExpiresAt;
  }

  /**
   * Check if token is expired or will expire soon
   * @param bufferTimeMs Buffer time in milliseconds (default 1 day)
   * @returns true if token is expired or will expire soon
   */
  isTokenExpiringSoon(bufferTimeMs: number = 24 * 60 * 60 * 1000): boolean {
    if (!this.tokenExpiresAt) {
      return false; // No expiration time available
    }

    const currentTime = Date.now();
    const bufferTime = this.tokenExpiresAt - bufferTimeMs;

    return currentTime >= bufferTime;
  }

  /**
   * Check if an error is non-retryable
   * Includes OIDC errors (e.g., invalid_grant) and deterministic failures
   * (e.g., missing refresh token, invalid config)
   * @param error Error message to check
   * @returns true if the error should not be retried
   */
  isNonRetryableError(error?: string): boolean {
    if (!error) return false;
    const lowerError = error.toLowerCase();

    // Check OIDC error codes
    if (NON_RETRYABLE_OIDC_ERRORS.some((code) => lowerError.includes(code))) {
      return true;
    }

    // Check deterministic failures that require user intervention
    if (DETERMINISTIC_FAILURES.some((msg) => lowerError.includes(msg))) {
      return true;
    }

    return false;
  }

  /**
   * Refresh the access token using the stored refresh token (single attempt).
   * Concurrent callers share the in-progress refresh promise.
   */
  async refreshAccessToken(): Promise<{ error?: string; success: boolean }> {
    if (this.loggingOut) return { error: 'Logout in progress', success: false };
    // If a refresh is already in progress, return the existing promise
    if (this.refreshPromise) {
      logger.debug('Token refresh already in progress, returning existing promise.');
      return this.refreshPromise;
    }

    logger.info('Initiating new token refresh operation.');

    // No retry: with refresh token rotation the server consumes the old token as soon
    // as the request lands. Resending it (e.g. after a lost response) triggers reuse
    // detection — invalid_grant + revocation of the whole grant — which logs the user
    // out. Transient failures are recovered by the next refresh cycle instead.
    this.refreshPromise = this.performTokenRefresh().finally(() => {
      logger.debug('Clearing the refresh promise reference.');
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  /**
   * Performs the actual token refresh logic.
   * This method is called by refreshAccessToken and wrapped in a promise.
   */
  private async performTokenRefresh(): Promise<{ error?: string; success: boolean }> {
    try {
      // Get configuration information
      const config = await this.getRemoteServerConfig();

      if (!(await this.isRemoteServerConfigured(config))) {
        logger.warn('Remote server not active or configured, skipping refresh.');
        return { error: 'Remote server is not active or configured', success: false };
      }

      // Get refresh token
      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) {
        logger.error('No refresh token available for refresh operation.');
        return { error: 'No refresh token available', success: false };
      }

      // Construct refresh request
      const remoteUrl = await this.getRemoteServerUrl(config);

      const tokenUrl = new URL('/oidc/token', remoteUrl);

      // Construct request body
      const body = querystring.stringify({
        client_id: 'orvilo-desktop',
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      logger.debug(`Sending token refresh request to ${tokenUrl.toString()}`);

      // Send request
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      appendVercelCookie(headers);
      setDesktopUserAgentHeader(headers);
      const response = await netFetch(tokenUrl.toString(), {
        body,
        headers,
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        // Try to parse error response
        const errorData = await response.json().catch(() => ({}));
        // Keep the OIDC code so AuthCtr can distinguish revoked grants from transient failures.
        const errorDetail = NON_RETRYABLE_OIDC_ERRORS.includes(errorData.error)
          ? errorData.error
          : 'oidc_error';
        const errorMessage =
          `Token refresh failed: ${response.status} ${response.statusText} ${errorDetail}`.trim();
        logger.error('Token refresh failed', { status: response.status, error: errorDetail });
        return { error: errorMessage, success: false };
      }

      // Parse response
      const data = await response.json();

      // Check if response contains necessary tokens
      if (!data.access_token || !data.refresh_token) {
        logger.error('Refresh response missing required tokens');
        return { error: 'Missing tokens in refresh response', success: false };
      }

      // Save new tokens
      logger.info('Token refresh successful, saving new tokens.');
      await this.saveTokens(data.access_token, data.refresh_token, data.expires_in);

      return { success: true };
    } catch {
      logger.error('Exception during token refresh operation');
      return { error: 'Exception occurred during token refresh', success: false };
    }
  }

  /**
   * Load encrypted tokens from persistent storage (electron-store) into memory.
   * This should be called during initialization or if memory tokens are missing.
   */
  private loadTokensFromStore() {
    logger.debug(`Attempting to load tokens from store key: ${this.encryptedTokensKey}`);
    const storedTokens = this.app.storeManager.get(this.encryptedTokensKey);

    if (storedTokens && storedTokens.accessToken && storedTokens.refreshToken) {
      logger.info('Successfully loaded tokens from store into memory.');
      // Legacy raw JWTs are recognizable; never interpret unknown ciphertext as raw.
      const legacyRaw = !storedTokens.encoding && storedTokens.accessToken.split('.').length === 3;
      this.tokenEncoding = legacyRaw ? 'memory' : 'safeStorage';
      this.encryptedAccessToken = storedTokens.accessToken;
      this.encryptedRefreshToken = storedTokens.refreshToken;
      this.tokenExpiresAt = storedTokens.expiresAt;
      this.lastRefreshAt = storedTokens.lastRefreshAt;
      if (
        !legacyRaw &&
        !storedTokens.encoding &&
        safeStorage.isEncryptionAvailable() &&
        safeStorage.getSelectedStorageBackend?.() === 'basic_text'
      ) {
        try {
          const accessToken = safeStorage.decryptString(
            Buffer.from(storedTokens.accessToken, 'base64'),
          );
          const refreshToken = safeStorage.decryptString(
            Buffer.from(storedTokens.refreshToken, 'base64'),
          );
          this.encryptedAccessToken = accessToken;
          this.encryptedRefreshToken = refreshToken;
          this.tokenEncoding = 'memory';
        } catch {
          logger.warn('Legacy token decryption failed; original retained');
        }
      }
      if (legacyRaw && this.isProtectedStorageAvailable()) {
        try {
          this.persistProtectedTokens(storedTokens.accessToken, storedTokens.refreshToken);
        } catch {
          logger.warn('Legacy token migration failed; original retained');
        }
      }

      if (this.tokenExpiresAt) {
        logger.debug(
          `Loaded token expiration time: ${new Date(this.tokenExpiresAt).toISOString()}`,
        );
      }
      if (this.lastRefreshAt) {
        logger.debug(`Loaded last refresh time: ${new Date(this.lastRefreshAt).toISOString()}`);
      }
    } else {
      logger.debug('No valid tokens found in store.');
    }
  }

  /**
   * Get the last token refresh time
   * @returns The timestamp (in milliseconds) of the last token refresh, or undefined if never refreshed
   */
  getLastTokenRefreshAt(): number | undefined {
    return this.lastRefreshAt;
  }

  // Initialize by loading tokens from store when the controller is ready
  // We might need a dedicated lifecycle method if constructor is too early for storeManager
  afterAppReady() {
    this.loadTokensFromStore();
  }

  async getRemoteServerUrl(config?: DataSyncConfig) {
    const dataConfig = this.normalizeConfig(config ?? (await this.getRemoteServerConfig()));

    return dataConfig.storageMode === 'cloud' ? OFFICIAL_CLOUD_SERVER : dataConfig.remoteServerUrl;
  }

  /**
   * Setup subscription webview session with OIDC token injection
   * This configures a webRequest interceptor on the given partition session
   * to automatically inject the Oidc-Auth token header for official domain requests.
   * @param params.partition The partition name for the webview session
   */
  @IpcMethod()
  async setupSubscriptionWebviewSession(params: { partition: string }) {
    const { partition } = params;

    logger.info(`Setting up subscription webview session for partition: ${partition}`);

    const session = electronSession.fromPartition(partition);

    session.webRequest.onBeforeSendHeaders(
      { urls: [`https://orvilo.aspectlylabs.com/*`, `https://*.orvilo.aspectlylabs.com/*`] },
      async (details, callback) => {
        const requestHeaders = { ...details.requestHeaders };

        const token = await this.getAccessToken();

        if (token) {
          requestHeaders['Oidc-Auth'] = token;
          logger.debug(`Injected Oidc-Auth token for: ${details.url}`);
        }
        setDesktopUserAgentHeader(requestHeaders);

        callback({ requestHeaders });
      },
    );

    logger.debug(`Subscription webview session setup completed for partition: ${partition}`);

    return { success: true };
  }
}
