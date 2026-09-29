import { CredsIdentifier, type ICredsService } from '@orvilo/builtin-tool-creds';
import { CredsExecutionRuntime } from '@orvilo/builtin-tool-creds/executionRuntime';
import debug from 'debug';

import { UserModel } from '@/database/models/user';
import { WorkspaceMemberModel } from '@/database/models/workspaceMember';
import { OwnCredsService } from '@/server/services/creds';
import { MarketService } from '@/server/services/market';

import { type ServerRuntimeRegistration } from './types';

const log = debug('orvilo-server:creds-runtime');

/**
 * Server-side Creds Service implementation
 * Wraps OwnCredsService (Orvilo's own credentials store) to provide the
 * ICredsService interface. The MarketService is still held for the pieces that
 * stay on Market by design: the OAuth connect broker and the sandbox runtime
 * `inject` writes into.
 */
export class ServerCredsService implements ICredsService {
  private credsService: OwnCredsService;
  private marketService: MarketService;
  private workspaceId?: string;

  private isShareVisitor: boolean;

  constructor(
    credsService: OwnCredsService,
    marketService: MarketService,
    workspaceId?: string,
    /**
     * Belt-and-braces guard: true for an Agent Share visitor's run
     * (`context.agentShareVisitor` set). `orvilo-creds` is already absent from
     * `AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS`, so this runtime should never
     * be constructed for a visitor in the first place — but `injectCreds`
     * refuses again here too, so the guarantee that the creator's decrypted
     * credentials never land in a sandbox a visitor controls doesn't rest on
     * the allowlist alone.
     */
    isShareVisitor = false,
  ) {
    this.credsService = credsService;
    this.marketService = marketService;
    this.workspaceId = workspaceId;
    this.isShareVisitor = isShareVisitor;
  }

  async getByKey(
    key: string,
    options?: { decrypt?: boolean },
  ): Promise<{
    fileName?: string;
    fileUrl?: string;
    name?: string;
    plaintext?: Record<string, string>;
    type: string;
    values?: Record<string, string>;
  }> {
    log('getByKey: key=%s, decrypt=%s', key, options?.decrypt);

    const result = await this.credsService.getByKey(key, { decrypt: options?.decrypt });
    if (!result) {
      throw new Error(`Credential not found: ${key}`);
    }

    log('getByKey success: key=%s, id=%s', key, result.id);

    return {
      fileName: result.fileName,
      name: result.name,
      plaintext: result.plaintext,
      type: result.type,
      values: result.plaintext,
    };
  }

  async getOAuthAuthorizeUrl(
    provider: string,
    redirectUri: string,
  ): Promise<{
    authorizeUrl: string;
  }> {
    log('getOAuthAuthorizeUrl: provider=%s', provider);

    const response = await this.marketService.market.connect.authorize(provider, {
      redirect_uri: redirectUri,
    });

    return {
      authorizeUrl: response.authorize_url,
    };
  }

  async getOAuthConnectionStatus(provider: string): Promise<{
    connected: boolean;
  }> {
    log('getOAuthConnectionStatus: provider=%s', provider);

    const response = await this.marketService.market.connect.getStatus(provider);

    return {
      connected: response.connected,
    };
  }

  async injectCreds(params: {
    keys: string[];
    sandbox?: boolean;
    topicId: string;
    userId: string;
  }): Promise<{
    credentials?: {
      env?: Record<string, string>;
      files?: Array<{ filename: string; key: string; path: string }>;
    };
    notFound?: string[];
    success: boolean;
    unsupportedInSandbox?: string[];
  }> {
    log('injectCreds: keys=%O, topicId=%s', params.keys, params.topicId);

    // Refuse before any resolution or sandbox write: injection writes the
    // creator's REAL credentials into the sandbox's ~/.creds/env, so for a
    // share visitor the only safe place to stop is here.
    if (this.isShareVisitor) {
      throw new Error(
        'Credential injection into the sandbox is unavailable in shared conversations.',
      );
    }

    const result = await this.credsService.inject({
      keys: params.keys,
      sandbox: params.sandbox,
      topicId: params.topicId,
    });

    log('injectCreds success: notFound=%d', result.notFound?.length || 0);

    return result as any;
  }

  async listCreds(): Promise<{
    data?: Array<{ id: string; key: string }>;
  }> {
    log('listCreds');

    const result = await this.credsService.list();

    log('listCreds success: %d credentials', result.data?.length || 0);

    return result;
  }

  async saveKVCred(params: {
    description?: string;
    key: string;
    name: string;
    type: 'kv-env' | 'kv-header';
    values: Record<string, string>;
  }): Promise<{ id: string }> {
    log('saveKVCred: key=%s, name=%s, type=%s', params.key, params.name, params.type);

    const result = await this.credsService.createKV({
      ...params,
      workspaceScope: Boolean(this.workspaceId),
    });

    log('saveKVCred success: id=%s', result.id);

    return result;
  }
}

/**
 * Creds Server Runtime
 * Per-request runtime (needs userId, topicId)
 */
export const credsRuntime: ServerRuntimeRegistration = {
  factory: async (context) => {
    if (!context.userId) {
      throw new Error('userId is required for Creds execution');
    }

    if (!context.serverDB) {
      throw new Error('serverDB is required for Creds execution');
    }

    if (context.workspaceId) {
      const membership = await new WorkspaceMemberModel(context.serverDB, context.userId).getMember(
        context.workspaceId,
        context.userId,
      );
      if (!membership) {
        throw new Error('Workspace membership is required for workspace Creds execution');
      }
    }

    log(
      'Creating CredsExecutionRuntime for userId=%s, topicId=%s, workspaceId=%s',
      context.userId,
      context.topicId,
      context.workspaceId,
    );

    // Read market accessToken from DB so the OAuth connect broker + the
    // sandbox provider inside `inject` can authenticate; credential data
    // itself comes from the Orvilo DB.
    let accessToken: string | undefined;
    try {
      const userModel = new UserModel(context.serverDB, context.userId);
      const settings = await userModel.getUserSettings();
      accessToken = (settings?.market as any)?.accessToken;
    } catch {
      // non-fatal — MarketService will fall back to trustedClientToken
    }

    const marketService = new MarketService({
      accessToken,
      userInfo: { userId: context.userId, workspaceId: context.workspaceId },
    });

    const ownCredsService = new OwnCredsService({
      marketService,
      serverDB: context.serverDB,
      userId: context.userId,
      workspaceId: context.workspaceId,
    });

    const credsService = new ServerCredsService(
      ownCredsService,
      marketService,
      context.workspaceId,
      Boolean(context.agentShareVisitor),
    );

    return new CredsExecutionRuntime(credsService, {
      topicId: context.topicId,
      userId: context.userId,
    });
  },
  identifier: CredsIdentifier,
};
