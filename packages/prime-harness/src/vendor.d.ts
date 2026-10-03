/**
 * Minimal type facades for the vendored Prime packages under `vendor/prime/`.
 *
 * The vendored source stays OUT of the repository TypeScript program; these
 * declarations type only the surface the runner actually uses. esbuild
 * resolves the real implementations at bundle time (scripts/build.mjs), so the
 * shapes here must stay structurally compatible with upstream — keep them
 * narrow and honest rather than permissive.
 */

declare module '@earendil-works/pi-ai' {
  export type Api = string;
  export type Provider = string;
  export type StopReason = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';

  export interface TextContent {
    text: string;
    textSignature?: string;
    type: 'text';
  }
  export interface ThinkingContent {
    redacted?: boolean;
    thinking: string;
    thinkingSignature?: string;
    type: 'thinking';
  }
  export interface ImageContent {
    data: string;
    mimeType: string;
    type: 'image';
  }
  export interface ToolCall {
    arguments: Record<string, unknown>;
    id: string;
    name: string;
    thoughtSignature?: string;
    type: 'toolCall';
  }
  export interface Usage {
    cacheRead: number;
    cacheWrite: number;
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    };
    input: number;
    output: number;
    totalTokens: number;
  }
  export interface UserMessage {
    content: string | (TextContent | ImageContent)[];
    role: 'user';
    timestamp: number;
  }
  export interface AssistantMessage {
    api: Api;
    content: (TextContent | ThinkingContent | ToolCall)[];
    errorMessage?: string;
    model: string;
    provider: Provider;
    role: 'assistant';
    stopReason: StopReason;
    timestamp: number;
    usage: Usage;
  }
  export interface ToolResultMessage {
    content: (TextContent | ImageContent)[];
    isError: boolean;
    role: 'toolResult';
    timestamp: number;
    toolCallId: string;
    toolName: string;
  }
  export type Message = UserMessage | AssistantMessage | ToolResultMessage;

  export interface Tool {
    description: string;
    name: string;
    parameters: unknown;
  }
  export interface Context {
    messages: Message[];
    systemPrompt?: string;
    tools?: Tool[];
  }
  export interface Model<TApi extends Api = Api> {
    api: TApi;
    baseUrl: string;
    contextWindow: number;
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    };
    headers?: Record<string, string>;
    id: string;
    input: ('text' | 'image')[];
    maxTokens: number;
    name: string;
    provider: Provider;
    reasoning: boolean;
  }
  export interface SimpleStreamOptions {
    maxTokens?: number;
    reasoning?: string;
    serviceTier?: string;
    sessionId?: string;
    signal?: AbortSignal;
    temperature?: number;
    thinkingBudgets?: unknown;
  }

  export type AssistantMessageEvent =
    | { type: 'start'; partial: AssistantMessage }
    | { type: 'text_start'; contentIndex: number; partial: AssistantMessage }
    | { type: 'text_delta'; contentIndex: number; delta: string; partial: AssistantMessage }
    | { type: 'text_end'; contentIndex: number; content: string; partial: AssistantMessage }
    | { type: 'thinking_start'; contentIndex: number; partial: AssistantMessage }
    | { type: 'thinking_delta'; contentIndex: number; delta: string; partial: AssistantMessage }
    | { type: 'thinking_end'; contentIndex: number; content: string; partial: AssistantMessage }
    | { type: 'toolcall_start'; contentIndex: number; partial: AssistantMessage }
    | { type: 'toolcall_delta'; contentIndex: number; delta: string; partial: AssistantMessage }
    | { type: 'toolcall_end'; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
    | { type: 'done'; reason: 'stop' | 'length' | 'toolUse'; message: AssistantMessage }
    | { type: 'error'; reason: 'aborted' | 'error'; error: AssistantMessage };

  export interface AssistantMessageEventStream {
    [Symbol.asyncIterator]: () => AsyncIterator<AssistantMessageEvent>;
    end: (result?: AssistantMessage) => void;
    push: (event: AssistantMessageEvent) => void;
  }

  export function createAssistantMessageEventStream(): AssistantMessageEventStream;

  export function clampServiceTier<TApi extends Api>(
    model: Model<TApi>,
    serviceTier?: string,
  ): string | undefined;
}

declare module '@earendil-works/pi-coding-agent' {
  import type {
    AssistantMessage,
    Context,
    Model,
    SimpleStreamOptions,
  } from '@earendil-works/pi-ai';
  import type { AgentSessionMessageController } from '@earendil-works/pi-coding-agent/core/agent-messages.js';
  import type { AgentObserveController } from '@earendil-works/pi-coding-agent/core/agent-observe.js';
  import type { AgentRlmHeartbeatController } from '@earendil-works/pi-coding-agent/core/cron-jobs.js';
  import type { SubagentRuntimeHost } from '@earendil-works/pi-coding-agent/core/rlm-runtime.js';

  /** A `type` alias (not `interface`) so the union member keeps an implicit
   * index signature and stays assignable to `UpstreamEvent`-style views. */
  export type AgentEventToolExecution = {
    args?: unknown;
    isError?: boolean;
    partialResult?: unknown;
    result?: unknown;
    toolCallId: string;
    toolName: string;
    type: 'tool_execution_start' | 'tool_execution_update' | 'tool_execution_end';
  };

  export type AgentSessionEvent =
    | { type: 'agent_start' }
    | { type: 'agent_end'; messages: unknown[] }
    | { type: 'turn_start' }
    | { type: 'turn_end'; message: unknown; toolResults: unknown[] }
    | { type: 'message_start'; message: unknown }
    | {
        type: 'message_update';
        message: AssistantMessage;
        assistantMessageEvent: { type: string; delta?: string };
      }
    | { type: 'message_end'; message: AssistantMessage }
    | AgentEventToolExecution
    | { type: string; [key: string]: unknown };

  export interface AgentSession {
    abort: () => Promise<void>;
    readonly agent: {
      convertToLlm?: unknown;
      getApiKey?: unknown;
      onPayload?: unknown;
      onResponse?: unknown;
      streamFn?: unknown;
      toolExecution?: unknown;
      transformContext?: unknown;
    };
    dispose: () => void;
    disposeAsync: () => Promise<void>;
    getActiveToolNames: () => string[];
    readonly isBashRunning: boolean;
    readonly isCompacting: boolean;
    readonly isRetrying: boolean;
    readonly isStreaming: boolean;
    readonly messages: unknown[];
    prompt: (text: string, options?: Record<string, unknown>) => Promise<void>;
    promptAndWait: (text: string) => Promise<void>;
    promptHeartbeat: (job: unknown, options?: Record<string, unknown>) => Promise<void>;
    readonly sessionFile?: string;
    readonly sessionId: string;
    readonly sessionManager: SessionManager;
    readonly sessionName?: string;
    setSessionName: (name: string) => void;
    subscribe: (listener: (event: AgentSessionEvent) => void) => () => void;
    readonly unfinishedActionCount: number;
  }
  /** Constructor-side class facade — the inline spawn path builds children
   * with `new AgentSession(config)`, not `createAgentSession`. */
  export const AgentSession: {
    new (config: Record<string, unknown>): AgentSession;
  };

  export interface AuthStorage {
    onChange: (listener: () => void) => () => void;
  }
  export const AuthStorage: {
    inMemory: (data?: Record<string, unknown>, options?: Record<string, unknown>) => AuthStorage;
  };

  export interface SessionManager {
    appendModelChange: (provider: string, modelId: string) => string;
    appendServiceTierChange: (serviceTier: string) => string;
    appendThinkingLevelChange: (thinkingLevel: string) => string;
    getCwd: () => string;
    getSessionArtifactDir: () => string | undefined;
    getSessionDir: () => string;
    getSessionFile: () => string | undefined;
    getSessionId: () => string;
    newSession: (options?: { parentSession?: string; rlmDepth?: number }) => unknown;
  }
  export const SessionManager: {
    create: (cwd: string, sessionDir?: string) => SessionManager;
    inMemory: (cwd?: string, sessionDir?: string) => SessionManager;
    open: (path: string, sessionDir?: string, cwdOverride?: string) => SessionManager;
  };

  /** Opaque to the runner — owned by the settings file under agentDir. */
  export type McpServerConfig = Record<string, unknown>;

  export interface SettingsManager {
    getFollowUpMode: () => 'all' | 'one-at-a-time';
    getGlobalMcpServers: () => Record<string, McpServerConfig> | undefined;
    getSteeringMode: () => 'all' | 'one-at-a-time';
    getThinkingBudgets: () => unknown;
    getTransport: () => unknown;
    setTelemetryEnabled: (enabled: boolean) => void;
  }
  export const SettingsManager: {
    create: (cwd: string, agentDir?: string) => SettingsManager;
    inMemory: (settings?: Record<string, unknown>) => SettingsManager;
  };

  export interface McpConnectionStoreLike {
    flush: () => Promise<void>;
    get: (connectionId: string) => unknown;
    load: () => void;
    queueVerifyResult: (record: unknown, options?: unknown) => unknown;
    records: () => readonly unknown[];
    remove: (connectionId: string) => void;
    upsert: (record: unknown) => void;
  }
  export class McpManager {
    constructor(options: {
      authStorage: AuthStorage;
      getUserServers?: () => Record<string, McpServerConfig> | undefined;
      noBackgroundVerification?: boolean;
      connectionStore?: McpConnectionStoreLike;
    });
    dispose(): void;
    getDisabledBuiltinSkillOverrides(): string[];
    registerAllProviders(): void;
  }

  export class DefaultResourceLoader implements ResourceLoader {
    constructor(options: {
      cwd: string;
      agentDir: string;
      settingsManager?: SettingsManager;
      extraBuiltinSkillOverrides?: () => string[];
    });
    extendResources(paths: unknown): void;
    getAgentsFiles(): { agentsFiles: Array<{ path: string; content: string }> };
    getAppendSystemPrompt(): string[];
    getExtensions(): LoadExtensionsResult;
    getPrompts(): { prompts: unknown[]; diagnostics: unknown[] };
    getSkills(): { skills: unknown[]; diagnostics: unknown[] };
    getSystemPrompt(): string | undefined;
    getThemes(): { themes: unknown[]; diagnostics: unknown[] };
    reload(): Promise<void>;
  }

  export interface StreamSimpleFn {
    (
      model: Model,
      context: Context,
      options?: SimpleStreamOptions,
    ): AsyncIterable<{
      type: string;
      [key: string]: unknown;
    }> & { push: (event: unknown) => void; end: (result?: unknown) => void };
  }

  export class ModelRegistry {
    static inMemory(authStorage: AuthStorage): ModelRegistry;
    setOnOAuthProvidersReset(listener: () => void): void;
    registerProvider(
      providerName: string,
      config: {
        api?: string;
        baseUrl?: string;
        apiKey?: string;
        streamSimple?: unknown;
        models?: Model[];
      },
    ): void;
  }

  export interface ExtensionRuntime {
    [key: string]: unknown;
  }

  export interface LoadExtensionsResult {
    diagnostics: unknown[];
    errors: unknown[];
    extensions: unknown[];
    runtime: ExtensionRuntime;
  }

  export function createExtensionRuntime(): ExtensionRuntime;

  export interface ResourceLoader {
    extendResources: (paths: unknown) => void;
    getAgentsFiles: () => { agentsFiles: Array<{ path: string; content: string }> };
    getAppendSystemPrompt: () => string[];
    getExtensions: () => LoadExtensionsResult;
    getPrompts: () => { prompts: unknown[]; diagnostics: unknown[] };
    getSkills: () => { skills: unknown[]; diagnostics: unknown[] };
    getSystemPrompt: () => string | undefined;
    getThemes: () => { themes: unknown[]; diagnostics: unknown[] };
    reload: () => Promise<void>;
  }

  export interface CreateAgentSessionOptions {
    agentDir?: string;
    agentMessageController?: AgentSessionMessageController;
    agentObserveController?: AgentObserveController;
    allowedToolNames?: string[];
    authStorage?: AuthStorage;
    autonomous?: unknown;
    customTools?: unknown[];
    cwd?: string;
    executionMode?: string;
    includeCompactSkill?: boolean;
    includeGoals?: boolean;
    initialActiveToolNames?: string[];
    initialGoal?: { objective: string; tokenBudget?: number };
    mcpManager?: McpManager;
    model?: Model;
    modelRegistry?: ModelRegistry;
    noTools?: 'all' | 'builtin';
    prewarmIpythonKernel?: boolean;
    resourceLoader?: ResourceLoader;
    rlmDepth?: number;
    rlmHeartbeatController?: AgentRlmHeartbeatController;
    rlmMaxDepth?: number;
    rlmParentAgent?: string;
    rlmParentNodeId?: string;
    rlmSessionDir?: string;
    scopedModels?: Array<{ model: Model; thinkingLevel?: string }>;
    semanticParentSessionId?: string;
    semanticSpawnedByRequestId?: string;
    serializedRefine?: boolean;
    serviceTier?: string;
    sessionManager?: SessionManager;
    sessionStartEvent?: {
      previousSessionFile?: string;
      reason: 'startup' | 'reload' | 'new' | 'resume' | 'fork';
      type: 'session_start';
    };
    settingsManager?: SettingsManager;
    subagentRuntimeHost?: SubagentRuntimeHost;
    telemetryDisabled?: boolean;
    thinkingBudgets?: unknown;
    thinkingLevel?: string;
    tools?: string[];
  }

  export function createAgentSession(
    options: CreateAgentSessionOptions,
  ): Promise<{ session: AgentSession }>;
}

/** The SDK keeps `McpManager` out of its root exports; it is reachable only
 * through this internal subpath, which we import exactly as upstream does. */
declare module '@earendil-works/pi-coding-agent/core/mcp/mcp-manager.js' {
  export type { McpConnectionStoreLike } from '@earendil-works/pi-coding-agent';
  export { McpManager } from '@earendil-works/pi-coding-agent';
}

declare module '@earendil-works/pi-coding-agent/core/mcp/connection-store.js' {
  import type { McpConnectionStoreLike } from '@earendil-works/pi-coding-agent';

  export const McpConnectionStore: { open: (path: string) => McpConnectionStoreLike };
}

declare module '@earendil-works/pi-coding-agent/core/session-manager.js' {
  export function getDefaultSessionDir(cwd: string, agentDir?: string): string;
}

declare module '@earendil-works/pi-coding-agent/config.js' {
  export function getAgentDir(): string;
  export function getSessionsDir(agentDir?: string): string;
}

declare module '@earendil-works/pi-agent-core' {
  import type { Model } from '@earendil-works/pi-ai';

  export interface AgentOptions {
    convertToLlm?: unknown;
    followUpMode?: string;
    getApiKey?: unknown;
    initialState?: {
      model?: Model;
      serviceTier?: string;
      systemPrompt?: string;
      thinkingLevel?: string;
      tools?: unknown[];
    };
    onPayload?: unknown;
    onResponse?: unknown;
    sessionId?: string;
    steeringMode?: string;
    streamFn?: unknown;
    thinkingBudgets?: unknown;
    toolExecution?: unknown;
    transformContext?: unknown;
    transport?: unknown;
  }
  export class Agent {
    constructor(options?: AgentOptions);
  }
}

declare module '@earendil-works/pi-coding-agent/core/rlm-runtime.js' {
  import type { Model } from '@earendil-works/pi-ai';
  import type { AgentSession } from '@earendil-works/pi-coding-agent';

  export interface RlmSubagentRuntime {
    session: AgentSession;
  }

  export interface CreateRlmSubagentRuntimeOptions {
    activeToolNames: string[];
    allowedToolNames?: string[];
    customTools: unknown[];
    id: string;
    ignoreSessionIds?: string[];
    includeCompactSkill: boolean;
    includeGoals: boolean;
    model: Model;
    onSessionPublished?: (session: AgentSession) => void;
    parentSession: AgentSession;
    prompt: string;
    rlmDepth: number;
    rlmMaxDepth: number;
    rlmParentNodeId: string;
    scopedModels: Array<{ model: Model; thinkingLevel?: string }>;
    serviceTier: string;
    sessionDir: string;
    sessionName: string;
    spawnCode?: string;
    spawnedByRequestId?: string;
    thinkingLevel: string;
  }

  export interface CreateRlmRootSessionOptions {
    cwd: string;
    model: Model;
    prompt: string;
    sessionName?: string;
    thinkingLevel: string;
  }

  export interface RlmCreateSessionResult {
    active_session_id: string;
    model: string;
    name: string;
    session_file: string;
    session_id: string;
  }

  export interface SubagentRuntimeHost {
    completeRlmSubagentRuntime?: (childId: string, session: AgentSession) => boolean;
    createRlmRootSession?: (
      options: CreateRlmRootSessionOptions,
    ) => Promise<RlmCreateSessionResult>;
    createRlmSubagentRuntime: (
      options: CreateRlmSubagentRuntimeOptions,
    ) => Promise<RlmSubagentRuntime>;
    deleteRlmSubagentRuntime: (childId: string, session?: AgentSession) => Promise<void>;
    disposeRlmSubagentRuntimes?: () => Promise<void>;
    releaseRlmSubagentRuntime?: (
      runtime: RlmSubagentRuntime,
      options: CreateRlmSubagentRuntimeOptions,
      status: 'done' | 'error' | 'cancelled',
    ) => Promise<void>;
  }
}

declare module '@earendil-works/pi-coding-agent/core/cron-jobs.js' {
  export interface AgentCronJob {
    [key: string]: unknown;
    activeSessionId: string;
    deliveryMode?: string;
    id: string;
    schedule?: { kind: string; [key: string]: unknown };
    status: string;
  }

  export interface CreateAgentCronJobInput {
    [key: string]: unknown;
    activeSessionId: string;
    cwd: string;
    deliveryMode?: string;
    label?: string;
    prompt: string;
    runtimeKind?: string;
    scheduleText: string;
    sessionFile: string;
    sessionId: string;
  }

  export interface AgentRlmHeartbeatController {
    createRlmHeartbeat: (input: {
      deliveryMode?: string;
      instruction: string;
      interval?: string;
      label?: string;
    }) => Promise<AgentCronJob>;
    deleteRlmHeartbeat: (id: string) => Promise<AgentCronJob | undefined>;
    listRlmHeartbeats: (options?: { includeInactive?: boolean }) => AgentCronJob[];
    updateRlmHeartbeat: (input: {
      deliveryMode?: string;
      id: string;
      instruction?: string;
      interval?: string;
      label?: string;
      status?: 'pause' | 'resume';
    }) => Promise<AgentCronJob | undefined>;
  }

  export const DEFAULT_HEARTBEAT_SCHEDULE: string;
  export function normalizeHeartbeatSchedule(input?: string): string;
  export function resolveHeartbeatStreamingBehavior(mode?: string): 'steer' | 'followUp';
  export function shouldDeferHeartbeatCronJob(
    job: AgentCronJob,
    activity: {
      hasPendingSessionWork: boolean;
      isBashRunning: boolean;
      isCompacting: boolean;
      isRetrying: boolean;
      isStreaming: boolean;
      unfinishedActionCount: number;
    },
  ): boolean;

  export class AgentCronJobStore {
    static forSessionArtifacts(): AgentCronJobStore;
    createRlmHeartbeat(input: CreateAgentCronJobInput): Promise<AgentCronJob>;
    deleteRlmHeartbeat(activeSessionId: string, id: string): Promise<AgentCronJob | undefined>;
    listRlmHeartbeats(
      activeSessionId: string,
      options?: { includeInactive?: boolean },
    ): AgentCronJob[];
    onHeartbeatChange(listener: () => void): () => void;
    recoverSessionArtifact(sessionId: string): Promise<AgentCronJob[]>;
    registerSessionArtifact(sessionId: string, artifactDir: string): boolean;
    updateRlmHeartbeat(
      activeSessionId: string,
      id: string,
      update: {
        deliveryMode?: string;
        label?: string;
        now?: Date;
        prompt?: string;
        scheduleText?: string;
        status?: 'pause' | 'resume';
      },
    ): Promise<AgentCronJob | undefined>;
  }

  export class AgentCronScheduler {
    constructor(
      store: AgentCronJobStore,
      hooks: {
        runJob: (job: AgentCronJob) => Promise<'skipped' | undefined | void>;
        onError?: (job: AgentCronJob, error: unknown) => void;
      },
    );
    start(): void;
    stop(): void;
    wake(): void;
  }
}

declare module '@earendil-works/pi-coding-agent/core/agent-messages.js' {
  export type AgentFamilyStatus = 'running' | 'idle' | 'inactive';
  export type AgentFamilyRelationship = 'parent' | 'sibling' | 'child';

  export interface AgentFamilyCatalogEntry {
    activeSessionId?: string;
    cwd?: string;
    depth: number;
    firstMessage?: string;
    id: string;
    messageCount?: number;
    name?: string;
    parentSessionId?: string;
    rlmChildId?: string;
    status: AgentFamilyStatus;
  }

  export interface AgentFamilyMember {
    entry: AgentFamilyCatalogEntry;
    relationship: AgentFamilyRelationship;
  }

  export interface AgentSessionNameAvailabilityInput {
    depth: number;
    ignoreSessionIds?: string[];
    name: string;
    parentSessionId?: string;
  }

  export interface AgentSessionMessageEndpoint {
    activeSessionId: string;
    runtimeKind?: string;
    sessionId: string;
    sessionName?: string;
  }

  export interface AgentSessionMessageReceipt {
    deliveredAt?: string;
    deliveryMode?: 'steer';
    deliveryStatus: 'delivered' | 'queued';
    from?: Record<string, unknown>;
    id: string;
    message: string;
    queuedAt?: string;
    source: 'agent_message';
    target: AgentSessionMessageEndpoint;
  }

  export interface AgentSessionMessageSendInput {
    message: string;
    receiverRole?: AgentFamilyRelationship;
    target: string;
  }

  export interface AgentSessionMessageController {
    assertSessionNameAvailable?: (input: AgentSessionNameAvailabilityInput) => void | Promise<void>;
    family?: () => AgentFamilyMember[] | Promise<AgentFamilyMember[]>;
    listAgents: () => unknown | Promise<unknown>;
    sendAgentMessage: (input: AgentSessionMessageSendInput) => Promise<AgentSessionMessageReceipt>;
    setSessionName?: (name: string) => void | Promise<void>;
  }
}

declare module '@earendil-works/pi-coding-agent/core/agent-observe.js' {
  export interface AgentObserveMessagePreview {
    customType?: string;
    index: number;
    role: string;
    text: string;
    timestamp?: number;
    toolCalls?: string[];
    truncated: boolean;
  }

  export interface AgentObserveAgentSummary {
    activeSessionId?: string;
    attachedClients: number;
    cwd?: string;
    firstMessage?: string;
    isCompacting: boolean;
    isCurrent: boolean;
    isSessionActive: boolean;
    isStreaming: boolean;
    latestMessage?: AgentObserveMessagePreview;
    messageCount?: number;
    parentActiveSessionId?: string;
    parentSessionId?: string;
    queuedCount: number;
    relationship?: 'parent' | 'sibling' | 'child';
    rlmChildId?: string;
    rlmParentNodeId?: string;
    runtimeKind?: 'top-level' | 'subagent';
    sessionId: string;
    sessionName?: string;
    status: 'running' | 'idle' | 'inactive';
  }

  export interface AgentObserveController {
    getAgent: (
      target: string,
    ) => { agent: AgentObserveAgentSummary } | Promise<{ agent: AgentObserveAgentSummary }>;
    listAgents: () =>
      | { agents: AgentObserveAgentSummary[]; current: AgentObserveAgentSummary }
      | Promise<{ agents: AgentObserveAgentSummary[]; current: AgentObserveAgentSummary }>;
    recentMessages: (input: { limit?: number; maxChars?: number; target: string }) =>
      | {
          agent: AgentObserveAgentSummary;
          messages: AgentObserveMessagePreview[];
          limit: number;
          maxChars: number;
          truncated: boolean;
        }
      | Promise<{
          agent: AgentObserveAgentSummary;
          messages: AgentObserveMessagePreview[];
          limit: number;
          maxChars: number;
          truncated: boolean;
        }>;
  }
}

declare module '@earendil-works/pi-coding-agent/core/autonomous.js' {
  export interface AgentAutonomousConfig {
    continuationPrompt?: string;
    enabled?: boolean;
    gates?: {
      commands?: string[];
      maxRetries?: number;
      timeoutMs?: number;
    };
    maxContinuations?: number;
    maxTokens?: number;
    maxTurns?: number;
    subagentKeepAliveMs?: number;
    timeoutMs?: number;
  }
}
