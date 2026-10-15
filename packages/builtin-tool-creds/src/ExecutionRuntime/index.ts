import type { BuiltinServerRuntimeOutput } from '@orvilo/types';

import type { InjectCredsToSandboxParams, SaveCredsParams } from '../types';

/**
 * Service interface for Credentials operations
 */
export interface ICredsService {
  /**
   * Inject credentials into sandbox
   */
  injectCreds: (params: {
    keys: string[];
    sandbox?: boolean;
    topicId: string;
    userId: string;
  }) => Promise<{
    credentials?: {
      env?: Record<string, string>;
      files?: Array<{ filename: string; key: string; path: string }>;
    };
    notFound?: string[];
    success: boolean;
    unsupportedInSandbox?: string[];
  }>;

  /**
   * List all user credentials
   */
  listCreds: () => Promise<{
    data?: Array<{ id: string; key: string }>;
  }>;

  /**
   * Save KV credential
   */
  saveKVCred: (params: {
    description?: string;
    key: string;
    name: string;
    type: 'kv-env' | 'kv-header';
    values: Record<string, string>;
  }) => Promise<{ id: string }>;
}

/**
 * Creds Execution Runtime (Server-side)
 *
 * This runtime executes creds tools via the injected ICredsService.
 * The service handles context (userId, topicId) internally.
 *
 * Uses direct service calls instead of the frontend tRPC client.
 */
export class CredsExecutionRuntime {
  private credsService: ICredsService;
  private context: { topicId?: string; userId?: string };

  constructor(credsService: ICredsService, context: { topicId?: string; userId?: string } = {}) {
    this.credsService = credsService;
    this.context = context;
  }

  /**
   * Inject credentials to sandbox environment
   */
  async injectCredsToSandbox(
    args: InjectCredsToSandboxParams,
  ): Promise<BuiltinServerRuntimeOutput> {
    try {
      const topicId = this.context.topicId;
      if (!topicId) {
        return {
          content: 'Cannot inject credentials: topicId is not available in the current context.',
          error: {
            message: 'topicId is required but not available',
            type: 'MissingTopicId',
          },
          success: false,
        };
      }

      const userId = this.context.userId;
      if (!userId) {
        return {
          content: 'Cannot inject credentials: user is not authenticated.',
          error: {
            message: 'userId is required but not available',
            type: 'MissingUserId',
          },
          success: false,
        };
      }

      const result = await this.credsService.injectCreds({
        keys: args.keys,
        sandbox: true,
        topicId,
        userId,
      });

      const credentials = result.credentials || {};
      const notFound = result.notFound || [];
      const unsupportedInSandbox = result.unsupportedInSandbox || [];

      // Build response content
      const injectedKeys = args.keys.filter((k) => !notFound.includes(k));
      let content = '';

      if (injectedKeys.length > 0) {
        content = `Credentials injected successfully: ${injectedKeys.join(', ')}.`;
      }

      if (notFound.length > 0) {
        content += ` Not found: ${notFound.join(', ')}. Please configure them in Settings > Credentials.`;
      }

      if (unsupportedInSandbox.length > 0) {
        content += ` Not supported in sandbox: ${unsupportedInSandbox.join(', ')}.`;
      }

      return {
        content: content.trim(),
        state: {
          credentials,
          injected: injectedKeys,
          notFound,
          success: notFound.length === 0,
          unsupportedInSandbox,
        },
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to inject credentials: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: {
          message: error instanceof Error ? error.message : 'Failed to inject credentials',
          type: 'InjectCredentialsFailed',
        },
        success: false,
      };
    }
  }

  /**
   * Save new credentials
   */
  async saveCreds(args: SaveCredsParams): Promise<BuiltinServerRuntimeOutput> {
    try {
      // Only support kv-env and kv-header types in server runtime
      // File upload requires frontend interaction
      if (args.type !== 'kv-env' && args.type !== 'kv-header') {
        return {
          content: `Credential type "${args.type}" is not supported in background execution. Only kv-env and kv-header types are supported.`,
          error: {
            message: `Unsupported credential type: ${args.type}`,
            type: 'UnsupportedCredentialType',
          },
          success: false,
        };
      }

      await this.credsService.saveKVCred({
        description: args.description,
        key: args.key,
        name: args.name,
        type: args.type,
        values: args.values,
      });

      return {
        content: `Credential "${args.name}" saved successfully with key "${args.key}"`,
        state: {
          key: args.key,
          message: `Credential "${args.name}" saved successfully`,
          success: true,
        },
        success: true,
      };
    } catch (error) {
      return {
        content: `Failed to save credential: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: {
          message: error instanceof Error ? error.message : 'Failed to save credential',
          type: 'SaveCredentialFailed',
        },
        success: false,
      };
    }
  }
}
