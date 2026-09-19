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
  /** Outcome for every requested tool id, in request order. */
  outcomes: ToolSurfaceOutcome[];
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
 *   - everything else (MCP/market/custom plugins) → `unsupported` outcome;
 *     they have no server-side executor to call back into.
 *
 * Throws when an `exclusivePluginIds` run ends up with every builtin tool
 * unresolved — an exclusive surface that mounts nothing is a required-tool
 * failure, not a degraded run.
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
    selectedToolIds,
    supportsBuiltinToolMount = true,
  } = input;

  const outcomes: ToolSurfaceOutcome[] = [];
  const push = (outcome: ToolSurfaceOutcome) => outcomes.push(outcome);

  if (disableTools) return { builtinToolSpecs: [], outcomes };

  const requested = exclusivePluginIds
    ? [...new Set(exclusivePluginIds)]
    : [
        ...new Set([
          ...getActivePluginIds(agentPlugins),
          ...(additionalPluginIds ?? []),
          ...(selectedToolIds ?? []),
        ]),
      ];

  const disabled = new Set(getDisabledPluginIds(agentPlugins));
  const chatGate = enableAgentMode === false ? new Set(chatModeAllowedToolIds) : undefined;

  const skillBlocks: string[] = [];
  const toolGuidance: string[] = [];
  const specs: AcpBuiltinToolSpec[] = [];

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

      // MCP / market / custom plugins: mounting remote MCP servers onto the ACP
      // session is a separate surface; record it so the gap is visible.
      push({ identifier, kind: 'tool', reason: 'no-server-executor', status: 'unsupported' });
    } catch (error) {
      push({
        identifier,
        kind: 'tool',
        reason: error instanceof Error ? error.message : String(error),
        status: 'failed',
      });
    }
  }

  // `exclusivePluginIds` is a caller's required surface: if it named builtin
  // tool ids and none of them resolved, the run cannot do what was asked —
  // refuse rather than dispatch a tool-less run.
  if (exclusivePluginIds?.length) {
    const exclusiveTools = outcomes.filter((o) => o.kind === 'tool');
    const mountedTools = exclusiveTools.filter((o) => o.status === 'mounted');
    if (
      exclusivePluginIds.some((id) => isBuiltinToolIdentifier(id)) &&
      exclusiveTools.length > 0 &&
      mountedTools.length === 0
    ) {
      throw new Error(
        `Required tools failed to mount: ${exclusiveTools
          .map((o) => `${o.identifier} (${o.status}: ${o.reason})`)
          .join(', ')}`,
      );
    }
  }

  for (const outcome of outcomes) {
    if (outcome.status !== 'mounted') {
      log('execAgent: tool %s %s (%s)', outcome.identifier, outcome.status, outcome.reason);
    }
  }

  const capabilityContext =
    [...skillBlocks, ...toolGuidance].filter(Boolean).join('\n\n') || undefined;

  return { builtinToolSpecs: specs, capabilityContext, outcomes };
};
