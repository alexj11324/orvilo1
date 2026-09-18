/**
 * Agent Adapter Registry
 *
 * Maps agent type keys to their adapter constructors. New agents are added
 * by registering here — no other code changes needed.
 *
 * Every local agent now executes through an ACP v1 session, so the migrated
 * types share `TraeAcpAdapter` — parameterized by the runtime spec's
 * `provider` / `eventPrefix` — instead of a per-vendor stream-json adapter.
 * The legacy adapters remain exported from `./adapters` for tests and for
 * parsing archived traces, but are no longer registered for live traffic.
 */

import {
  ClaudeCodeSdkAdapter,
  CursorAcpAdapter,
  CursorAdapter,
  DevinAcpAdapter,
  DroidAcpAdapter,
  GrokBuildAdapter,
  TraeAcpAdapter,
} from './adapters';
import type { AcpSessionAdapterOptions } from './adapters/traeAcp';
import type { LocalHeterogeneousAgentType } from './config';
import { getAcpAgentRuntime } from './spawn/acpRuntime';
import type { AgentEventAdapter } from './types';

interface AgentRegistryEntry {
  createAdapter: () => AgentEventAdapter;
}

/**
 * Build the `TraeAcpAdapter` options for a standard-ACP agent from its runtime
 * spec — `provider` stamps events, `eventPrefix` selects the synthetic
 * lifecycle payload names the session emits.
 */
const acpAdapterOptions = (agentType: string): AcpSessionAdapterOptions => {
  const spec = getAcpAgentRuntime(agentType);
  if (!spec) throw new Error(`No ACP runtime is registered for agent type "${agentType}"`);
  return { eventPrefix: spec.eventPrefix, provider: spec.provider };
};

const localAgentRegistry = {
  'amp': {
    createAdapter: () => new TraeAcpAdapter(acpAdapterOptions('amp')),
  },
  'claude-code': {
    createAdapter: () => new TraeAcpAdapter(acpAdapterOptions('claude-code')),
  },
  'codebuddy': {
    createAdapter: () => new TraeAcpAdapter(acpAdapterOptions('codebuddy')),
  },
  'codex': {
    createAdapter: () => new TraeAcpAdapter(acpAdapterOptions('codex')),
  },
  // The Cursor ACP session feeds its pipeline with the 'cursor-acp' runtime
  // key; the 'cursor' entry stays on the legacy adapter for archived-trace
  // parsing (no live session resolves it anymore).
  'cursor': {
    createAdapter: () => new CursorAdapter(),
  },
  'droid': {
    createAdapter: () => new DroidAcpAdapter(),
  },
  'devin': {
    createAdapter: () => new DevinAcpAdapter(),
  },
  'grok-build': {
    createAdapter: () => new GrokBuildAdapter(),
  },
  'kimi-code': {
    createAdapter: () => new TraeAcpAdapter(acpAdapterOptions('kimi-code')),
  },
  'opencode': {
    createAdapter: () => new TraeAcpAdapter(acpAdapterOptions('opencode')),
  },
  'pi': {
    createAdapter: () => new TraeAcpAdapter(acpAdapterOptions('pi')),
  },
  'qoder': {
    createAdapter: () => new TraeAcpAdapter(acpAdapterOptions('qoder')),
  },
  'trae': {
    createAdapter: () => new TraeAcpAdapter(),
  },
  // 'kimi-cli': { createAdapter: () => new KimiCLIAdapter() },
} satisfies Record<LocalHeterogeneousAgentType, AgentRegistryEntry>;

const runtimeAdapterRegistry = {
  'claude-code-sdk': {
    createAdapter: () => new ClaudeCodeSdkAdapter(),
  },
  'cursor-acp': {
    createAdapter: () => new CursorAcpAdapter(),
  },
  'droid-acp': {
    createAdapter: () => new DroidAcpAdapter(),
  },
} satisfies Record<string, AgentRegistryEntry>;

const registry: Record<string, AgentRegistryEntry> = {
  ...localAgentRegistry,
  ...runtimeAdapterRegistry,
};

/**
 * Create an adapter instance for the given agent type.
 */
export const createAdapter = (agentType: string): AgentEventAdapter => {
  const entry = registry[agentType];
  if (!entry) {
    throw new Error(
      `Unknown agent type: "${agentType}". Available: ${Object.keys(registry).join(', ')}`,
    );
  }
  return entry.createAdapter();
};

/**
 * List all registered agent types.
 */
export const listAgentTypes = (): string[] => Object.keys(registry);

/** Local CLI adapters that must match the shared descriptor catalog. */
export const listLocalAgentTypes = (): LocalHeterogeneousAgentType[] =>
  Object.keys(localAgentRegistry) as LocalHeterogeneousAgentType[];
