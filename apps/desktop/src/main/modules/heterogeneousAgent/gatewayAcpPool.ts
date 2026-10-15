import { createHash, randomUUID } from 'node:crypto';

import type { AskUserBridge } from '@orvilo/heterogeneous-agents/askUser';
import type { OrviloBuiltinMcpServer } from '@orvilo/heterogeneous-agents/builtinMcp';
import type { HeteroTurnAgentSource } from '@orvilo/heterogeneous-agents/run';
import type {
  PersistentAcpAgent,
  PersistentAcpAgentOptions,
} from '@orvilo/heterogeneous-agents/spawn';
import type { AcpBuiltinToolSpec } from '@orvilo/types';

/** Default LRU cap: warm agents are full vendor processes, keep few. */
export const GATEWAY_ACP_POOL_MAX_ENTRIES = 4;
/** Default idle TTL before a warm agent (and its process) is dropped. */
export const GATEWAY_ACP_POOL_IDLE_MS = 10 * 60 * 1000;

/** MCP route name the agent sees — the same `orvilo_cc` server `hetero exec` mounts. */
const BUILTIN_MCP_SERVER_NAME = 'orvilo_cc';

/**
 * Per-turn context the entry's builtin-tool caller reads. The MCP server (and
 * the caller baked into its extra tools) outlives one operation, so the turn's
 * credentials live in this mutable holder instead of the closure.
 */
export interface GatewayAcpTurnContext {
  bridge?: AskUserBridge;
  /** Operation-scoped token (`hetero:tool:exec`) for builtin tool callbacks. */
  operationJwt?: string;
  serverUrl: string;
  /** Workspace for `X-Workspace-Id` on builtin tool callbacks. */
  workspaceId?: string;
}

export interface GatewayAcpTurnContextHolder {
  current?: GatewayAcpTurnContext;
}

export interface GatewayAcpPoolDeps {
  createAgent: (options: PersistentAcpAgentOptions) => Promise<PersistentAcpAgent>;
  /** Build and start an entry's `orvilo_cc` server. Required when specs carry builtin tools. */
  createMcpServer?: (params: {
    agentType: string;
    builtinTools: AcpBuiltinToolSpec[];
    context: GatewayAcpTurnContextHolder;
  }) => Promise<OrviloBuiltinMcpServer>;
  idleMs?: number;
  log?: { warn: (...args: unknown[]) => void };
  maxEntries?: number;
  now?: () => number;
}

/** What one gateway operation needs from the pool. */
export interface GatewayAcpTurnSpec {
  /** Process-level options; everything here must be covered by `fingerprint`. */
  agentOptions: Omit<PersistentAcpAgentOptions, 'mcpServers' | 'resumeSessionId' | 'warmIdleMs'>;
  builtinTools?: AcpBuiltinToolSpec[];
  fingerprint: string;
  key: string;
  resumeSessionId?: string;
}

interface McpMount {
  context: GatewayAcpTurnContextHolder;
  routeId: string;
  server: OrviloBuiltinMcpServer;
}

interface PoolEntry {
  agent?: PersistentAcpAgent;
  /** The agent ran (or is running) at least one turn — only then is `reusable` meaningful. */
  agentUsed: boolean;
  /** `resumeSessionId` the current agent was created with. */
  createdResumeSessionId?: string;
  evicted: boolean;
  fingerprint?: string;
  idleTimer?: NodeJS.Timeout;
  key: string;
  lastUsedAt: number;
  locked: boolean;
  mcp?: McpMount;
  /** Promise-chain mutex: each lease waits for the previous holder. */
  queue: Promise<void>;
}

/** A held turn slot on one pool entry. Release exactly once. */
export interface GatewayAcpLease {
  /** The agent most recently handed to the runner (or prepared for it). */
  readonly agent: PersistentAcpAgent | undefined;
  /** Source passed to `runHeteroTurn`. */
  readonly agents: HeteroTurnAgentSource;
  /**
   * Bind the turn's AskUser bridge. With an `orvilo_cc` mount the bridge is
   * bound to the entry's stable route (tool calls route to this operation);
   * otherwise it is returned unchanged.
   */
  bindTurn: (params: {
    bridge: AskUserBridge;
    context: GatewayAcpTurnContext;
    operationId: string;
  }) => AskUserBridge;
  /** Close the agent and drop the entry (cancellation / quit). Idempotent. */
  evict: () => void;
  readonly key: string;
  /** End the turn: release the MCP route, free the mutex, restart the idle clock. */
  release: () => void;
}

const stableStringify = (value: unknown): string => {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Pool key: one warm agent per (workspace, topic, agent type). */
export const buildGatewayAcpPoolKey = (params: {
  agentType: string;
  topicId: string;
  workspaceId?: string;
}) => `${params.workspaceId ?? ''}:${params.topicId}:${params.agentType}`;

/**
 * Fingerprint of everything fixed for a persistent agent's lifetime. A changed
 * fingerprint means the warm process cannot serve the turn and is replaced.
 * The env is hashed so secrets (BYOK keys) are never kept in plain text.
 */
export const buildGatewayAcpFingerprint = (params: {
  agentType: string;
  args?: string[];
  builtinTools?: AcpBuiltinToolSpec[];
  command?: string;
  cwd: string;
  env?: Record<string, string>;
  initialModel?: string;
  initialPermission?: unknown;
  workspaceId?: string;
}): string =>
  sha256(
    stableStringify({
      agentType: params.agentType,
      args: params.args ?? [],
      builtinTools: params.builtinTools?.length ? sha256(stableStringify(params.builtinTools)) : '',
      command: params.command ?? '',
      cwd: params.cwd,
      env: sha256(stableStringify(params.env ?? {})),
      initialModel: params.initialModel ?? '',
      initialPermission: params.initialPermission ?? null,
      workspaceId: params.workspaceId ?? '',
    }),
  );

/**
 * Warm pool of persistent standard-ACP agents for gateway-dispatched runs.
 *
 * One entry per (workspace, topic, agent type). Turns on an entry are
 * serialized by a promise-chain mutex — an ACP session takes one
 * `session/prompt` at a time. An entry is replaced when its fingerprint
 * changes, its agent is no longer reusable, or the server asks to resume a
 * different native session than the live one. Idle entries expire after
 * `idleMs`; at most `maxEntries` idle entries are kept (LRU).
 */
export class GatewayAcpPool {
  private readonly entries = new Map<string, PoolEntry>();
  private readonly idleMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(private readonly deps: GatewayAcpPoolDeps) {
    this.idleMs = deps.idleMs ?? GATEWAY_ACP_POOL_IDLE_MS;
    this.maxEntries = deps.maxEntries ?? GATEWAY_ACP_POOL_MAX_ENTRIES;
    this.now = deps.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Wait for the entry's turn slot, then make sure it holds an agent that can
   * serve `spec`. Rejects (with the slot released) when the agent or its MCP
   * mount cannot be prepared — callers then fall back to the CLI wrapper.
   */
  async lease(spec: GatewayAcpTurnSpec): Promise<GatewayAcpLease> {
    let entry = this.entries.get(spec.key);
    if (!entry) {
      entry = {
        agentUsed: false,
        evicted: false,
        key: spec.key,
        lastUsedAt: this.now(),
        locked: false,
        queue: Promise.resolve(),
      };
      this.entries.set(spec.key, entry);
    }

    const previous = entry.queue;
    let unlock!: () => void;
    entry.queue = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await previous;

    // Evicted (cancel / LRU / quit) while we waited: start over on whatever
    // entry now owns the key instead of reviving a dropped one.
    if (entry.evicted) {
      unlock();
      return this.lease(spec);
    }

    entry.locked = true;
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
    }

    try {
      await this.prepare(entry, spec);
    } catch (error) {
      entry.locked = false;
      this.dropEntry(entry);
      unlock();
      throw error;
    }

    this.touch(entry);
    return this.createLease(entry, spec, unlock);
  }

  /** Close every agent and MCP server (app quit). */
  closeAll(): void {
    for (const entry of this.entries.values()) this.dropEntry(entry);
    this.entries.clear();
  }

  private async prepare(entry: PoolEntry, spec: GatewayAcpTurnSpec): Promise<void> {
    if (entry.fingerprint !== undefined && entry.fingerprint !== spec.fingerprint) {
      this.closeAgent(entry);
      this.closeMcp(entry);
    }
    entry.fingerprint = spec.fingerprint;

    if (entry.agent && !this.canServe(entry, spec.resumeSessionId)) this.closeAgent(entry);

    if (spec.builtinTools?.length && !entry.mcp) {
      if (!this.deps.createMcpServer) throw new Error('builtin tools need an MCP server factory');
      const context: GatewayAcpTurnContextHolder = {};
      const server = await this.deps.createMcpServer({
        agentType: spec.agentOptions.agentType,
        builtinTools: spec.builtinTools,
        context,
      });
      const routeId = `gw-acp-${randomUUID()}`;
      server.registerRoute(routeId);
      entry.mcp = { context, routeId, server };
    }

    if (!entry.agent) await this.createAgent(entry, spec, spec.resumeSessionId);
  }

  /** Whether the entry's live agent can take a turn that resumes `resumeSessionId`. */
  private canServe(entry: PoolEntry, resumeSessionId: string | undefined): boolean {
    const agent = entry.agent;
    if (!agent) return false;
    if (entry.agentUsed && !agent.reusable) return false;
    const liveSessionId = agent.sessionId ?? entry.createdResumeSessionId;
    return liveSessionId === resumeSessionId;
  }

  private async createAgent(
    entry: PoolEntry,
    spec: GatewayAcpTurnSpec,
    resumeSessionId: string | undefined,
  ): Promise<PersistentAcpAgent> {
    const agent = await this.deps.createAgent({
      ...spec.agentOptions,
      ...(entry.mcp
        ? {
            mcpServers: [
              {
                name: BUILTIN_MCP_SERVER_NAME,
                type: 'http',
                url: entry.mcp.server.urlForOperation(entry.mcp.routeId),
              },
            ],
          }
        : {}),
      ...(resumeSessionId ? { resumeSessionId } : {}),
      warmIdleMs: this.idleMs,
    });
    entry.agent = agent;
    entry.agentUsed = false;
    entry.createdResumeSessionId = resumeSessionId;
    return agent;
  }

  private createLease(
    entry: PoolEntry,
    spec: GatewayAcpTurnSpec,
    unlock: () => void,
  ): GatewayAcpLease {
    let released = false;
    let routeBound = false;

    const agents: HeteroTurnAgentSource = {
      acquire: async ({ fresh, resumeSessionId }) => {
        if (entry.evicted) throw new Error('Gateway ACP pool entry was evicted');
        if (fresh) {
          this.closeAgent(entry);
          const agent = await this.createAgent(entry, spec, undefined);
          entry.agentUsed = true;
          return agent;
        }
        if (!entry.agent || !this.canServe(entry, resumeSessionId)) {
          this.closeAgent(entry);
          await this.createAgent(entry, spec, resumeSessionId);
        }
        entry.agentUsed = true;
        return entry.agent!;
      },
    };

    return {
      get agent() {
        return entry.agent;
      },
      agents,
      bindTurn: ({ bridge, context, operationId }) => {
        if (!entry.mcp) return bridge;
        entry.mcp.context.current = { ...context, bridge };
        routeBound = true;
        return entry.mcp.server.bindRoute(entry.mcp.routeId, operationId, bridge);
      },
      evict: () => {
        this.dropEntry(entry);
      },
      key: entry.key,
      release: () => {
        if (released) return;
        released = true;
        if (routeBound && entry.mcp) {
          entry.mcp.server.releaseRoute(entry.mcp.routeId);
          entry.mcp.context.current = undefined;
        }
        entry.locked = false;
        entry.lastUsedAt = this.now();
        if (!entry.evicted) {
          if (entry.agent && entry.agentUsed && !entry.agent.reusable) this.closeAgent(entry);
          this.scheduleIdle(entry);
          this.enforceCap();
        }
        unlock();
      },
    };
  }

  /** Mark most recently used (Map iteration order is the LRU order). */
  private touch(entry: PoolEntry) {
    entry.lastUsedAt = this.now();
    if (this.entries.get(entry.key) === entry) {
      this.entries.delete(entry.key);
      this.entries.set(entry.key, entry);
    }
    this.enforceCap();
  }

  private enforceCap() {
    if (this.entries.size <= this.maxEntries) return;
    for (const entry of this.entries.values()) {
      if (this.entries.size <= this.maxEntries) return;
      if (entry.locked) continue;
      this.dropEntry(entry);
    }
    if (this.entries.size > this.maxEntries) {
      this.deps.log?.warn(
        'Gateway ACP pool over capacity (%d > %d): every entry is busy',
        this.entries.size,
        this.maxEntries,
      );
    }
  }

  private scheduleIdle(entry: PoolEntry) {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = undefined;
      if (!entry.locked) this.dropEntry(entry);
    }, this.idleMs);
    entry.idleTimer.unref?.();
  }

  private closeAgent(entry: PoolEntry) {
    const agent = entry.agent;
    entry.agent = undefined;
    entry.agentUsed = false;
    entry.createdResumeSessionId = undefined;
    if (!agent) return;
    try {
      agent.close();
    } catch (error) {
      this.deps.log?.warn('Gateway ACP agent close failed:', error);
    }
  }

  private closeMcp(entry: PoolEntry) {
    const mcp = entry.mcp;
    entry.mcp = undefined;
    if (!mcp) return;
    mcp.context.current = undefined;
    void mcp.server.stop().catch((error) => {
      this.deps.log?.warn('Gateway ACP MCP server stop failed:', error);
    });
  }

  private dropEntry(entry: PoolEntry) {
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    if (entry.evicted) return;
    entry.evicted = true;
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
    }
    this.closeAgent(entry);
    this.closeMcp(entry);
  }
}
