import { randomUUID } from 'node:crypto';
import os from 'node:os';

import { OFFICIAL_DEVICE_GATEWAY_URL } from '@orvilo/const/url';
import type {} from '@orvilo/device-control';
import type {
  AgentRunRequestMessage,
  GatewayClient,
  RpcRequestMessage,
  SystemInfoRequestMessage,
  ToolCallRequestMessage,
  ToolCallResponseMessage,
} from '@orvilo/device-gateway-client';
import type { IdentitySource } from '@orvilo/device-identity';
import type { GatewayConnectionStatus, GatewayLocalState } from '@orvilo/electron-client-ipc';
import { app, powerSaveBlocker } from 'electron';

import { isDev } from '@/const/env';
import { getDesktopEnv } from '@/env';
import { createLogger } from '@/utils/logger';
import { getDesktopUserAgent } from '@/utils/user-agent';

import { createOutcome, type RecordedOutcome, resolveLocalState } from './gatewayLocalState';
import { ServiceModule } from './index';

const logger = createLogger('services:GatewayConnectionSrv');

const DEFAULT_GATEWAY_URL = OFFICIAL_DEVICE_GATEWAY_URL;

/**
 * Result envelope a tool-call handler must return. Mirrors
 * `BuiltinServerRuntimeOutput` so the renderer-side and remote-device paths
 * stay symmetric: `content` is the LLM-facing prompt text; `state` carries the
 * structured payload that downstream persists into `pluginState`.
 */
interface ToolCallResult {
  content: string;
  error?: unknown;
  state?: unknown;
  success: boolean;
}

interface ToolCallHandler {
  (identifier: string | undefined, apiName: string, args: unknown): Promise<ToolCallResult>;
}

/**
 * Coerce a runtime error (which may be an Error, string, or `{ message }`
 * object) into the string shape the wire protocol expects. Returns undefined
 * when there's no error to transmit.
 */
const serializeWireError = (err: unknown): string | undefined => {
  if (err === undefined || err === null) return undefined;
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};

interface AgentRunHandler {
  (request: AgentRunRequestMessage): Promise<{ reason?: string; status: 'accepted' | 'rejected' }>;
}

/**
 * Handler for generic server-internal device RPCs (e.g. workspace-init scans).
 * Dispatches by `method` name and returns the JSON-serializable result. Distinct
 * from {@link ToolCallHandler} — RPCs are never exposed to the agent.
 */
interface RpcHandler {
  (method: string, params: unknown): Promise<unknown>;
}

interface DeviceRegistrar {
  (info: {
    deviceId: string;
    hostname: string;
    identitySource: IdentitySource;
    platform: string;
  }): Promise<void>;
}

/**
 * GatewayConnectionService
 *
 * Core business logic for managing WebSocket connection to the cloud device-gateway.
 * Extracted from GatewayConnectionCtr so other controllers can reuse connect/disconnect.
 */
export default class GatewayConnectionService extends ServiceModule {
  private client: GatewayClient | null = null;
  private connectQueue: Promise<unknown> = Promise.resolve();
  private status: GatewayConnectionStatus = 'disconnected';
  /** Last auto-connect / connect / register outcome; see `gatewayLocalState.ts`. */
  private localOutcome: RecordedOutcome | undefined;
  private deviceId: string | null = null;
  private powerSaveBlockerId: number | null = null;

  private identitySource: IdentitySource | null = null;

  private tokenProvider: (() => Promise<string | null>) | null = null;
  private tokenRefresher: (() => Promise<{ error?: string; success: boolean }>) | null = null;
  private toolCallHandler: ToolCallHandler | null = null;
  private agentRunHandler: AgentRunHandler | null = null;
  private rpcHandler: RpcHandler | null = null;
  private deviceRegistrar: DeviceRegistrar | null = null;
  // ─── Configuration ───

  /**
   * Set token provider function (to decouple from RemoteServerConfigCtr)
   */
  setTokenProvider(provider: () => Promise<string | null>) {
    this.tokenProvider = provider;
  }

  /**
   * Set token refresher function (for auth_expired handling)
   */
  setTokenRefresher(refresher: () => Promise<{ error?: string; success: boolean }>) {
    this.tokenRefresher = refresher;
  }

  /**
   * Set tool call handler (to route tool calls to LocalFileCtr/ShellCommandCtr)
   */
  setToolCallHandler(handler: ToolCallHandler) {
    this.toolCallHandler = handler;
  }

  /**
   * Set the generic device-RPC handler (routes server-internal method calls such
   * as workspace-init to the relevant controller). Distinct from the tool-call
   * handler — these are never surfaced to the agent.
   */
  setRpcHandler(handler: RpcHandler) {
    this.rpcHandler = handler;
  }

  setAgentRunHandler(handler: AgentRunHandler) {
    this.agentRunHandler = handler;
  }

  /**
   * Persist this device to the server's device registry. Called on every
   * connect once the userId is known (deviceId is user-scoped). Injected by the
   * controller, which owns the authed server URL + token.
   */
  setDeviceRegistrar(registrar: DeviceRegistrar) {
    this.deviceRegistrar = registrar;
  }

  // ─── Device ID ───

  /**
   * Ensure a stored fallback id exists. Pre-login this doubles as the device id
   * shown by `getDeviceInfo`; once a userId is available `resolveDeviceIdentity`
   * replaces it with a stable machine-derived id.
   */
  loadOrCreateDeviceId() {
    const stored = this.app.storeManager.get('gatewayDeviceId') as string | undefined;
    if (stored) {
      this.deviceId = stored;
    } else {
      this.deviceId = randomUUID();
      this.app.storeManager.set('gatewayDeviceId', this.deviceId);
    }
    logger.debug(`Device ID: ${this.deviceId}`);
  }

  /**
   * Derive the stable, user-scoped device id. Survives Orvilo reinstalls
   * because it hashes the OS machine id; the shared per-principal record preserves
   * the fallback identity when the machine id is unavailable.
   */
  async resolveDeviceIdentity(
    userId: string,
  ): Promise<{ deviceId: string; identitySource: IdentitySource }> {
    const { resolvePersistentDeviceIdentity } = await import('@orvilo/device-identity');
    const identity = await resolvePersistentDeviceIdentity(userId);
    this.deviceId = identity.deviceId;
    this.identitySource = identity.identitySource;
    return identity;
  }

  getDeviceId(): string {
    return this.deviceId || 'unknown';
  }

  /**
   * Connection routing key — the gateway's stale-socket dedupe key, decoupled
   * from the stable `deviceId`. Reuses the persisted random UUID (historically
   * `gatewayDeviceId`, now used purely as the connectionId) so a reconnect of
   * this install replaces only its own previous socket, while a co-running
   * `orvilo connect` on the same machine (same deviceId, different connectionId)
   * stays connected.
   */
  getConnectionId(): string {
    let id = this.app.storeManager.get('gatewayDeviceId') as string | undefined;
    if (!id) {
      id = randomUUID();
      this.app.storeManager.set('gatewayDeviceId', id);
    }
    return id;
  }

  // ─── Connection Status ───

  getStatus(): GatewayConnectionStatus {
    return this.status;
  }

  /** User-facing explanation of the current connection (see `gatewayLocalState.ts`). */
  getLocalState(): GatewayLocalState {
    return resolveLocalState({ recorded: this.localOutcome, status: this.status }, Date.now());
  }

  /** Record why connect did or did not proceed, and tell every window. */
  recordLocalOutcome(outcome: RecordedOutcome) {
    this.localOutcome = outcome;
    this.broadcastStatus();
  }

  async getDeviceInfo() {
    const token = await this.tokenProvider?.();
    const userId = token ? this.extractUserIdFromToken(token) : null;
    const { resolvePersistentDeviceIdentity } = await import('@orvilo/device-identity');
    const deviceId = userId
      ? (await resolvePersistentDeviceIdentity(userId)).deviceId
      : this.getConnectionId();
    return {
      deviceId,
      hostname: os.hostname(),
      platform: process.platform,
      userId: userId ?? undefined,
    };
  }

  /**
   * Whether a registry device id belongs to this physical desktop.
   */
  async matchesDeviceId(deviceId: string): Promise<boolean> {
    if (this.getDeviceId() === deviceId) return true;

    const token = await this.tokenProvider?.();
    const userId = token ? this.extractUserIdFromToken(token) : undefined;
    if (userId) {
      const identity = await this.resolveDeviceIdentity(userId);
      if (identity.deviceId === deviceId) return true;
    }

    return false;
  }

  // ─── Connection Logic ───

  async connect(): Promise<{ error?: string; success: boolean }> {
    if (this.status === 'connected' || this.status === 'connecting') {
      // The socket is up but the server never accepted the registration, so
      // this is the user's "Retry": redo only the registration.
      if (this.localOutcome?.phase === 'registerFailed') await this.retryRegistration();
      return { success: true };
    }
    try {
      return await this.doConnect();
    } catch (err) {
      this.recordLocalOutcome(
        createOutcome('gatewayUnreachable', Date.now(), (err as Error).message),
      );
      throw err;
    }
  }

  private async retryRegistration() {
    const token = await this.tokenProvider?.();
    const userId = token ? this.extractUserIdFromToken(token) : null;
    if (userId) await this.registerThisDevice(userId);
  }

  /**
   * Resolve this device's identity and register it with the server registry,
   * recording the outcome. Failure is non-fatal for the socket but never silent.
   */
  private async registerThisDevice(userId: string) {
    this.recordLocalOutcome(createOutcome('registering', Date.now()));
    const identity = await this.resolveDeviceIdentity(userId);
    try {
      await this.deviceRegistrar?.({
        deviceId: identity.deviceId,
        hostname: os.hostname(),
        identitySource: identity.identitySource,
        platform: process.platform,
      });
      this.recordLocalOutcome(createOutcome('connecting', Date.now()));
    } catch (err) {
      const reason = (err as Error).message;
      logger.warn(`Device registration failed (non-fatal): ${reason}`);
      this.recordLocalOutcome(createOutcome('registerFailed', Date.now(), reason));
    }
    return identity;
  }

  async disconnect(): Promise<{ success: boolean }> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    this.setStatus('disconnected');
    return { success: true };
  }

  /** Serialize sign-in and startup so the previous socket can be closed. */
  private doConnect(): Promise<{ error?: string; success: boolean }> {
    const run = this.connectQueue.then(() => this.openClient());
    this.connectQueue = run.catch(() => {});
    return run;
  }

  private async openClient(): Promise<{ error?: string; success: boolean }> {
    // Clean up any existing client
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }

    if (!this.tokenProvider) {
      logger.warn('Cannot connect: no token provider configured');
      return { error: 'No token provider configured', success: false };
    }

    const token = await this.tokenProvider();
    if (!token) {
      logger.warn('Cannot connect: no access token');
      this.recordLocalOutcome(createOutcome('signInRequired', Date.now()));
      return { error: 'No access token available', success: false };
    }

    const gatewayUrl = this.getGatewayUrl();
    const userId = this.extractUserIdFromToken(token);
    logger.info(`Connecting to device gateway: ${gatewayUrl}, userId: ${userId || 'unknown'}`);

    // Resolve the stable, user-scoped device id and register with the server
    // registry before opening the WS, so the device row exists by the time the
    // gateway reports it online.
    let deviceId = this.getDeviceId();
    if (userId) {
      deviceId = (await this.registerThisDevice(userId)).deviceId;
    } else {
      this.recordLocalOutcome(
        createOutcome(
          'registerFailed',
          Date.now(),
          'Access token has no user id, so this device was not registered',
        ),
      );
    }

    const { GatewayClient } = await import('@orvilo/device-gateway-client');
    const client = new GatewayClient({
      channel: isDev ? 'desktop-dev' : 'desktop',
      connectionId: this.getConnectionId(),
      deviceId,
      gatewayUrl,
      logger,
      token,
      userAgent: getDesktopUserAgent(),
      userId: userId || undefined,
    });

    this.setupClientEvents(client);
    this.client = client;

    await client.connect();

    return { success: true };
  }

  /** Bind all request handlers to the user’s physical connection. */
  private setupClientEvents(client: GatewayClient) {
    client.on('status_changed', (status) => this.setStatus(status));
    client.on('tool_call_request', (request) => this.handleToolCallRequest(request, client));
    client.on('system_info_request', (request) => this.handleSystemInfoRequest(client, request));
    client.on('rpc_request', (request) => this.handleRpcRequest(client, request));
    client.on('agent_run_request', (request) => this.handleAgentRunRequest(client, request));
    client.on('error', (error) => logger.error('WebSocket error:', error.message));
    client.on('auth_expired', () => {
      void this.handleAuthExpired();
    });
  }

  // ─── Auth Expired Handling ───

  private async handleAuthExpired() {
    // Disconnect the current client
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }

    if (!this.tokenRefresher) {
      logger.error('No token refresher configured, cannot handle auth_expired');
      this.setStatus('disconnected');
      this.recordLocalOutcome(createOutcome('signInRequired', Date.now()));
      return;
    }

    logger.info('Attempting token refresh before reconnect');
    const result = await this.tokenRefresher();

    if (result.success) {
      logger.info('Token refreshed, reconnecting');
      await this.doConnect();
    } else {
      logger.error('Token refresh failed:', result.error);
      this.setStatus('disconnected');
      this.recordLocalOutcome(createOutcome('signInRequired', Date.now(), result.error));
    }
  }

  // ─── System Info ───

  /**
   * Triggering workflow: gateway `system_info_request` -> handleSystemInfoRequest
   * -> {@link GatewayClient.sendSystemInfoResponse}, including desktop tool support.
   */
  private async handleSystemInfoRequest(client: GatewayClient, request: SystemInfoRequestMessage) {
    logger.info(`Received system_info_request: requestId=${request.requestId}`);
    const { getShellInfo } = await import('@orvilo/local-file-shell/shell');
    client.sendSystemInfoResponse({
      requestId: request.requestId,
      result: {
        success: true,
        systemInfo: {
          supportedTools: ['orvilo-computer-use'],
          arch: os.arch(),
          // Tell the server-side prompt builder which shell runCommand spawns here.
          defaultShell: (await getShellInfo()).displayName,
          desktopPath: app.getPath('desktop'),
          documentsPath: app.getPath('documents'),
          downloadsPath: app.getPath('downloads'),
          homePath: app.getPath('home'),
          musicPath: app.getPath('music'),
          picturesPath: app.getPath('pictures'),
          userDataPath: app.getPath('userData'),
          videosPath: app.getPath('videos'),
          workingDirectory: process.cwd(),
        },
      },
    });
  }

  // ─── Generic Device RPC ───

  private async handleRpcRequest(client: GatewayClient, request: RpcRequestMessage) {
    const { method, params, requestId } = request;
    logger.info(`Received rpc_request: method=${method}, requestId=${requestId}`);

    if (!this.rpcHandler) {
      client.sendRpcResponse({
        requestId,
        result: { error: 'No RPC handler registered', success: false },
      });
      return;
    }

    try {
      const data = await this.rpcHandler(method, params);
      client.sendRpcResponse({ requestId, result: { data, success: true } });
    } catch (error) {
      logger.error(`rpc_request method=${method} failed:`, serializeWireError(error));
      client.sendRpcResponse({
        requestId,
        result: { error: serializeWireError(error), success: false },
      });
    }
  }

  // ─── Agent Run ───

  private handleAgentRunRequest = async (
    client: GatewayClient,
    request: AgentRunRequestMessage,
  ) => {
    logger.info(
      `Received agent_run_request: operationId=${request.operationId} type=${request.agentType}`,
    );

    if (!this.agentRunHandler) {
      logger.warn('No agent run handler configured, rejecting request');
      client.sendAgentRunAck({
        operationId: request.operationId,
        reason: 'no handler',
        status: 'rejected',
      });
      return;
    }

    // Topic scope for heteroIngest/heteroFinish is carried by the dispatched run.
    const workspaceId = request.ingestWorkspaceId ?? request.workspaceId;
    const result = await this.agentRunHandler(
      workspaceId && workspaceId !== request.workspaceId ? { ...request, workspaceId } : request,
    );
    client.sendAgentRunAck({ operationId: request.operationId, ...result });
  };

  // ─── Tool Call Routing ───

  private handleToolCallRequest = async (
    request: ToolCallRequestMessage,
    client: GatewayClient,
  ) => {
    const { requestId, toolCall } = request;
    const { apiName, arguments: argsStr, identifier, type } = toolCall;

    logger.info(
      `Received tool call: apiName=${apiName}, requestId=${requestId}, type=${type ?? 'tool'}`,
    );

    // Timed on THIS machine's clock, around both routes. The server can only
    // observe the whole dispatch round trip, so without this number a slow tool
    // and slow transport are indistinguishable — and desktop is where most
    // device tool calls actually happen, so leaving it out here would bias the
    // measurement toward the `orvilo connect` subset.
    const startedAt = performance.now();

    try {
      if (type && type !== 'tool') {
        throw new Error(
          'Platform MCP execution is retired. Configure MCP in the Agent’s native harness.',
        );
      }
      if (!this.toolCallHandler) throw new Error('No tool call handler configured');
      const result = await this.toolCallHandler(identifier, apiName, JSON.parse(argsStr));

      // Forward the typed envelope unchanged. Critically, do NOT stringify the
      // whole result into `content` — that would bury the structured payload
      // inside a JSON blob and lose `state`. The wire protocol carries each
      // field separately so downstream (`DeviceGateway` → `RuntimeExecutors`)
      // can persist `state` to `pluginState`. Optional fields are only set
      // when present so payloads stay minimal.
      const wireResult: ToolCallResponseMessage['result'] = {
        content: result.content,
        executionTimeMs: Math.round(performance.now() - startedAt),
        success: result.success,
      };
      const wireError = serializeWireError(result.error);
      if (wireError !== undefined) wireResult.error = wireError;
      if (result.state !== undefined) wireResult.state = result.state;

      client.sendToolCallResponse({ requestId, result: wireResult });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Tool call failed: apiName=${apiName}, error=${errorMsg}`);

      client.sendToolCallResponse({
        requestId,
        result: {
          content: errorMsg,
          error: errorMsg,
          // A failure is timed too: a tool that took 30s to fail is as
          // interesting as one that took 30s to succeed.
          executionTimeMs: Math.round(performance.now() - startedAt),
          success: false,
        },
      });
    }
  };

  // ─── Power Save Blocker ───

  /**
   * Start power save blocker to prevent macOS App Nap from suspending the process
   * while the gateway connection is active. Uses 'prevent-app-suspension' so the
   * display can still sleep — only the app process is kept alive.
   */
  private startPowerSaveBlocker() {
    if (this.powerSaveBlockerId !== null) return;
    this.powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    logger.info(`Power save blocker started (id=${this.powerSaveBlockerId})`);
  }

  private stopPowerSaveBlocker() {
    if (this.powerSaveBlockerId === null) return;
    powerSaveBlocker.stop(this.powerSaveBlockerId);
    logger.info(`Power save blocker stopped (id=${this.powerSaveBlockerId})`);
    this.powerSaveBlockerId = null;
  }

  // ─── Status Broadcasting ───

  private setStatus(status: GatewayConnectionStatus) {
    if (this.status === status) return;

    logger.info(`Connection status: ${this.status} → ${status}`);
    this.status = status;

    // Keep the app process alive while gateway is connected so macOS App Nap
    // does not suspend it during display sleep, which would drop the WebSocket.
    if (status === 'connected') {
      this.startPowerSaveBlocker();
    } else {
      this.stopPowerSaveBlocker();
    }

    this.broadcastStatus();
  }

  private broadcastStatus() {
    this.app.browserManager.broadcastToAllWindows('gatewayConnectionStatusChanged', {
      localState: this.getLocalState(),
      status: this.status,
    });
  }

  // ─── Gateway URL ───

  private getGatewayUrl(): string {
    // Env override wins (dev: point at a local `wrangler dev` gateway), then the
    // user-configured store value, then the production default.
    return (
      getDesktopEnv().DEVICE_GATEWAY_URL ||
      this.app.storeManager.get('gatewayUrl') ||
      DEFAULT_GATEWAY_URL
    );
  }

  // ─── Token Helpers ───

  /**
   * Extract userId (sub claim) from JWT without verification.
   * The token will be verified server-side; we just need the userId for routing.
   */
  private extractUserIdFromToken(token: string): string | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      return payload.sub || null;
    } catch {
      logger.warn('Failed to extract userId from JWT token');
      return null;
    }
  }
}
