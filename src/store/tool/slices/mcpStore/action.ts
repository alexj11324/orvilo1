import { type PluginItem } from '@lobehub/market-sdk';
import { type ToolManifest } from '@orvilo/types';
import { type TRPCClientError } from '@trpc/client';
import debug from 'debug';
import { produce } from 'immer';
import { gt, valid } from 'semver';

import { getActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { type MCPErrorData } from '@/libs/mcp/types';
import { parseStdioErrorMessage } from '@/libs/mcp/types';
import { discoverService } from '@/services/discover';
import { type McpDeviceScope, mcpScopeCacheKey, mcpService } from '@/services/mcp';
import { pluginService } from '@/services/plugin';
import { type StoreSetter } from '@/store/types';
import { getUserStoreState } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import {
  type CheckMcpInstallResult,
  type McpConnectionParams,
  type MCPErrorInfo,
  type MCPInstallProgress,
} from '@/types/plugins';
import { MCPInstallStep } from '@/types/plugins';
import { sleep } from '@/utils/sleep';
import { setNamespace } from '@/utils/storeDebug';

import { type ToolStore } from '../../store';
import { type MCPStoreState } from './initialState';

const log = debug('orvilo-mcp:store:action');

const n = setNamespace('mcpStore');

const doesConfigSchemaRequireInput = (configSchema?: any) => {
  if (!configSchema) return false;

  const hasRequiredArray =
    Array.isArray(configSchema.required) && configSchema.required.some(Boolean);

  const hasRequiredProperty =
    !!configSchema.properties &&
    Object.values(configSchema.properties).some(
      (property: any) => property && property.required === true,
    );

  return hasRequiredArray || hasRequiredProperty;
};

/**
 * Non-secret cache-key material for a connection blob / config blob. A short
 * DJB2-style hash keeps tokens and endpoint values out of the store keys
 * while still separating operations whose inputs differ.
 */
const stableConfigKey = (input: unknown): string => {
  if (!input) return 'none';
  const raw = JSON.stringify(input) ?? '';
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
};

/**
 * Scope-complete cache key for an MCP operation: principal + workspace +
 * device scope + plugin + connection identity + config fingerprint. Two
 * scopes never share a slot — a connection test under a topic scope can
 * never surface (or abort) the settings-local one.
 */
const mcpOperationCacheKey = (params: {
  config?: unknown;
  connection?: unknown;
  identifier: string;
  scope?: McpDeviceScope;
}): string => {
  const principalId = userProfileSelectors.userId(getUserStoreState()) ?? 'anonymous';
  const workspaceId = getActiveWorkspaceId() ?? 'personal';
  return [
    `principal:${principalId}`,
    `workspace:${workspaceId}`,
    mcpScopeCacheKey(params.scope),
    `mcp:${params.identifier}`,
    `conn:${stableConfigKey(params.connection)}`,
    `config:${stableConfigKey(params.config)}`,
  ].join('|');
};

const toNonEmptyStringRecord = (input?: Record<string, any>) => {
  if (!input) return undefined;

  const entries = Object.entries(input).filter(
    ([, value]) => value !== undefined && value !== null,
  );

  if (entries.length === 0) return undefined;

  return entries.reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = typeof value === 'string' ? value : String(value);

    return acc;
  }, {});
};

/**
 * Build manifest for cloud MCP connection from market data
 */
const buildCloudMcpManifest = (params: {
  data: any;
  plugin: { description?: string; icon?: string; identifier: string };
}): ToolManifest => {
  const { data, plugin } = params;

  log('Using cloud connection, building manifest from market data');

  // Get tools (MCP format) or api (Orvilo format) from data
  const mcpTools = data.tools;
  const orviloApi = data.api;

  // If MCP format tools, need to convert to Orvilo api format
  // MCP: { name, description, inputSchema }
  // Orvilo: { name, description, parameters }
  let apiArray: any[] = [];

  if (orviloApi) {
    // Already in Orvilo format, use directly
    apiArray = orviloApi;
    log('[Cloud MCP] Using existing Orvilo API format');
  } else if (mcpTools && Array.isArray(mcpTools)) {
    // Convert MCP tools format to Orvilo api format
    apiArray = mcpTools.map((tool: any) => ({
      description: tool.description || '',
      name: tool.name,
      parameters: tool.inputSchema || {},
    }));
    log('[Cloud MCP] Converted %d MCP tools to Orvilo API format', apiArray.length);
  } else {
    console.warn('[Cloud MCP] No tools or api found in manifest data');
  }

  // Build complete manifest
  const manifest: ToolManifest = {
    api: apiArray,
    author: data.author?.name || data.author || '',
    createAt: data.createdAt || new Date().toISOString(),
    homepage: data.homepage || '',
    identifier: plugin.identifier,
    manifest: data.manifestUrl || '',
    meta: {
      avatar: data.icon || plugin.icon,
      description: plugin.description || data.description,
      tags: data.tags || [],
      title: data.name || plugin.identifier,
    },
    name: data.name || plugin.identifier,
    type: 'mcp',
    version: data.version,
  } as unknown as ToolManifest;

  log('[Cloud MCP] Final manifest built:', {
    apiCount: manifest.api?.length,
    identifier: manifest.identifier,
    version: manifest.version,
  });

  return manifest;
};

// Test connection result type
export interface TestMcpConnectionResult {
  error?: string;
  /** STDIO process output logs for debugging */
  errorLog?: string;
  manifest?: ToolManifest;
  success: boolean;
}

type Setter = StoreSetter<ToolStore>;
export const createMCPPluginStoreSlice = (set: Setter, get: () => ToolStore, _api?: unknown) =>
  new PluginMCPStoreActionImpl(set, get, _api);

export class PluginMCPStoreActionImpl {
  readonly #get: () => ToolStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => ToolStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  // Resolve the scope-complete operation key an identifier currently owns —
  // operation state is stored under the composite key, never a bare
  // identifier, so two scopes can't read or cancel each other's rows.
  #operationKey = (identifier: string): string =>
    this.#get().mcpOperationKeyByIdentifier[identifier] ?? identifier;

  cancelInstallMCPPlugin = async (identifier: string): Promise<void> => {
    const operationKey = this.#operationKey(identifier);
    // Get and cancel AbortController
    const abortController = this.#get().mcpInstallAbortControllers[operationKey];
    if (abortController) {
      abortController.abort();

      // Clean up AbortController storage
      this.#set(
        produce((draft: MCPStoreState) => {
          delete draft.mcpInstallAbortControllers[operationKey];
        }),
        false,
        n('cancelInstallMCPPlugin/clearController'),
      );
    }

    // Clean up installation progress and loading state
    this.#get().updateMCPInstallProgress(identifier, undefined);
    this.#get().updateInstallLoadingState(identifier, undefined);
  };

  cancelMcpConnectionTest = (identifier: string): void => {
    const operationKey = this.#operationKey(identifier);
    const abortController = this.#get().mcpTestAbortControllers[operationKey];
    if (abortController) {
      abortController.abort();

      // Clean up state
      this.#set(
        produce((draft: MCPStoreState) => {
          draft.mcpTestLoading[operationKey] = false;
          delete draft.mcpTestAbortControllers[operationKey];
          delete draft.mcpTestErrors[operationKey];
        }),
        false,
        n('cancelMcpConnectionTest'),
      );
    }
  };

  installMCPPlugin = async (
    identifier: string,
    options: {
      config?: Record<string, any>;
      resume?: boolean;
      scope?: McpDeviceScope;
      skipDepsCheck?: boolean;
    } = {},
  ): Promise<boolean | undefined> => {
    const { resume = false, config, skipDepsCheck } = options;
    // The dependency check, manifest probe and install all run in ONE device
    // scope. Settings installs run on this machine's proven local device; a
    // caller that names a scope gets the same scope end-to-end — the
    // operation never falls back to whichever device happens to be local.
    const scope: McpDeviceScope = options.scope ?? { kind: 'local' };
    const normalizedConfig = toNonEmptyStringRecord(config);
    const computedKey = mcpOperationCacheKey({
      config: normalizedConfig,
      identifier,
      scope,
    });
    // A resume continues the paused operation under its stored key — the new
    // config is input to the same operation, not a different one.
    const operationKey = resume
      ? (this.#get().mcpOperationKeyByIdentifier[identifier] ?? computedKey)
      : computedKey;

    const detail = await discoverService.getMcpDetail({ identifier });
    if (!detail) return;

    const plugin = detail as unknown as PluginItem;

    // Extract haveCloudEndpoint after plugin is loaded
    // @ts-expect-error
    const { haveCloudEndpoint } = plugin || {};

    const { updateInstallLoadingState, refreshPlugins, updateMCPInstallProgress } = this.#get();

    // Create AbortController for canceling installation
    const abortController = new AbortController();

    // Store AbortController + the identifier -> operation-key index
    this.#set(
      produce((draft: MCPStoreState) => {
        draft.mcpOperationKeyByIdentifier[identifier] = operationKey;
        draft.mcpInstallAbortControllers[operationKey] = abortController;
      }),
      false,
      n('installMCPPlugin/setController'),
    );

    let data: any;
    let result: CheckMcpInstallResult | undefined;
    let connection: any;

    try {
      // Check if already cancelled
      if (abortController.signal.aborted) {
        return;
      }

      if (resume) {
        // Resume mode: get previous info from storage — the row lives under
        // the paused operation's scope-complete key.
        const configInfo = this.#get().mcpInstallProgress[operationKey];
        if (!configInfo) {
          console.error('No config info found for resume');
          return;
        }

        data = configInfo.manifest;
        connection = configInfo.connection ? { ...configInfo.connection } : undefined;
        result = configInfo.checkResult;
      } else {
        // Normal mode: start installation from scratch

        // Step 1: Fetch plugin manifest
        updateMCPInstallProgress(identifier, {
          progress: 15,
          step: MCPInstallStep.FETCHING_MANIFEST,
        });

        updateInstallLoadingState(identifier, true);

        // Check if already cancelled
        if (abortController.signal.aborted) {
          return;
        }

        data = await discoverService.getMCPPluginManifest(plugin.identifier, {
          install: true,
        });

        const deploymentOptions: any[] = Array.isArray(data.deploymentOptions)
          ? data.deploymentOptions
          : [];

        const httpOption =
          deploymentOptions.find(
            (option) => option?.connection?.url && option?.connection?.type === 'http',
          ) ||
          deploymentOptions.find((option) => option?.connection?.url && !option?.connection?.type);

        // Find stdio type deployment option
        const stdioOption = deploymentOptions.find(
          (option) =>
            option?.connection?.type === 'stdio' ||
            (!option?.connection?.type && !option?.connection?.url),
        );

        // Check if cloudEndPoint is available: stdio type + haveCloudEndpoint exists
        // Both desktop and web should use cloud endpoint if available
        const hasCloudEndpoint = stdioOption && haveCloudEndpoint;

        // Prioritize endpoint (http/cloud) over stdio in all environments
        // Desktop: endpoint > stdio
        // Web: endpoint only (stdio not supported)
        const shouldUseHttpDeployment = !!httpOption;

        if (hasCloudEndpoint) {
          // Use cloudEndPoint, create cloud type connection
          log('Using cloudEndPoint for stdio plugin: %s', haveCloudEndpoint);

          connection = {
            auth: stdioOption?.connection?.auth || { type: 'none' },
            cloudEndPoint: haveCloudEndpoint,
            headers: stdioOption?.connection?.headers,
            type: 'cloud',
          } as any;

          log('Using cloud connection: %O', {
            cloudEndPoint: haveCloudEndpoint,
            type: connection.type,
          });

          const configSchema = stdioOption?.connection?.configSchema;
          const needsConfig = doesConfigSchemaRequireInput(configSchema);

          if (needsConfig && !normalizedConfig) {
            updateMCPInstallProgress(identifier, {
              configSchema,
              connection,
              manifest: data,
              needsConfig: true,
              progress: 50,
              step: MCPInstallStep.CONFIGURATION_REQUIRED,
            });

            updateInstallLoadingState(identifier, undefined);
            return false;
          }
        } else if (shouldUseHttpDeployment && httpOption) {
          // HTTP type: skip system dependency check, use URL directly
          log('HTTP MCP detected, skipping system dependency check');

          connection = {
            auth: httpOption.connection?.auth || { type: 'none' },
            headers: httpOption.connection?.headers,
            type: 'http',
            url: httpOption.connection?.url,
          };

          log('Using HTTP connection: %O', { type: connection.type, url: connection.url });

          const configSchema = httpOption.connection?.configSchema;
          const needsConfig = doesConfigSchemaRequireInput(configSchema);

          if (needsConfig && !normalizedConfig) {
            updateMCPInstallProgress(identifier, {
              configSchema,
              connection,
              manifest: data,
              needsConfig: true,
              progress: 50,
              step: MCPInstallStep.CONFIGURATION_REQUIRED,
            });

            updateInstallLoadingState(identifier, undefined);
            return false;
          }
        } else {
          // stdio type: requires complete system dependency check process

          // Step 2: Check installation environment
          updateMCPInstallProgress(identifier, {
            progress: 30,
            step: MCPInstallStep.CHECKING_INSTALLATION,
          });

          // Check if already cancelled
          if (abortController.signal.aborted) {
            return;
          }

          result = await mcpService.checkInstallation(data, {
            scope,
            signal: abortController.signal,
          });

          if (!result.success) {
            updateMCPInstallProgress(identifier, undefined);
            return;
          }

          // Step 3: Check if system dependencies are met
          if (!skipDepsCheck && !result.allDependenciesMet) {
            // Dependencies not met, pause installation and show dependency installation guide
            updateMCPInstallProgress(identifier, {
              connection: result.connection,
              manifest: data,
              progress: 40,
              step: MCPInstallStep.DEPENDENCIES_REQUIRED,
              systemDependencies: result.systemDependencies,
            });

            // Pause installation, wait for user to install dependencies
            updateInstallLoadingState(identifier, undefined);
            return false; // Return false to indicate dependencies need to be installed
          }

          // Step 4: Check if configuration is needed
          if (result.needsConfig) {
            // Configuration needed, pause installation
            updateMCPInstallProgress(identifier, {
              checkResult: result,
              configSchema: result.configSchema,
              connection: result.connection,
              manifest: data,
              needsConfig: true,
              progress: 50,
              step: MCPInstallStep.CONFIGURATION_REQUIRED,
            });

            // Pause installation, wait for user configuration
            updateInstallLoadingState(identifier, undefined);
            return false; // Return false to indicate configuration is needed
          }

          connection = result.connection;
        }
      }

      let mergedHttpHeaders: Record<string, string> | undefined;
      let mergedStdioEnv: Record<string, string> | undefined;
      let mergedCloudHeaders: Record<string, string> | undefined;

      if (connection?.type === 'http') {
        const baseHeaders = toNonEmptyStringRecord(connection.headers);

        if (baseHeaders || normalizedConfig) {
          mergedHttpHeaders = {
            ...baseHeaders,
            ...normalizedConfig,
          };
        }
      }

      if (connection?.type === 'stdio') {
        const baseEnv = toNonEmptyStringRecord(connection.env);

        if (baseEnv || normalizedConfig) {
          mergedStdioEnv = {
            ...baseEnv,
            ...normalizedConfig,
          };
        }
      }

      if (connection?.type === 'cloud') {
        const baseHeaders = toNonEmptyStringRecord(connection.headers);

        if (baseHeaders || normalizedConfig) {
          mergedCloudHeaders = {
            ...baseHeaders,
            ...normalizedConfig,
          };
        }
      }

      // Get server manifest logic
      updateInstallLoadingState(identifier, true);

      // Step 5: Get server manifest
      updateMCPInstallProgress(identifier, {
        progress: 70,
        step: MCPInstallStep.GETTING_SERVER_MANIFEST,
      });

      // Check if already cancelled
      if (abortController.signal.aborted) {
        return;
      }

      let manifest: ToolManifest | undefined;

      if (connection?.type === 'stdio') {
        manifest = await mcpService.getStdioMcpServerManifest(
          {
            args: connection.args,
            command: connection.command!,
            env: mergedStdioEnv,
            name: identifier, // Pass config as environment variables (in resume mode)
          },
          { avatar: plugin.icon, description: plugin.description, name: data.name },
          { scope, signal: abortController.signal },
        );
      }
      if (connection?.type === 'http') {
        manifest = await mcpService.getStreamableMcpServerManifest(
          {
            auth: connection.auth,
            headers: mergedHttpHeaders,
            identifier,
            metadata: {
              avatar: plugin.icon,
              description: plugin.description,
            },
            url: connection.url!,
          },
          { scope, signal: abortController.signal },
        );
      }
      if (connection?.type === 'cloud') {
        // Cloud type: build manifest directly from market data
        manifest = buildCloudMcpManifest({ data, plugin });
      }

      // set version
      if (manifest) {
        // set Version - use semver to compare versions and take the larger value
        const dataVersion = data?.version;
        const manifestVersion = manifest.version;

        if (dataVersion && manifestVersion) {
          // If both versions exist, compare and take the larger value
          if (valid(dataVersion) && valid(manifestVersion)) {
            manifest.version = gt(dataVersion, manifestVersion) ? dataVersion : manifestVersion;
          } else {
            // If version format is incorrect, prioritize dataVersion
            manifest.version = dataVersion;
          }
        } else {
          // If only one version exists, use the existing version
          manifest.version = dataVersion || manifestVersion;
        }
      }

      // Check if already cancelled
      if (abortController.signal.aborted) {
        return;
      }

      if (!manifest) {
        updateMCPInstallProgress(identifier, undefined);
        return;
      }

      // Step 6: Install plugin
      updateMCPInstallProgress(identifier, {
        progress: 90,
        step: MCPInstallStep.INSTALLING_PLUGIN,
      });

      // Check if already cancelled
      if (abortController.signal.aborted) {
        return;
      }

      // Update connection object, write merged configuration
      const finalConnection = { ...connection };
      if (finalConnection.type === 'http' && mergedHttpHeaders) {
        finalConnection.headers = mergedHttpHeaders;
      }
      if (finalConnection.type === 'stdio' && mergedStdioEnv) {
        finalConnection.env = mergedStdioEnv;
      }
      if (finalConnection.type === 'cloud' && mergedCloudHeaders) {
        finalConnection.headers = mergedCloudHeaders;
      }

      await pluginService.installPlugin({
        // For mcp, store connection info in customParams field first
        customParams: { mcp: finalConnection },
        identifier: plugin.identifier,
        manifest,
        settings: normalizedConfig,
        type: 'plugin',
      });

      // Check if already cancelled
      if (abortController.signal.aborted) {
        return;
      }

      await refreshPlugins();

      // Step 7: Complete installation
      updateMCPInstallProgress(identifier, {
        progress: 100,
        step: MCPInstallStep.COMPLETED,
      });

      // Show completed status briefly then clear progress
      await sleep(1000);

      updateMCPInstallProgress(identifier, undefined);
      updateInstallLoadingState(identifier, undefined);

      // Clean up AbortController
      this.#set(
        produce((draft: MCPStoreState) => {
          delete draft.mcpInstallAbortControllers[operationKey];
        }),
        false,
        n('installMCPPlugin/clearController'),
      );

      return true;
    } catch (e) {
      // Silently handle errors caused by cancellation
      if (abortController.signal.aborted) {
        console.info('MCP plugin installation cancelled for:', identifier);
        return;
      }

      const error = e as TRPCClientError<any>;

      console.error('MCP plugin installation failed:', error);

      // Handle structured error info
      let errorInfo: MCPErrorInfo;

      // If it's a structured MCPError
      if (!!error.data && 'errorData' in error.data) {
        const mcpError = error.data.errorData as MCPErrorData;

        errorInfo = {
          message: mcpError.message,
          metadata: mcpError.metadata,
          type: mcpError.type,
        };
      } else {
        // Fallback handling for normal errors
        const rawErrorMessage = error instanceof Error ? error.message : String(error);

        // Parse STDIO error message to extract process output logs
        const { originalMessage, errorLog } = parseStdioErrorMessage(rawErrorMessage);

        errorInfo = {
          message: originalMessage,
          metadata: {
            errorLog,
            params: connection
              ? {
                  args: connection.args,
                  command: connection.command,
                  type: connection.type,
                }
              : undefined,
            step: 'installation_error',
            timestamp: Date.now(),
          },
          type: 'UNKNOWN_ERROR',
        };
      }

      // Set error status, display structured error info
      updateMCPInstallProgress(identifier, {
        errorInfo,
        progress: 0,
        step: MCPInstallStep.ERROR,
      });

      updateInstallLoadingState(identifier, undefined);

      // Clean up AbortController
      this.#set(
        produce((draft: MCPStoreState) => {
          delete draft.mcpInstallAbortControllers[operationKey];
        }),
        false,
        n('installMCPPlugin/clearController'),
      );
    }
  };

  testMcpConnection = async (
    params: McpConnectionParams & { scope?: McpDeviceScope },
  ): Promise<TestMcpConnectionResult> => {
    const { identifier, connection, metadata } = params;
    // Same scope rule as install: the probe runs on the device that will
    // serve the connection — the settings test defaults to the local device.
    const scope: McpDeviceScope = params.scope ?? { kind: 'local' };
    const operationKey = mcpOperationCacheKey({ connection, identifier, scope });

    // Create AbortController for canceling test
    const abortController = new AbortController();

    // Store AbortController and set loading state
    this.#set(
      produce((draft: MCPStoreState) => {
        draft.mcpOperationKeyByIdentifier[identifier] = operationKey;
        draft.mcpTestAbortControllers[operationKey] = abortController;
        draft.mcpTestLoading[operationKey] = true;
        draft.mcpTestErrors[operationKey] = '';
      }),
      false,
      n('testMcpConnection/start'),
    );

    try {
      let manifest: ToolManifest;

      if (connection.type === 'http') {
        if (!connection.url) {
          throw new Error('URL is required for HTTP connection');
        }

        manifest = await mcpService.getStreamableMcpServerManifest(
          {
            auth: connection.auth,
            headers: connection.headers,
            identifier,
            metadata,
            url: connection.url,
          },
          { scope, signal: abortController.signal },
        );
      } else if (connection.type === 'stdio') {
        if (!connection.command) {
          throw new Error('Command is required for STDIO connection');
        }

        manifest = await mcpService.getStdioMcpServerManifest(
          {
            args: connection.args,
            command: connection.command,
            env: connection.env,
            name: identifier,
          },
          metadata,
          { scope, signal: abortController.signal },
        );
      } else {
        throw new Error('Invalid MCP connection type');
      }

      // Check if already cancelled
      if (abortController.signal.aborted) {
        return { error: 'Test cancelled', success: false };
      }

      // Clean up state
      this.#set(
        produce((draft: MCPStoreState) => {
          draft.mcpTestLoading[operationKey] = false;
          delete draft.mcpTestAbortControllers[operationKey];
          delete draft.mcpTestErrors[operationKey];
        }),
        false,
        n('testMcpConnection/success'),
      );

      return { manifest, success: true };
    } catch (error) {
      // Silently handle errors caused by cancellation
      if (abortController.signal.aborted) {
        return { error: 'Test cancelled', success: false };
      }

      const rawErrorMessage = error instanceof Error ? error.message : String(error);

      // Parse STDIO error message to extract process output logs
      const { originalMessage, errorLog } = parseStdioErrorMessage(rawErrorMessage);

      // Set error state
      this.#set(
        produce((draft: MCPStoreState) => {
          draft.mcpTestLoading[operationKey] = false;
          draft.mcpTestErrors[operationKey] = originalMessage;
          delete draft.mcpTestAbortControllers[operationKey];
        }),
        false,
        n('testMcpConnection/error'),
      );

      return { error: originalMessage, errorLog, success: false };
    }
  };

  uninstallMCPPlugin = async (identifier: string): Promise<void> => {
    await pluginService.uninstallPlugin(identifier);
    await this.#get().refreshPlugins();
  };

  updateMCPInstallProgress = (
    identifier: string,
    progress: MCPInstallProgress | undefined,
  ): void => {
    const operationKey = this.#operationKey(identifier);
    this.#set(
      produce((draft: MCPStoreState) => {
        draft.mcpInstallProgress[operationKey] = progress;
        if (progress === undefined) {
          delete draft.mcpOperationKeyByIdentifier[identifier];
        }
      }),
      false,
      n(`updateMCPInstallProgress/${progress?.step || 'clear'}`),
    );
  };
}

export type PluginMCPStoreAction = Pick<PluginMCPStoreActionImpl, keyof PluginMCPStoreActionImpl>;
