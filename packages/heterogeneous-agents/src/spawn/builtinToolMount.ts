import { resolveHeteroCliAgentType } from '@orvilo/types';

import { ACP_MCP_MOUNT_AGENT_TYPES } from './acpRuntime';

/**
 * Whether an execution binding can mount the per-run builtin/MCP tool surface
 * (`orvilo_cc`): the set of builtin *tool* specs embedded in the agent's
 * `session/new` `mcpServers` payload.
 *
 * This answers against the mount-capable set, NOT the transport set
 * (`ACP_RUNTIME_AGENT_TYPES`): a runtime that accepts `session/new` but drops
 * `mcpServers` — `pi` via `pi-acp@0.0.33`, which stores and never consumes it —
 * is transport-capable and mount-incapable. Remote platform types and the
 * non-standard adapters (cursor/devin/droid/grok/trae) are in neither set.
 *
 * Prime uses a native MCP bridge rather than the ACP session/new mount.
 */
export const canMountBuiltinToolSurface = (
  binding: { type?: string | null } | null | undefined,
): boolean => {
  const cliType = resolveHeteroCliAgentType(binding?.type ? { type: binding.type } : undefined);
  return !!cliType && ACP_MCP_MOUNT_AGENT_TYPES.has(cliType);
};

/** Orchestrators use either Prime's native per-run MCP bridge or MCP-capable ACP. */
export const canRunGroupSupervisorRuntime = (
  binding: { type?: string | null } | null | undefined,
): boolean => binding?.type === 'orvilo' || canMountBuiltinToolSurface(binding);
