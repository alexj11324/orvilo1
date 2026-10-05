/**
 * Per-engine prompt-cache keep-alive policy.
 *
 * LLM prompt caches expire on inactivity; a cached prefix refreshes for free
 * each time a request READS the same prefix. While an agent session sits
 * idle between turns, the provider-side cache dies and the next real turn
 * re-pays a full prefix WRITE. This table encodes each engine's TTL
 * economics so the keep-alive scheduler (`cacheKeepalive.ts`) can ping just
 * under the TTL and disarm at the break-even point — the point where
 * accumulated ping spend reaches the cost of one re-warm:
 *
 *   N pings × readFactor ≥ writeFactor  ⇒  maxPings = floor(write / read)
 *
 * Kept in its own module (not `acpRuntime.ts`) so sibling work splitting the
 * capability helpers there does not collide.
 *
 * Provider economics are from official docs (see
 * docs/development/cache-keepalive.md for sources). Engines whose provider
 * cache TTL is unknown — or that have no persistent prefix worth warming —
 * are `supportsKeepalive: false` pending a per-adapter audit.
 */

import type { CacheKeepaliveClock } from './cacheKeepalive';

export interface AgentCachePolicy {
  /** Read cost of one cached-prefix request, as a multiple of base input price. */
  cacheReadCostFactor: number;
  /** Provider-side cache TTL in seconds — the idle window before a rewrite. */
  cacheTtlSeconds: number;
  /** Prefix rewrite (cache creation) cost as a multiple of base input price. */
  cacheWriteCostFactor: number;
  /**
   * Where the numbers come from — docs citation, or why the engine is marked
   * uncapable (unknown provider caching / no persistent prefix).
   */
  evidence: string;
  /**
   * Hard cap on keep-alive residency in milliseconds regardless of
   * break-even — bounds orphaned process lifetime and stale-session memory.
   */
  maxKeepaliveWindowMs?: number;
  /** Seconds between inert turns — under the TTL with a safety margin. */
  pingIntervalSeconds: number;
  /**
   * `session/set_config_option` configId that pins provider prompt-cache
   * routing (e.g. codex `prompt_cache_key`), keyed to the session id when
   * `ORVILO_CODEX_PROMPT_CACHE_KEY` is enabled.
   */
  promptCacheKey?: string;
  /** True only when a provider cache worth warming is known to exist. */
  supportsKeepalive: boolean;
  /** Human note on which telemetry should confirm the assumed economics. */
  verify?: string;
}

const UNSUPPORTED_EVIDENCE =
  'provider prompt-cache TTL undocumented for this adapter — keep-alive disabled pending per-adapter audit';

/**
 * The policy table, keyed by the CLI adapter type a session is spawned as
 * (`AgentSession.agentType` / `StandardAcpSessionConfig.agentType`).
 * Pre-cutover engine kinds (`claude-sdk`, `codex-app-server`) persist on
 * legacy rows — the alias map below keeps resolving them onto the CLI
 * adapter they used to wrap.
 */
export const AGENT_CACHE_POLICIES: Record<string, AgentCachePolicy> = {
  'amp': {
    cacheReadCostFactor: 0,
    cacheTtlSeconds: 0,
    cacheWriteCostFactor: 0,
    evidence: UNSUPPORTED_EVIDENCE,
    pingIntervalSeconds: 0,
    supportsKeepalive: false,
  },
  'claude-code': {
    cacheReadCostFactor: 0.1,
    cacheTtlSeconds: 300,
    cacheWriteCostFactor: 1.25,
    evidence:
      'Anthropic prompt caching: 5m default TTL, write 1.25× input, read 0.1×, free TTL refresh on every read (platform.claude.com prompt-caching docs)',
    // ~12 pings at 270s ≈ 54min; 56min cap bounds residency slightly beyond.
    maxKeepaliveWindowMs: 3_360_000,
    pingIntervalSeconds: 270,
    supportsKeepalive: true,
  },
  'codebuddy': {
    cacheReadCostFactor: 0,
    cacheTtlSeconds: 0,
    cacheWriteCostFactor: 0,
    evidence: UNSUPPORTED_EVIDENCE,
    pingIntervalSeconds: 0,
    supportsKeepalive: false,
  },
  'codex': {
    cacheReadCostFactor: 0.25,
    cacheTtlSeconds: 1800,
    cacheWriteCostFactor: 1.25,
    evidence:
      'OpenAI prompt caching: exact 30m TTL on GPT-5.6+ (prompt_cache_options.ttl "30m"), refreshes 30m on reuse, prompt_cache_key pins routing; earlier gpt-5.1-codex in-memory cache is ~5–10m. Read factor assumed a conservative 0.25×.',
    maxKeepaliveWindowMs: 8_250_000, // 5 pings × 1650s — break-even reached first
    pingIntervalSeconds: 1650,
    promptCacheKey: 'prompt_cache_key',
    supportsKeepalive: true,
  },
  'cursor': {
    cacheReadCostFactor: 0,
    cacheTtlSeconds: 0,
    cacheWriteCostFactor: 0,
    evidence: UNSUPPORTED_EVIDENCE,
    pingIntervalSeconds: 0,
    supportsKeepalive: false,
  },
  'devin': {
    cacheReadCostFactor: 0.1,
    cacheTtlSeconds: 300,
    cacheWriteCostFactor: 1.25,
    evidence:
      'Devin runs Cognition’s own stack — provider cache TTL unverified; Anthropic-like 5m assumed',
    maxKeepaliveWindowMs: 3_360_000,
    pingIntervalSeconds: 270,
    supportsKeepalive: true,
    verify:
      'confirm via session/prompt usage: cache_read/cache_write token counters when the devin-acp transport surfaces them',
  },
  'droid': {
    cacheReadCostFactor: 0,
    cacheTtlSeconds: 0,
    cacheWriteCostFactor: 0,
    evidence: UNSUPPORTED_EVIDENCE,
    pingIntervalSeconds: 0,
    supportsKeepalive: false,
  },
  'grok-build': {
    cacheReadCostFactor: 0,
    cacheTtlSeconds: 0,
    cacheWriteCostFactor: 0,
    evidence: UNSUPPORTED_EVIDENCE,
    pingIntervalSeconds: 0,
    supportsKeepalive: false,
  },
  'kimi-code': {
    cacheReadCostFactor: 0,
    cacheTtlSeconds: 0,
    cacheWriteCostFactor: 0,
    evidence: UNSUPPORTED_EVIDENCE,
    pingIntervalSeconds: 0,
    supportsKeepalive: false,
  },
  'opencode': {
    cacheReadCostFactor: 0,
    cacheTtlSeconds: 0,
    cacheWriteCostFactor: 0,
    evidence: UNSUPPORTED_EVIDENCE,
    pingIntervalSeconds: 0,
    supportsKeepalive: false,
  },
  'pi': {
    cacheReadCostFactor: 0,
    cacheTtlSeconds: 0,
    cacheWriteCostFactor: 0,
    evidence: UNSUPPORTED_EVIDENCE,
    pingIntervalSeconds: 0,
    supportsKeepalive: false,
  },
  'qoder': {
    cacheReadCostFactor: 0,
    cacheTtlSeconds: 0,
    cacheWriteCostFactor: 0,
    evidence: UNSUPPORTED_EVIDENCE,
    pingIntervalSeconds: 0,
    supportsKeepalive: false,
  },
  'trae': {
    cacheReadCostFactor: 0,
    cacheTtlSeconds: 0,
    cacheWriteCostFactor: 0,
    evidence: UNSUPPORTED_EVIDENCE,
    pingIntervalSeconds: 0,
    supportsKeepalive: false,
  },
};

/** Legacy engine-kind strings resolving onto their CLI adapter's entry. */
const CACHE_POLICY_ALIASES: Record<string, string> = {
  'claude-sdk': 'claude-code',
  'codex-app-server': 'codex',
};

/** Global kill switch: `0`/`off`/`false`/`no` disables keep-alive everywhere. */
export const CACHE_KEEPALIVE_ENV = 'ORVILO_CACHE_KEEPALIVE';
/** Opt-in flag for pinning codex `prompt_cache_key` to the session id. */
export const CODEX_PROMPT_CACHE_KEY_ENV = 'ORVILO_CODEX_PROMPT_CACHE_KEY';

/**
 * Per-session overrides (tests, per-spawn tuning) — merged over the
 * env-derived configuration. `clock` drives every keep-alive timer.
 */
export interface CacheKeepaliveOverrides {
  clock?: CacheKeepaliveClock;
  enabled?: boolean;
  maxPings?: number;
  maxWindowMs?: number;
  pingIntervalMs?: number;
}

export interface ResolvedCacheKeepalive {
  clock?: CacheKeepaliveClock;
  enabled: boolean;
  /** Break-even ping cap derived from the policy's cost factors. */
  maxPings: number;
  maxWindowMs: number;
  pingIntervalMs: number;
  policy: AgentCachePolicy;
  /** ConfigId to apply at session setup (only when opted in via env). */
  promptCacheKey?: string;
}

const isEnvDisabled = (value: string | undefined): boolean =>
  value !== undefined && ['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());

const isEnvEnabled = (value: string | undefined): boolean =>
  value !== undefined && ['1', 'on', 'true', 'yes'].includes(value.trim().toLowerCase());

const parsePositiveMs = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/** Break-even: pings stop paying once their spend reaches one prefix rewrite. */
export const computeMaxKeepalivePings = (policy: AgentCachePolicy): number =>
  Math.max(1, Math.floor(policy.cacheWriteCostFactor / policy.cacheReadCostFactor));

export const resolveAgentCachePolicy = (agentType: string): AgentCachePolicy | undefined =>
  AGENT_CACHE_POLICIES[CACHE_POLICY_ALIASES[agentType] ?? agentType];

/**
 * Resolve the effective keep-alive configuration for one spawned session:
 * policy table → env (`ORVILO_CACHE_KEEPALIVE`, per-engine
 * `ORVILO_CACHE_KEEPALIVE_<KEY>[_INTERVAL_MS|_WINDOW_MS]`, `<KEY>` = the
 * uppercased agent type with `-` → `_`) → explicit overrides.
 * Returns `undefined` when the engine cannot keep its cache warm at all.
 */
export const resolveCacheKeepalive = (
  agentType: string,
  env: NodeJS.ProcessEnv = process.env,
  overrides: CacheKeepaliveOverrides = {},
): ResolvedCacheKeepalive | undefined => {
  const policy = resolveAgentCachePolicy(agentType);
  if (!policy?.supportsKeepalive) return undefined;

  const envKey = agentType.toUpperCase().replaceAll('-', '_');
  const enabled =
    overrides.enabled ??
    (!isEnvDisabled(env[CACHE_KEEPALIVE_ENV]) &&
      !isEnvDisabled(env[`${CACHE_KEEPALIVE_ENV}_${envKey}`]));
  if (!enabled) return undefined;

  const pingIntervalMs =
    overrides.pingIntervalMs ??
    parsePositiveMs(env[`${CACHE_KEEPALIVE_ENV}_${envKey}_INTERVAL_MS`]) ??
    policy.pingIntervalSeconds * 1000;
  const maxWindowMs =
    overrides.maxWindowMs ??
    parsePositiveMs(env[`${CACHE_KEEPALIVE_ENV}_${envKey}_WINDOW_MS`]) ??
    policy.maxKeepaliveWindowMs ??
    computeMaxKeepalivePings(policy) * pingIntervalMs;

  return {
    clock: overrides.clock,
    enabled: true,
    maxPings: overrides.maxPings ?? computeMaxKeepalivePings(policy),
    maxWindowMs,
    pingIntervalMs,
    policy,
    promptCacheKey:
      policy.promptCacheKey && isEnvEnabled(env[CODEX_PROMPT_CACHE_KEY_ENV])
        ? policy.promptCacheKey
        : undefined,
  };
};
