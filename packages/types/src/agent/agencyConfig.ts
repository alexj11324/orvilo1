import type { WorkingDirConfigValue } from '../device';
import type { OrviloAgentChatConfig } from './chatConfig';
import type { AgentGraph } from './graph';
import { hasAnyCliFlag, hasCliConfigKey, hasCliFlag } from './heteroCliArgs';
import type { HeterogeneousAgentType, LocalHeterogeneousAgentType } from './heterogeneousAgent';
import {
  BUILTIN_HETEROGENEOUS_AGENT_CONFIGS,
  HETEROGENEOUS_AGENT_CONFIGS,
  REMOTE_HETEROGENEOUS_AGENT_CONFIGS,
} from './heterogeneousAgent';
import type {
  AmpAgentMode,
  ClaudeCodeReasoningEffort,
  CodexReasoningEffort,
  CodexSpeedMode,
  GrokBuildReasoningEffort,
  HeteroCliEncoding,
  HeterogeneousAgentMode,
  HeterogeneousReasoningEffort,
  HeterogeneousSpeedMode,
  QoderReasoningEffort,
} from './heteroSelectorCapabilities';
import {
  applyHeteroSelection,
  CODEX_REASONING_EFFORT_CONFIG_KEY,
  CODEX_SERVICE_TIER_CONFIG_KEY,
  getHeteroSelectorCapability,
  GROK_BUILD_REASONING_EFFORT_FLAGS,
  HETERO_SELECTOR_CAPABILITIES,
  HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
  isAmpAgentMode,
  isClaudeCodeReasoningEffort,
  isCodexFastServiceTier,
  isCodexReasoningEffort,
  isGrokBuildReasoningEffort,
  isQoderReasoningEffort,
  QODER_REASONING_EFFORT_FLAG,
} from './heteroSelectorCapabilities';

export type HeterogeneousAgentModelCatalogErrorCode =
  'cli_not_found' | 'command_failed' | 'device_unavailable' | 'timeout' | 'unsupported_client';

/** One model reported by a heterogeneous CLI's device-local model catalog. */
export interface HeterogeneousAgentModel {
  /** Exact value accepted by the provider's native model selector. Treat as opaque. */
  id: string;
  /** Optional human-readable model label. */
  label?: string;
  /** Model identifier shown when the CLI does not provide a separate display label. */
  modelId: string;
  /** Provider or CLI family, used only for display grouping. */
  providerId: string;
}

export interface ListHeterogeneousAgentModelsParams {
  args?: string[];
  command?: string;
  cwd?: string;
  env?: Record<string, string>;
  type:
    | 'codebuddy'
    | 'cursor'
    | 'devin'
    | 'droid'
    | 'grok-build'
    | 'opencode'
    | 'pi'
    | 'qoder'
    | 'trae';
}

export interface HeterogeneousAgentModelCatalogSuccess {
  models: HeterogeneousAgentModel[];
  status: 'success';
  updatedAt: number;
}

export interface HeterogeneousAgentModelCatalogFailure {
  error: {
    code: HeterogeneousAgentModelCatalogErrorCode;
    message: string;
  };
  status: 'error';
  updatedAt: number;
}

export type HeterogeneousAgentModelCatalog =
  HeterogeneousAgentModelCatalogFailure | HeterogeneousAgentModelCatalogSuccess;

/** Authentication source used by a heterogeneous agent CLI. */
export type HeterogeneousAuthMode = 'api' | 'subscription';

/**
 * Reference-only user-provider API binding for a heterogeneous agent.
 * Provider credentials are resolved at launch and are never persisted here.
 */
export interface HeterogeneousProviderApiConfig {
  /** Primary model used by the CLI. */
  model: string;
  /** User provider whose runtime credentials are resolved locally. */
  providerId: string;
  /** Optional model used for fast/background work. Defaults to the primary model. */
  smallFastModel?: string | null;
  /** Omitted by existing records; any omitted source is a user-provider binding. */
  source?: 'provider';
}

/** Legacy Claude Code request alias. Current CLIs send `aspectlylabs/${catalogId}`. */
export const SERVER_DEFAULT_HETEROGENEOUS_MODEL_ALIAS = 'orvilo-default';

const SERVER_DEFAULT_HETEROGENEOUS_MODEL_NAMESPACE = 'aspectlylabs/';

export const formatServerDefaultHeterogeneousModel = (model: string): string =>
  `${SERVER_DEFAULT_HETEROGENEOUS_MODEL_NAMESPACE}${model}`;

export const isServerDefaultHeterogeneousModel = (
  requestModel: unknown,
  operationModel: string,
): boolean => requestModel === formatServerDefaultHeterogeneousModel(operationModel);

export interface ServerDefaultHeterogeneousRelayInvocation {
  acceptedAt: string;
  agentType: string;
  ingress: 'anthropic-messages' | 'openai-responses';
  model: string;
  operationId: string;
  provider: string;
}

/** Durable proof written only after the official relay accepts a model invocation. */
export const isServerDefaultHeterogeneousRelayInvocation = (
  value: unknown,
): value is ServerDefaultHeterogeneousRelayInvocation => {
  if (!value || typeof value !== 'object') return false;
  const invocation = value as Partial<ServerDefaultHeterogeneousRelayInvocation>;
  return (
    typeof invocation.acceptedAt === 'string' &&
    typeof invocation.agentType === 'string' &&
    ['anthropic-messages', 'openai-responses'].includes(invocation.ingress ?? '') &&
    typeof invocation.model === 'string' &&
    typeof invocation.operationId === 'string' &&
    typeof invocation.provider === 'string'
  );
};

/**
 * Map a CLI-reported server-default model back to the catalog id.
 *
 * Supported CLIs request `aspectlylabs/${catalogId}`. Older Claude Code sessions used
 * {@link SERVER_DEFAULT_HETEROGENEOUS_MODEL_ALIAS}. Neither is the catalog id
 * the user picked.
 */
export const unwrapServerDefaultHeterogeneousModel = (
  reportedModel: string | undefined,
  configuredModel?: string,
): string | undefined => {
  const configured = configuredModel?.trim() || undefined;

  if (!reportedModel) return configured;

  if (reportedModel === SERVER_DEFAULT_HETEROGENEOUS_MODEL_ALIAS) {
    return configured ?? reportedModel;
  }

  if (reportedModel.startsWith(SERVER_DEFAULT_HETEROGENEOUS_MODEL_NAMESPACE)) {
    const unwrapped = reportedModel.slice(SERVER_DEFAULT_HETEROGENEOUS_MODEL_NAMESPACE.length);
    return unwrapped || reportedModel;
  }

  return reportedModel;
};

/** Deployment-owned API binding whose provider and credentials stay on the server. */
export interface HeterogeneousServerDefaultApiConfig {
  /** Model id from the deployment's enabled model catalog. */
  model: string;
  source: 'server-default';
}

export type HeterogeneousApiConfig =
  HeterogeneousProviderApiConfig | HeterogeneousServerDefaultApiConfig;

/**
 * Inner engine driving a builtin Orvilo harness session
 * (`HeterogeneousProviderConfig.type === 'orvilo'`).
 *
 * - `'claude-sdk'`: in-process Claude Agent SDK session over the local `claude` binary.
 * - `'codex-app-server'`: Codex app-server thread session over the local `codex` binary.
 */
export type OrviloEngineKind = 'claude-sdk' | 'codex-app-server';

export const ORVILO_ENGINE_KINDS = [
  'claude-sdk',
  'codex-app-server',
] as const satisfies readonly OrviloEngineKind[];

/**
 * Engine used when `engine` is missing or carries an unrecognized value. The
 * Claude Agent SDK engine is the default Orvilo runtime.
 */
export const DEFAULT_ORVILO_ENGINE: OrviloEngineKind = 'claude-sdk';

export interface OrviloEngineCapabilities {
  builtinTools: boolean;
  userQuestions: boolean;
}

/** Capabilities implemented by this repository's managed desktop transports. */
export const ORVILO_ENGINE_CAPABILITIES = {
  'claude-sdk': { builtinTools: true, userQuestions: true },
  'codex-app-server': { builtinTools: false, userQuestions: false },
} as const satisfies Record<OrviloEngineKind, OrviloEngineCapabilities>;

export const isOrviloEngineKind = (engine: unknown): engine is OrviloEngineKind =>
  typeof engine === 'string' && (ORVILO_ENGINE_KINDS as readonly string[]).includes(engine);

/**
 * Resolve the effective Orvilo engine, defaulting to the Claude Agent SDK
 * engine. Unknown persisted values degrade to the default rather than failing
 * the run — the engine field is a preference, not an identity.
 */
export const resolveOrviloEngine = (
  engine: OrviloEngineKind | string | null | undefined,
): OrviloEngineKind => (isOrviloEngineKind(engine) ? engine : DEFAULT_ORVILO_ENGINE);

export const getOrviloEngineCapabilities = (
  engine: OrviloEngineKind | string | null | undefined,
): OrviloEngineCapabilities => ORVILO_ENGINE_CAPABILITIES[resolveOrviloEngine(engine)];

/**
 * Local CLI family each Orvilo engine executes through — the managed transport
 * binary on desktop (`claude` / `codex`) and the CLI fallback family on
 * connected devices and cloud sandboxes.
 */
export const ORVILO_ENGINE_CLI_AGENT_TYPES = {
  'claude-sdk': 'claude-code',
  'codex-app-server': 'codex',
} as const satisfies Record<OrviloEngineKind, LocalHeterogeneousAgentType>;

/**
 * The local CLI family an Orvilo engine resolves to. Every gate that only
 * understands local CLI types (command resolution, adapters, auth/error
 * classification, resume identity) must see THIS type — `orvilo` has no
 * executable or adapter of its own.
 */
export const resolveOrviloCliAgentType = (
  engine: OrviloEngineKind | string | null | undefined,
): (typeof ORVILO_ENGINE_CLI_AGENT_TYPES)[OrviloEngineKind] =>
  ORVILO_ENGINE_CLI_AGENT_TYPES[resolveOrviloEngine(engine)];

/**
 * Resolve the local CLI family that actually executes a heterogeneous
 * provider: for the builtin `'orvilo'` harness it is the selected engine's
 * family; for every other declared type it is the type unchanged (remote
 * platform types pass through — callers gate them out separately).
 */
export const resolveHeteroCliAgentType = (
  provider: { engine?: OrviloEngineKind | string | null; type: string } | null | undefined,
): string | undefined =>
  provider?.type === 'orvilo' ? resolveOrviloCliAgentType(provider.engine) : provider?.type;

/**
 * Resolve the agent-level system context handed to a heterogeneous run:
 * the provider's static `systemContext`, with the agent's `systemRole`
 * persona prepended for the builtin Orvilo harness only.
 *
 * External CLI harnesses keep their own identity — a raw `claude-code` agent
 * is Claude Code plus extra context, so its `systemRole` stays a Orvilo-side
 * display field. The builtin Orvilo harness has no identity of its own: the
 * agent's persona IS the product, so it leads the injected context.
 */
export const resolveHeteroAgentSystemContext = (
  provider: { systemContext?: string | null; type: string } | null | undefined,
  agentSystemRole?: string | null,
): string | undefined => {
  const persona = provider?.type === 'orvilo' ? agentSystemRole?.trim() : undefined;
  const staticContext = provider?.systemContext?.trim();

  if (!persona && !staticContext) return undefined;
  return [persona, staticContext].filter(Boolean).join('\n\n');
};

/**
 * Heterogeneous agent provider configuration.
 * When set, the assistant delegates execution to an external agent runtime
 * instead of using the built-in model runtime.
 *
 * Three families of hetero agents are supported:
 *
 * - **Local CLI** (`amp` | `claude-code` | `codebuddy` | `codex` |
 *   `cursor` | `droid` | `grok-build` | `kimi-code` | `opencode` | `pi` | `qoder` | `trae`):
 *   spawned as a child process on the desktop or a connected device; uses
 *   `command`, `args`, `env`, `systemContext`.
 *
 * - **Platform task** (`openclaw` | `hermes`): runs on this desktop when
 *   `executionTarget` is `local`, or on a machine connected via `lh connect`
 *   when it is `device`. `platformAgentId` selects the named platform agent.
 *
 * - **Builtin engine** (`orvilo`): a managed session driven by the local
 *   engine selected by `engine`; `command` overrides the engine binary path.
 */
export interface HeterogeneousProviderConfig {
  /** Credential-free API binding used when `authMode` is `api`. */
  apiConfig?: HeterogeneousApiConfig;
  /** Additional CLI arguments for the agent command (local CLI only). */
  args?: string[];
  /** Defaults to `subscription` for backwards compatibility. */
  authMode?: HeterogeneousAuthMode;
  /**
   * Command to spawn the agent (e.g. 'claude') (local CLI only). For the
   * builtin Orvilo engine this overrides the binary resolved from `engine`.
   */
  command?: string;
  /**
   * Reasoning effort, surfaced through the chat-input model selector and
   * translated into the provider-specific CLI flags/config at spawn time.
   * Omitted or `'default'` values are displayed as Default in the UI and are
   * not passed as CLI overrides, so the CLI can keep its own settings, env
   * vars, and account defaults.
   */
  effort?: HeterogeneousReasoningEffort;
  /**
   * Inner engine for the builtin Orvilo harness (`type === 'orvilo'` only).
   * Defaults to `'claude-sdk'`; when the preferred engine's binary is not
   * installed on the execution device, the runtime may fall back to another
   * detected engine.
   */
  engine?: OrviloEngineKind;
  /** Custom environment variables (local CLI only). */
  env?: Record<string, string>;
  /**
   * Amp agent mode, surfaced through the chat-input selector and translated
   * into `--mode <mode>` at spawn time. Omitted or `'default'` values leave
   * Amp's own account and environment defaults in control.
   */
  mode?: HeterogeneousAgentMode;
  /**
   * CLI model, surfaced through the chat-input model selector and translated
   * into the provider-specific model override at spawn time. Empty / omitted
   * values are displayed as Default in the UI, but are not passed as CLI flags
   * so the CLI can keep its own settings, env vars, and account defaults.
   */
  model?: string;
  /**
   * Platform-side agent identifier used by remote device runtimes.
   * - openclaw: selects the named agent (defaults to `'main'`)
   * - hermes: reserved for future use
   */
  platformAgentId?: string;
  /**
   * Speed mode (Codex only), surfaced through the chat-input model selector
   * and translated into the `service_tier` CLI config at spawn time. Omitted
   * or `'default'` values are displayed as Standard in the UI and are not
   * passed as CLI overrides, so the CLI keeps its own settings and account
   * defaults.
   */
  speed?: HeterogeneousSpeedMode;
  /**
   * Static context prepended to every user prompt before it reaches the agent CLI.
   * Use this to prime the agent with workspace conventions, rules, or instructions
   * that should apply to every conversation.
   * Combined with any runtime-generated context (e.g. cloned repo list).
   */
  systemContext?: string;
  /** Agent runtime type, derived from the shared heterogeneous-agent descriptor catalog. */
  type: HeterogeneousAgentType;
}

export interface HeterogeneousTopicModel {
  model: string;
  /**
   * Provider identity used by the topic pin. For the builtin Orvilo harness,
   * this is the resolved CLI family (`claude-code` or `codex`) rather than the
   * declared `orvilo` wrapper type so the pin remains engine-scoped.
   */
  provider: string;
}

/**
 * Everything a topic pins for a heterogeneous run: the model/provider pair from
 * the top-level `topics.model`/`provider` columns plus the reasoning effort
 * from `topics.metadata.heteroEffort`. Each part is optional — a topic may pin
 * an effort without a model (runtimes without a model selector) or the other
 * way round.
 */
export interface HeterogeneousTopicPin extends Partial<HeterogeneousTopicModel> {
  effort?: HeterogeneousReasoningEffort;
}

/**
 * Resolve the topic-level model snapshot for a heterogeneous provider.
 *
 * Server-default API models intentionally remain Agent-scoped: unlike a user-provider
 * binding, their deployment-owned provider identity cannot be represented by the topic's
 * model/provider pair. Their topic execution therefore ignores any stale pin from another
 * auth mode and follows the current Agent config.
 */
export const resolveHeterogeneousProviderTopicModel = (
  config: HeterogeneousProviderConfig,
): HeterogeneousTopicModel | undefined => {
  if (config.authMode === 'api') {
    if (!config.apiConfig || config.apiConfig.source === 'server-default') return undefined;
    return { model: config.apiConfig.model, provider: config.apiConfig.providerId };
  }

  // Selector capabilities are keyed by CLI family. Persist that family as the
  // Orvilo topic identity so a Claude pin cannot be replayed by Codex later.
  const family = resolveHeteroCliAgentType(config);
  const model = getHeteroSelectorCapability(family)?.model?.resolve(config);
  return model ? { model, provider: family ?? config.type } : undefined;
};

/**
 * Check whether a topic model pin belongs to the provider that will execute it.
 *
 * Before Orvilo engines were selectable, its topics were persisted with the
 * wrapper type (`provider: 'orvilo'`). Those pins are compatible with the old
 * Claude default, but their origin cannot be recovered once an Agent is using
 * Codex. Keep the legacy Claude behavior while refusing to carry an unknown
 * model across the engine boundary.
 */
const isCompatibleHeterogeneousTopicModelPin = (
  config: HeterogeneousProviderConfig,
  topicModel: HeterogeneousTopicPin,
): boolean => {
  const family = resolveHeteroCliAgentType(config);

  if (config.type === 'orvilo' && topicModel.provider === config.type) {
    return family === resolveOrviloCliAgentType(DEFAULT_ORVILO_ENGINE);
  }

  return topicModel.provider === config.type || topicModel.provider === family;
};

const applyTopicModelPin = (
  config: HeterogeneousProviderConfig,
  topicModel: HeterogeneousTopicPin | undefined,
): HeterogeneousProviderConfig => {
  if (!topicModel?.model) return config;

  if (config.authMode === 'api') {
    const apiConfig = config.apiConfig;
    // Server-default is Agent-scoped. In particular, do not turn it back into a
    // user-provider binding when this topic retains a pin from an earlier auth mode.
    if (apiConfig?.source === 'server-default') return config;
    if (!topicModel.provider || topicModel.provider === config.type) return config;
    return {
      ...config,
      apiConfig: {
        model: topicModel.model,
        providerId: topicModel.provider,
        ...(apiConfig?.providerId === topicModel.provider
          ? { smallFastModel: apiConfig.smallFastModel }
          : {}),
      },
    };
  }

  if (!isCompatibleHeterogeneousTopicModelPin(config, topicModel)) return config;

  const family = resolveHeteroCliAgentType(config);
  return {
    ...config,
    ...applyHeteroSelection({ ...config, type: family }, { model: topicModel.model }),
  };
};

/**
 * Overlay a topic's pins (model/provider + reasoning effort) on the agent's
 * heterogeneous provider config. The model pin follows the auth-mode rules of
 * {@link applyTopicModelPin}; the effort pin is a plain CLI-level override, so
 * it applies when supported by the effective model — independent of whether
 * a model was pinned. `'default'` is a real pin (it means "drop the
 * agent's effort flag for this topic"), only `undefined` keeps the agent value.
 */
export const applyTopicModelToHeterogeneousProvider = (
  config: HeterogeneousProviderConfig,
  topicModel: HeterogeneousTopicPin | undefined,
): HeterogeneousProviderConfig => {
  if (
    config.authMode !== 'api' &&
    topicModel?.model &&
    !isCompatibleHeterogeneousTopicModelPin(config, topicModel)
  ) {
    return config;
  }

  const withModel = applyTopicModelPin(config, topicModel);
  let effort = topicModel?.effort;
  if (effort === undefined) return withModel;
  const capability = getHeteroSelectorCapability(resolveHeteroCliAgentType(withModel));
  if (!capability?.effort) return withModel;
  const model =
    withModel.authMode === 'api'
      ? withModel.apiConfig?.model
      : capability.model?.resolve(withModel);
  /** Auth-mode changes can reject the topic model while leaving its old effort behind. */
  if (effort !== 'default' && !capability.effort.levels(model ?? 'default').includes(effort)) {
    effort = 'default';
  }
  return {
    ...withModel,
    ...applyHeteroSelection(
      { ...withModel, type: resolveHeteroCliAgentType(withModel) },
      { effort },
    ),
  };
};

const HETEROGENEOUS_AGENT_TYPES = new Set<string>([
  ...BUILTIN_HETEROGENEOUS_AGENT_CONFIGS.map(({ type }) => type),
  ...HETEROGENEOUS_AGENT_CONFIGS.map(({ type }) => type),
  ...REMOTE_HETEROGENEOUS_AGENT_CONFIGS.map(({ type }) => type),
]);

const LEGACY_COMMAND_INFERENCE_TYPES = new Set<LocalHeterogeneousAgentType>([
  'claude-code',
  'codex',
]);

interface LegacyHeterogeneousProviderConfig extends HeterogeneousProviderConfig {
  adapterType?: unknown;
}

const resolveKnownHeterogeneousAgentType = (value: unknown): HeterogeneousAgentType | undefined => {
  if (typeof value !== 'string' || !value) return;
  if (!HETEROGENEOUS_AGENT_TYPES.has(value)) {
    throw new Error(`Unknown heterogeneous agent type: "${value}"`);
  }
  return value as HeterogeneousAgentType;
};

/**
 * Upgrade a persisted provider config written before `type` became required.
 *
 * New callers must always write `type`; this compatibility path exists because
 * `agents.agency_config` is JSONB and older rows are not runtime-schema parsed
 * or backfilled. The old renderer preferred `adapterType`, then recognized
 * Claude/Codex from `command`, and otherwise defaulted to Claude Code.
 */
export const normalizeHeterogeneousProviderConfig = (
  config: HeterogeneousProviderConfig,
): HeterogeneousProviderConfig => {
  const legacyConfig = config as LegacyHeterogeneousProviderConfig;
  const explicitType = resolveKnownHeterogeneousAgentType(legacyConfig.type);
  if (explicitType && legacyConfig.adapterType === undefined) return config;

  const adapterType = explicitType
    ? undefined
    : resolveKnownHeterogeneousAgentType(legacyConfig.adapterType);
  const normalizedCommand = config.command?.trim().toLowerCase();
  const inferredType = normalizedCommand
    ? HETEROGENEOUS_AGENT_CONFIGS.find(
        ({ defaultCommand, type }) =>
          LEGACY_COMMAND_INFERENCE_TYPES.has(type) &&
          normalizedCommand.includes(defaultCommand.toLowerCase()),
      )?.type
    : undefined;
  const type = explicitType ?? adapterType ?? inferredType ?? 'claude-code';
  const normalizedConfig = { ...legacyConfig };
  delete normalizedConfig.adapterType;

  return { ...normalizedConfig, type };
};

const normalizeAgencyConfigHeterogeneousProvider = (
  agencyConfig: OrviloAgentAgencyConfig | null | undefined,
): OrviloAgentAgencyConfig | undefined => {
  const base = agencyConfig ?? undefined;
  if (!base?.heterogeneousProvider) return base;

  const heterogeneousProvider = normalizeHeterogeneousProviderConfig(base.heterogeneousProvider);
  return heterogeneousProvider === base.heterogeneousProvider
    ? base
    : { ...base, heterogeneousProvider };
};

interface ClaudeCodeSelectionSource {
  args?: string[];
  effort?: string | null;
  model?: string | null;
}

interface AmpSelectionSource {
  args?: string[];
  mode?: string | null;
}

interface CodexSelectionSource {
  args?: string[];
  effort?: string | null;
  model?: string | null;
  speed?: string | null;
}

interface GrokBuildSelectionSource {
  args?: string[];
  effort?: string | null;
  model?: string | null;
}

interface QoderSelectionSource {
  args?: string[];
  effort?: string | null;
  model?: string | null;
}

const HETERO_EXEC_AGENT_ARG_FLAG = '--agent-arg';

const modelFlagsOf = (
  type: 'codex' | 'grok-build' | 'opencode' | 'pi' | 'qoder',
): readonly string[] =>
  HETERO_SELECTOR_CAPABILITIES[type].model.encodings.flatMap((encoding: HeteroCliEncoding) =>
    encoding.kind === 'flag' ? encoding.flags : [],
  );

const CODEX_MODEL_FLAGS = modelFlagsOf('codex');
const CURSOR_MODEL_FLAGS = ['--model'] as const;
const GROK_BUILD_MODEL_FLAGS = modelFlagsOf('grok-build');
const OPENCODE_MODEL_FLAGS = modelFlagsOf('opencode');
const PI_MODEL_FLAGS = modelFlagsOf('pi');
const QODER_MODEL_FLAGS = modelFlagsOf('qoder');

const getExplicitAmpAgentMode = (
  source: AmpSelectionSource | null | undefined,
): AmpAgentMode | undefined => {
  const mode = source?.mode?.trim();
  return isAmpAgentMode(mode) ? mode : undefined;
};

const getExplicitClaudeCodeModel = (
  source: ClaudeCodeSelectionSource | null | undefined,
): string | undefined => {
  const model = source?.model?.trim();
  return model && model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION ? model : undefined;
};

const getExplicitClaudeCodeReasoningEffort = (
  source: ClaudeCodeSelectionSource | null | undefined,
): ClaudeCodeReasoningEffort | undefined => {
  const effort = source?.effort?.trim();
  return isClaudeCodeReasoningEffort(effort) ? effort : undefined;
};

const getExplicitCodexModel = (
  source: CodexSelectionSource | null | undefined,
): string | undefined => {
  const model = source?.model?.trim();
  return model && model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION ? model : undefined;
};

const getExplicitCodexReasoningEffort = (
  source: CodexSelectionSource | null | undefined,
): CodexReasoningEffort | undefined => {
  const effort = source?.effort?.trim();
  return isCodexReasoningEffort(effort) ? effort : undefined;
};

const getExplicitGrokBuildReasoningEffort = (
  source: GrokBuildSelectionSource | null | undefined,
): GrokBuildReasoningEffort | undefined => {
  const effort = source?.effort?.trim();
  return isGrokBuildReasoningEffort(effort) ? effort : undefined;
};

const getExplicitQoderReasoningEffort = (
  source: QoderSelectionSource | null | undefined,
): QoderReasoningEffort | undefined => {
  const effort = source?.effort?.trim();
  return isQoderReasoningEffort(effort) ? effort : undefined;
};

const getExplicitCodexSpeedMode = (
  source: CodexSelectionSource | null | undefined,
): CodexSpeedMode | undefined => {
  const speed = source?.speed?.trim();
  return isCodexFastServiceTier(speed) ? 'fast' : undefined;
};

/**
 * Resolve the effective native CLI args for a heterogeneous spawn.
 *
 * For Amp, Claude Code, CodeBuddy, and Codex, explicit mode/model/effort
 * selections are persisted on the provider config; this is the single place
 * that maps those stored settings onto provider-specific argv for direct local
 * desktop spawns. OpenCode, Pi, and Qoder use their device-local model catalogs
 * and forward the selected model using the native `--model` flag.
 * Missing/default settings are resolved by the UI helpers for display only.
 * They are not appended here because CLI overrides must not mask each CLI's
 * own settings/env/account defaults. User-authored `args` win, so there is
 * never a duplicate flag/config override.
 *
 * Returns `provider.args` unchanged (possibly `undefined`) when there is
 * nothing to inject, preserving the prior `args: provider.args` behavior for
 * every other provider type.
 */
export const buildHeteroSpawnArgs = (
  provider: HeterogeneousProviderConfig | undefined | null,
): string[] | undefined => {
  if (!provider) return undefined;
  // The builtin Orvilo harness has no argv of its own — the selected engine's
  // CLI family owns model/effort/speed translation (`--model`/`--effort` for
  // claude-sdk, codex `-c` config for codex-app-server).
  if (provider.type === 'orvilo') {
    return buildHeteroSpawnArgs({
      ...provider,
      type: resolveOrviloCliAgentType(provider.engine),
    });
  }
  if (
    provider.type !== 'amp' &&
    provider.type !== 'claude-code' &&
    provider.type !== 'codebuddy' &&
    provider.type !== 'codex' &&
    provider.type !== 'cursor' &&
    provider.type !== 'droid' &&
    provider.type !== 'devin' &&
    provider.type !== 'grok-build' &&
    provider.type !== 'kimi-code' &&
    provider.type !== 'opencode' &&
    provider.type !== 'pi' &&
    provider.type !== 'qoder' &&
    provider.type !== 'trae'
  ) {
    return provider.args;
  }

  const baseArgs = provider.args ?? [];
  const extraArgs: string[] = [];

  if (provider.type === 'amp') {
    const mode = getExplicitAmpAgentMode(provider);
    if (mode && !hasCliFlag(baseArgs, '--mode')) extraArgs.push('--mode', mode);
  }

  if (provider.type === 'claude-code' || provider.type === 'codebuddy') {
    const model = getExplicitClaudeCodeModel(provider);
    if (model && !hasCliFlag(baseArgs, '--model')) extraArgs.push('--model', model);
    const effort = getExplicitClaudeCodeReasoningEffort(provider);
    if (effort && !hasCliFlag(baseArgs, '--effort')) extraArgs.push('--effort', effort);
  }

  if (provider.type === 'codex') {
    const model = getExplicitCodexModel(provider);
    if (
      model &&
      !hasAnyCliFlag(baseArgs, CODEX_MODEL_FLAGS) &&
      !hasCliConfigKey(baseArgs, 'model')
    ) {
      extraArgs.push('--model', model);
    }

    const effort = getExplicitCodexReasoningEffort(provider);
    if (effort && !hasCliConfigKey(baseArgs, CODEX_REASONING_EFFORT_CONFIG_KEY)) {
      extraArgs.push('-c', `${CODEX_REASONING_EFFORT_CONFIG_KEY}="${effort}"`);
    }

    const speed = getExplicitCodexSpeedMode(provider);
    if (speed && !hasCliConfigKey(baseArgs, CODEX_SERVICE_TIER_CONFIG_KEY)) {
      extraArgs.push('-c', `${CODEX_SERVICE_TIER_CONFIG_KEY}="${speed}"`);
    }
  }

  if (provider.type === 'grok-build') {
    const model = provider.model?.trim();
    if (
      model &&
      model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
      !hasAnyCliFlag(baseArgs, GROK_BUILD_MODEL_FLAGS)
    ) {
      extraArgs.push('--model', model);
    }
    const effort = getExplicitGrokBuildReasoningEffort(provider);
    if (effort && !hasAnyCliFlag(baseArgs, GROK_BUILD_REASONING_EFFORT_FLAGS)) {
      extraArgs.push('--effort', effort);
    }
  }

  if (provider.type === 'opencode') {
    const model = provider.model?.trim();
    if (
      model &&
      model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
      !hasAnyCliFlag(baseArgs, OPENCODE_MODEL_FLAGS)
    ) {
      extraArgs.push('--model', model);
    }
  }

  if (provider.type === 'cursor' || provider.type === 'devin' || provider.type === 'kimi-code') {
    const model = provider.model?.trim();
    if (
      model &&
      model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
      !hasAnyCliFlag(baseArgs, CURSOR_MODEL_FLAGS)
    ) {
      extraArgs.push('--model', model);
    }
  }

  if (provider.type === 'pi') {
    const model = provider.model?.trim();
    if (
      model &&
      model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
      !hasAnyCliFlag(baseArgs, PI_MODEL_FLAGS)
    ) {
      extraArgs.push('--model', model);
    }
  }

  if (provider.type === 'qoder') {
    const model = provider.model?.trim();
    if (
      model &&
      model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
      !hasAnyCliFlag(baseArgs, QODER_MODEL_FLAGS)
    ) {
      extraArgs.push('--model', model);
    }
    const effort = getExplicitQoderReasoningEffort(provider);
    if (effort && !hasCliFlag(baseArgs, QODER_REASONING_EFFORT_FLAG)) {
      extraArgs.push(QODER_REASONING_EFFORT_FLAG, effort);
    }
  }

  if (extraArgs.length === 0) return provider.args;
  return [...baseArgs, ...extraArgs];
};

/**
 * Resolve args for the `lh hetero exec` wrapper.
 *
 * Unlike `buildHeteroSpawnArgs`, these args are consumed by the Orvilo CLI
 * wrapper first, not by the native agent binary. Native provider args are
 * encoded with `--agent-arg=<arg>` so wrapper flags such as `-c, --command`
 * never collide with provider flags. Keep selector overrides in the wrapper's
 * structured `--model` / `--effort` form; `lh hetero exec` translates them
 * into native provider arguments immediately before `spawnAgent`. Amp mode is
 * encoded as a native argument because older device CLIs predate the wrapper's
 * structured `--mode` option but already support `--agent-arg`.
 */
export const buildHeteroExecArgs = (
  provider: HeterogeneousProviderConfig | undefined | null,
): string[] | undefined => {
  if (!provider) return undefined;
  // Builtin Orvilo harness: the device/sandbox-side `lh hetero exec` still
  // needs the resolved engine to pick the engine's CLI family — it travels as
  // the wrapper-level `--engine` option; model/effort/speed use the family's
  // structured encodings.
  if (provider.type === 'orvilo') {
    const engine = resolveOrviloEngine(provider.engine);
    const execArgs = buildHeteroExecArgs({
      ...provider,
      type: resolveOrviloCliAgentType(engine),
    });
    return ['--engine', engine, ...(execArgs ?? [])];
  }
  if (
    provider.type !== 'amp' &&
    provider.type !== 'claude-code' &&
    provider.type !== 'codebuddy' &&
    provider.type !== 'codex' &&
    provider.type !== 'cursor' &&
    provider.type !== 'droid' &&
    provider.type !== 'devin' &&
    provider.type !== 'grok-build' &&
    provider.type !== 'kimi-code' &&
    provider.type !== 'opencode' &&
    provider.type !== 'pi' &&
    provider.type !== 'qoder' &&
    provider.type !== 'trae'
  ) {
    return provider.args;
  }

  const baseArgs = provider.args ?? [];
  const wrapperArgs = baseArgs.map((arg) => `${HETERO_EXEC_AGENT_ARG_FLAG}=${arg}`);
  const selectorArgs: string[] = [];

  if (provider.type === 'amp') {
    const mode = getExplicitAmpAgentMode(provider);
    if (mode && !hasCliFlag(baseArgs, '--mode')) {
      wrapperArgs.push(
        `${HETERO_EXEC_AGENT_ARG_FLAG}=--mode`,
        `${HETERO_EXEC_AGENT_ARG_FLAG}=${mode}`,
      );
    }
  }

  if (provider.type === 'claude-code' || provider.type === 'codebuddy') {
    const model = getExplicitClaudeCodeModel(provider);
    if (model && !hasCliFlag(baseArgs, '--model')) selectorArgs.push('--model', model);
    const effort = getExplicitClaudeCodeReasoningEffort(provider);
    if (effort && !hasCliFlag(baseArgs, '--effort')) selectorArgs.push('--effort', effort);
  }

  if (provider.type === 'codex') {
    const model = getExplicitCodexModel(provider);
    if (
      model &&
      !hasAnyCliFlag(baseArgs, CODEX_MODEL_FLAGS) &&
      !hasCliConfigKey(baseArgs, 'model')
    ) {
      selectorArgs.push('--model', model);
    }

    const effort = getExplicitCodexReasoningEffort(provider);
    if (
      effort &&
      !hasCliFlag(baseArgs, '--effort') &&
      !hasCliConfigKey(baseArgs, CODEX_REASONING_EFFORT_CONFIG_KEY)
    ) {
      selectorArgs.push('--effort', effort);
    }

    const speed = getExplicitCodexSpeedMode(provider);
    if (
      speed &&
      !hasCliFlag(baseArgs, '--speed') &&
      !hasCliConfigKey(baseArgs, CODEX_SERVICE_TIER_CONFIG_KEY)
    ) {
      selectorArgs.push('--speed', speed);
    }
  }

  if (provider.type === 'grok-build') {
    const model = provider.model?.trim();
    if (
      model &&
      model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
      !hasAnyCliFlag(baseArgs, GROK_BUILD_MODEL_FLAGS)
    ) {
      wrapperArgs.push(
        `${HETERO_EXEC_AGENT_ARG_FLAG}=--model`,
        `${HETERO_EXEC_AGENT_ARG_FLAG}=${model}`,
      );
    }
    const effort = getExplicitGrokBuildReasoningEffort(provider);
    if (effort && !hasAnyCliFlag(baseArgs, GROK_BUILD_REASONING_EFFORT_FLAGS)) {
      wrapperArgs.push(
        `${HETERO_EXEC_AGENT_ARG_FLAG}=--effort`,
        `${HETERO_EXEC_AGENT_ARG_FLAG}=${effort}`,
      );
    }
  }

  if (provider.type === 'opencode') {
    const model = provider.model?.trim();
    if (
      model &&
      model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
      !hasAnyCliFlag(baseArgs, OPENCODE_MODEL_FLAGS)
    ) {
      selectorArgs.push('--model', model);
    }
  }

  if (provider.type === 'cursor' || provider.type === 'devin' || provider.type === 'kimi-code') {
    const model = provider.model?.trim();
    if (
      model &&
      model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
      !hasAnyCliFlag(baseArgs, CURSOR_MODEL_FLAGS)
    ) {
      selectorArgs.push('--model', model);
    }
  }

  if (provider.type === 'pi') {
    const model = provider.model?.trim();
    if (
      model &&
      model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
      !hasAnyCliFlag(baseArgs, PI_MODEL_FLAGS)
    ) {
      selectorArgs.push('--model', model);
    }
  }

  if (provider.type === 'qoder') {
    const model = provider.model?.trim();
    if (
      model &&
      model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
      !hasAnyCliFlag(baseArgs, QODER_MODEL_FLAGS)
    ) {
      selectorArgs.push('--model', model);
    }
    const effort = getExplicitQoderReasoningEffort(provider);
    if (effort && !hasCliFlag(baseArgs, QODER_REASONING_EFFORT_FLAG)) {
      selectorArgs.push('--effort', effort);
    }
  }

  if (provider.type === 'droid' || provider.type === 'trae') {
    const model = provider.model?.trim();
    if (model && model !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION) {
      selectorArgs.push('--model', model);
    }
  }

  const args = [...wrapperArgs, ...selectorArgs];
  return args.length > 0 ? args : undefined;
};

/**
 * Where an agent runs.
 * - `none`    : no execution environment — plain chat, no built-in run tools
 * - `auto`    : auto-pick a device — when exactly one is online it is activated
 *               automatically; with several online the model selects one via the
 *               remote-device tool. The ONLY mode that touches a device the user
 *               did not explicitly select. Opt-in: never a silent default.
 * - `local`   : run on the user's Electron desktop (desktop only)
 * - `device`  : dispatched to an `lh connect` device identified by `boundDeviceId`
 * - `sandbox` : server-spawned cloud sandbox
 *
 * Platform task agents (`openclaw` | `hermes`) support `local` and `device` targets.
 */
export type DeviceExecutionTarget = 'auto' | 'device' | 'local' | 'none' | 'sandbox';

export type ExecutionPlanUnroutedReason =
  /** `auto` mode with more than one device online — the model must pick one */
  | 'ambiguous-online-devices'
  /** an explicitly bound device exists but is offline — never silently fall back */
  | 'bound-device-offline'
  /**
   * device-capable target (`auto` / `local` / `device`) but no device selected —
   * nothing bound/requested, and not the `auto` single-online-device case
   */
  | 'no-bound-device'
  /** `auto` mode but no device online at all */
  | 'no-online-device';

/**
 * Where (and whether) a run executes, resolved ONCE at the entry point.
 * Downstream layers consume the plan instead of re-deriving the answer from
 * `executionTarget` / `boundDeviceId` / online state themselves.
 *
 * `target` is the EFFECTIVE execution target (platform defaults and coercions
 * applied; degraded to `none` when device access is denied) — consumers must
 * read it instead of re-resolving `agencyConfig.executionTarget`.
 */
export type ExecutionPlan = { target: DeviceExecutionTarget } &
  /** route execution / device tools to this device (the local machine is a registered device) */
  (
    | { deviceId: string; kind: 'device' }
    /**
     * Device-targeted but no routable device right now. The run proceeds without
     * an active device; the remote-device proxy may let the model activate one
     * mid-run (native agents), or the caller may treat this as a hard error
     * (hetero dispatch).
     */
    | { kind: 'device-unrouted'; reason: ExecutionPlanUnroutedReason }
    /** plain chat — no execution environment, no run tools, no device ever */
    | { kind: 'none' }
    /** ephemeral cloud sandbox */
    | { kind: 'sandbox' }
  );

/**
 * Whether a workspace member may override the agent's shared execution target.
 *
 * - `member`: the shared config is a default; each member may override it
 * - `fixed`: every caller must use the shared execution target
 *
 * Missing values intentionally resolve as `member` for backwards compatibility.
 */
export type ExecutionTargetSelectionPolicy = 'fixed' | 'member';

/**
 * Controls whether a workspace agent always uses its shared model or lets
 * each member choose a personal model for that agent.
 *
 * Missing values resolve contextually: public Workspace Agents inherit the
 * current `member` default, while personal/private Agents remain fixed.
 */
export type AgentModelSelectionPolicy = 'fixed' | 'member';

/**
 * Controls who may publish a share link for the topics a workspace agent
 * holds.
 *
 * The permission is about the AGENT's topics, not just one's own: `member`
 * (the default, which missing values resolve to) lets every workspace member
 * publish any of this agent's topics they can open — including topics other
 * members created. `restricted` narrows publishing to the agent's creator and
 * workspace owners, the same "creator or workspace owner" bucket the
 * Permission page's `canManage` uses.
 *
 * Only *publishing* is gated. Revoking a link (or the private placeholder the
 * share popover creates on open) is never restricted: taking a topic back out
 * of circulation is always safe, and blocking the placeholder would leave a
 * restricted member staring at a popover that cannot load.
 */
export type AgentTopicSharePolicy = 'member' | 'restricted';

/**
 * Agent agency configuration.
 * Contains settings for agent execution modes and device binding.
 */
export interface OrviloAgentAgencyConfig {
  /**
   * Device ID of the machine connected via `lh connect`.
   * Required when `executionTarget === 'device'`.
   */
  boundDeviceId?: string;
  /**
   * Whether to route this agent through a graph-style orchestration runtime
   * (Graph Agent). Undefined means the agent uses the default runtime path.
   *
   * The graph is the agent's behavior definition — node policies, routing
   * conditions and data contracts — so it lives on the agency config (how the
   * agent behaves and executes) rather than the chat config (per-session
   * preferences). This lets an agent evolve its own behavior by evolving its
   * graph nodes.
   */
  enableGraphMode?: boolean;
  /**
   * Execution target for the hetero agent. When omitted, resolves to a
   * platform default: `'local'` on desktop and `'none'` on web.
   */
  executionTarget?: DeviceExecutionTarget;
  /**
   * Workspace execution-target selection policy. A fixed `device` target is
   * valid only with a public workspace device; other fixed targets do not bind
   * a device.
   */
  executionTargetSelectionPolicy?: ExecutionTargetSelectionPolicy;
  /**
   * Graph Agent behavior definition. The `AgentGraph` snapshot describing
   * nodes, edges, field contracts and routing conditions for graph-style
   * orchestration. Together with `enableGraphMode`, this is the agent's
   * behavior body — one graph is one agent.
   */
  graph?: null | AgentGraph;
  heterogeneousProvider?: HeterogeneousProviderConfig;
  /**
   * Confine the run's shell commands to the device sandbox. A *modifier* on
   * `executionTarget: 'local'`, not a target of its own — the run still goes to
   * the same machine through the same routing, it is only what the spawned
   * command may touch that changes (writes limited to the working directory,
   * no network).
   *
   * Modelled as a flag rather than a sixth `DeviceExecutionTarget` deliberately:
   * every existing routing rule (web coercion, gateway upgrade, bot-trigger
   * promotion, fixed-workspace policy) stays literally unchanged, and the flag
   * composes if sandboxed execution later extends to `device` targets.
   *
   * Only shell commands are affected. File tools (`writeFile` / `editFile`) run
   * in the desktop process itself, and heterogeneous CLI agents spawn through
   * their own path — neither passes through the sandboxed runner. Say
   * "commands" in user-facing copy, never "the agent".
   */
  localSandbox?: boolean;
  /**
   * Let the sandboxed commands reach the package-registry allowlist. Only
   * meaningful with {@link localSandbox}; defaults to off.
   *
   * A separate field rather than a tri-state on `localSandbox` because the two
   * answer different questions ("fence this?" vs "may the fence let installs
   * through?"), and because the network choice must survive toggling the
   * sandbox off and back on.
   *
   * Never means "the network is open" — the sandbox backend rejects a catch-all
   * allowlist outright, so this opens a fixed set of registries and forges.
   * User-facing copy must not promise more than that.
   */
  localSandboxNetwork?: boolean;
  /**
   * Workspace model-selection policy. `fixed` keeps the shared agent model
   * authoritative; `member` enables a per-user model override stored in
   * `workspace_user_settings.preference`. Missing values on public Workspace
   * Agents resolve to `member` for legacy rows.
   */
  modelSelectionPolicy?: AgentModelSelectionPolicy;
  /**
   * Model override for sub-agents this agent spawns via
   * `orvilo-agent.callSubAgent`. When unset (or nulled to clear a previous
   * override), sub-agents follow the parent run's effective model — same
   * provider, same model. Configurable in the params panel; `null` rather than
   * `undefined` marks the cleared state because the config deep-merge skips
   * `undefined` and would resurrect the old override.
   */
  subagent?: {
    /**
     * chatConfig overrides (thinking / reasoning-effort extend params) for the
     * overridden sub-agent model, merged over the parent's chatConfig at spawn.
     * Only meaningful together with a `model` override — when sub-agents follow
     * the parent model they inherit the parent's chatConfig wholesale, so the
     * effort follows automatically.
     */
    chatConfig?: Partial<OrviloAgentChatConfig> | null;
    model?: string | null;
    provider?: string | null;
  };
  /**
   * Who may publish a share link for this agent's topics. Missing values
   * resolve to `member` for legacy rows — see {@link AgentTopicSharePolicy}.
   *
   * Enforced server-side in the topic share procedures; the share controls only
   * mirror it so a restricted member sees a disabled button with a reason
   * instead of a request that fails.
   */
  topicSharePolicy?: AgentTopicSharePolicy;
  /**
   * Ad-hoc verify criteria mounted directly on this agent, in addition to any
   * `verifyRubricId`. Use for one-off checks that don't warrant a reusable
   * rubric. References `verify_criteria.id`.
   */
  verifyCriteriaIds?: string[];
  /**
   * Verify (delivery checker) rubric (reusable criteria template) mounted on
   * this agent. Every run instantiates this rubric's criteria — together with
   * any `verifyCriteriaIds` — into its check plan. References `verify_rubrics.id`.
   */
  verifyRubricId?: string;
  /**
   * Per-device working directory source chosen for this agent. Key = `deviceId`
   * (the local machine uses its own gateway deviceId, so local and remote share
   * one model). This is the **agent-level** source in the resolution precedence:
   *
   *   `topic.metadata.workingDirectory`
   *     > effective path of `workingDirByDevice[targetDeviceId]`
   *     > `device.defaultCwd`
   *
   * Legacy values are plain path strings. New git-aware values may carry `git`
   * metadata; when `git.activeWorktree` is present, that active worktree is the
   * effective cwd while `path` remains the source/recent entry.
   *
   * Keyed per device so switching the bound device never resolves a path that
   * only exists on another machine. Persisted (server-synced) so the choice
   * follows the user across sessions / ends.
   */
  workingDirByDevice?: Record<string, WorkingDirConfigValue>;
}

/**
 * The `agencyConfig` keys that govern every workspace member rather than the
 * agent's own behaviour, and which only the agent's creator or the workspace
 * primary owner may write.
 *
 * Any surface that writes `agencyConfig` has to account for these: the TRPC
 * writer strips them from an unauthorized patch, and the public API — whose
 * schema cannot express them at all — must never drop them, not even when
 * clearing the column.
 */
export const AGENT_PERMISSION_POLICY_KEYS = [
  'executionTargetSelectionPolicy',
  'modelSelectionPolicy',
  'topicSharePolicy',
] as const satisfies readonly (keyof OrviloAgentAgencyConfig)[];

/**
 * Explicit defaults written when a workspace agent is created.
 *
 * Members may choose their own model and execution environment, and may share
 * the agent's topics, by default. Legacy public Workspace rows without these
 * policies resolve to the same `member` defaults at runtime.
 */
export const DEFAULT_WORKSPACE_AGENT_SELECTION_POLICIES = {
  executionTargetSelectionPolicy: 'member',
  modelSelectionPolicy: 'member',
  topicSharePolicy: 'member',
} as const satisfies Pick<
  OrviloAgentAgencyConfig,
  'executionTargetSelectionPolicy' | 'modelSelectionPolicy' | 'topicSharePolicy'
>;

/**
 * Resolve who may publish a share link for a topic held by this agent.
 *
 * Personal (non-workspace) agents are never restricted — there is no one else
 * to restrict — and legacy workspace rows without the field keep the `member`
 * behaviour they were created with.
 */
export const resolveAgentTopicSharePolicy = (
  shared: Pick<AgentTopicShareSubject, 'agencyConfig' | 'workspaceId'>,
): AgentTopicSharePolicy => {
  if (!shared.workspaceId) return 'member';

  return shared.agencyConfig?.topicSharePolicy ?? 'member';
};

/** The agent fields a topic-share decision reads. */
export interface AgentTopicShareSubject {
  agencyConfig?: Pick<OrviloAgentAgencyConfig, 'topicSharePolicy'> | null;
  /** Creator of the agent — always allowed to publish its topics. */
  userId?: string | null;
  workspaceId?: string | null;
}

/**
 * Whether `viewerId` may publish a share link for a topic held by this agent.
 *
 * The bypass bucket is deliberately the same one the Permission page calls
 * `canManage`: the agent's creator, or a workspace owner (which the caller
 * resolves — server-side from RBAC, client-side from the workspace role).
 */
export const canPublishAgentTopicLink = (
  agent: AgentTopicShareSubject | null | undefined,
  viewer: { isWorkspaceOwner?: boolean; userId?: string | null },
): boolean => {
  // No agent resolved (legacy session-only topic, or a row this caller cannot
  // see): there is no policy to apply, so fall back to the role gate alone.
  if (!agent) return true;
  if (resolveAgentTopicSharePolicy(agent) === 'member') return true;
  if (viewer.isWorkspaceOwner) return true;

  return !!agent.userId && agent.userId === viewer.userId;
};

/**
 * The raw override merge behind {@link resolveAgencyConfig}, without the
 * `fixed`-policy short-circuit. The owner path of
 * {@link resolveAgentAgencyConfig} needs it directly: the stored selection
 * policy constrains members, not the owner, so the owner's own override
 * applies even while the shared policy is `fixed`.
 */
const applyAgencyConfigOverride = (
  base: OrviloAgentAgencyConfig | undefined,
  override:
    | Pick<
        OrviloAgentAgencyConfig,
        'boundDeviceId' | 'executionTarget' | 'localSandbox' | 'localSandboxNetwork'
      >
    | null
    | undefined,
): OrviloAgentAgencyConfig | undefined => {
  if (!override) return base;
  const hasTarget = override.executionTarget !== undefined;
  const hasDevice = override.boundDeviceId !== undefined;
  // `false` is a real value here — a member turning the sandbox (or its network
  // allowance) back off must override a shared `true`, so test for presence,
  // not truthiness.
  const hasLocalSandbox = override.localSandbox !== undefined;
  const hasLocalSandboxNetwork = override.localSandboxNetwork !== undefined;
  if (!hasTarget && !hasDevice && !hasLocalSandbox && !hasLocalSandboxNetwork) return base;
  return {
    ...base,
    ...(hasTarget ? { executionTarget: override.executionTarget } : {}),
    ...(hasDevice ? { boundDeviceId: override.boundDeviceId } : {}),
    ...(hasLocalSandbox ? { localSandbox: override.localSandbox } : {}),
    ...(hasLocalSandboxNetwork ? { localSandboxNetwork: override.localSandboxNetwork } : {}),
  };
};

/**
 * The workspace-shared `agencyConfig` on the agent row is one row per agent —
 * inherently a *single* execution decision for the whole workspace. Real users
 * want each member to pick their own machine independently (see
 * `UserPreference.agentDeviceOverrides`). This helper merges the shared
 * baseline with the caller's per-agent override so every code path — client
 * device switcher, server dispatch, workingDir resolution — sees one
 * consistent "effective" config.
 *
 * Rules:
 * - `fixed` shared config ignores the caller override entirely
 * - `override.executionTarget` wins when set; falls back to shared
 * - `override.boundDeviceId` wins when set; falls back to shared
 * - `override.localSandbox` wins when set; falls back to shared. It rides along
 *   with the target because it qualifies *this member's* local execution — one
 *   member sandboxing their own machine says nothing about anyone else's.
 * - Nothing else (heterogeneousProvider, verifyRubricId, workingDirByDevice)
 *   is overridable — those describe the agent, not this user's routing
 *
 * A `null`-ish `override` is a no-op — safe to call on personal agents (where
 * no override ever exists) or on paths that don't yet know about the current
 * user's preference.
 */
export const resolveAgencyConfig = (
  agencyConfig: OrviloAgentAgencyConfig | null | undefined,
  override:
    | Pick<
        OrviloAgentAgencyConfig,
        'boundDeviceId' | 'executionTarget' | 'localSandbox' | 'localSandboxNetwork'
      >
    | null
    | undefined,
): OrviloAgentAgencyConfig | undefined => {
  const base = normalizeAgencyConfigHeterogeneousProvider(agencyConfig);
  if (base?.executionTargetSelectionPolicy === 'fixed') return base;
  return applyAgencyConfigOverride(base, override);
};

export interface AgentAgencyConfigContext {
  /** Author/admin callers manage the shared config instead of using member overrides. */
  canManage?: boolean;
  visibility?: 'private' | 'public';
  workspaceId?: string | null;
}

/**
 * Resolve an Agent's effective agency config in its ownership context.
 *
 * Member execution-target policies apply only after a Workspace Agent is
 * public. The caller's per-user override, however, merges for EVERY workspace
 * agent — member, manager, or private owner alike: a `local` / this-machine
 * pick is inherently per-user (the shared row must never carry a personal
 * device — the server rejects it), so managers and private-agent owners store
 * that pick in the same `agentDeviceOverrides` slot members use. The owner
 * path bypasses the `fixed` short-circuit (the policy constrains members, not
 * the owner) and keeps stripping the stored selection policy, which is
 * retained only as the policy that takes effect once the Agent is published.
 */
export const resolveAgentAgencyConfig = (
  agencyConfig: OrviloAgentAgencyConfig | null | undefined,
  override:
    | Pick<
        OrviloAgentAgencyConfig,
        'boundDeviceId' | 'executionTarget' | 'localSandbox' | 'localSandboxNetwork'
      >
    | null
    | undefined,
  context: AgentAgencyConfigContext,
): OrviloAgentAgencyConfig | undefined => {
  const base = normalizeAgencyConfigHeterogeneousProvider(agencyConfig);
  const isPublicWorkspaceAgent =
    !!context.workspaceId && context.visibility !== 'private' && context.canManage !== true;

  if (isPublicWorkspaceAgent) return resolveAgencyConfig(base, override);

  const merged = context.workspaceId ? applyAgencyConfigOverride(base, override) : base;

  if (!merged?.executionTargetSelectionPolicy) return merged;

  const { executionTargetSelectionPolicy, ...ownerConfig } = merged;
  return executionTargetSelectionPolicy ? ownerConfig : merged;
};

/**
 * Apply "undefined means delete" semantics to a `workingDirByDevice` patch.
 *
 * Deep-merge (used by both the client optimistic store and the server persist
 * path) can only add/overwrite keys — it silently skips `undefined` sources, so
 * it can never *remove* a per-device entry. To clear a device's cwd the patch
 * carries `{ [deviceId]: undefined }`; this prunes those keys from the merged
 * map after the merge has run.
 *
 * Mutates `merged` in place (safe on an immer draft) and is a no-op when the
 * patch touches no device entries.
 */
export const pruneWorkingDirByDeviceDeletes = (
  merged: { workingDirByDevice?: Record<string, unknown> } | null | undefined,
  patch: { workingDirByDevice?: Record<string, unknown> } | null | undefined,
): void => {
  const incoming = patch?.workingDirByDevice;
  const target = merged?.workingDirByDevice;
  if (!incoming || !target) return;

  for (const key of Object.keys(incoming)) {
    if (incoming[key] === undefined) delete target[key];
  }
};
