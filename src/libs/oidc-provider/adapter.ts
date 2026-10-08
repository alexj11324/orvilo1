import { type OrviloDatabase } from '@orvilo/database';
import {
  oidcAccessTokens,
  oidcAuthorizationCodes,
  oidcClients,
  oidcDeviceCodes,
  oidcGrants,
  oidcInteractions,
  oidcRefreshTokens,
  oidcSessions,
} from '@orvilo/database/schemas';
import debug from 'debug';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { errors } from 'oidc-provider';

// Create adapter logging namespace
const log = debug('orvilo-oidc:adapter');

class OIDCAdapter {
  private db: OrviloDatabase;
  private name: string;

  constructor(name: string, db: OrviloDatabase) {
    log('[%s] Constructor called with name: %s', name, name);

    this.name = name;
    this.db = db;
  }

  /**
   * Get the corresponding database table based on model name
   */
  private getTable() {
    log('Getting table for model: %s', this.name);
    switch (this.name) {
      case 'AccessToken': {
        return oidcAccessTokens;
      }
      case 'AuthorizationCode': {
        return oidcAuthorizationCodes;
      }
      case 'RefreshToken': {
        return oidcRefreshTokens;
      }
      case 'DeviceCode': {
        return oidcDeviceCodes;
      }
      case 'ClientCredentials': {
        return oidcAccessTokens;
      } // Use the same table
      case 'Client': {
        return oidcClients;
      }
      case 'InitialAccessToken': {
        return oidcAccessTokens;
      } // Use the same table
      case 'RegistrationAccessToken': {
        return oidcAccessTokens;
      } // Use the same table
      case 'Interaction': {
        return oidcInteractions;
      }
      case 'ReplayDetection': {
        log('ReplayDetection - no persistent storage needed');
        return null;
      } // No persistent storage needed
      case 'PushedAuthorizationRequest': {
        return oidcAuthorizationCodes;
      } // Use the same table
      case 'Grant': {
        return oidcGrants;
      }
      case 'Session': {
        return oidcSessions;
      }
      default: {
        const error = `Unsupported model: ${this.name}`;
        log('ERROR: %s', error);
        throw new Error(error);
      }
    }
  }

  /**
   * Create or update model instance
   */
  async upsert(id: string, payload: any, expiresIn: number): Promise<void> {
    const table = this.getTable();
    if (!table) {
      log('[%s] upsert - No table for model, returning early', this.name);
      return;
    }

    if (this.name === 'Client') {
      // Special handling for client model, directly use the passed data
      log('[Client] Upserting client record');
      try {
        await this.db
          .insert(table)
          .values({
            applicationType: payload.application_type,
            clientSecret: payload.client_secret,
            clientUri: payload.client_uri,
            description: payload.description,
            grants: payload.grant_types || [],
            id,
            isFirstParty: !!payload.isFirstParty,
            logoUri: payload.logo_uri,
            name: payload.name,
            policyUri: payload.policy_uri,
            redirectUris: payload.redirectUris || [],
            responseTypes: payload.response_types || [],
            scopes: Array.isArray(payload.scopes)
              ? payload.scopes
              : payload.scope
                ? payload.scope.split(' ')
                : [],
            tokenEndpointAuthMethod: payload.token_endpoint_auth_method,
            tosUri: payload.tos_uri,
          } as any)
          .onConflictDoUpdate({
            set: {
              applicationType: payload.application_type,
              clientSecret: payload.clientSecret,
              clientUri: payload.client_uri,
              description: payload.description,
              grants: payload.grant_types || [],
              isFirstParty: !!payload.isFirstParty,
              logoUri: payload.logo_uri,
              name: payload.name,
              policyUri: payload.policy_uri,
              redirectUris: payload.redirectUris || [],
              responseTypes: payload.response_types || [],
              scopes: payload.scope ? payload.scope.split(' ') : [],
              tokenEndpointAuthMethod: payload.token_endpoint_auth_method,
              tosUri: payload.tos_uri,
            } as any,
            target: (table as any).id,
          });
      } catch (error) {
        console.error('[OIDC Adapter] Client upsert failed');
        throw error;
      }
      return;
    }

    // For other models, save complete data and metadata
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
    log('[%s] expiresAt set to: %s', this.name, expiresAt ? expiresAt.toISOString() : 'undefined');

    const record: Record<string, any> = {
      data: payload,
      expiresAt,
      id,
    };

    // Add specific fields
    if (payload.accountId) {
      record.userId = payload.accountId;
    } else {
      try {
        const { getUserAuth } = await import('@orvilo/utils/server');
        try {
          const { userId } = await getUserAuth();
          if (userId) {
            // For DeviceCode, only set record.userId (DB column) without modifying payload.
            // oidc-provider uses payload.accountId to track authorization state:
            // it's unset during inFlight stage and set only after consent completes.
            // Injecting accountId into payload would cause the token endpoint to
            // mistake an in-flight code as fully authorized.
            if (this.name !== 'DeviceCode') {
              payload.accountId = userId;
            }
            record.userId = userId;
            log('[%s] Setting userId from auth context: %s', this.name, userId);
          }
        } catch {
          // If getting userId fails, continue processing without throwing error
        }
      } catch {
        // If importing module fails, continue processing without throwing error
      }
    }

    if (payload.clientId) {
      record.clientId = payload.clientId;
    }

    if (payload.grantId) {
      record.grantId = payload.grantId;
    }

    if (this.name === 'DeviceCode' && payload.userCode) {
      record.userCode = payload.userCode;
    }

    try {
      log('[%s] Executing upsert DB operation', this.name);

      await this.db
        .insert(table)
        .values(record as any)
        .onConflictDoUpdate({
          set: {
            data: payload,
            expiresAt,
            ...(payload.accountId ? { userId: payload.accountId } : {}),
            ...(payload.clientId ? { clientId: payload.clientId } : {}),
            ...(payload.grantId ? { grantId: payload.grantId } : {}),
            ...(this.name === 'DeviceCode' && payload.userCode
              ? { userCode: payload.userCode }
              : {}),
          } as any,
          target: (table as any).id,
        });

      if (this.name === 'AccessToken' || this.name === 'DeviceCode') {
        this.stampClientLastUsed(payload.clientId);
      }
    } catch (error) {
      console.error(`[OIDC Adapter] Error upserting ${this.name}:`);
      throw error;
    }
  }

  private stampClientLastUsed(clientId?: string): void {
    if (!clientId || !clientId.startsWith('lca_')) return;

    // last_used_at is a best-effort UX signal for user-created OAuth clients;
    // a failed stamp must never break token issuance, so swallow all errors.
    void this.db
      .update(oidcClients)
      .set({ lastUsedAt: new Date() })
      .where(eq(oidcClients.id, clientId))
      .then(undefined, () => {
        console.error('[OIDC Adapter] Client usage stamp failed');
      });
  }

  /**
   * Find model instance
   */
  async find(id: string): Promise<any> {
    const table = this.getTable();
    if (!table) {
      log('[%s] find - No table for model, returning undefined', this.name);
      return undefined;
    }

    try {
      log('[%s] Executing find DB query', this.name);
      const result = await this.db
        .select()
        .from(table)
        .where(eq((table as any).id, id))
        .limit(1);

      if (!result || result.length === 0) {
        return undefined;
      }

      const model = result[0] as any;

      // Special handling for client model
      if (this.name === 'Client') {
        if (model.enabled === false) {
          return undefined;
        }
        log('[Client] Converting client record to expected format');
        const clientMetadata: Record<string, any> = {
          application_type: model.applicationType,
          client_id: model.id,
          client_secret: model.clientSecret,
          client_uri: model.clientUri,
          grant_types: model.grants,
          isFirstParty: model.isFirstParty,
          logo_uri: model.logoUri,
          policy_uri: model.policyUri,
          redirect_uris: model.redirectUris,
          response_types: model.responseTypes,
          scope: model.scopes.join(' '),
          token_endpoint_auth_method: model.tokenEndpointAuthMethod,
          tos_uri: model.tosUri,
        };
        // oidc-provider's client schema treats any non-undefined value as "provided" and
        // rejects null for optional string fields (`must be a non-empty string if provided`),
        // so nullable DB columns must be stripped instead of passed through.
        for (const key of Object.keys(clientMetadata)) {
          if (clientMetadata[key] === null || clientMetadata[key] === undefined)
            delete clientMetadata[key];
        }
        return clientMetadata;
      }

      // If record has expired, return undefined
      if (model.expiresAt && new Date() > new Date(model.expiresAt)) {
        log('[%s] Record expired (expiresAt: %s), returning undefined', this.name, model.expiresAt);
        return undefined;
      }

      if (model.consumedAt) {
        // The SDK must see consumed refresh tokens to detect replay and revoke their grant.
        if (this.name === 'RefreshToken') {
          return {
            ...model.data,
            consumed: Math.floor(new Date(model.consumedAt).getTime() / 1000),
          };
        }
        return undefined;
      }

      log('[%s] Successfully found and returning record data', this.name);
      return model.data;
    } catch {
      console.error(`[OIDC Adapter] Error finding ${this.name}:`);
      return undefined;
    }
  }

  /**
   * Find model instance by userCode (only for device flow)
   */
  async findByUserCode(userCode: string): Promise<any> {
    if (this.name !== 'DeviceCode') {
      const error = 'findByUserCode can only be used for DeviceCode model';
      log('ERROR: %s', error);
      throw new Error(error);
    }

    try {
      const result = await this.db
        .select()
        .from(oidcDeviceCodes)
        .where(eq(oidcDeviceCodes.userCode, userCode))
        .limit(1);

      if (!result || result.length === 0) {
        return undefined;
      }

      const model = result[0];

      // If record has expired or been consumed, return undefined
      if (model.expiresAt && new Date() > new Date(model.expiresAt)) {
        log('[DeviceCode] Record expired (expiresAt: %s), returning undefined', model.expiresAt);
        return undefined;
      }

      if (model.consumedAt) {
        log(
          '[DeviceCode] Record already consumed (consumedAt: %s), returning undefined',
          model.consumedAt,
        );
        return undefined;
      }

      return model.data;
    } catch {
      console.error('[OIDC Adapter] Error finding DeviceCode by userCode:');
      return undefined;
    }
  }

  /**
   * Find interaction instance by uid
   */
  async findByUid(uid: string): Promise<any> {
    const table = this.getTable();
    if (this.name === 'Session') {
      try {
        const jsonbUidEq = sql`${(table as any).data}->>'uid' = ${uid}`;
        // @ts-ignore
        const results = await this.db.select().from(table).where(jsonbUidEq).limit(1);

        if (!results || results.length === 0) {
          return undefined;
        }

        const model = results[0] as any;
        // Check expiration
        if (model.expiresAt && model.expiresAt < new Date()) {
          await this.destroy(model.id); // Still use primary key id for deletion
          return undefined;
        }

        return model.data;
      } catch {
        console.error(`[OIDC Adapter] Error finding Session by uid:`);
      }
    }
    // Reuse find method implementation
    log('[Interaction] Delegating to find() method');
    return this.find(uid);
  }

  /**
   * Find session by user ID
   * Used for session pre-synchronization
   */
  async findSessionByUserId(userId: string): Promise<any> {
    log('[%s] findSessionByUserId called - userId: %s', this.name, userId);

    if (this.name !== 'Session') {
      log('[%s] findSessionByUserId - Not a Session model, returning undefined', this.name);
      return undefined;
    }

    const table = this.getTable();
    if (!table) {
      log('[%s] findSessionByUserId - No table for model, returning undefined', this.name);
      return undefined;
    }

    try {
      log('[%s] Executing findSessionByUserId DB query', this.name);
      const result = await this.db
        .select()
        .from(table)
        .where(eq((table as any).userId, userId))
        .limit(1);

      if (!result || result.length === 0) {
        log('[%s] No session found for userId: %s', this.name, userId);
        return undefined;
      }

      return (result[0] as { data: any }).data;
    } catch {
      console.error(`[OIDC Adapter] Error finding session by userId:`);
      return undefined;
    }
  }

  /**
   * Destroy model instance
   */
  async destroy(id: string): Promise<void> {
    const table = this.getTable();
    if (!table) {
      log('[%s] destroy - No table for model, returning early', this.name);
      return;
    }

    try {
      log('[%s] Executing destroy DB operation', this.name);
      await this.db.delete(table).where(eq((table as any).id, id));
    } catch (error) {
      console.error(`[OIDC Adapter] Error destroying ${this.name}:`);
      throw error;
    }
  }

  /**
   * Mark model instance as consumed
   */
  async consume(id: string): Promise<void> {
    const table = this.getTable();
    if (!table) {
      log('[%s] consume - No table for model, returning early', this.name);
      return;
    }

    if (this.name === 'RefreshToken') {
      const [consumed] = await this.db
        .update(oidcRefreshTokens)
        .set({ consumedAt: new Date() })
        .where(and(eq(oidcRefreshTokens.id, id), isNull(oidcRefreshTokens.consumedAt)))
        .returning({ id: oidcRefreshTokens.id });
      if (!consumed) {
        const [token] = await this.db
          .select({ grantId: oidcRefreshTokens.grantId })
          .from(oidcRefreshTokens)
          .where(eq(oidcRefreshTokens.id, id))
          .limit(1);
        if (token?.grantId) {
          await this.db.delete(oidcGrants).where(eq(oidcGrants.id, token.grantId));
          await this.revokeByGrantId(token.grantId);
        }
        throw new errors.InvalidGrant('refresh token already used');
      }
      return;
    }

    try {
      log('[%s] Executing consume DB operation', this.name);
      await this.db
        .update(table)
        // @ts-ignore
        .set({ consumedAt: new Date() })
        .where(eq((table as any).id, id));
    } catch (error) {
      console.error(`[OIDC Adapter] Error consuming ${this.name}:`);
      throw error;
    }
  }

  /**
   * Revoke all related model instances by grantId
   */
  async revokeByGrantId(grantId: string): Promise<void> {
    log('[%s] revokeByGrantId called', this.name);

    // Grants themselves don't need to be revoked by grantId
    if (this.name === 'Grant') {
      log('[Grant] revokeByGrantId skipped for Grant model, as it is the grant itself');
      return;
    }

    // Pre-check if model name is valid, even if table is not directly used later
    this.getTable();

    try {
      log('[%s] Starting transaction for revokeByGrantId operations', this.name);

      // Use transaction to delete all records containing grantId, ensuring atomicity
      await this.db.transaction(async (tx) => {
        // All tables that may contain grantId
        const tables = [
          oidcAccessTokens,
          oidcAuthorizationCodes,
          oidcRefreshTokens,
          oidcDeviceCodes,
        ];

        for (const table of tables) {
          if ('grantId' in table) {
            log('[%s] Revoking token family records', this.name);
            await tx.delete(table).where(eq((table as any).grantId, grantId));
          }
        }
      });

      log('[%s] Successfully completed token family revocation', this.name);
    } catch (error) {
      console.error(`[OIDC Adapter] Error in revokeByGrantId transaction:`);
      throw error;
    }
  }

  /**
   * Create adapter factory
   */
  static createAdapterFactory = (db: OrviloDatabase) => {
    log('Creating adapter factory with database instance');
    return (name: string) => new OIDCAdapter(name, db);
  };
}

export { OIDCAdapter as DrizzleAdapter };
