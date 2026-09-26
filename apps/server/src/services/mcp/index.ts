import { type DeploymentOption } from '@lobehub/market-sdk';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  type CheckMcpInstallResult,
  type CustomPluginMetadata,
  type OrviloPluginApi,
  type ToolManifest,
  type ToolManifestSettings,
} from '@orvilo/types';
import { safeParseJSON } from '@orvilo/utils';
import { TRPCError } from '@trpc/server';
import retry from 'async-retry';
import debug from 'debug';

import {
  type MCPClientParams,
  type McpPrompt,
  type McpResource,
  type McpTool,
  type StdioMCPParams,
} from '@/libs/mcp';
import { MCPClient } from '@/libs/mcp';

import { type ProcessContentBlocksFn } from './contentProcessor';
import { contentBlocksToString } from './contentProcessor';
import { mcpSystemDepsCheckService } from './deps';

const log = debug('orvilo-mcp:service');

/**
 * MCP Tool call raw result type
 */
export interface MCPToolCallRawResult {
  content: any[];
  isError?: boolean;
}

/**
 * MCP Tool call processed result type
 */
export interface MCPToolCallProcessedResult {
  content: string;
  error?: Error;
  state: {
    content: any[];
    isError?: boolean;
  };
  success: boolean;
}

// Removed MCPConnection interface as it's no longer needed

export class MCPService {
  // Store instances of the custom MCPClient, keyed by serialized MCPClientParams
  private clients: Map<string, MCPClient> = new Map();

  /**
   * Process MCP tool call result with content blocks processing
   * This is a common utility method that can be used by both internal MCP calls and external services (e.g., Composio)
   */
  static async processToolCallResult(
    result: MCPToolCallRawResult,
    processContentBlocksFn?: ProcessContentBlocksFn,
  ): Promise<MCPToolCallProcessedResult> {
    // Process content blocks (upload images, etc.)

    const newContent =
      result.isError || !processContentBlocksFn
        ? result.content
        : await processContentBlocksFn(result.content);

    // Convert content blocks to string
    const content = contentBlocksToString(newContent);

    const state = { ...result, content: newContent };

    if (result.isError) {
      return { content, state, success: true };
    }

    return { content, state, success: true };
  }

  private sanitizeForLogging = <T extends Record<string, any>>(obj: T): Record<string, unknown> => {
    if (!obj) return obj;

    const { auth, env: _, headers, ...rest } = obj;
    return {
      ...rest,
      ...(auth ? { auth: { type: auth.type } } : {}),
      ...(headers ? { headerNames: Object.keys(headers) } : {}),
    };
  };

  private sanitizeErrorForLogging = (
    error: unknown,
    params?: MCPClientParams,
  ): Record<string, unknown> => {
    const message = this.redactMcpSecrets(
      error instanceof Error ? error.message : String(error),
      params,
    );
    return {
      message,
      ...(error instanceof Error ? { name: error.name } : {}),
    };
  };

  private redactMcpSecrets = (value: string, params?: MCPClientParams): string => {
    let redacted = value;
    if (params?.type === 'http') {
      const secrets = [
        params.auth?.accessToken,
        params.auth?.clientSecret,
        params.auth?.refreshToken,
        params.auth?.token,
        ...Object.values(params.headers ?? {}),
      ].filter((value): value is string => Boolean(value));
      for (const secret of secrets) redacted = redacted.replaceAll(secret, '[REDACTED]');
    }
    return redacted;
  };

  private redactMcpSecretsFromValue = (value: unknown, params?: MCPClientParams): unknown => {
    if (typeof value === 'string') return this.redactMcpSecrets(value, params);
    if (Array.isArray(value)) {
      return value.map((item) => this.redactMcpSecretsFromValue(item, params));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.redactMcpSecretsFromValue(item, params),
        ]),
      );
    }
    return value;
  };

  // --- MCP Interaction ---

  // listTools now accepts MCPClientParams
  async listTools(params: MCPClientParams): Promise<OrviloPluginApi[]> {
    const loggableParams = this.sanitizeForLogging(params);

    return retry(
      async (bail, attemptNumber) => {
        // Skip cache on retry attempts
        const skipCache = attemptNumber > 1;
        const client = await this.getClient(params, skipCache);
        log(`Listing tools using client for params: %O (attempt ${attemptNumber})`, loggableParams);

        try {
          const result = await client.listTools();
          log(
            `Tools listed successfully for params: %O, result count: %d`,
            loggableParams,
            result.length,
          );
          return result.map<OrviloPluginApi>((item) => ({
            // Assuming identifier is the unique name/id
            description: item.description,
            name: item.name,
            parameters: item.inputSchema as ToolManifestSettings,
          }));
        } catch (error) {
          const safeMessage = this.redactMcpSecrets((error as Error).message, params);
          // Only retry for NoValidSessionId errors
          if ((error as Error).message !== 'NoValidSessionId') {
            console.error(
              `Error listing tools for params %O:`,
              loggableParams,
              this.sanitizeErrorForLogging(error, params),
            );
            bail(
              new TRPCError({
                cause: new Error(safeMessage),
                code: 'INTERNAL_SERVER_ERROR',
                message: `Error listing tools from MCP server: ${safeMessage}`,
              }),
            );
            return []; // This line will never be reached due to bail, but needed for type safety
          }
          throw error; // Rethrow to trigger retry
        }
      },
      { maxRetryTime: 1000, minTimeout: 100, retries: 3 },
    );
  }

  // listTools now accepts MCPClientParams
  async listRawTools(params: MCPClientParams): Promise<McpTool[]> {
    const client = await this.getClient(params); // Get client using params
    const loggableParams = this.sanitizeForLogging(params);
    log(`Listing tools using client for params: %O`, loggableParams);

    try {
      const result = await client.listTools();
      log(
        `Tools listed successfully for params: %O, result count: %d`,
        loggableParams,
        result.length,
      );
      return result;
    } catch (error) {
      const safeMessage = this.redactMcpSecrets((error as Error).message, params);
      console.error(
        `Error listing tools for params %O:`,
        loggableParams,
        this.sanitizeErrorForLogging(error, params),
      );
      // Propagate a TRPCError for better handling upstream
      throw new TRPCError({
        cause: new Error(safeMessage),
        code: 'INTERNAL_SERVER_ERROR',
        message: `Error listing tools from MCP server: ${safeMessage}`,
      });
    } finally {
      if (params.type === 'http' && params.cacheMode === 'ephemeral') {
        try {
          await client.disconnect();
        } catch {
          // The request is already complete; cleanup failure must not replace it.
        }
      }
    }
  }

  // listResources now accepts MCPClientParams
  async listResources(params: MCPClientParams): Promise<McpResource[]> {
    const client = await this.getClient(params); // Get client using params
    const loggableParams = this.sanitizeForLogging(params);
    log(`Listing resources using client for params: %O`, loggableParams);

    try {
      const result = await client.listResources();
      log(
        `Resources listed successfully for params: %O, result count: %d`,
        loggableParams,
        result.length,
      );
      return result;
    } catch (error) {
      const safeMessage = this.redactMcpSecrets((error as Error).message, params);
      console.error(
        `Error listing resources for params %O:`,
        loggableParams,
        this.sanitizeErrorForLogging(error, params),
      );
      // Propagate a TRPCError for better handling upstream
      throw new TRPCError({
        cause: new Error(safeMessage),
        code: 'INTERNAL_SERVER_ERROR',
        message: `Error listing resources from MCP server: ${safeMessage}`,
      });
    }
  }

  // listPrompts now accepts MCPClientParams
  async listPrompts(params: MCPClientParams): Promise<McpPrompt[]> {
    const client = await this.getClient(params); // Get client using params
    const loggableParams = this.sanitizeForLogging(params);
    log(`Listing prompts using client for params: %O`, loggableParams);

    try {
      const result = await client.listPrompts();
      log(
        `Prompts listed successfully for params: %O, result count: %d`,
        loggableParams,
        result.length,
      );
      return result;
    } catch (error) {
      const safeMessage = this.redactMcpSecrets((error as Error).message, params);
      console.error(
        `Error listing prompts for params %O:`,
        loggableParams,
        this.sanitizeErrorForLogging(error, params),
      );
      // Propagate a TRPCError for better handling upstream
      throw new TRPCError({
        cause: new Error(safeMessage),
        code: 'INTERNAL_SERVER_ERROR',
        message: `Error listing prompts from MCP server: ${safeMessage}`,
      });
    }
  }

  // callTool now accepts an object with clientParams, toolName, argsStr, and processContentBlocks
  async callTool(options: {
    argsStr: any;
    clientParams: MCPClientParams;
    processContentBlocks?: ProcessContentBlocksFn;
    toolName: string;
  }): Promise<any> {
    const {
      clientParams,
      toolName,
      argsStr,
      processContentBlocks: processContentBlocksFn,
    } = options;

    const client = await this.getClient(clientParams); // Get client using params

    const args = safeParseJSON(argsStr);
    const loggableParams = this.sanitizeForLogging(clientParams);

    log(
      `Calling tool "${toolName}" using client for params: %O with args: %O`,
      loggableParams,
      args,
    );

    try {
      // Delegate the call to the MCPClient instance
      const result = await client.callTool(toolName, args); // Pass args directly

      // Use the common processing method
      const processedResult = await MCPService.processToolCallResult(
        result,
        processContentBlocksFn,
      );
      const safeResult = {
        ...processedResult,
        content: this.redactMcpSecrets(processedResult.content, clientParams),
        state: this.redactMcpSecretsFromValue(
          processedResult.state,
          clientParams,
        ) as typeof processedResult.state,
      };

      log(
        `Tool "${toolName}" called successfully for params: %O, result: %O`,
        loggableParams,
        safeResult.state,
      );

      return safeResult;
    } catch (error) {
      if (error instanceof McpError) {
        const mcpError = error as McpError;
        const safeMessage = this.redactMcpSecrets(mcpError.message, clientParams);

        return {
          content: safeMessage,
          error: new Error(safeMessage),
          state: {
            content: [{ text: safeMessage, type: 'text' }],
            isError: true,
          },
          success: false,
        };
      }

      const safeMessage = this.redactMcpSecrets((error as Error).message, clientParams);
      console.error(
        `Error calling tool "${toolName}" for params %O:`,
        this.sanitizeForLogging(clientParams),
        this.sanitizeErrorForLogging(error, clientParams),
      );
      // Propagate a TRPCError
      throw new TRPCError({
        cause: new Error(safeMessage),
        code: 'INTERNAL_SERVER_ERROR',
        message: `Error calling tool "${toolName}" on MCP server: ${safeMessage}`,
      });
    } finally {
      if (clientParams.type === 'http' && clientParams.cacheMode === 'ephemeral') {
        try {
          await client.disconnect();
        } catch {
          // The request is already complete; cleanup failure must not replace it.
        }
      }
    }
  }

  // Private method to get or initialize a client based on parameters
  private async getClient(params: MCPClientParams, skipCache = false): Promise<MCPClient> {
    const ephemeral = params.type === 'http' && params.cacheMode === 'ephemeral';
    const key = ephemeral ? undefined : this.serializeParams(params);

    if (key && !skipCache && this.clients.has(key)) {
      return this.clients.get(key)!;
    }

    log(`No cached client found, Initializing new client.`);
    let client: MCPClient | undefined;
    try {
      client = new MCPClient(params);
      await client.initialize({
        onProgress: (progress) => {
          log(`New client initializing... ${progress.progress}/${progress.total}`);
        },
      }); // Initialization logic should be within MCPClient
      if (key) {
        this.clients.set(key, client);
        log('New client initialized and cached.');
      } else {
        log('New ephemeral client initialized.');
      }
      return client;
    } catch (error) {
      if (ephemeral && client) {
        try {
          await client.disconnect();
        } catch {
          // Initialization already failed; cleanup remains best-effort.
        }
      }
      console.error(
        `Failed to initialize MCP client:`,
        this.sanitizeErrorForLogging(error, params),
      );

      // Preserve complete error information, especially detailed stderr output
      const errorMessage = this.redactMcpSecrets(
        error instanceof Error ? error.message : String(error),
        params,
      );

      if (typeof error === 'object' && !!error && 'data' in error) {
        throw new TRPCError({
          cause: new Error(errorMessage),
          code: 'SERVICE_UNAVAILABLE',
          message: errorMessage,
        });
      }

      // Log detailed error information for debugging
      log('Detailed initialization error: %O', {
        error: errorMessage,
        params: this.sanitizeForLogging(params),
        stack:
          error instanceof Error && error.stack
            ? this.redactMcpSecrets(error.stack, params)
            : undefined,
      });

      throw new TRPCError({
        cause: new Error(errorMessage),
        code: 'INTERNAL_SERVER_ERROR',
        message: errorMessage, // Use complete error message directly
      });
    }
  }

  // Custom serialization function to ensure consistent keys
  private serializeParams(params: MCPClientParams): string {
    const sortedKeys = Object.keys(params).sort();
    const sortedParams: Record<string, any> = {};

    for (const key of sortedKeys) {
      const value = (params as any)[key];
      // Sort the 'args' array if it exists
      if (key === 'args' && Array.isArray(value)) {
        sortedParams[key] = JSON.stringify(key);
      } else {
        sortedParams[key] = value;
      }
    }

    return JSON.stringify(sortedParams);
  }

  async getStreamableMcpServerManifest(
    identifier: string,
    url: string,
    metadata?: CustomPluginMetadata,
    auth?: {
      accessToken?: string;
      token?: string;
      type: 'none' | 'bearer' | 'oauth2';
    },
    headers?: Record<string, string>,
  ): Promise<ToolManifest> {
    const mcpParams = { name: identifier, type: 'http' as const, url };

    // Add authentication info to parameters if available
    if (auth) {
      (mcpParams as any).auth = auth;
    }

    // Add headers info to parameters if available
    if (headers) {
      (mcpParams as any).headers = headers;
    }

    const tools = await this.listTools(mcpParams);

    return {
      api: tools,
      identifier,
      // @ts-ignore
      mcpParams,
      meta: {
        avatar: metadata?.avatar || 'MCP_AVATAR',
        description:
          metadata?.description ||
          `${identifier} MCP server has ${tools.length} tools, like "${tools[0]?.name}"`,
        title: identifier,
      },
      // TODO: temporary
      type: 'mcp' as any,
    };
  }

  async getStdioMcpServerManifest(
    params: Omit<StdioMCPParams, 'type'>,
    metadata?: CustomPluginMetadata,
  ): Promise<ToolManifest> {
    const mcpParams = {
      args: params.args,
      command: params.command,
      env: params.env,
      name: params.name,
      type: 'stdio' as const,
    };

    const client = await this.getClient(mcpParams); // Get client using params

    const manifest = await client.listManifests();

    const identifier = params.name;

    return {
      api: manifest.tools ? this.transformMCPToolToOrviloAPI(manifest.tools) : [],
      identifier,
      meta: {
        avatar: metadata?.avatar || 'MCP_AVATAR',
        description:
          metadata?.description ||
          `${identifier} MCP server has ` +
            Object.entries(manifest)
              .filter(([key]) => ['tools', 'prompts', 'resources'].includes(key))
              .map(([key, item]) => `${(item as Array<any>)?.length} ${key}`)
              .join(','),
        title: metadata?.name || identifier,
      },
      ...manifest,
      // @ts-ignore
      mcpParams,
      // TODO: temporary
      type: 'mcp' as any,
    } as ToolManifest;
  }

  /**
   * Check MCP plugin installation status
   */
  async checkMcpInstall(input: {
    deploymentOptions: DeploymentOption[];
  }): Promise<CheckMcpInstallResult> {
    try {
      const loggableInput = {
        deploymentOptions: input.deploymentOptions.map((o) => this.sanitizeForLogging(o)),
      };
      log('Checking MCP plugin installation status: %O', loggableInput);
      const results = [];

      // Check each deployment option
      for (const option of input.deploymentOptions) {
        // Use system dependency check service to check deployment option
        const result = await mcpSystemDepsCheckService.checkDeployOption(option);
        results.push(result);
      }

      // Find the recommended or first installable option
      const recommendedResult = results.find((r) => r.isRecommended && r.allDependenciesMet);
      const firstInstallableResult = results.find((r) => r.allDependenciesMet);

      // Return the recommended result, or the first installable result, or the first result
      const bestResult = recommendedResult || firstInstallableResult || results[0];

      log('Check completed, best result: %O', bestResult);

      // Construct return result, ensure configuration check information is included
      const checkResult: CheckMcpInstallResult = {
        ...bestResult,
        allOptions: results,
        platform: process.platform,
        success: true,
      };

      // If the best result requires configuration, ensure related fields are set at the top level
      if (bestResult?.needsConfig) {
        checkResult.needsConfig = true;
        checkResult.configSchema = bestResult.configSchema;
        log('Configuration required for best deployment option: %O', bestResult.configSchema);
      }

      return checkResult;
    } catch (error) {
      log('Check failed: %O', error);
      return {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error when checking MCP plugin installation status',
        platform: process.platform,
        success: false,
      };
    }
  }

  private transformMCPToolToOrviloAPI = (data: McpTool[]) => {
    return data.map<OrviloPluginApi>((item) => ({
      // Assuming identifier is the unique name/id
      description: item.description,
      name: item.name,
      parameters: item.inputSchema as ToolManifestSettings,
    }));
  };
}

// Export a singleton instance
export const mcpService = new MCPService();
