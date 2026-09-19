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

export interface RunToolSurface {
  /** Server-backed builtin tools the execution host mounts on its per-run MCP server. */
  builtinToolSpecs: AcpBuiltinToolSpec[];
  /**
   * Capability text merged into the ACP system context: activated skill
   * instructions plus each mounted tool's usage guidance (`manifest.systemRole`).
   */
  capabilityContext?: string;
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
 *   - everything else (MCP/market/custom plugins) → dropped with a debug log;
 *     they have no server-side executor to call back into.
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

  if (disableTools) return { builtinToolSpecs: [] };

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
    if (disabled.has(identifier)) continue;
    if (chatGate && !chatGate.has(identifier)) continue;
    if (
      disableLocalSystem &&
      (identifier === LocalSystemIdentifier || identifier === AuvIdentifier)
    )
      continue;
    if (disableSelfFeedbackIntentTool && identifier === SELF_FEEDBACK_INTENT_IDENTIFIER) continue;

    const skill = builtinSkills.find((item) => item.identifier === identifier);
    if (skill) {
      skillBlocks.push(`<skill identifier="${identifier}">\n${skill.content.trim()}\n</skill>`);
      continue;
    }

    if (isBuiltinToolIdentifier(identifier)) {
      if (!supportsBuiltinToolMount) {
        log('execAgent: harness cannot mount MCP tools; skipped %s', identifier);
        continue;
      }
      if (!hasServerRuntime(identifier)) {
        // No server-side executor to call back into — nothing mounts.
        log('execAgent: builtin tool %s has no server runtime; skipped', identifier);
        continue;
      }
      const manifest = builtinTools.find((tool) => tool.identifier === identifier)?.manifest;
      if (!manifest?.api?.length) {
        log('execAgent: builtin tool %s has no api surface; skipped', identifier);
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
      continue;
    }

    // MCP / market / custom plugins: mounting remote MCP servers onto the ACP
    // session is a separate surface; log so the gap is visible rather than silent.
    log('execAgent: plugin %s is not a builtin skill/tool; skipped', identifier);
  }

  const capabilityContext =
    [...skillBlocks, ...toolGuidance].filter(Boolean).join('\n\n') || undefined;

  return { builtinToolSpecs: specs, capabilityContext };
};
