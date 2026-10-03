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
}

declare module '@earendil-works/pi-coding-agent' {
  import type {
    AssistantMessage,
    Context,
    Model,
    SimpleStreamOptions,
  } from '@earendil-works/pi-ai';

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
    disposeAsync: () => Promise<void>;
    getActiveToolNames: () => string[];
    prompt: (text: string) => Promise<void>;
    promptAndWait: (text: string) => Promise<void>;
    readonly sessionId: string;
    subscribe: (listener: (event: AgentSessionEvent) => void) => () => void;
  }

  export interface AuthStorage {
    onChange: (listener: () => void) => () => void;
  }
  export const AuthStorage: {
    inMemory: (data?: Record<string, unknown>, options?: Record<string, unknown>) => AuthStorage;
  };

  export interface SessionManager {}
  export const SessionManager: {
    create: (cwd: string, sessionDir?: string) => SessionManager;
    inMemory: (cwd?: string, sessionDir?: string) => SessionManager;
    open: (path: string, sessionDir?: string, cwdOverride?: string) => SessionManager;
  };

  /** Opaque to the runner — owned by the settings file under agentDir. */
  export type McpServerConfig = Record<string, unknown>;

  export interface SettingsManager {
    getGlobalMcpServers: () => Record<string, McpServerConfig> | undefined;
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
    authStorage?: AuthStorage;
    autonomous?: unknown;
    customTools?: unknown[];
    cwd?: string;
    mcpManager?: McpManager;
    model?: Model;
    modelRegistry?: ModelRegistry;
    noTools?: 'all' | 'builtin';
    resourceLoader?: ResourceLoader;
    sessionManager?: SessionManager;
    settingsManager?: SettingsManager;
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
