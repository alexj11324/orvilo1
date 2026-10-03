/**
 * In-process RLM sub-agent family for the runner — the upstream unseal.
 *
 * Upstream interactive sessions spawn sub-agents through the session's
 * inline host; the daemon spawns them through `AgentSessionRuntime`. Neither
 * shape is reachable from `createAgentSession` with our custom services, so
 * the runner installs its own `SubagentRuntimeHost`: it replicates the
 * upstream inline spawn (same services, same parent links, real persistent
 * session files under the device stateDir) while keeping a live handle
 * registry — which is exactly what the upstream inline path withholds and
 * the agent_message / agent_observe / rlm_heartbeat controllers need.
 *
 * Egress boundary is unchanged: children inherit the parent's `streamFn`,
 * which is the `orvilo-broker` bridge — every sub-agent's inference still
 * exits only through the host broker.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { Agent } from '@earendil-works/pi-agent-core';
import { clampServiceTier } from '@earendil-works/pi-ai';
import type {
  AgentSession,
  McpManager,
  ModelRegistry,
  ResourceLoader,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { AgentSession as AgentSessionClass, SessionManager } from '@earendil-works/pi-coding-agent';
import type {
  AgentFamilyMember,
  AgentSessionMessageController,
  AgentSessionMessageSendInput,
} from '@earendil-works/pi-coding-agent/core/agent-messages.js';
import type { AgentObserveController } from '@earendil-works/pi-coding-agent/core/agent-observe.js';
import type { AgentAutonomousConfig } from '@earendil-works/pi-coding-agent/core/autonomous.js';
import type {
  AgentCronJob,
  AgentRlmHeartbeatController,
} from '@earendil-works/pi-coding-agent/core/cron-jobs.js';
import {
  AgentCronJobStore,
  AgentCronScheduler,
  DEFAULT_HEARTBEAT_SCHEDULE,
  normalizeHeartbeatSchedule,
  resolveHeartbeatStreamingBehavior,
  shouldDeferHeartbeatCronJob,
} from '@earendil-works/pi-coding-agent/core/cron-jobs.js';
import type {
  CreateRlmRootSessionOptions,
  CreateRlmSubagentRuntimeOptions,
  RlmCreateSessionResult,
  RlmSubagentRuntime,
} from '@earendil-works/pi-coding-agent/core/rlm-runtime.js';
import type { HarnessSessionEvent } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { isRecord } from '@orvilo/utils/object';

import { mapAgentSessionEvent } from './events';

/** The shared services every family member is built on (runner-owned). */
export interface RunnerServices {
  cwd: string;
  mcpManager: McpManager;
  modelRegistry: ModelRegistry;
  resourceLoader: ResourceLoader;
  settingsManager: SettingsManager;
}

interface PrimeRlmEntry {
  /** Spawn key — the RLM child node id the parent's tree tracks. */
  key: string;
  kind: 'root' | 'subagent';
  parentId?: string;
  session: AgentSession;
  sessionDir: string;
  sessionName?: string;
  unsubscribe: () => void;
}

export interface PrimeRlmFamilyOptions {
  agentDir: string;
  /** Host tool policy — propagated so children can't widen the surface. */
  allowedToolNames?: string[];
  /** Autonomous policy propagated to every family member. */
  autonomous?: AgentAutonomousConfig;
  cwd: string;
  /** Emit a wire event already stamped with the producing session context. */
  emit: (event: HarnessSessionEvent) => void;
  /** Effective maxDepth (host policy pin or upstream default). */
  rlmMaxDepth?: number;
  /** Directory under device stateDir that parents child session dirs. */
  rlmSessionDir: string;
  services: RunnerServices;
}

/** Lazily-resolved session back-reference (upstream's `stateRef` pattern —
 * the controllers go into the session's constructor before the session
 * exists). */
interface SessionRef {
  runtimeKind: 'top-level' | 'subagent';
  session?: AgentSession;
  sessionFile?: string;
}

const requireSelf = (ref: SessionRef): AgentSession => {
  if (!ref.session) throw new Error('RLM controller used before the session was bound');
  return ref.session;
};

/**
 * The family registry + host + controllers. One instance per runner session;
 * the same object is passed to every member so children can spawn, observe,
 * and message within the same family.
 */
export class PrimeRlmFamily {
  private readonly entries = new Map<string, PrimeRlmEntry>();
  private readonly bySessionId = new Map<string, PrimeRlmEntry>();
  private root: PrimeRlmEntry | undefined;
  private readonly cronStore = AgentCronJobStore.forSessionArtifacts();
  private readonly scheduler: AgentCronScheduler;
  private disposed = false;

  constructor(private readonly options: PrimeRlmFamilyOptions) {
    this.scheduler = new AgentCronScheduler(this.cronStore, {
      onError: (job, error) =>
        console.error(
          'rlm heartbeat run failed',
          job.id,
          error instanceof Error ? error.message : error,
        ),
      runJob: async (job) => this.runHeartbeatJob(job),
    });
  }

  /** The host handed to every session in the family. */
  readonly host = {
    completeRlmSubagentRuntime: () => false,
    createRlmRootSession: (options: CreateRlmRootSessionOptions) => this.createRootSession(options),
    createRlmSubagentRuntime: (options: CreateRlmSubagentRuntimeOptions) =>
      this.createSubagentRuntime(options),
    deleteRlmSubagentRuntime: async (childId: string, session?: AgentSession) =>
      this.deleteEntry(childId, session),
    disposeRlmSubagentRuntimes: async () => this.disposeAll(),
    releaseRlmSubagentRuntime: async (
      runtime: RlmSubagentRuntime,
      _options: CreateRlmSubagentRuntimeOptions,
      _status: 'done' | 'error' | 'cancelled',
    ) => this.releaseEntry(runtime.session),
  };

  /** Register the root session + start the heartbeat scheduler. */
  bindRoot(session: AgentSession): void {
    const entry: PrimeRlmEntry = {
      key: session.sessionId,
      kind: 'root',
      session,
      sessionDir: this.options.rlmSessionDir,
      unsubscribe: () => undefined,
    };
    this.root = entry;
    this.entries.set(entry.key, entry);
    this.bySessionId.set(session.sessionId, entry);
    this.registerHeartbeatContext(entry);
    this.scheduler.start();
    this.cronStore.onHeartbeatChange(() => this.scheduler.wake());
  }

  /**
   * Controllers for a session under construction. The returned ref is filled
   * by `bindControllers` once the session object exists — pass the
   * controllers straight into the `AgentSession` config.
   */
  makeControllers(): {
    ref: SessionRef;
    controllers: {
      agentMessageController: AgentSessionMessageController;
      agentObserveController: AgentObserveController;
      rlmHeartbeatController: AgentRlmHeartbeatController;
    };
  } {
    const ref: SessionRef = { runtimeKind: 'top-level' };
    return {
      controllers: {
        agentMessageController: this.messageController(ref),
        agentObserveController: this.observeController(ref),
        rlmHeartbeatController: this.heartbeatController(ref),
      },
      ref,
    };
  }

  /** Fill a controller ref after the session exists. */
  bindControllers(ref: SessionRef, session: AgentSession, runtimeKind: SessionRef['runtimeKind']) {
    ref.session = session;
    ref.runtimeKind = runtimeKind;
    ref.sessionFile = (session as { sessionFile?: string }).sessionFile;
  }

  // ---------- session construction (upstream inline-parity) ----------

  private newSession(
    build: (extra: Record<string, unknown>) => Record<string, unknown>,
    runtimeKind: SessionRef['runtimeKind'],
  ): AgentSession {
    const { ref, controllers } = this.makeControllers();
    const config = build({
      agentMessageController: controllers.agentMessageController,
      agentObserveController: controllers.agentObserveController,
      rlmHeartbeatController: controllers.rlmHeartbeatController,
      subagentRuntimeHost: this.host,
    });
    const session = new AgentSessionClass(config as never);
    this.bindControllers(ref, session, runtimeKind);
    return session;
  }

  private register(
    key: string,
    session: AgentSession,
    fields: {
      kind: PrimeRlmEntry['kind'];
      parentId?: string;
      sessionDir: string;
      sessionName?: string;
    },
  ): PrimeRlmEntry {
    const entry: PrimeRlmEntry = {
      key,
      kind: fields.kind,
      parentId: fields.parentId,
      session,
      sessionDir: fields.sessionDir,
      sessionName: fields.sessionName ?? (session as { sessionName?: string }).sessionName,
      unsubscribe: session.subscribe((event) => {
        const wire = mapAgentSessionEvent(event as never);
        if (wire) this.options.emit({ ...wire, subagent: this.subagentContext(entry) });
      }),
    };
    this.entries.set(key, entry);
    this.bySessionId.set(session.sessionId, entry);
    this.registerHeartbeatContext(entry);
    return entry;
  }

  private subagentContext(entry: PrimeRlmEntry) {
    return { childId: entry.key, name: entry.sessionName, parentId: entry.parentId };
  }

  private registerHeartbeatContext(entry: PrimeRlmEntry): void {
    const artifactDir = (
      entry.session as { sessionManager?: { getSessionArtifactDir?: () => string | undefined } }
    ).sessionManager?.getSessionArtifactDir?.();
    if (
      artifactDir &&
      this.cronStore.registerSessionArtifact(entry.session.sessionId, artifactDir)
    ) {
      void this.cronStore
        .recoverSessionArtifact(entry.session.sessionId)
        .then(() => this.scheduler.wake());
    }
  }

  // ---------- SubagentRuntimeHost ----------

  private async createSubagentRuntime(
    options: CreateRlmSubagentRuntimeOptions,
  ): Promise<RlmSubagentRuntime> {
    if (this.disposed) throw new Error('RLM family is disposed');
    const parent = options.parentSession as AgentSession;
    const parentCwd =
      (parent as { sessionManager?: { getCwd?: () => string } }).sessionManager?.getCwd?.() ??
      this.options.cwd;
    const sessionManager = SessionManager.create(parentCwd, options.sessionDir);
    const parentFile = (parent as { sessionFile?: string }).sessionFile;
    if (parentFile) {
      sessionManager.newSession({ parentSession: parentFile, rlmDepth: options.rlmDepth });
    }
    sessionManager.appendModelChange(options.model.provider, options.model.id);
    sessionManager.appendThinkingLevelChange(options.thinkingLevel);
    sessionManager.appendServiceTierChange(options.serviceTier);
    const sessionId = sessionManager.getSessionId();
    const svc = this.options.services;
    const parentAgent = (parent as unknown as { agent: Record<string, unknown> }).agent;
    const settings = svc.settingsManager;
    const childAgent = new Agent({
      initialState: {
        model: options.model,
        serviceTier: clampServiceTier(options.model, options.serviceTier),
        systemPrompt: '',
        thinkingLevel: options.thinkingLevel,
        tools: [],
      },
      convertToLlm: parentAgent.convertToLlm,
      followUpMode: settings.getFollowUpMode(),
      getApiKey: parentAgent.getApiKey,
      onPayload: parentAgent.onPayload,
      onResponse: parentAgent.onResponse,
      sessionId,
      steeringMode: settings.getSteeringMode(),
      streamFn: parentAgent.streamFn,
      thinkingBudgets: settings.getThinkingBudgets(),
      toolExecution: parentAgent.toolExecution,
      transformContext: parentAgent.transformContext,
      transport: settings.getTransport(),
    });
    const child = this.newSession(
      (controllers) => ({
        ...controllers,
        agent: childAgent,
        agentDir: this.options.agentDir,
        allowedToolNames: options.allowedToolNames ?? this.options.allowedToolNames,
        autonomous: this.options.autonomous,
        cwd: parentCwd,
        customTools: options.customTools,
        includeCompactSkill: options.includeCompactSkill,
        includeGoals: options.includeGoals,
        initialActiveToolNames: options.activeToolNames,
        mcpManager: svc.mcpManager,
        modelRegistry: svc.modelRegistry,
        resourceLoader: svc.resourceLoader,
        rlmDepth: options.rlmDepth,
        rlmMaxDepth: options.rlmMaxDepth,
        rlmParentAgent: (parent as { sessionName?: string }).sessionName ?? parent.sessionId,
        rlmParentNodeId: options.rlmParentNodeId,
        rlmSessionDir: options.sessionDir,
        scopedModels: options.scopedModels,
        semanticParentSessionId: parent.sessionId,
        semanticSpawnedByRequestId: options.spawnedByRequestId,
        serviceTierPreference: options.serviceTier,
        sessionManager,
        sessionStartEvent: { reason: 'startup', type: 'session_start' },
        settingsManager: svc.settingsManager,
      }),
      'subagent',
    );
    if (options.sessionName !== undefined && child.sessionName !== options.sessionName) {
      try {
        child.setSessionName(options.sessionName);
      } catch (error) {
        child.dispose();
        throw error;
      }
    }
    const entry = this.register(options.id, child, {
      kind: 'subagent',
      parentId: parent.sessionId,
      sessionDir: options.sessionDir,
      sessionName: options.sessionName,
    });
    options.onSessionPublished?.(child);
    // First-sight emission carries the spawn prompt — the ledger seeds the
    // subagent Thread's user message from it (hetero spawnMetadata parity).
    this.options.emit({
      child: {
        id: entry.key,
        label: options.sessionName ?? entry.key,
        parentId: parent.sessionId,
        prompt: options.prompt,
        sessionDir: options.sessionDir,
        status: 'queued',
      },
      kind: 'subagent_update',
    });
    return { session: child };
  }

  private async createRootSession(
    options: CreateRlmRootSessionOptions,
  ): Promise<RlmCreateSessionResult> {
    if (this.disposed) throw new Error('RLM family is disposed');
    const svc = this.options.services;
    const sessionManager = SessionManager.create(
      options.cwd,
      path.join(this.options.rlmSessionDir, 'roots'),
    );
    sessionManager.newSession();
    const session = this.newSession(
      (controllers) => ({
        ...controllers,
        agentDir: this.options.agentDir,
        allowedToolNames: this.options.allowedToolNames,
        autonomous: this.options.autonomous,
        cwd: options.cwd,
        includeCompactSkill: true,
        mcpManager: svc.mcpManager,
        model: options.model,
        modelRegistry: svc.modelRegistry,
        resourceLoader: svc.resourceLoader,
        rlmDepth: 0,
        rlmMaxDepth: this.options.rlmMaxDepth,
        rlmSessionDir: this.options.rlmSessionDir,
        sessionManager,
        sessionStartEvent: { reason: 'startup', type: 'session_start' },
        settingsManager: svc.settingsManager,
        thinkingLevel: options.thinkingLevel,
      }),
      'top-level',
    );
    if (options.sessionName !== undefined) {
      (session as { setSessionName?: (name: string) => void }).setSessionName?.(
        options.sessionName,
      );
    }
    const entry = this.register(session.sessionId, session, {
      kind: 'root',
      sessionDir: this.options.rlmSessionDir,
      sessionName: options.sessionName,
    });
    this.options.emit({
      child: {
        id: entry.key,
        label: options.sessionName ?? session.sessionId,
        prompt: options.prompt,
        status: 'running',
      },
      kind: 'subagent_update',
    });
    void session
      .prompt(options.prompt)
      .catch((error) =>
        console.error(
          'rlm.create_session prompt failed',
          error instanceof Error ? error.message : error,
        ),
      );
    return {
      active_session_id: session.sessionId,
      model: String((options.model as { id?: string }).id ?? ''),
      name: options.sessionName ?? session.sessionId,
      session_file: (session as { sessionFile?: string }).sessionFile ?? '',
      session_id: session.sessionId,
    };
  }

  private async releaseEntry(session: AgentSession): Promise<void> {
    const entry = this.bySessionId.get(session.sessionId);
    if (entry) this.unregister(entry);
    await session
      .disposeAsync()
      .catch((error) =>
        console.error('rlm child dispose failed', error instanceof Error ? error.message : error),
      );
  }

  private async deleteEntry(childId: string, session?: AgentSession): Promise<void> {
    const entry =
      this.entries.get(childId) ?? (session ? this.bySessionId.get(session.sessionId) : undefined);
    if (entry) this.unregister(entry);
    const target = entry?.session ?? session;
    if (target) {
      await target
        .disposeAsync()
        .catch((error) =>
          console.error(
            'rlm child delete dispose failed',
            error instanceof Error ? error.message : error,
          ),
        );
    }
  }

  private async disposeAll(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.scheduler.stop();
    const pending: Promise<unknown>[] = [];
    for (const entry of this.entries.values()) {
      if (entry === this.root) continue;
      entry.unsubscribe();
      pending.push(entry.session.disposeAsync());
    }
    this.entries.clear();
    this.bySessionId.clear();
    this.root = undefined;
    await Promise.allSettled(pending);
  }

  private unregister(entry: PrimeRlmEntry): void {
    entry.unsubscribe();
    this.entries.delete(entry.key);
    this.bySessionId.delete(entry.session.sessionId);
    if (entry === this.root) this.root = undefined;
  }

  // ---------- heartbeat delivery ----------

  private heartbeatController(ref: SessionRef): AgentRlmHeartbeatController {
    return {
      listRlmHeartbeats: (listOptions) =>
        this.cronStore.listRlmHeartbeats(requireSelf(ref).sessionId, listOptions),
      createRlmHeartbeat: (input) => {
        const session = requireSelf(ref);
        const sessionFile = ref.sessionFile;
        if (!sessionFile) throw new Error('RLM heartbeats require a persisted session file');
        return this.cronStore.createRlmHeartbeat({
          activeSessionId: session.sessionId,
          cwd: this.options.cwd,
          deliveryMode: input.deliveryMode,
          label: input.label,
          prompt: input.instruction,
          runtimeKind: ref.runtimeKind,
          scheduleText: normalizeHeartbeatSchedule(input.interval ?? DEFAULT_HEARTBEAT_SCHEDULE),
          sessionFile,
          sessionId: session.sessionId,
        });
      },
      updateRlmHeartbeat: (input) =>
        this.cronStore.updateRlmHeartbeat(requireSelf(ref).sessionId, input.id, {
          deliveryMode: input.deliveryMode,
          label: input.label,
          prompt: input.instruction,
          scheduleText: input.interval,
          status: input.status,
        }),
      deleteRlmHeartbeat: (id) => this.cronStore.deleteRlmHeartbeat(requireSelf(ref).sessionId, id),
    };
  }

  private async runHeartbeatJob(job: AgentCronJob): Promise<'skipped' | undefined> {
    const entry = this.bySessionId.get(job.activeSessionId);
    if (!entry) return 'skipped';
    const session = entry.session as {
      isBashRunning?: boolean;
      isCompacting?: boolean;
      isRetrying?: boolean;
      isStreaming?: boolean;
      promptHeartbeat?: (job: AgentCronJob, options?: Record<string, unknown>) => Promise<void>;
      unfinishedActionCount?: number;
    };
    if (
      typeof session.promptHeartbeat !== 'function' ||
      shouldDeferHeartbeatCronJob(job, {
        hasPendingSessionWork: (session.unfinishedActionCount ?? 0) > 0,
        isBashRunning: session.isBashRunning ?? false,
        isCompacting: session.isCompacting ?? false,
        isRetrying: session.isRetrying ?? false,
        isStreaming: session.isStreaming ?? false,
        unfinishedActionCount: session.unfinishedActionCount ?? 0,
      })
    ) {
      return 'skipped';
    }
    await session.promptHeartbeat(job, {
      followUpQueueKey: `heartbeat:${job.id}`,
      source: 'rpc',
      streamingBehavior: resolveHeartbeatStreamingBehavior(job.deliveryMode),
    });
    return undefined;
  }

  // ---------- agent_observe ----------

  private observeController(ref: SessionRef): AgentObserveController {
    return {
      listAgents: () => ({
        agents: [...this.entries.values()].map((entry) => this.summaryFor(entry)),
        current: this.summaryFor(this.entryOf(requireSelf(ref))),
      }),
      getAgent: (target) => ({ agent: this.summaryFor(this.resolve(target, ref)) }),
      recentMessages: ({ limit = 8, maxChars = 800, target }) => {
        const entry = this.resolve(target, ref);
        const all = (entry.session as { messages?: unknown[] }).messages ?? [];
        const start = Math.max(0, all.length - limit);
        const messages = all
          .slice(start)
          .map((message, index) => createObservePreview(message, start + index, maxChars));
        return {
          agent: this.summaryFor(entry),
          limit,
          maxChars,
          messages,
          truncated: messages.some((message) => message.truncated),
        };
      },
    };
  }

  private entryOf(session: AgentSession): PrimeRlmEntry {
    return (
      this.bySessionId.get(session.sessionId) ?? {
        key: session.sessionId,
        kind: 'root' as const,
        session,
        sessionDir: this.options.rlmSessionDir,
        unsubscribe: () => undefined,
      }
    );
  }

  private summaryFor(entry: PrimeRlmEntry) {
    const live = entry.session as {
      isCompacting?: boolean;
      isStreaming?: boolean;
      messages?: unknown[];
      sessionName?: string;
      unfinishedActionCount?: number;
    };
    return {
      activeSessionId: entry.session.sessionId,
      attachedClients: 0,
      isCompacting: live.isCompacting ?? false,
      isCurrent: entry === this.root || entry.session === this.root?.session,
      isSessionActive: true,
      isStreaming: live.isStreaming ?? false,
      messageCount: live.messages?.length,
      queuedCount: live.unfinishedActionCount ?? 0,
      parentSessionId: entry.parentId,
      rlmChildId: entry.kind === 'subagent' ? entry.key : undefined,
      rlmParentNodeId: entry.parentId,
      runtimeKind: entry.kind === 'subagent' ? ('subagent' as const) : ('top-level' as const),
      sessionId: entry.session.sessionId,
      sessionName: entry.sessionName ?? live.sessionName,
      status: (live.isStreaming ? 'running' : 'idle') as 'running' | 'idle' | 'inactive',
    };
  }

  // ---------- agent_message ----------

  private messageController(ref: SessionRef): AgentSessionMessageController {
    return {
      family: async () => this.familyOf(requireSelf(ref)),
      listAgents: async () => ({
        agents: [...this.entries.values()].map((entry) => ({
          activeSessionId: entry.session.sessionId,
          runtimeKind: entry.kind === 'subagent' ? ('subagent' as const) : ('top-level' as const),
          sessionId: entry.session.sessionId,
          sessionName: entry.sessionName,
          status: 'running' as const,
        })),
        current: {
          activeSessionId: requireSelf(ref).sessionId,
          sessionId: requireSelf(ref).sessionId,
          sessionName: (requireSelf(ref) as { sessionName?: string }).sessionName,
        },
      }),
      sendAgentMessage: async (input: AgentSessionMessageSendInput) => {
        const self = requireSelf(ref);
        const dest = this.resolve(input.target, ref);
        await dest.session.prompt(input.message, {
          agentMessageId: `agentmsg_${randomUUID()}`,
          streamingBehavior: 'steer',
        });
        return {
          deliveredAt: new Date().toISOString(),
          deliveryStatus: 'delivered' as const,
          id: `agentmsg_${randomUUID()}`,
          message: input.message,
          source: 'agent_message' as const,
          target: {
            activeSessionId: dest.session.sessionId,
            runtimeKind: dest.kind === 'subagent' ? ('subagent' as const) : ('top-level' as const),
            sessionId: dest.session.sessionId,
            sessionName: dest.sessionName,
          },
          ...(self.sessionId ? { from: { sessionId: self.sessionId } } : {}),
        };
      },
    };
  }

  private familyOf(self: AgentSession): AgentFamilyMember[] {
    const selfEntry = this.bySessionId.get(self.sessionId);
    const selfDepth = selfEntry ? this.depthOf(selfEntry) : 0;
    const members: AgentFamilyMember[] = [];
    for (const entry of this.entries.values()) {
      if (entry === selfEntry) continue;
      if (selfEntry?.parentId !== undefined && entry.session.sessionId === selfEntry.parentId) {
        members.push({
          entry: this.catalogEntry(entry, selfDepth - 1),
          relationship: 'parent',
        });
      } else if (entry.parentId === self.sessionId) {
        members.push({
          entry: this.catalogEntry(entry, selfDepth + 1),
          relationship: 'child',
        });
      } else if (selfEntry?.parentId !== undefined && entry.parentId === selfEntry.parentId) {
        members.push({
          entry: this.catalogEntry(entry, selfDepth),
          relationship: 'sibling',
        });
      }
    }
    return members;
  }

  private catalogEntry(entry: PrimeRlmEntry, depth: number) {
    return {
      depth,
      id: entry.session.sessionId,
      name: entry.sessionName,
      parentSessionId: entry.parentId,
      rlmChildId: entry.kind === 'subagent' ? entry.key : undefined,
      status: 'running' as const,
    };
  }

  private depthOf(entry: PrimeRlmEntry): number {
    let depth = 0;
    let cursor = entry;
    while (cursor.parentId !== undefined) {
      const parent = this.bySessionId.get(cursor.parentId);
      if (!parent) break;
      depth += 1;
      cursor = parent;
    }
    return depth;
  }

  private resolve(target: string, ref: SessionRef): PrimeRlmEntry {
    const normalized = target.trim();
    for (const entry of this.entries.values()) {
      if (
        entry.session.sessionId === normalized ||
        entry.key === normalized ||
        entry.sessionName === normalized
      ) {
        return entry;
      }
    }
    const self = ref.session;
    if (
      self &&
      (normalized === self.sessionId ||
        normalized === (self as { sessionName?: string }).sessionName)
    ) {
      return this.entryOf(self);
    }
    throw new Error('Agent reach is limited to parent, siblings, and children');
  }
}

/** Collapse an upstream AgentMessage into the agent_observe preview shape. */
const createObservePreview = (
  message: unknown,
  index: number,
  maxChars: number,
): {
  index: number;
  role: string;
  text: string;
  truncated: boolean;
  timestamp?: number;
  toolCalls?: string[];
} => {
  const record = isRecord(message) ? message : {};
  const role = typeof record.role === 'string' ? record.role : 'unknown';
  let text = '';
  const content = record.content;
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    text = content
      .filter((part) => isRecord(part) && part.type === 'text' && typeof part.text === 'string')
      .map((part) => (part as { text: string }).text)
      .join('');
  }
  const toolCalls = Array.isArray(content)
    ? content
        .filter(
          (part) => isRecord(part) && part.type === 'toolCall' && typeof part.name === 'string',
        )
        .map((part) => (part as { name: string }).name)
    : undefined;
  const truncated = text.length > maxChars;
  return {
    index,
    role,
    text: truncated ? `${text.slice(0, maxChars)}…` : text,
    truncated,
    ...(typeof record.timestamp === 'number' ? { timestamp: record.timestamp } : {}),
    ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
  };
};
