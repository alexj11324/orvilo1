import { builtinSkills } from '@orvilo/builtin-skills';
import { AuvIdentifier } from '@orvilo/builtin-tool-auv';
import { LocalSystemIdentifier } from '@orvilo/builtin-tool-local-system';
import { SELF_FEEDBACK_INTENT_IDENTIFIER } from '@orvilo/builtin-tool-self-iteration';
import {
  builtinTools,
  chatModeAllowedToolIds,
  isBuiltinToolIdentifier,
} from '@orvilo/builtin-tools';
import type { AcpBuiltinToolSpec, AgentPluginEntry } from '@orvilo/types';
import { getActivePluginIds, getDisabledPluginIds } from '@orvilo/types';
import debug from 'debug';

import { hasServerRuntime } from '@/server/services/toolExecution/serverRuntimes';

import type { ExternalToolPins } from './externalToolPins';

const log = debug('orvilo-server:ai-agent:tool-surface');

/**
 * Per-tool mount outcome. Every requested plugin id produces exactly one
 * outcome — nothing is dropped silently:
 *   - `mounted`      — builtin tool spec emitted, or builtin skill shipped as
 *                      capability instructions (`kind` distinguishes them)
 *   - `unsupported`  — cannot run on this harness/wire at all (non-builtin
 *                      plugin, harness cannot mount MCP, no server runtime,
 *                      no API surface)
 *   - `unauthorized` — policy denied it (agent-disabled entry, chat-mode
 *                      allowlist, run-level suppression flags)
 *   - `failed`       — resolving the identifier threw
 */
export interface ToolSurfaceOutcome {
  identifier: string;
  kind: 'skill' | 'tool';
  /** Machine-readable reason code; empty string when `mounted`. */
  reason: string;
  status: 'mounted' | 'unsupported' | 'unauthorized' | 'failed';
}

export interface RunToolSurface {
  /** Server-backed builtin tools the execution host mounts on its per-run MCP server. */
  builtinToolSpecs: AcpBuiltinToolSpec[];
  /**
   * Capability text merged into the ACP system context: activated skill
   * instructions plus each mounted tool's usage guidance (`manifest.systemRole`).
   */
  capabilityContext?: string;
  /**
   * External (connector / installed-plugin MCP) tools that mounted this run,
   * keyed by identifier. Persisted on the operation so the exec callback can
   * re-resolve the connection and enforce the per-tool allowlist — carries no
   * credentials or `mcpParams`.
   */
  externalTools?: Record<string, ExternalToolSurfaceEntry>;
  /** Outcome for every requested tool id, in request order. */
  outcomes: ToolSurfaceOutcome[];
}

/**
 * A resolved external tool surface for one identifier — produced upstream from
 * `user_connectors`/`user_connector_tools` or `user_installed_plugins` by
 * `resolveExternalToolSurface`. `callable` is false when a plugin manifest
 * exists but carries no transport params (`customParams.mcp`); such an entry
 * resolves as `unsupported`/`no-server-executor` rather than mounting a spec
 * the exec path cannot fulfil.
 */
export interface ExternalToolSurfaceEntry {
  apis: Array<{
    description?: string;
    name: string;
    parameters?: Record<string, unknown>;
  }>;
  callable: boolean;
  /**
   * Identity pins persisted on the operation (SA02/F04): the exec callback
   * re-authorizes the SAME connection/install + grant revision + schema
   * digest — never a same-identifier substitute.
   */
  pins?: ExternalToolPins;
  source: 'connector' | 'mcp-plugin';
}

interface ResolveRunToolSurfaceInput {
  additionalPluginIds?: string[];
  agentPlugins?: AgentPluginEntry[];
  disableLocalSystem?: boolean;
  disableSelfFeedbackIntentTool?: boolean;
  disableTools?: boolean;
  /** `chatConfig.enableAgentMode === false` restricts the surface to `chatModeAllowedToolIds`. */
  enableAgentMode?: boolean;
  exclusivePluginIds?: string[];
  externalTools?: Record<string, ExternalToolSurfaceEntry>;
  /**
   * Tool identifiers this run cannot start without — task-tool requirements,
   * exclusive surfaces and evidence tools all land here. Every id must resolve
   * to `mounted` or resolution throws before dispatch.
   */
  requiredToolIds?: string[];
  selectedToolIds?: string[];
  /**
   * Whether the resolved execution harness can mount MCP servers in its ACP
   * `session/new`. `false` drops the builtin-tool branch entirely — specs AND
   * usage guidance — so a non-MCP harness (cursor/devin/droid/grok/trae, or a
   * remote platform type) never advertises tools it cannot call. Builtin
   * skills still ship: they are plain instructions, not invocable tools.
   */
  supportsBuiltinToolMount?: boolean;
}

/**
 * Resolve the builtin tool/skill surface for an ACP run.
 *
 * The retired server-side loop mounted these as live tool definitions; under
 * ACP the agent harness owns its own tool loop, so Orvilo builtin tools ride a
 * per-run MCP server the host exposes (`orvilo_cc`), and builtin
 * skills ship their instructions inline in the system context.
 *
 * Identifier classes are split by what can actually run on the wire:
 *   - builtin skills (`@orvilo/builtin-skills`) → content → `capabilityContext`
 *   - builtin tools with a `serverRuntimes` registration → `builtinToolSpecs`;
 *     device-proxy runtimes (local-system / browser / remote-device) count —
 *     their factory routes the call back to the bound device via the gateway
 *   - external MCP / connector / installed-plugin tools resolved upstream into
 *     `externalTools` → `builtinToolSpecs` (same per-run MCP wire; the exec
 *     callback re-resolves the connection at call time)
 *   - anything unresolved → an `unsupported`/`unauthorized`/`failed` outcome
 *     with a machine-readable reason — never silently dropped.
 *
 * Throws before dispatch when any id in `requiredToolIds`/`exclusivePluginIds`
 * fails to mount — a required surface that cannot run is an admission error,
 * not a degraded run. `disableTools` combined with required ids is a conflict
 * and throws rather than silently dropping them.
 */
export const resolveRunToolSurface = (input: ResolveRunToolSurfaceInput): RunToolSurface => {
  const {
    additionalPluginIds,
    agentPlugins,
    disableLocalSystem,
    disableSelfFeedbackIntentTool,
    disableTools,
    enableAgentMode,
    exclusivePluginIds,
    externalTools,
    requiredToolIds,
    selectedToolIds,
    supportsBuiltinToolMount = true,
  } = input;

  // The three sets are modelled separately (F05):
  //   - `allowed`  — the exclusive ceiling; when `exclusivePluginIds` is set,
  //     ONLY these ids may mount. It is a ceiling, not a must-have list:
  //     whether an exclusive item is also required is explicit in
  //     `requiredToolIds`, never assumed.
  //   - `required` — ids that must reach a verifiable `mounted` state before
  //     the task is executable; a partial or failed mount is a dispatch
  //     blocker, not a degraded run (specPrepared ≠ hostConfirmed).
  //   - `requested` — the ids actually resolved: the exclusive ceiling when
  //     present, else the union of every admission channel.
  const allowed = exclusivePluginIds ? new Set(exclusivePluginIds) : undefined;
  const required = new Set(requiredToolIds ?? []);

  // required ⊄ allowed → contract conflict: refusing the run is correct, and
  // widening `allowed` to fit `required` is the bug this guards against
  // (exclusive=[read] + required=[write] must NOT mount write).
  const offCeiling = [...required].filter((id) => allowed && !allowed.has(id));
  if (offCeiling.length) {
    throw new Error(`Required tools conflict with the exclusive surface: ${offCeiling.join(', ')}`);
  }

  const outcomes: ToolSurfaceOutcome[] = [];
  const push = (outcome: ToolSurfaceOutcome) => outcomes.push(outcome);

  if (disableTools) {
    if (required.size) {
      throw new Error(
        `Required tools cannot mount: tools are disabled for this run (${[...required].join(', ')})`,
      );
    }
    return { builtinToolSpecs: [], outcomes };
  }

  const requested = allowed
    ? [...allowed]
    : [
        ...new Set([
          ...getActivePluginIds(agentPlugins),
          ...(additionalPluginIds ?? []),
          ...(requiredToolIds ?? []),
          ...(selectedToolIds ?? []),
        ]),
      ];

  const disabled = new Set(getDisabledPluginIds(agentPlugins));
  const chatGate = enableAgentMode === false ? new Set(chatModeAllowedToolIds) : undefined;

  const skillBlocks: string[] = [];
  const toolGuidance: string[] = [];
  const specs: AcpBuiltinToolSpec[] = [];
  const mountedExternal: Record<string, ExternalToolSurfaceEntry> = {};

  for (const identifier of requested) {
    try {
      if (disabled.has(identifier)) {
        push({
          identifier,
          kind: 'tool',
          reason: 'disabled-by-agent-config',
          status: 'unauthorized',
        });
        continue;
      }
      if (chatGate && !chatGate.has(identifier)) {
        push({
          identifier,
          kind: 'tool',
          reason: 'not-in-chat-mode-allowlist',
          status: 'unauthorized',
        });
        continue;
      }
      if (
        disableLocalSystem &&
        (identifier === LocalSystemIdentifier || identifier === AuvIdentifier)
      ) {
        push({
          identifier,
          kind: 'tool',
          reason: 'suppressed-by-run-config',
          status: 'unauthorized',
        });
        continue;
      }
      if (disableSelfFeedbackIntentTool && identifier === SELF_FEEDBACK_INTENT_IDENTIFIER) {
        push({
          identifier,
          kind: 'tool',
          reason: 'suppressed-by-run-config',
          status: 'unauthorized',
        });
        continue;
      }

      const skill = builtinSkills.find((item) => item.identifier === identifier);
      if (skill) {
        skillBlocks.push(`<skill identifier="${identifier}">\n${skill.content.trim()}\n</skill>`);
        push({ identifier, kind: 'skill', reason: '', status: 'mounted' });
        continue;
      }

      if (isBuiltinToolIdentifier(identifier)) {
        if (!supportsBuiltinToolMount) {
          push({
            identifier,
            kind: 'tool',
            reason: 'harness-cannot-mount-mcp',
            status: 'unsupported',
          });
          continue;
        }
        if (!hasServerRuntime(identifier)) {
          push({ identifier, kind: 'tool', reason: 'no-server-runtime', status: 'unsupported' });
          continue;
        }
        const manifest = builtinTools.find((tool) => tool.identifier === identifier)?.manifest;
        if (!manifest?.api?.length) {
          push({ identifier, kind: 'tool', reason: 'no-api-surface', status: 'unsupported' });
          continue;
        }
        specs.push({
          apis: manifest.api.map((api) => ({
            description: api.description,
            name: api.name,
            parameters: api.parameters as Record<string, unknown> | undefined,
          })),
          identifier,
        });
        if (manifest.systemRole) toolGuidance.push(manifest.systemRole.trim());
        push({ identifier, kind: 'tool', reason: '', status: 'mounted' });
        continue;
      }

      // External MCP / connector / installed-plugin tools: resolved upstream
      // into `externalTools`; their calls ride the same per-run MCP surface and
      // the server-side exec callback re-resolves the connection (fresh OAuth
      // token / `customParams.mcp`) at call time.
      const external = externalTools?.[identifier];
      if (!external) {
        push({ identifier, kind: 'tool', reason: 'plugin-not-installed', status: 'unsupported' });
        continue;
      }
      if (!supportsBuiltinToolMount) {
        push({
          identifier,
          kind: 'tool',
          reason: 'harness-cannot-mount-mcp',
          status: 'unsupported',
        });
        continue;
      }
      if (!external.callable) {
        push({ identifier, kind: 'tool', reason: 'no-server-executor', status: 'unsupported' });
        continue;
      }
      if (!external.apis.length) {
        push({ identifier, kind: 'tool', reason: 'no-api-surface', status: 'unsupported' });
        continue;
      }
      specs.push({ apis: external.apis, identifier });
      mountedExternal[identifier] = external;
      push({ identifier, kind: 'tool', reason: '', status: 'mounted' });
    } catch (error) {
      push({
        identifier,
        kind: 'tool',
        reason: error instanceof Error ? error.message : String(error),
        status: 'failed',
      });
    }
  }

  if (required.size) {
    const unmet = [...required].map((id) => {
      const outcome = outcomes.find((o) => o.identifier === id);
      if (outcome?.status === 'mounted') return undefined;
      return outcome
        ? `${id} (${outcome.status}${outcome.reason ? `: ${outcome.reason}` : ''})`
        : `${id} (not requested)`;
    });
    const failures = unmet.filter(Boolean) as string[];
    if (failures.length) {
      throw new Error(`Required tools failed to mount: ${failures.join(', ')}`);
    }
  }

  for (const outcome of outcomes) {
    if (outcome.status !== 'mounted') {
      log('execAgent: tool %s %s (%s)', outcome.identifier, outcome.status, outcome.reason);
    }
  }

  const capabilityContext =
    [...skillBlocks, ...toolGuidance].filter(Boolean).join('\n\n') || undefined;

  return {
    builtinToolSpecs: specs,
    capabilityContext,
    ...(Object.keys(mountedExternal).length ? { externalTools: mountedExternal } : {}),
    outcomes,
  };
};
