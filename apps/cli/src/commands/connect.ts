import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  defaultGetLocalFilePreview,
  defaultGetProjectFileIndex,
  defaultSearchProjectFiles,
  type DeviceControlDeps,
  executeDeviceRpc,
} from '@orvilo/device-control';
import type {
  AgentRunRequestMessage,
  DeviceSystemInfo,
  RpcRequestMessage,
  SystemInfoRequestMessage,
  ToolCallRequestMessage,
} from '@orvilo/device-gateway-client';
import { GatewayClient } from '@orvilo/device-gateway-client';
import {
  listHeterogeneousAgentModels,
  listHeterogeneousAgentPermissions,
} from '@orvilo/heterogeneous-agents/models';
import { canonicalizePath, getShellInfo } from '@orvilo/local-file-shell';
import type { Command } from 'commander';

import { resolveToken } from '../auth/resolveToken';
import { CLI_API_KEY_ENV } from '../constants/auth';
import {
  CLI_CONFIG_DIR_NAME,
  CLI_CONNECT_SERVICE_NAME,
  CLI_DISPLAY_NAME,
  CLI_PRIMARY_BIN,
} from '../constants/identity';
import { OFFICIAL_GATEWAY_URL } from '../constants/urls';
import {
  appendLog,
  getLogPath,
  getRunningDaemonPid,
  readStatus,
  removePid,
  removeStatus,
  reportDaemonStartupReady,
  spawnDaemon,
  stopDaemon,
  writeStatus,
} from '../daemon/manager';
import { listTasks } from '../daemon/taskRegistry';
import { spawnHeteroAgentRun } from '../device/agentRun';
import { renewDevicePrimeRuns } from '../device/primeRun';
import { registerDevice, resolveDeviceIdentity } from '../device/register';
import {
  installConnectService,
  readConnectServiceStatus,
  restartConnectService,
  startConnectService,
  stopConnectService,
  uninstallConnectService,
} from '../service/connect';
import { loadOrCreateConnectionId, loadSettings, normalizeUrl, saveSettings } from '../settings';
import { executeToolCall } from '../tools';
import { cleanupAllProcesses } from '../tools/shell';
import { log, setVerbose } from '../utils/logger';
import { sweepLocalTraces } from '../utils/traceMaintenance';

const CONNECT_SERVICE_NAME = CLI_CONNECT_SERVICE_NAME;

interface ConnectOptions {
  daemon?: boolean;
  daemonChild?: boolean;
  deviceId?: string;
  gateway?: string;
  serviceChild?: boolean;
  token?: string;
  verbose?: boolean;
}

export function registerConnectCommand(program: Command) {
  const connectCmd = program
    .command('connect')
    .description('Connect to the device gateway and listen for tool calls')
    .option('--token <jwt>', 'JWT access token')
    .option('--gateway <url>', 'Device gateway URL')
    .option('--device-id <id>', 'Device ID (auto-generated if not provided)')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('-d, --daemon', 'Run as a background daemon process')
    .option('--daemon-child', 'Internal: runs as the daemon child process')
    .option('--service-child', 'Internal: runs as the system service child process')
    .action(async (options: ConnectOptions) => {
      if (options.verbose) setVerbose(true);

      // --daemon: spawn detached child and exit
      if (options.daemon) {
        return handleDaemonStart(options);
      }

      const isServiceChild = options.serviceChild || process.env.ORVILO_CONNECT_SERVICE === '1';
      const isDaemonChild =
        options.daemonChild || isServiceChild || process.env.ORVILO_DAEMON === '1';

      await runConnect(options, isDaemonChild);
    });

  // Subcommands
  connectCmd.command('stop').description('Stop the background daemon process').action(handleStop);

  connectCmd
    .command('status')
    .description('Show background daemon status')
    .action(() => {
      const pid = getRunningDaemonPid();
      if (pid === null) {
        log.info('No daemon is running.');
        return;
      }

      const status = readStatus();
      log.info('─── Daemon Status ───');
      log.info(`  PID              : ${pid}`);
      if (status) {
        log.info(`  Started at       : ${status.startedAt}`);
        log.info(`  Connection       : ${status.connectionStatus}`);
        log.info(`  Gateway          : ${status.gatewayUrl}`);
        const uptime = formatUptime(new Date(status.startedAt));
        log.info(`  Uptime           : ${uptime}`);
      }
      log.info('─────────────────────');
    });

  connectCmd
    .command('logs')
    .description('Tail the daemon log file')
    .option('-n, --lines <count>', 'Number of lines to show', '50')
    .option('-f, --follow', 'Follow log output')
    .action(async (opts: { follow?: boolean; lines?: string }) => {
      const logPath = getLogPath();
      if (!fs.existsSync(logPath)) {
        log.warn('No log file found. Start the daemon first.');
        return;
      }

      const lines = opts.lines || '50';
      const args = [`-n`, lines];
      if (opts.follow) args.push('-f');

      // Use tail directly — this hands control to the child process
      try {
        const { execFileSync } = await import('node:child_process');
        execFileSync('tail', [...args, logPath], { stdio: 'inherit' });
      } catch {
        // tail -f exits via SIGINT, which throws — that's fine
      }
    });

  connectCmd
    .command('restart')
    .description('Restart the background daemon process')
    .option('--token <jwt>', 'JWT access token')
    .option('--gateway <url>', 'Device gateway URL')
    .option('--device-id <id>', 'Device ID')
    .option('-v, --verbose', 'Enable verbose logging')
    .action(async (options: ConnectOptions) => {
      const wasStopped = stopDaemon();
      if (wasStopped) {
        log.info('Stopped existing daemon.');
      }
      await handleDaemonStart({ ...options, daemon: true });
    });

  const serviceCmd = connectCmd
    .command('service')
    .description('Manage the Linux user systemd connect service');

  serviceCmd
    .command('install')
    .description('Install and start the Linux user systemd connect service')
    .action(() => {
      installConnectService();
      log.info(`Installed and started ${CONNECT_SERVICE_NAME}.`);
      log.info("Run 'orvilo connect service status' to inspect the service.");
    });

  serviceCmd
    .command('uninstall')
    .description('Remove the Linux user systemd connect service')
    .action(() => {
      const removed = uninstallConnectService();
      if (removed) log.info(`Uninstalled ${CONNECT_SERVICE_NAME}.`);
      else log.warn('No connect service is installed.');
    });

  serviceCmd
    .command('start')
    .description('Start the installed connect service')
    .action(() => {
      const started = startConnectService();
      if (started) log.info(`Started ${CONNECT_SERVICE_NAME}.`);
      else log.warn('No connect service is installed.');
    });

  serviceCmd
    .command('stop')
    .description('Stop the installed connect service')
    .action(() => {
      const stopped = stopConnectService();
      if (stopped) log.info(`Stopped ${CONNECT_SERVICE_NAME}.`);
      else log.warn('No connect service is installed.');
    });

  serviceCmd
    .command('restart')
    .description('Restart the installed connect service')
    .action(() => {
      const restarted = restartConnectService();
      if (restarted) log.info(`Restarted ${CONNECT_SERVICE_NAME}.`);
      else log.warn('No connect service is installed.');
    });

  serviceCmd
    .command('status')
    .description('Show the installed connect service status')
    .action(() => {
      const serviceStatus = readConnectServiceStatus();
      if (!serviceStatus) {
        log.info('No connect service is installed.');
        return;
      }

      const status = readStatus();
      log.info('─── Connect Service Status ───');
      log.info(`  Service          : ${serviceStatus.serviceName}`);
      log.info(`  Installed        : yes`);
      log.info(`  Enabled          : ${serviceStatus.enabled ? 'yes' : 'no'}`);
      log.info(`  Active           : ${serviceStatus.active ? 'yes' : 'no'}`);
      log.info(`  Sub-state        : ${serviceStatus.subState || 'unknown'}`);
      if (serviceStatus.mainPid !== null) {
        log.info(`  PID              : ${serviceStatus.mainPid}`);
      }
      if (status) {
        log.info(`  Connection       : ${status.connectionStatus}`);
        log.info(`  Gateway          : ${status.gatewayUrl}`);
        const uptime = formatUptime(new Date(status.startedAt));
        log.info(`  Uptime           : ${uptime}`);
      }
      log.info('──────────────────────────────');
    });

  // Top-level alias for `connect stop`. Users who run `orvilo connect` naturally
  // reach for `orvilo disconnect` to undo it; the nested `connect stop` is not
  // discoverable enough on its own.
  program
    .command('disconnect')
    .description('Disconnect from the device gateway (alias for `connect stop`)')
    .action(handleStop);
}

// --- Internal helpers ---

function handleStop() {
  const stopped = stopDaemon();
  if (stopped) {
    log.info('Daemon stopped.');
  } else {
    log.warn('No daemon is running.');
  }
}

async function handleDaemonStart(options: ConnectOptions) {
  const existingPid = getRunningDaemonPid();
  if (existingPid !== null) {
    log.error(`Daemon is already running (PID ${existingPid}).`);
    log.error("Use 'orvilo connect stop' to stop it, or 'orvilo connect restart' to restart.");
    process.exit(1);
  }

  // Build args to re-run with --daemon-child
  const args = buildDaemonArgs(options);
  const pid = await spawnDaemon(args);

  log.info(`Daemon started (PID ${pid}).`);
  log.info(`  Logs: ${getLogPath()}`);
  log.info("  Run 'orvilo connect status' to check connection.");
  log.info("  Run 'orvilo connect stop' to stop.");
}

function buildDaemonArgs(options: ConnectOptions): string[] {
  // Find the entry script (process.argv[1])
  const script = process.argv[1];
  const args = [script, 'connect'];

  if (options.token) args.push('--token', options.token);
  if (options.gateway) args.push('--gateway', options.gateway);
  if (options.deviceId) args.push('--device-id', options.deviceId);
  if (options.verbose) args.push('--verbose');

  return args;
}

async function runConnect(options: ConnectOptions, isDaemonChild: boolean) {
  let auth = await resolveToken(options);
  const settings = loadSettings();
  const gatewayUrl = normalizeUrl(options.gateway) || settings?.gatewayUrl;

  if (!gatewayUrl && settings?.serverUrl) {
    log.error(
      `Current login uses custom --server ${settings?.serverUrl}. Please also provide '--gateway <url>' for the device gateway.`,
    );
    process.exit(1);
    throw new Error('process.exit');
  }

  if (options.gateway && gatewayUrl) {
    saveSettings({ ...settings, gatewayUrl });
  }

  const resolvedGatewayUrl = gatewayUrl || OFFICIAL_GATEWAY_URL;

  // One stable user-owned identity is used for every workspace Agent.
  const identity = await resolveDeviceIdentity(auth.userId, options.deviceId);
  let connectToken = auth.token;
  const connectTokenType = auth.tokenType;
  const refreshConnectToken = async (): Promise<string | undefined> => {
    const refreshed = await resolveToken({});
    if (!refreshed) return undefined;
    auth = refreshed;
    connectToken = refreshed.token;
    return connectToken;
  };

  // Freeform channel label (`cli` by default); `ORVILO_CLI_CHANNEL` lets a
  // dev build tag itself `cli-dev` so the gateway can prioritise / display it.
  const channel = process.env.ORVILO_CLI_CHANNEL || 'cli';

  const client = new GatewayClient({
    channel,
    connectionId: loadOrCreateConnectionId(),
    deviceId: identity?.deviceId ?? options.deviceId,
    gatewayUrl: resolvedGatewayUrl,
    logger: isDaemonChild ? createDaemonLogger() : log,
    serverUrl: auth.serverUrl,
    token: connectToken,
    tokenType: connectTokenType,
    userId: auth.userId,
  });

  const info = (msg: string) => {
    if (isDaemonChild) appendLog(msg);
    else log.info(msg);
  };

  const error = (msg: string) => {
    if (isDaemonChild) appendLog(`[ERROR] ${msg}`);
    else log.error(msg);
  };

  // Print device info
  info(`─── ${CLI_DISPLAY_NAME} ───`);
  info(`  Device ID : ${client.currentDeviceId}`);
  info(`  Hostname  : ${os.hostname()}`);
  info(`  Platform  : ${process.platform}`);
  info(`  Gateway   : ${resolvedGatewayUrl}`);
  info(`  Auth      : ${auth.tokenType}`);
  info(`  Mode      : ${isDaemonChild ? 'daemon' : 'foreground'}`);
  info('───────────────────');

  // Update local connection status so other CLI commands can resolve the current device
  const updateStatus = (connectionStatus: string) => {
    writeStatus({
      connectionStatus,
      deviceId: client.currentDeviceId,
      gatewayUrl: resolvedGatewayUrl,
      pid: process.pid,
      startedAt: startedAt.toISOString(),
    });
  };

  const startedAt = new Date();
  updateStatus('connecting');

  // Housekeeping for the local trace store: partials left behind by killed
  // agent processes become `interrupted` snapshots (so `orvilo trace op list` shows
  // the crashed runs), and aged-out snapshots are deleted. Fire-and-forget —
  // it must never delay the gateway connection.
  void sweepLocalTraces().then(({ deleted, reconciled }) => {
    if (reconciled > 0 || deleted > 0) {
      info(`  Traces    : ${reconciled} interrupted run(s) closed, ${deleted} expired removed`);
    }
  });

  // Portable device RPC handlers use the same user-owned connection.
  const hostEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const deviceControlDeps: DeviceControlDeps = {
    getActiveWorktreeWriter: async (worktreePath: string) => {
      // Compare canonical identities, not spellings — a run registered under
      // a symlinked or aliased cwd still owns the same physical directory.
      const target = await canonicalizePath(worktreePath);
      for (const entry of listTasks()) {
        if (entry.cwd && (await canonicalizePath(entry.cwd)) === target) {
          return { operationId: entry.operationId, pid: entry.pid, topicId: entry.topicId };
        }
      }
      return null;
    },
    getLocalFilePreview: defaultGetLocalFilePreview,
    getProjectFileIndex: defaultGetProjectFileIndex,
    listHeterogeneousAgentModels: (params) =>
      listHeterogeneousAgentModels({
        ...params,
        env: { ...hostEnvironment, ...params.env },
      }),
    listHeterogeneousAgentPermissions: (params) =>
      listHeterogeneousAgentPermissions({
        ...params,
        env: { ...hostEnvironment, ...params.env },
      }),
    searchProjectFiles: defaultSearchProjectFiles,
  };

  const handlerContext: GatewayHandlerContext = {
    deps: deviceControlDeps,
    error,
    // Read at dispatch time — `auth` may be refreshed mid-session.
    getServerUrl: () => auth.serverUrl,
    info,
    isDaemonChild,
  };

  // Request handlers (system info / tool calls / device RPCs / agent runs) —
  // bound to the physical user connection.
  bindGatewayClientHandlers(client, handlerContext);

  client.on('connected', () => {
    updateStatus('connected');
  });

  client.on('disconnected', () => {
    updateStatus('disconnected');
  });

  client.on('reconnecting', () => {
    updateStatus('reconnecting');
  });

  // Proactive token refresh — schedule before the user token expires.
  const startProactiveRefresh = (): (() => void) | null =>
    scheduleProactiveRefresh(
      connectToken,
      connectTokenType,
      async () => {
        const newToken = await refreshConnectToken();
        if (newToken) {
          client.updateToken(newToken);
          cancelRefreshTimer = startProactiveRefresh();
        }
        return newToken;
      },
      info,
      error,
    );
  let cancelRefreshTimer = startProactiveRefresh();

  // Handle auth failed — attempt token refresh once before giving up
  // (e.g., auto-reconnect may send an expired JWT before proactive refresh fires)
  let authFailedRefreshAttempted = false;
  client.on('auth_failed', async (reason) => {
    if (connectTokenType === 'jwt' && !authFailedRefreshAttempted) {
      authFailedRefreshAttempted = true;
      info(`Authentication failed (${reason}). Attempting token refresh...`);
      try {
        const prev = connectToken;
        const newToken = await refreshConnectToken();
        if (newToken && newToken !== prev) {
          info('Token refreshed successfully. Reconnecting...');
          client.updateToken(newToken);
          authFailedRefreshAttempted = false;
          cancelRefreshTimer = startProactiveRefresh();
          await client.reconnect();
          return;
        }
      } catch {
        // fall through
      }
    }

    error(`Authentication failed: ${reason}`);
    error(
      `Run '${CLI_PRIMARY_BIN} login', or set ${CLI_API_KEY_ENV} and run '${CLI_PRIMARY_BIN} login --server <url>' to configure API key authentication.`,
    );
    cleanup();
    process.exit(1);
  });

  // Handle auth expired — refresh token and reconnect automatically
  client.on('auth_expired', async () => {
    if (connectTokenType === 'apiKey') {
      // API keys don't expire; ignore stale auth_expired signals
      return;
    }

    info('Authentication expired. Attempting to refresh token...');

    try {
      const newToken = await refreshConnectToken();
      if (newToken) {
        info('Token refreshed successfully. Reconnecting...');
        client.updateToken(newToken);
        cancelRefreshTimer = startProactiveRefresh();
        await client.reconnect();
        return;
      }
    } catch {
      // refresh failed — fall through
    }

    error("Could not refresh token. Run 'orvilo login' to re-authenticate.");
    cleanup();
    process.exit(1);
  });

  // Handle errors
  client.on('error', (err) => {
    error(`Connection error: ${err.message}`);
  });

  // Graceful shutdown
  const cleanup = () => {
    info('Shutting down...');
    cancelRefreshTimer?.();
    cleanupAllProcesses();
    client.disconnect();
    removeStatus();
    if (isDaemonChild) {
      removePid();
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  // A connection without an authoritative registry row cannot be selected or run.
  // Refuse startup before reporting daemon readiness when registration fails.
  if (!identity) throw new Error('A user-owned device identity is required.');
  try {
    await registerDevice(auth, identity);
  } catch (err) {
    error(`Device registration failed: ${(err as Error).message}`);
    cleanup();
    throw err;
  }

  await reportDaemonStartupReady();

  // Connect
  await client.connect();

  // Best-effort after the main connection — a failed restore never blocks it.
}

/** Everything a gateway connection's request handlers need from the host process. */
interface GatewayHandlerContext {
  deps: DeviceControlDeps;
  error: (msg: string) => void;
  /** Read at dispatch time — the underlying auth may be refreshed mid-session. */
  getServerUrl: () => string;
  info: (msg: string) => void;
  isDaemonChild: boolean;
}

/** Bind tool, RPC, and run handlers to the user-owned connection. */
function bindGatewayClientHandlers(client: GatewayClient, ctx: GatewayHandlerContext) {
  const { deps, error, getServerUrl, info, isDaemonChild } = ctx;

  // Handle system info requests
  client.on('system_info_request', async (request: SystemInfoRequestMessage) => {
    info(`Received system_info_request: requestId=${request.requestId}`);
    const systemInfo = await collectSystemInfo();
    client.sendSystemInfoResponse({
      requestId: request.requestId,
      result: { success: true, systemInfo },
    });
  });

  // Handle tool call requests
  client.on('tool_call_request', async (request: ToolCallRequestMessage) => {
    const { operationId, requestId, timeout, toolCall } = request;
    if (isDaemonChild) {
      appendLog(
        `[TOOL] ${toolCall.apiName}${operationId ? ` op=${operationId}` : ''} (${requestId})`,
      );
    } else {
      log.toolCall(toolCall.apiName, requestId, toolCall.arguments, operationId);
    }

    // Timed on the DEVICE's clock. The server can only see the whole dispatch
    // round trip, so reporting this back is what separates a slow tool from
    // slow transport.
    const startedAt = performance.now();
    const result =
      toolCall.type && toolCall.type !== 'tool'
        ? {
            content:
              'Platform MCP execution is retired. Configure MCP in the Agent’s native harness.',
            error:
              'Platform MCP execution is retired. Configure MCP in the Agent’s native harness.',
            state: undefined,
            success: false,
          }
        : await executeToolCall(toolCall.apiName, toolCall.arguments, timeout);
    const executionTimeMs = Math.round(performance.now() - startedAt);

    if (isDaemonChild) {
      appendLog(
        `[RESULT] ${result.success ? 'OK' : 'FAIL'} ${executionTimeMs}ms${operationId ? ` op=${operationId}` : ''} (${requestId})`,
      );
    } else {
      log.toolResult(requestId, result.success, result.content, operationId);
    }

    client.sendToolCallResponse({
      requestId,
      result: {
        content: result.content,
        error: result.error,
        executionTimeMs,
        state: result.state,
        success: result.success,
      },
    });
  });

  // Handle generic server-internal device RPCs (git / workspace / file ops).
  // Shares the `@orvilo/device-control` dispatcher with the desktop app so the
  // CLI exposes the same remote-device control surface.
  client.on('rpc_request', async (request: RpcRequestMessage) => {
    const { method, params, requestId } = request;
    if (isDaemonChild) appendLog(`[RPC] ${method} (${requestId})`);
    else info(`Received rpc_request: method=${method} (${requestId})`);

    try {
      const data = await executeDeviceRpc(method, params, deps);
      client.sendRpcResponse({ requestId, result: { data, success: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isDaemonChild) appendLog(`[RPC ERROR] ${method}: ${message} (${requestId})`);
      else error(`rpc_request method=${method} failed: ${message}`);
      client.sendRpcResponse({ requestId, result: { error: message, success: false } });
    }
  });

  // Gateway liveness is the lease renewal source for in-daemon Prime runs:
  // each heartbeat ack re-arms every live run's bounded side-effect lease,
  // so a device that loses the gateway stops them on schedule.
  client.on('heartbeat_ack', () => {
    renewDevicePrimeRuns();
  });

  // Handle gateway-dispatched agent runs (heterogeneous agents, e.g. Claude
  // Code). Mirrors the desktop app: spawn `orvilo hetero exec`, which owns the full
  // execution + server-ingest pipeline. Ack with the spawn outcome — `accepted`
  // once the child starts, `rejected` if it fails to spawn (e.g. bad cwd) — so
  // a failed dispatch surfaces as an error instead of a stuck assistant message.
  client.on('agent_run_request', async (request: AgentRunRequestMessage) => {
    info(
      `Received agent_run_request: operationId=${request.operationId} type=${request.agentType}`,
    );
    try {
      const ack = await spawnHeteroAgentRun(
        {
          agentType: request.agentType,
          assistantMessageId: request.assistantMessageId,
          args: request.args,
          builtinTools: request.builtinTools,
          cwd: request.cwd,
          env: request.env,
          imageList: request.imageList,
          jwt: request.jwt,
          operationId: request.operationId,
          // `request.jwt` IS the operation token on this path (no user-token
          // substitution like the desktop does) — forwarded under the explicit
          // key so the exec-side env contract matches the other two hosts.
          operationJwt: request.jwt,
          prime: request.prime,
          prompt: request.prompt,
          resumeFallbackSystemContext: request.resumeFallbackSystemContext,
          resumeSessionId: request.resumeSessionId,
          runGeneration: request.runGeneration,
          serverUrl: getServerUrl(),
          systemContext: request.systemContext,
          topicId: request.topicId,
          workspaceId: request.ingestWorkspaceId ?? request.workspaceId,
        },
        { error, info },
      );
      client.sendAgentRunAck({ operationId: request.operationId, ...ack });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      error(`agent_run_request failed: ${reason}`);
      client.sendAgentRunAck({ operationId: request.operationId, reason, status: 'rejected' });
    }
  });
}

function createDaemonLogger() {
  return {
    debug: (msg: string) => appendLog(`[DEBUG] ${msg}`),
    error: (msg: string) => appendLog(`[ERROR] ${msg}`),
    info: (msg: string) => appendLog(`[INFO] ${msg}`),
    warn: (msg: string) => appendLog(`[WARN] ${msg}`),
  };
}

function formatUptime(startedAt: Date): string {
  const diff = Date.now() - startedAt.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// How far before expiry to proactively refresh (1 hour)
const PROACTIVE_REFRESH_BUFFER = 60 * 60;

/**
 * Parse the `exp` claim from a JWT without verifying the signature.
 */
function parseJwtExp(token: string): number | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return typeof payload.exp === 'number' ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Schedule a proactive token refresh before the (connect) token expires.
 * `refresh` refreshes the user token and returns the new token. Returns a cleanup
 * function that cancels the scheduled timer.
 */
function scheduleProactiveRefresh(
  token: string,
  tokenType: string,
  refresh: () => Promise<string | undefined>,
  info: (msg: string) => void,
  error: (msg: string) => void,
): (() => void) | null {
  if (tokenType !== 'jwt') return null;

  const exp = parseJwtExp(token);
  if (!exp) return null;

  const lifetimeMs = exp * 1000 - Date.now();
  if (lifetimeMs <= 0) {
    // Token already expired — refresh once on next tick.
    void doRefresh();
    return null;
  }

  // Refresh ahead of expiry, but never let the buffer meet or exceed the token's
  // remaining lifetime: a buffer >= lifetime collapses the refresh window to <=0
  // and busy-loops re-minting (e.g. a 1h token with a 1h buffer). Cap the buffer
  // at half the remaining lifetime so a short-lived token refreshes about once per
  // half-life instead of spinning.
  const bufferMs = Math.min(PROACTIVE_REFRESH_BUFFER * 1000, lifetimeMs / 2);
  const delay = lifetimeMs - bufferMs;

  const timer = setTimeout(() => void doRefresh(), delay);
  return () => clearTimeout(timer);

  async function doRefresh() {
    try {
      const newToken = await refresh();
      if (!newToken) {
        error('Proactive token refresh failed — no valid credentials.');
        return;
      }
      if (newToken !== token) info('Proactively refreshed token.');
    } catch {
      error('Proactive token refresh failed.');
    }
  }
}

async function collectSystemInfo(): Promise<DeviceSystemInfo> {
  const home = os.homedir();
  const platform = process.platform;
  const videosDir = platform === 'linux' ? 'Videos' : 'Movies';

  return {
    arch: os.arch(),
    // Tell the server-side prompt builder which shell runCommand spawns here.
    defaultShell: (await getShellInfo()).displayName,
    desktopPath: path.join(home, 'Desktop'),
    documentsPath: path.join(home, 'Documents'),
    downloadsPath: path.join(home, 'Downloads'),
    homePath: home,
    musicPath: path.join(home, 'Music'),
    picturesPath: path.join(home, 'Pictures'),
    userDataPath: path.join(home, CLI_CONFIG_DIR_NAME),
    videosPath: path.join(home, videosDir),
    workingDirectory: process.cwd(),
  };
}
