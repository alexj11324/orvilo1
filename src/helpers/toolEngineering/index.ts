/**
 * Tools Engineering - Unified tools processing using ToolsEngine
 */
import { AuvManifest } from '@orvilo/builtin-tool-auv';
import { CloudSandboxManifest } from '@orvilo/builtin-tool-cloud-sandbox';
import { KnowledgeBaseManifest } from '@orvilo/builtin-tool-knowledge-base';
import { LocalSystemManifest } from '@orvilo/builtin-tool-local-system';
import { MemoryManifest } from '@orvilo/builtin-tool-memory';
import { WebBrowsingManifest } from '@orvilo/builtin-tool-web-browsing';
import { alwaysOnToolIds, chatModeAllowedToolIds, defaultToolIds } from '@orvilo/builtin-tools';
import { createEnableChecker, type PluginEnableChecker } from '@orvilo/context-engine';
import { ToolsEngine } from '@orvilo/context-engine';
import {
  type BuiltinToolManifest,
  type BuiltinToolResolveContext,
  type ChatCompletionTool,
  type ToolManifest,
  type WorkingModel,
} from '@orvilo/types';

import { applyToolNameMaxLength } from '@/helpers/applyToolNameMaxLength';
import { isToolAvailableInCurrentEnv } from '@/helpers/toolAvailability';
import { getAgentStoreState } from '@/store/agent';
import { agentChatConfigSelectors, agentSelectors } from '@/store/agent/selectors';
import { getToolStoreState } from '@/store/tool';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

import { getSearchConfig } from '../getSearchConfig';
import { isCanUseFC } from '../isCanUseFC';

/**
 * Tools engine configuration options
 */
export interface ToolsEngineConfig {
  /** Default tool IDs that will always be added to the end of the tools list */
  defaultToolIds?: string[];
  /**
   * Identifiers the agent has explicitly disabled (`agents.plugins` tri-state).
   * Dropped from the combined manifest pool entirely — not just the
   * enableChecker rule map — because `allowExplicitActivation` lets the
   * activator resolve/enable any manifest present in `manifestSchemas`
   * regardless of the rules, bypassing a rule-only gate.
   */
  disabledPluginIds?: string[];
  /** Custom enable checker for plugins */
  enableChecker?: PluginEnableChecker;
  /**
   * Runtime context for context-aware builtin manifests. When provided, each
   * builtin tool with a `resolveManifest` produces its manifest for this context
   * (trimming APIs or opting out via `null`). Omit for context-free callers
   * (e.g. UI token estimation) — they get the full static manifests.
   */
  manifestContext?: BuiltinToolResolveContext;
}

/**
 * A manifest is usable by ToolsEngine only if it has a non-empty `api` array.
 * ToolsEngine.convertManifestsToTools calls `manifest.api.map(...)` unconditionally,
 * so any entry with `api` missing / non-array will crash the whole tools build.
 * Sources that populate manifests (installed plugins, Composio, Orvilo skills, MCP)
 * have no shared schema validation, so we guard defensively at the merge point.
 */
const isValidToolManifest = (m: ToolManifest | undefined): m is ToolManifest =>
  !!m && typeof m === 'object' && Array.isArray((m as ToolManifest).api);

const dropInvalidManifests = (manifests: (ToolManifest | undefined)[], source: string) => {
  const valid: ToolManifest[] = [];
  const dropped: Array<{ identifier?: string; reason: string }> = [];

  for (const m of manifests) {
    if (isValidToolManifest(m)) {
      valid.push(m);
    } else if (m) {
      dropped.push({
        identifier: (m as { identifier?: string }).identifier,
        reason: Array.isArray((m as { api?: unknown }).api)
          ? 'unknown'
          : 'missing `api` field (expected array)',
      });
    }
  }

  if (dropped.length > 0) {
    console.warn(
      `[toolEngineering] Dropped ${dropped.length} invalid manifest(s) from ${source}:`,
      dropped,
    );
  }

  return valid;
};

/**
 * Initialize ToolsEngine with current manifest schemas and configurable options
 */
export const createToolsEngine = (config: ToolsEngineConfig = {}): ToolsEngine => {
  const { enableChecker, defaultToolIds, disabledPluginIds = [], manifestContext } = config;

  // Push the deployment's `TOOL_NAME_MAX_LENGTH` in before any tool name is
  // generated — the client mirror of `createServerToolsEngine`. Without it a
  // deployment setting `0` would still get `MD5HASH_…` names on this path.
  applyToolNameMaxLength();

  const toolStoreState = getToolStoreState();

  // Get all builtin tool manifests. When a manifest context is supplied (agent
  // runtime path), context-aware tools resolve their manifest for it — trimming
  // APIs (e.g. orvilo-agent hides callSubAgent in groups) or opting out via `null`.
  // Context-free callers fall back to the full static manifest.
  const builtinManifests = toolStoreState.builtinTools
    .map((tool) =>
      manifestContext && tool.resolveManifest
        ? tool.resolveManifest(manifestContext)
        : tool.manifest,
    )
    .filter((m): m is BuiltinToolManifest => !!m) as ToolManifest[];

  const combinedManifests = dropInvalidManifests(builtinManifests, 'builtinTools');

  // Disabled identifiers are dropped from the pool outright (not left for the
  // enableChecker rules) — a plugin, skill, connector, or user-toggleable
  // builtin tool the agent has explicitly disabled must not be discoverable/
  // activatable at all, matching the server-side (aiAgent gateway) treatment.
  // Explicit activation bypasses enable rules; a plain Web client must not
  // acquire the Electron IPC executor. Gateway execution uses the server engine.
  const allManifests = combinedManifests.filter(
    (m) =>
      !disabledPluginIds.includes(m.identifier) &&
      (m.identifier !== AuvManifest.identifier || isToolAvailableInCurrentEnv(m.identifier)),
  );

  return new ToolsEngine({
    defaultToolIds,
    enableChecker,
    functionCallChecker: isCanUseFC,
    manifestSchemas: allManifests,
  });
};

export const createAgentToolsEngine = (
  workingModel: WorkingModel,
  /** Runtime-resolved plugin IDs (from agentConfigResolver), may include tools beyond the active agent */
  pluginIds?: string[],
  /** Conversation context for context-aware builtin manifests (scope, isSubAgent). */
  manifestContext?: BuiltinToolResolveContext,
) => {
  const searchConfig = getSearchConfig(workingModel.model, workingModel.provider);
  const agentState = getAgentStoreState();
  // `currentAgentPlugins` already resolves to pinned-only identifiers — disabled
  // entries never reach the tools-engine whitelist.
  const userPlugins = agentSelectors.currentAgentPlugins(agentState);
  const disabledPluginIds = agentSelectors.currentAgentDisabledPlugins(agentState);
  const isChatMode =
    agentChatConfigSelectors.currentChatConfig(agentState).enableAgentMode === false ||
    !isCanUseFC(workingModel.model, workingModel.provider);

  // Each entry below still respects its own runtime gate; in chat mode this
  // is the entire whitelist. `allowExplicitActivation` and user plugins /
  // `alwaysOnToolIds` are deliberately omitted in chat mode so the activator
  // can't smuggle additional tools in.
  const kbEnabled = agentSelectors.hasEnabledKnowledgeBases(agentState);
  const memoryEnabled =
    agentChatConfigSelectors.currentChatConfig(agentState).memory?.enabled ??
    settingsSelectors.memoryEnabled(useUserStore.getState());
  const webBrowsingEnabled = searchConfig.useApplicationBuiltinSearchTool;
  const chatModeRules = {
    [KnowledgeBaseManifest.identifier]: kbEnabled,
    [MemoryManifest.identifier]: memoryEnabled,
    [WebBrowsingManifest.identifier]: webBrowsingEnabled,
  };

  const agentModeRules = {
    // Runtime-resolved plugins (from agentConfigResolver for the effective agent,
    // may include sub-agent/group/page scope plugins not on the active agent)
    ...(pluginIds && Object.fromEntries(pluginIds.map((id) => [id, true]))),
    // User-selected plugins (from the active agent)
    ...Object.fromEntries(userPlugins.map((id) => [id, true])),
    // Always-on builtin tools
    ...Object.fromEntries(alwaysOnToolIds.map((id) => [id, true])),
    // System-level rules (may override user selection for specific tools)
    [CloudSandboxManifest.identifier]: agentChatConfigSelectors.isCloudSandboxEnabled(agentState),
    [KnowledgeBaseManifest.identifier]: kbEnabled,
    [LocalSystemManifest.identifier]: agentChatConfigSelectors.isLocalSystemEnabled(agentState),
    [MemoryManifest.identifier]: memoryEnabled,
    [WebBrowsingManifest.identifier]: webBrowsingEnabled,
  };

  return createToolsEngine({
    defaultToolIds: isChatMode ? chatModeAllowedToolIds : defaultToolIds,
    disabledPluginIds,
    manifestContext,
    enableChecker: createEnableChecker({
      allowExplicitActivation: !isChatMode,
      platformFilter: ({ pluginId }) => {
        return isToolAvailableInCurrentEnv(pluginId) ? undefined : false;
      },
      rules: isChatMode ? chatModeRules : agentModeRules,
    }),
  });
};

/**
 * Provides the same functionality using ToolsEngine with enhanced capabilities
 *
 * @param toolIds - Array of tool IDs to generate tools for
 * @param model - Model name for function calling compatibility check (optional)
 * @param provider - Provider name for function calling compatibility check (optional)
 * @returns Array of ChatCompletionTool objects
 */
export const getEnabledTools = (
  toolIds: string[] = [],
  model: string,
  provider: string,
): ChatCompletionTool[] => {
  const toolsEngine = createToolsEngine();

  return (
    toolsEngine.generateTools({
      model, // Use provided model or fallback
      provider, // Use provided provider or fallback
      toolIds,
    }) || []
  );
};
