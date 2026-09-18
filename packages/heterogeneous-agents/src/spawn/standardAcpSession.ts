import type { HeterogeneousAgentModel } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';

import type { AskUserBridge, InterventionAnswer } from '../askUser/AskUserBridge';
import type { UsageData } from '../types';
import type { AcpAgentSessionOptions } from './acpAgentSession';
import {
  ACP_PROTOCOL_VERSION,
  AcpAgentSession,
  selectAcpPermissionOption,
} from './acpAgentSession';
import type { AcpAgentRuntimeSpec } from './acpRuntime';
import type { AcpRpcMessage } from './acpStdioClient';
import { AcpRpcResponseError, AcpServerRequestError } from './acpStdioClient';
import type { UploadHeterogeneousImage } from './agentStreamPipeline';
import type { AgentPromptInput, BuildAgentInputOptions } from './input';
import {
  buildTraeAcpPrompt,
  parseTraeAcpModelCatalog,
  type TraeAcpModelCatalog,
  type TraeAcpPromptBlock,
} from './traeAcpSession';

/**
 * The ACP `session/update` payload vocabulary is identical across every
 * standard-conforming agent, so prompt blocks reuse TRAE's shape.
 */
export type StandardAcpPromptBlock = TraeAcpPromptBlock;
export type StandardAcpTextPromptBlock = Extract<TraeAcpPromptBlock, { type: 'text' }>;
export type StandardAcpImagePromptBlock = Extract<TraeAcpPromptBlock, { type: 'image' }>;

export const buildStandardAcpPrompt = (
  prompt: AgentPromptInput,
  options: BuildAgentInputOptions = {},
): Promise<StandardAcpPromptBlock[]> => buildTraeAcpPrompt(prompt, options);

interface StandardAcpInitializeResult {
  agentCapabilities?: {
    loadSession?: boolean;
    promptCapabilities?: { image?: boolean };
    sessionCapabilities?: { close?: unknown };
  };
  protocolVersion?: number | string;
}

interface StandardAcpSessionResult {
  configOptions?: unknown;
  models?: { availableModels?: unknown; currentModelId?: unknown };
  sessionId?: string;
}

interface StandardAcpSetConfigOptionResult {
  configOptions?: unknown;
}

interface StandardAcpPromptResult {
  stopReason?: string;
  /** ACP experimental `Usage` block on the `session/prompt` result. */
  usage?: unknown;
}

/** One `session/set_config_option` application, applied after session setup. */
export interface StandardAcpConfigOption {
  configId: string;
  /**
   * Selector-derived preferences are optional: they are skipped when the
   * session's advertised `configOptions` lack the configId (or constrain the
   * value to a different set), and a rejected application is logged and
   * dropped instead of failing the run — bridge vocabularies drift across
   * versions. The factory's permission presets omit the flag and stay
   * required, since they encode the headless run posture.
   */
  optional?: boolean;
  value: boolean | string;
}

export interface StandardAcpSessionOptions extends AcpAgentSessionOptions {
  askUserBridge?: AskUserBridge;
  /**
   * Caller-supplied `session/set_config_option` applications, applied after
   * the factory's per-agent defaults (so callers may override them — e.g.
   * `--effort` → `reasoning_effort`, `service_tier` → `fast-mode`).
   */
  configOptions?: StandardAcpConfigOption[];
  /**
   * Resume-continuity seed for agents reporting cumulative (not per-turn)
   * usage — the pipeline emits a baseline `session_configured` so resumed
   * Codex turns don't restart the usage counters at zero.
   */
  initialCumulativeUsage?: UsageData;
  /** Model id selected through `session/set_config_option` after session setup. */
  initialModel?: string;
  inputOptions?: BuildAgentInputOptions;
  /** `session/new` `mcpServers` entries forwarded verbatim (ACP shape). */
  mcpServers?: Record<string, unknown>[];
  onModel?: (model: string) => void;
  /** Structured prompt, or an already-normalized ACP block array. */
  prompt: AgentPromptInput | StandardAcpPromptBlock[];
  uploadImage?: UploadHeterogeneousImage;
}

/**
 * Per-agent static wiring supplied by the factory in `standardAcpAgents.ts`.
 * Everything not listed here is handled generically by the session.
 */
export interface StandardAcpSessionConfig {
  /** Registry adapter key feeding `AgentStreamPipeline`. */
  agentType: string;
  /** Final child argv (ACP prefix flags and user args already merged). */
  args: string[];
  /**
   * Session config options applied in order right after `session/new` /
   * `session/load` — e.g. permission presets (`mode`, `permission`) that
   * replace the legacy CLI `--permission-mode` flags.
   */
  configOptions?: StandardAcpConfigOption[];
  /** Extra `_meta` merged into the session-establishing request. */
  sessionMeta?: Record<string, unknown>;
  spec: AcpAgentRuntimeSpec;
}

interface ParsedPermissionRequest {
  options: { kind?: string; name: string; optionId: string }[];
  title: string;
  toolCallId: string;
}

interface ElicitationQuestion {
  fieldKey: string;
  header: string;
  multiSelect: boolean;
  options: { description?: string; label: string }[];
  question: string;
}

const ELICITATION_FIELD_PATTERN = /^question_(\d+)$/;
const ELICITATION_CUSTOM_SUFFIX = '_custom';

const FREEFORM_KEY = '__freeform__';
const SUPPLEMENT_KEY = '__supplement__';

/**
 * `session/request_permission` auto-answer preference when no AskUser bridge
 * is attached: durable allow first, then once, then reject as the least
 * surprising non-allowable fallback.
 */
const AUTO_PERMISSION_PREFERENCES = [
  (option: { kind?: unknown; optionId?: unknown }) =>
    option.kind === 'allow_always' ||
    option.optionId === 'allow_always' ||
    option.optionId === 'approve_always',
  (option: { kind?: unknown; optionId?: unknown }) =>
    option.optionId === 'allow_session' ||
    option.optionId === 'approve_for_session' ||
    option.kind === 'allow_once' ||
    option.optionId === 'allow_once',
  (option: { kind?: unknown }) => option.kind === 'reject_once',
];

/**
 * Parse the `configOptions` list carried by `session/new` / `session/load` /
 * `session/set_config_option` results into `configId → allowed select values`.
 * Both field spellings are accepted (`id` in protocol v1, `configId` in v2);
 * an entry with no enumerated `options` maps to `undefined` (unconstrained).
 */
const parseAdvertisedConfigOptions = (
  value: unknown,
): Map<string, Set<string> | undefined> => {
  const advertised = new Map<string, Set<string> | undefined>();
  if (!Array.isArray(value)) return advertised;
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = entry.configId ?? entry.id;
    if (typeof id !== 'string' || !id) continue;
    const allowed =
      Array.isArray(entry.options) && entry.options.length > 0
        ? new Set(
            entry.options.flatMap((variant) => {
              const optionValue = isRecord(variant) ? variant.value : undefined;
              if (typeof optionValue === 'boolean') return [String(optionValue)];
              return typeof optionValue === 'string' && optionValue ? [optionValue] : [];
            }),
          )
        : undefined;
    advertised.set(id, allowed);
  }
  return advertised;
};

/**
 * Shared ACP v1 session for every agent reached through
 * {@link ../acpRuntime!ACP_AGENT_RUNTIMES} — native `*-acp` modes and upstream
 * bridge binaries alike.
 *
 * The session owns the parts that are identical everywhere:
 *   - `initialize` (fs/terminal disabled, form elicitation advertised so
 *     bridges can surface AskUserQuestion-style forms)
 *   - `session/new` | `session/load` (+ optional `_meta` / `mcpServers`)
 *   - model discovery + `initialModel` via `session/set_config_option`
 *     (or the legacy `session/set_model` fallback)
 *   - `session/request_permission` → interactive `AskUserBridge` card, or a
 *     deterministic allow-all answer when no bridge is attached
 *   - `elicitation/create` (form mode) → AskUserBridge question card
 *   - `session/update` → `AgentStreamPipeline` (adapter selected by
 *     `config.agentType`)
 *   - synthetic `<prefix>_session` / `<prefix>_prompt_completed` /
 *     `<prefix>_error` lifecycle payloads
 *
 * Per-agent variance is reduced to `StandardAcpSessionConfig` (argv, config
 * options, `_meta`) plus the runtime spec (labels/transport/event prefix).
 */
export class StandardAcpSession extends AcpAgentSession<
  StandardAcpInitializeResult,
  StandardAcpSessionOptions
> {
  private acceptUpdates = false;
  /**
   * Latest `configId → allowed values` snapshot the agent advertised — seeded
   * from `session/new`/`session/load` and refreshed by every
   * `session/set_config_option` response, so options applied later (e.g. a
   * model-gated `effort`) gate on the post-set vocabulary.
   */
  private advertisedConfigOptions = new Map<string, Set<string> | undefined>();
  private modelDiscovery?: StandardAcpSession;
  private resolvedPrompt: StandardAcpPromptBlock[] = [];

  constructor(
    options: StandardAcpSessionOptions,
    private readonly sessionConfig: StandardAcpSessionConfig,
  ) {
    super(options, {
      args: sessionConfig.args,
      pipeline: {
        agentType: sessionConfig.agentType,
        cwd: options.cwd,
        initialCumulativeUsage: options.initialCumulativeUsage,
        uploadImage: options.uploadImage,
      },
      processLabel: sessionConfig.spec.label,
      transport: sessionConfig.spec.transport,
    });
  }

  /** The agent-native session id (for resume). */
  get nativeSessionId(): string | undefined {
    return this.acpSessionId;
  }

  /** Short-lived probe: create a session and read the agent's model catalog. */
  async discoverModels(): Promise<HeterogeneousAgentModel[]> {
    try {
      const initialized = await this.initializeConnection();
      const sessionResult = await this.client.request<StandardAcpSessionResult>('session/new', {
        cwd: this.options.cwd,
        mcpServers: [],
      });
      if (!sessionResult?.sessionId) {
        throw new Error(`${this.sessionConfig.spec.label} returned no session id`);
      }
      const catalog = parseTraeAcpModelCatalog(sessionResult);
      if (!catalog) {
        throw new Error(
          `${this.sessionConfig.spec.label} did not expose a model configuration option`,
        );
      }
      if (initialized?.agentCapabilities?.sessionCapabilities?.close) {
        await this.client.request('session/close', { sessionId: sessionResult.sessionId });
      }
      return catalog.models;
    } finally {
      this.client.close();
    }
  }

  protected async prepareRun(): Promise<void> {
    this.resolvedPrompt = await this.resolvePrompt();
  }

  protected buildInitializeParams(): unknown {
    return {
      clientCapabilities: {
        // `elicitation.form` opts into `elicitation/create` form requests —
        // how claude-agent-acp surfaces `AskUserQuestion` and codex-acp
        // surfaces approval forms. `url` is intentionally not advertised:
        // there is no channel to render an OAuth URL card.
        elicitation: { form: {} },
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: {
        name: 'lobehub',
        title: 'LobeHub',
        version: this.options.clientVersion,
      },
      protocolVersion: ACP_PROTOCOL_VERSION,
    };
  }

  protected validateInitialized(initialized: StandardAcpInitializeResult): void {
    if (
      typeof initialized?.protocolVersion === 'number' &&
      initialized.protocolVersion !== ACP_PROTOCOL_VERSION
    ) {
      throw new Error(
        `${this.sessionConfig.spec.label} returned unsupported protocol version: ${initialized.protocolVersion}`,
      );
    }
  }

  protected async establishSession(initialized: StandardAcpInitializeResult): Promise<string> {
    const { spec } = this.sessionConfig;
    if (
      this.resolvedPrompt.some((block) => block.type === 'image') &&
      initialized?.agentCapabilities?.promptCapabilities?.image !== true
    ) {
      throw new Error(`${spec.label} agent does not support image prompt blocks`);
    }
    if (this.options.resumeSessionId && initialized?.agentCapabilities?.loadSession !== true) {
      throw new Error(`${spec.label} agent does not support loading sessions`);
    }

    const sessionResult = await this.client.request<StandardAcpSessionResult>(
      this.options.resumeSessionId ? 'session/load' : 'session/new',
      {
        cwd: this.options.cwd,
        mcpServers: this.options.mcpServers ?? [],
        ...(this.options.resumeSessionId ? { sessionId: this.options.resumeSessionId } : {}),
        ...(this.sessionConfig.sessionMeta ? { _meta: this.sessionConfig.sessionMeta } : {}),
      },
    );
    const sessionId = sessionResult?.sessionId ?? this.options.resumeSessionId;
    if (!sessionId) throw new Error(`${spec.label} returned no session id`);
    this.options.onSessionId(sessionId);

    this.mergeAdvertisedConfigOptions(sessionResult.configOptions);
    const model = await this.applyInitialModel(sessionId, sessionResult);
    await this.applySessionConfigOptions(sessionId);
    if (model) {
      this.pipeline.configureSession({ model });
      this.options.onModel?.(model);
    }
    await this.pushToPipeline({ model, sessionId, type: `${spec.eventPrefix}_session` });
    return sessionId;
  }

  protected onBeforePrompt(): void {
    // session/load may replay historical updates before returning; only
    // forward updates once the new prompt is about to start.
    this.acceptUpdates = true;
  }

  protected buildPromptParams(sessionId: string): unknown {
    return { prompt: this.resolvedPrompt, sessionId };
  }

  protected override async settlePrompt(result: unknown): Promise<void> {
    await this.client.drain();
    const promptResult = isRecord(result) ? (result as StandardAcpPromptResult) : undefined;
    await this.pushToPipeline({
      stopReason: promptResult?.stopReason,
      type: `${this.sessionConfig.spec.eventPrefix}_prompt_completed`,
      usage: promptResult?.usage,
    });
  }

  protected async onRunFailure(error: Error): Promise<void> {
    await this.pushToPipeline({
      message: error.message,
      type: `${this.sessionConfig.spec.eventPrefix}_error`,
    });
    await this.emitEvents(await this.pipeline.flush());
  }

  protected onHostClose(): void {
    this.modelDiscovery?.close();
  }

  protected async handleAgentMessage(message: AcpRpcMessage): Promise<void> {
    if (message.method !== 'session/update' || !this.acceptUpdates) return;
    const params = isRecord(message.params) ? message.params : undefined;
    if (!isRecord(params?.update)) return;

    const update = params.update;
    if (update.sessionUpdate === 'config_option_update') {
      const model = parseTraeAcpModelCatalog({
        configOptions: update.configOptions,
      })?.currentModelId;
      if (model) {
        this.pipeline.configureSession({ model });
        this.options.onModel?.(model);
      }
    }
    await this.pushToPipeline(update);
  }

  protected async handleServerRequest(message: AcpRpcMessage): Promise<unknown> {
    switch (message.method) {
      case 'session/request_permission': {
        return this.respondToPermissionRequest(message);
      }
      case 'elicitation/create': {
        return this.respondToElicitation(message);
      }
      default: {
        throw new AcpServerRequestError(
          -32_601,
          `Unsupported ${this.sessionConfig.spec.label} client request: ${message.method}`,
        );
      }
    }
  }

  // ---------------------------------------------------------------- prompt

  private async resolvePrompt(): Promise<StandardAcpPromptBlock[]> {
    const prompt = this.options.prompt;
    if (
      Array.isArray(prompt) &&
      prompt.every(
        (block) =>
          'type' in block && (block.type === 'text' || ('data' in block && block.type === 'image')),
      )
    ) {
      return prompt as StandardAcpPromptBlock[];
    }
    return buildStandardAcpPrompt(prompt as AgentPromptInput, this.options.inputOptions);
  }

  // ----------------------------------------------------------------- model

  private async applyInitialModel(
    sessionId: string,
    sessionResult: StandardAcpSessionResult,
  ): Promise<string | undefined> {
    let catalog = parseTraeAcpModelCatalog(sessionResult);
    const requestedModel = this.options.initialModel?.trim();
    if (!requestedModel || requestedModel === 'default') return catalog?.currentModelId;
    if (!catalog && this.options.resumeSessionId) {
      catalog = await this.discoverResumeModelCatalog();
    }

    const selected = catalog?.models.find(
      (model) => model.id === requestedModel || model.label === requestedModel,
    );
    const value = selected?.id ?? requestedModel;
    if (catalog && !selected) {
      throw new Error(`${this.sessionConfig.spec.label} model is unavailable: ${requestedModel}`);
    }

    if (!catalog || catalog.protocol === 'config-option') {
      const response = await this.client.request<StandardAcpSetConfigOptionResult>(
        'session/set_config_option',
        { configId: catalog?.configId ?? 'model', sessionId, value },
      );
      this.mergeAdvertisedConfigOptions(response?.configOptions);
      return (
        parseTraeAcpModelCatalog({ configOptions: response?.configOptions })?.currentModelId ??
        value
      );
    }

    await this.client.request('session/set_model', { modelId: value, sessionId });
    return value;
  }

  /**
   * Apply the queued `session/set_config_option` applications in order.
   *
   * Required options (the factory's permission presets) apply unconditionally —
   * a rejection fails the run because they encode the headless posture.
   * `optional` selector-derived options are gated on what the agent actually
   * advertised: skipped when a non-empty `configOptions` list lacks the
   * configId or constrains the value elsewhere, attempted-and-tolerated when
   * nothing was advertised (`session/load` may omit the list entirely). A
   * rejected optional application lands in the stderr trace, never fails the
   * session.
   */
  private async applySessionConfigOptions(sessionId: string): Promise<void> {
    const pending = this.sessionConfig.configOptions ?? [];
    if (pending.length === 0) return;

    for (const option of pending) {
      // Read the latest snapshot per iteration — `mergeAdvertisedConfigOptions`
      // replaces the map, so a set applied earlier in this loop may have
      // refreshed the vocabulary (e.g. a model-gated `effort` option).
      const advertised = this.advertisedConfigOptions;
      if (option.optional && advertised.size > 0) {
        const allowed = advertised.get(option.configId);
        if (allowed === undefined && !advertised.has(option.configId)) {
          this.noteSkippedConfigOption(option, 'not advertised by the agent');
          continue;
        }
        if (allowed !== undefined && !allowed.has(String(option.value))) {
          this.noteSkippedConfigOption(option, 'value not among the advertised options');
          continue;
        }
      }

      try {
        const response = await this.client.request<StandardAcpSetConfigOptionResult>(
          'session/set_config_option',
          { configId: option.configId, sessionId, value: option.value },
        );
        // The response carries the full updated list — refresh the advertised
        // snapshot so later options gate on the post-set state.
        this.mergeAdvertisedConfigOptions(response?.configOptions);
      } catch (error) {
        if (!option.optional) throw error;
        this.noteSkippedConfigOption(
          option,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  /** Refresh the advertised config vocabulary; an absent/empty list keeps the last known one. */
  private mergeAdvertisedConfigOptions(value: unknown): void {
    const parsed = parseAdvertisedConfigOptions(value);
    if (parsed.size > 0) this.advertisedConfigOptions = parsed;
  }

  /** Drop a diagnostic line into the stderr sink; the run's trace records why a selector no-oped. */
  private noteSkippedConfigOption(option: StandardAcpConfigOption, reason: string): void {
    void Promise.resolve(
      this.options.onStderr(
        `[${this.sessionConfig.spec.label}] skipped session config option ` +
          `"${option.configId}=${String(option.value)}": ${reason}\n`,
      ),
    ).catch(() => {});
  }

  /**
   * `session/load` responses may omit `configOptions` on some agents. Spin up
   * a throwaway `session/new` probe to learn the model catalog before
   * applying `initialModel` — mirrors `TraeAcpSession`'s resume path.
   */
  private async discoverResumeModelCatalog(): Promise<TraeAcpModelCatalog | undefined> {
    const discovery = new StandardAcpSession(
      {
        ...this.options,
        initialModel: undefined,
        mcpServers: undefined,
        onEvents: () => {},
        onModel: undefined,
        onRuntimeStatus: () => {},
        onSessionId: () => {},
        operationId: `${this.options.operationId}-model-discovery`,
        prompt: '',
        resumeSessionId: undefined,
        sessionId: `${this.options.sessionId}-model-discovery`,
      },
      { ...this.sessionConfig, configOptions: undefined, sessionMeta: undefined },
    );
    this.modelDiscovery = discovery;
    try {
      const initialized = await discovery.initializeConnection();
      const sessionResult = await discovery.client.request<StandardAcpSessionResult>(
        'session/new',
        { cwd: this.options.cwd, mcpServers: [] },
      );
      const catalog = parseTraeAcpModelCatalog(sessionResult);
      if (initialized?.agentCapabilities?.sessionCapabilities?.close && sessionResult?.sessionId) {
        await discovery.client.request('session/close', { sessionId: sessionResult.sessionId });
      }
      return catalog;
    } finally {
      discovery.client.close();
      if (this.modelDiscovery === discovery) this.modelDiscovery = undefined;
    }
  }

  // ------------------------------------------------------------- permission

  private async respondToPermissionRequest(message: AcpRpcMessage): Promise<unknown> {
    const request = this.parsePermissionRequest(message.params, String(message.id));
    if (!request) {
      const optionId = selectAcpPermissionOption(message.params, AUTO_PERMISSION_PREFERENCES);
      return {
        outcome: optionId ? { optionId, outcome: 'selected' } : { outcome: 'cancelled' },
      };
    }

    const selected = this.options.askUserBridge
      ? await this.askPermissionInteractively(message, request)
      : this.selectPermissionOption(request);
    return {
      outcome: selected
        ? { optionId: selected.optionId, outcome: 'selected' }
        : { outcome: 'cancelled' },
    };
  }

  private parsePermissionRequest(
    value: unknown,
    requestId: string,
  ): ParsedPermissionRequest | undefined {
    if (!isRecord(value)) return;
    const toolCall = isRecord(value.toolCall) ? value.toolCall : undefined;
    const options = Array.isArray(value.options)
      ? value.options.flatMap((option) => {
          if (!isRecord(option) || typeof option.optionId !== 'string' || !option.optionId) {
            return [];
          }
          return [
            {
              ...(typeof option.kind === 'string' ? { kind: option.kind } : {}),
              name: typeof option.name === 'string' && option.name ? option.name : option.optionId,
              optionId: option.optionId,
            },
          ];
        })
      : [];
    if (options.length === 0) return;

    return {
      options,
      toolCallId:
        typeof toolCall?.toolCallId === 'string' ? toolCall.toolCallId : `perm-${requestId}`,
      title:
        typeof toolCall?.title === 'string' && toolCall.title
          ? toolCall.title
          : `Allow ${this.sessionConfig.spec.label} to continue?`,
    };
  }

  private selectPermissionOption(
    request: ParsedPermissionRequest,
  ): ParsedPermissionRequest['options'][number] | undefined {
    const byId = selectAcpPermissionOption(
      { options: request.options },
      AUTO_PERMISSION_PREFERENCES,
    );
    return request.options.find((option) => option.optionId === byId);
  }

  /**
   * Interactive permission: emit a synthetic `askUserQuestion` tool call so
   * the card lands in the normal tool timeline, then await the user's pick.
   * Option `id`s are provider-owned values (the renderer submits `id`, not
   * `label`, when present) — matching `DevinAcpSession`'s convention.
   */
  private async askPermissionInteractively(
    message: AcpRpcMessage,
    request: ParsedPermissionRequest,
  ): Promise<ParsedPermissionRequest['options'][number] | undefined> {
    const bridge = this.options.askUserBridge!;
    const toolCallId = `${this.sessionConfig.spec.eventPrefix}-permission-${String(message.id)}-${request.toolCallId}`;
    const arguments_ = {
      questions: [
        {
          header: 'Permission required',
          multiSelect: false as const,
          options: request.options.map(({ name, optionId }) => ({ id: optionId, label: name })),
          question: request.title,
        },
      ],
    };
    await this.pushToPipeline({
      identifier: this.sessionConfig.spec.provider,
      rawInput: arguments_,
      sessionUpdate: 'tool_call',
      title: 'askUserQuestion',
      toolCallId,
    });
    const answer = await bridge.pending({
      arguments: arguments_,
      interactionKind: 'permission',
      toolCallId,
    });
    await this.pushToPipeline({
      rawOutput: answer,
      sessionUpdate: 'tool_call_update',
      status: 'completed',
      toolCallId,
    });

    const selections = this.getAnswerSelections(answer, request.title);
    return request.options.find(({ optionId }) => selections.includes(optionId));
  }

  private getAnswerSelections(answer: InterventionAnswer, question: string): string[] {
    if (answer.cancelled || !isRecord(answer.result)) return [];
    const selection = answer.result[question];
    return (Array.isArray(selection) ? selection : [selection]).flatMap((value) =>
      typeof value === 'string' ? [value] : [],
    );
  }

  // ------------------------------------------------------------ elicitation

  /**
   * `elicitation/create` — the AskUserQuestion carrier for claude-agent-acp
   * (and MCP elicitation generally). Form mode becomes an AskUserBridge
   * question card; `url` mode is cancelled (there is no URL surface).
   */
  private async respondToElicitation(message: AcpRpcMessage): Promise<unknown> {
    const params = isRecord(message.params) ? message.params : undefined;
    const questions = this.parseElicitationQuestions(params);
    const bridge = this.options.askUserBridge;
    if (!bridge || !params || questions.length === 0) {
      return { action: 'cancel' };
    }

    const toolCallId =
      typeof params.toolCallId === 'string' && params.toolCallId
        ? params.toolCallId
        : `${this.sessionConfig.spec.eventPrefix}-elicit-${String(message.id)}`;
    const arguments_ = {
      questions: questions.map(({ fieldKey: _, ...question }) => question),
    };
    await this.pushToPipeline({
      identifier: this.sessionConfig.spec.provider,
      rawInput: arguments_,
      sessionUpdate: 'tool_call',
      title: 'askUserQuestion',
      toolCallId,
    });
    const answer = await bridge.pending({
      arguments: arguments_,
      interactionKind: 'question',
      toolCallId,
    });
    await this.pushToPipeline({
      rawOutput: answer,
      sessionUpdate: 'tool_call_update',
      status: 'completed',
      toolCallId,
    });

    if (answer.cancelled || !isRecord(answer.result)) return { action: 'cancel' };
    return { action: 'accept', content: this.buildElicitationContent(questions, answer.result) };
  }

  /**
   * Rebuild the canonical `AskUserQuestion` question list from an ACP form
   * schema: `question_<i>` enum/array fields become options, `question_<i>_custom`
   * free-text fields fold back into the pick list (the renderer submits custom
   * text under the question key already).
   */
  private parseElicitationQuestions(
    params: Record<string, unknown> | undefined,
  ): ElicitationQuestion[] {
    const schema = isRecord(params?.requestedSchema) ? params.requestedSchema : undefined;
    const properties = isRecord(schema?.properties) ? schema.properties : undefined;
    if (!properties) return [];

    const single = Object.keys(properties).filter((key) => ELICITATION_FIELD_PATTERN.test(key));
    const message = typeof params?.message === 'string' ? params.message : '';
    const questions: ElicitationQuestion[] = [];
    for (const [key, rawProp] of Object.entries(properties)) {
      const match = key.match(ELICITATION_FIELD_PATTERN);
      if (!match || !isRecord(rawProp)) continue;
      const enumOptions = this.readEnumOptions(rawProp);
      const multiSelect = rawProp.type === 'array';
      questions.push({
        fieldKey: key,
        header: typeof rawProp.title === 'string' ? rawProp.title : '',
        multiSelect,
        options: enumOptions,
        question:
          single.length === 1 && message
            ? message
            : typeof rawProp.description === 'string' && rawProp.description
              ? rawProp.description
              : message,
      });
    }
    return questions.sort((a, b) => Number(a.fieldKey.slice(9)) - Number(b.fieldKey.slice(9)));
  }

  private readEnumOptions(
    prop: Record<string, unknown>,
  ): { description?: string; label: string }[] {
    const variants = Array.isArray(prop.oneOf)
      ? prop.oneOf
      : isRecord(prop.items) && Array.isArray(prop.items.anyOf)
        ? prop.items.anyOf
        : [];
    return variants.flatMap((variant) => {
      if (!isRecord(variant)) return [];
      const label =
        typeof variant.const === 'string'
          ? variant.const
          : typeof variant.title === 'string'
            ? variant.title
            : undefined;
      if (!label) return [];
      return [
        {
          ...(typeof variant.description === 'string' && variant.description
            ? { description: variant.description }
            : {}),
          label,
        },
      ];
    });
  }

  /**
   * Map the renderer's `{ [questionText]: pick(s), __freeform__?, __supplement__? }`
   * answer back onto `question_<i>` / `question_<i>_custom` form fields. Values
   * that aren't enum labels land in the custom field — the bridge stringifies
   * whichever field carries the user's text.
   */
  private buildElicitationContent(
    questions: ElicitationQuestion[],
    result: Record<string, unknown>,
  ): Record<string, unknown> {
    const content: Record<string, unknown> = {};

    const freeform = result[FREEFORM_KEY];
    if (typeof freeform === 'string' && freeform.trim()) {
      content[`question_0${ELICITATION_CUSTOM_SUFFIX}`] = freeform.trim();
      return content;
    }

    for (const question of questions) {
      const value = result[question.question];
      const values = (Array.isArray(value) ? value : [value]).flatMap((entry) =>
        typeof entry === 'string' && entry ? [entry] : [],
      );
      if (values.length === 0) continue;

      const labels = new Set(question.options.map((option) => option.label));
      const picks = values.filter((entry) => labels.has(entry));
      const customs = values.filter((entry) => !labels.has(entry));
      if (picks.length > 0) {
        content[question.fieldKey] = question.multiSelect ? picks : picks[0];
      }
      if (customs.length > 0) {
        content[`${question.fieldKey}${ELICITATION_CUSTOM_SUFFIX}`] = customs.join(', ');
      }
    }

    const supplement = result[SUPPLEMENT_KEY];
    if (typeof supplement === 'string' && supplement.trim() && questions.length > 0) {
      const customKey = `question_0${ELICITATION_CUSTOM_SUFFIX}`;
      content[customKey] = [content[customKey], supplement.trim()].filter(Boolean).join(' ');
    }
    return content;
  }
}

/** True for the ACP `session/load` "session not found" failures that trigger a fresh-start retry. */
export const isStandardAcpSessionNotFoundError = (error: unknown): error is AcpRpcResponseError => {
  if (!(error instanceof AcpRpcResponseError) || error.method !== 'session/load') return false;
  const message = error.rpcError.message ?? '';
  return /not found|no such session|unknown session|expired/i.test(message);
};
