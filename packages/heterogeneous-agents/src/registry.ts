/**
 * Agent Adapter Registries — live execution vs historical trace decoding.
 *
 * `liveAdapterRegistry` is the only registry `createLiveAdapter` consults, and
 * every entry is an ACP adapter — either the shared `TraeAcpAdapter`
 * parameterized by the runtime spec's `provider` / `eventPrefix`, or a
 * dedicated per-vendor ACP adapter. Live sessions can therefore never resolve
 * a legacy stream-json decoder.
 *
 * `historicalDecoderRegistry` holds parse-only decoders for archived
 * stream-json traces (`cursor` legacy, `claude-code-sdk`). Entries in it are
 * reachable exclusively through `createTraceDecoder` — they cannot spawn a
 * process or appear in `listLiveAgentTypes()`.
 *
 * New agents are added by registering a live adapter — no other code changes
 * needed.
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

/**
 * Live adapters keyed by user-facing local agent type. `cursor` is absent:
 * its live sessions run on the `cursor-acp` transport key below, so the
 * user-facing key only survives as a historical decoder.
 */
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
} satisfies Record<Exclude<LocalHeterogeneousAgentType, 'cursor'>, AgentRegistryEntry>;

/** Live adapters keyed by ACP transport (dedicated sessions feed these keys). */
const transportAdapterRegistry = {
  'cursor-acp': {
    createAdapter: () => new CursorAcpAdapter(),
  },
  'droid-acp': {
    createAdapter: () => new DroidAcpAdapter(),
  },
} satisfies Record<string, AgentRegistryEntry>;

const liveAdapterRegistry: Record<string, AgentRegistryEntry> = {
  ...localAgentRegistry,
  ...transportAdapterRegistry,
};

/**
 * Parse-only decoders for archived vendor streams. Nothing here can be
 * resolved for a live run — `createLiveAdapter` throws on these keys.
 */
const historicalDecoderRegistry: Record<string, AgentRegistryEntry> = {
  'claude-code-sdk': {
    createAdapter: () => new ClaudeCodeSdkAdapter(),
  },
  'cursor': {
    createAdapter: () => new CursorAdapter(),
  },
};

/**
 * Create a live adapter for the given agent/transport type. Every registered
 * entry is ACP; historical decoder keys throw here.
 */
export const createLiveAdapter = (agentType: string): AgentEventAdapter => {
  const entry = liveAdapterRegistry[agentType];
  if (!entry) {
    const historical = historicalDecoderRegistry[agentType];
    if (historical) {
      throw new Error(
        `Agent type "${agentType}" is a historical trace decoder and cannot start a live session.`,
      );
    }
    throw new Error(
      `Unknown agent type: "${agentType}". Available: ${Object.keys(liveAdapterRegistry).join(', ')}`,
    );
  }
  return entry.createAdapter();
};

/**
 * Create a parse-only decoder for an archived trace format. Decoders must not
 * be used to back a live session — they translate recorded wire payloads into
 * `AgentStreamEvent`s for replay and tests.
 */
export const createTraceDecoder = (agentType: string): AgentEventAdapter => {
  const entry = historicalDecoderRegistry[agentType];
  if (!entry) {
    throw new Error(
      `Unknown trace decoder: "${agentType}". Available: ${Object.keys(historicalDecoderRegistry).join(', ')}`,
    );
  }
  return entry.createAdapter();
};

/**
 * List live (startable) agent/transport types. Historical decoders never
 * appear here.
 */
export const listLiveAgentTypes = (): string[] => Object.keys(liveAdapterRegistry);

/** List the archived-trace decoder keys. */
export const listTraceDecoderTypes = (): string[] => Object.keys(historicalDecoderRegistry);

/** Local CLI adapter keys that must match the shared descriptor catalog. */
export const listLocalAgentTypes = (): LocalHeterogeneousAgentType[] => [
  ...(Object.keys(localAgentRegistry) as LocalHeterogeneousAgentType[]),
  // 'cursor' stays a selectable local type — its live session is the
  // 'cursor-acp' transport; the decoder entry is historical-only.
  'cursor',
];
