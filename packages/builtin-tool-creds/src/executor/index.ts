import type { BuiltinToolContext, BuiltinToolResult } from '@orvilo/types';
import { BaseExecutor } from '@orvilo/types';
import debug from 'debug';

import { lambdaClient } from '@/libs/trpc/client';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/slices/auth/selectors';

import { CredsIdentifier } from '../manifest';
import type { InjectCredsToSandboxParams, SaveCredsParams } from '../types';
import { CredsApiName } from '../types';

const log = debug('orvilo-creds:executor');

class CredsExecutor extends BaseExecutor<typeof CredsApiName> {
  readonly identifier = CredsIdentifier;
  protected readonly apiEnum = CredsApiName;

  /**
   * Inject credentials to sandbox environment
   * Calls the SDK inject API to get decrypted credentials for sandbox injection.
   */
  injectCredsToSandbox = async (
    params: InjectCredsToSandboxParams,
    ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    try {
      // Get topicId from context (like cloud-sandbox does)
      const topicId = ctx?.topicId;
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

      // Get userId from user store (like cloud-sandbox does)
      const userId = userProfileSelectors.userId(useUserStore.getState());
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

      log('[CredsExecutor] injectCredsToSandbox - keys:', params.keys, 'topicId:', topicId);

      // Call the inject API with keys, topicId and userId from context
      const result = await lambdaClient.creds.inject.mutate({
        keys: params.keys,
        sandbox: true,
        topicId,
        userId,
      });

      const credentials = (result as any).credentials || {};
      const notFound = (result as any).notFound || [];
      const unsupportedInSandbox = (result as any).unsupportedInSandbox || [];

      log('[CredsExecutor] injectCredsToSandbox - result:', {
        envKeys: Object.keys(credentials.env || {}),
        filesCount: credentials.files?.length || 0,
        notFound,
        unsupportedInSandbox,
      });

      // Build response content
      const injectedKeys = params.keys.filter((k) => !notFound.includes(k));
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
      log('[CredsExecutor] injectCredsToSandbox - error:', error);
      return {
        content: `Failed to inject credentials: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: {
          message: error instanceof Error ? error.message : 'Failed to inject credentials',
          type: 'InjectCredentialsFailed',
        },
        success: false,
      };
    }
  };

  /**
   * Save new credentials
   */
  saveCreds = async (
    params: SaveCredsParams,
    _ctx?: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    try {
      // Normalize params: AI may send `displayName` instead of `name`,
      // or `value` (env-style string) instead of `values` (Record)
      const raw = params as any;
      const name: string = params.name || raw.displayName || params.key;

      let values: Record<string, string> = params.values;
      if (!values && typeof raw.value === 'string') {
        values = {};
        for (const line of (raw.value as string).split('\n')) {
          const idx = line.indexOf('=');
          if (idx > 0) {
            values[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
          }
        }
      }

      if (!values || Object.keys(values).length === 0) {
        return {
          content:
            'Failed to save credential: values must be a non-empty object of key-value pairs (e.g., { "API_KEY": "sk-xxx" }).',
          error: {
            message: 'values is empty or missing. Provide key-value pairs, not a raw string.',
            type: 'InvalidParams',
          },
          success: false,
        };
      }

      log('[CredsExecutor] saveCreds - key:', params.key, 'name:', name);

      await lambdaClient.creds.createKV.mutate({
        description: params.description,
        key: params.key,
        name,
        type: params.type as 'kv-env' | 'kv-header',
        values,
      });

      return {
        content: `Credential "${name}" saved successfully with key "${params.key}"`,
        state: {
          key: params.key,
          message: `Credential "${name}" saved successfully`,
          success: true,
        },
        success: true,
      };
    } catch (error) {
      log('[CredsExecutor] saveCreds - error:', error);
      return {
        content: `Failed to save credential: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: {
          message: error instanceof Error ? error.message : 'Failed to save credential',
          type: 'SaveCredentialFailed',
        },
        success: false,
      };
    }
  };
}

export const credsExecutor = new CredsExecutor();
