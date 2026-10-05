/**
 * `@orvilo/prime-harness` runner — container PID 1.
 *
 * Boots an upstream `createAgentSession` at upstream parity: the default
 * toolset (`initialActiveToolNames` = `['ipython']` plus whatever
 * extension/acp-mcp tools the resource loader surfaces), a real
 * `DefaultResourceLoader` scanning the device-supplied workspace, a
 * persistent `SessionManager` under the device-supplied stateDir (real
 * resume via `session.resume`/`resumeSessionId`), a persistent
 * `SettingsManager` with telemetry disabled, a real `McpManager` fed by the
 * managed settings file under `agentDir`, and the upstream thinking-level
 * resolution (saved session → settings default → DEFAULT_THINKING_LEVEL,
 * clamped to `model.reasoning`).
 *
 * What stays sealed — the credential architecture, not the capability:
 * in-memory `AuthStorage` (zero credentials), a `ModelRegistry` whose ONLY
 * provider is `orvilo-broker` (all inference exits through the host's broker
 * over the ndjson link — there is no other path out), telemetry off.
 *
 * Protocol channel: stdin/stdout carry ndjson JSON-RPC frames only. Every
 * diagnostic — ours or a stray upstream `console.log` — goes to stderr so it
 * can never corrupt the wire.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import type { Model } from '@earendil-works/pi-ai';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { getSessionsDir } from '@earendil-works/pi-coding-agent/config.js';
import { McpConnectionStore } from '@earendil-works/pi-coding-agent/core/mcp/connection-store.js';
import { McpManager } from '@earendil-works/pi-coding-agent/core/mcp/mcp-manager.js';
import { getDefaultSessionDir } from '@earendil-works/pi-coding-agent/core/session-manager.js';
import type {
  HarnessInitParams,
  HarnessResumeParams,
} from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import {
  BROKER_CANCEL_METHOD,
  BROKER_EVENT_NOTIFICATION,
  BROKER_INFER_METHOD,
  HARNESS_ABORT_METHOD,
  HARNESS_EVENT_NOTIFICATION,
  HARNESS_INIT_METHOD,
  HARNESS_LIST_SESSIONS_METHOD,
  HARNESS_PROMPT_METHOD,
  HARNESS_PROTOCOL_VERSION,
  HARNESS_RESUME_METHOD,
} from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { isNonEmptyString, isRecord } from '@orvilo/utils/object';

import type { BrokerBridge } from './broker';
import { createBrokerBridge } from './broker';
import { mapAgentSessionEvent, mapStopReason } from './events';
import { RunnerLink } from './ndjson';
import { PrimeRlmFamily } from './rlmHost';

/** The runner MUST echo this pin or the host refuses the handshake. */
const RUNNER_PIN = {
  commit: '7d442aafa985f9342134fac16c2ef41f03fb45c1',
  version: '0.9.8',
  license: 'MIT',
} as const;

/**
 * The runner presents the host-pinned route from `harness.init` upstream —
 * `model.id` is the route the run's issued binding actually granted, and
 * reasoning/input/contextWindow/maxTokens pass through from the same
 * `HarnessInitModel` the host resolved off `ProviderModelCapability`.
 * baseUrl/api/provider stay inert: no egress exists.
 */
const brokerModel = (init: HarnessInitParams['model']): Model => ({
  id: init.id,
  name: `Orvilo Broker (${init.id})`,
  api: 'orvilo-broker',
  provider: 'orvilo-broker',
  baseUrl: 'orvilo-broker://local',
  reasoning: init.reasoning === true,
  input:
    Array.isArray(init.input) && init.input.every((m) => m === 'text' || m === 'image')
      ? init.input
      : ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow:
    typeof init.contextWindow === 'number' && Number.isSafeInteger(init.contextWindow)
      ? init.contextWindow
      : 128_000,
  maxTokens: init.maxOutputTokens,
});

// stdout is the protocol channel — anything else must go to stderr.
const stderrWrite = (args: unknown[]) => process.stderr.write(`${args.map(String).join(' ')}\n`);
const hush = (...args: unknown[]) => stderrWrite(args);
Object.assign(console, { debug: hush, info: hush, log: hush, warn: hush });

const link = new RunnerLink({ input: process.stdin, output: process.stdout });

interface RunnerSession {
  aborting: boolean;
  bridge: BrokerBridge;
  /** The upstream session id — reported in the init/resume ack. */
  id: string;
  init: HarnessInitParams;
  promptInFlight: Promise<void> | undefined;
  resumed: boolean;
  session: AgentSession;
  unsubscribe: () => void;
}

let current: RunnerSession | undefined;

/** `<agentDir>/sessions/<sessionId>.jsonl` — the file a resume reopens. */
const sessionFilePath = (sessionDir: string, sessionId: string): string =>
  path.join(sessionDir, `${sessionId}.jsonl`);

const isInitParams = (params: unknown): params is HarnessInitParams =>
  isRecord(params) &&
  params.protocolVersion === HARNESS_PROTOCOL_VERSION &&
  isNonEmptyString(params.workspace) &&
  isRecord(params.pin) &&
  isNonEmptyString(params.pin.commit) &&
  isRecord(params.model) &&
  isNonEmptyString(params.model.id) &&
  typeof params.model.maxOutputTokens === 'number' &&
  Number.isSafeInteger(params.model.maxOutputTokens) &&
  params.model.maxOutputTokens >= 1 &&
  (params.stateDir === undefined || typeof params.stateDir === 'string') &&
  (params.resumeSessionId === undefined || typeof params.resumeSessionId === 'string') &&
  (params.autonomous === undefined || isRecord(params.autonomous)) &&
  (params.goal === undefined ||
    (isRecord(params.goal) && isNonEmptyString(params.goal.objective))) &&
  (params.rlm === undefined ||
    (isRecord(params.rlm) &&
      (params.rlm.maxDepth === undefined ||
        (typeof params.rlm.maxDepth === 'number' && Number.isSafeInteger(params.rlm.maxDepth))))) &&
  (params.thinkingLevel === undefined || typeof params.thinkingLevel === 'string') &&
  (params.toolPolicy === undefined ||
    (isRecord(params.toolPolicy) &&
      (params.toolPolicy.active === undefined ||
        (Array.isArray(params.toolPolicy.active) &&
          params.toolPolicy.active.every(isNonEmptyString))) &&
      (params.toolPolicy.allowed === undefined ||
        (Array.isArray(params.toolPolicy.allowed) &&
          params.toolPolicy.allowed.every(isNonEmptyString)))));

/**
 * Build the upstream session. When `resumeSessionId` names an existing
 * `<sessionDir>/<id>.jsonl`, the manager reopens it — the upstream session
 * restores its messages/model/thinking level and the run reports the same
 * session id back in the ack (the host detects resumed-vs-rebuilt by
 * comparing the acked id against the id it asked for).
 */
const buildSession = async (
  init: HarnessInitParams,
  resumeSessionId?: string,
): Promise<RunnerSession> => {
  const agentDir = isNonEmptyString(init.stateDir)
    ? init.stateDir
    : path.join(init.workspace, '.prime', 'agent');
  const sessionDir = getDefaultSessionDir(init.workspace, agentDir);

  const authStorage = AuthStorage.inMemory({});
  const modelRegistry = ModelRegistry.inMemory(authStorage);

  const model = brokerModel(init.model);
  const sessionManager = (() => {
    if (isNonEmptyString(resumeSessionId)) {
      const file = sessionFilePath(sessionDir, resumeSessionId);
      if (existsSync(file)) return SessionManager.open(file, sessionDir, init.workspace);
    }
    return SessionManager.create(init.workspace, sessionDir);
  })();

  // Persistent settings under agentDir — telemetry stays sealed through the
  // persisted settings file, exactly as upstream records it.
  const settingsManager = SettingsManager.create(init.workspace, agentDir);
  settingsManager.setTelemetryEnabled(false);

  // Real MCP manager fed by the managed settings file under agentDir — the
  // Orvilo-managed path; the connection store persists under the same dir.
  const mcpManager = new McpManager({
    authStorage,
    connectionStore: McpConnectionStore.open(path.join(agentDir, 'mcp-connections.json')),
    getUserServers: () => settingsManager.getGlobalMcpServers(),
  });

  const resourceLoader = new DefaultResourceLoader({
    cwd: init.workspace,
    agentDir,
    settingsManager,
    extraBuiltinSkillOverrides: () => mcpManager.getDisabledBuiltinSkillOverrides(),
  });
  await resourceLoader.reload();

  // Bridge the model registry to mcpManager exactly as upstream does.
  modelRegistry.setOnOAuthProvidersReset(() => mcpManager.registerAllProviders());

  // The ONLY provider is orvilo-broker — `streamSimple` is the broker bridge,
  // so all inference exits through the host over the stdio wire (zero-credential
  // AuthStorage stays sealed; `apiKey` is the upstream-required non-empty
  // sentinel, never a real credential). The provider must be registered before
  // createAgentSession runs but the upstream session id only exists after, so
  // the bridge reads it through a cell filled in once the session exists —
  // resolution happens per-pump inside streamSimple.
  const sessionId = { current: '' };
  const bridge = createBrokerBridge(link, () => sessionId.current);
  modelRegistry.registerProvider('orvilo-broker', {
    api: 'orvilo-broker',
    apiKey: 'embedded',
    baseUrl: 'orvilo-broker://local',
    models: [model],
    streamSimple: bridge.streamSimple,
  });

  const resumed =
    isNonEmptyString(resumeSessionId) && existsSync(sessionFilePath(sessionDir, resumeSessionId));

  // The in-process RLM family — children spawn, persist under device
  // stateDir, emit subagent-scoped wire events, and carry the agent_message /
  // agent_observe / rlm_heartbeat controllers upstream registers off the
  // controllers' presence. Egress stays broker-only: children inherit the
  // broker streamFn.
  const family = new PrimeRlmFamily({
    agentDir,
    allowedToolNames: init.toolPolicy?.allowed,
    autonomous: init.autonomous,
    cwd: init.workspace,
    emit: (event) =>
      link.notify(HARNESS_EVENT_NOTIFICATION, { sessionId: sessionId.current, event }),
    rlmMaxDepth: init.rlm?.maxDepth,
    rlmSessionDir: path.join(agentDir, 'rlm'),
    services: { cwd: init.workspace, mcpManager, modelRegistry, resourceLoader, settingsManager },
  });
  const { controllers, ref } = family.makeControllers();

  const { session } = await createAgentSession({
    agentDir,
    agentMessageController: controllers.agentMessageController,
    agentObserveController: controllers.agentObserveController,
    authStorage,
    autonomous: init.autonomous,
    cwd: init.workspace,
    executionMode: 'rpc',
    // Host pins ON for long sessions (upstream default = the compaction
    // setting; this keeps it on even if the device settings file pins off).
    includeCompactSkill: true,
    includeGoals: true,
    initialActiveToolNames: init.toolPolicy?.active,
    allowedToolNames: init.toolPolicy?.allowed,
    initialGoal: init.goal
      ? { objective: init.goal.objective, tokenBudget: init.goal.tokenBudget }
      : undefined,
    mcpManager,
    model,
    modelRegistry,
    prewarmIpythonKernel: true,
    resourceLoader,
    rlmDepth: 0,
    rlmHeartbeatController: controllers.rlmHeartbeatController,
    rlmMaxDepth: init.rlm?.maxDepth,
    rlmSessionDir: path.join(agentDir, 'rlm'),
    serializedRefine: true,
    sessionManager,
    sessionStartEvent: {
      type: 'session_start',
      reason: resumed ? 'resume' : 'startup',
      ...(resumed && resumeSessionId
        ? { previousSessionFile: sessionFilePath(sessionDir, resumeSessionId) }
        : {}),
    },
    settingsManager,
    subagentRuntimeHost: family.host,
    telemetryDisabled: true,
    // Host-provided effort wins when present; otherwise upstream resolves
    // saved-session → settings default → DEFAULT_THINKING_LEVEL, clamped to
    // model.reasoning.
    thinkingLevel: init.thinkingLevel,
    // tools/noTools/customTools intentionally omitted — upstream default
    // initialActiveToolNames ('ipython') plus extension/acp-mcp surface.
  });

  sessionId.current = session.sessionId;
  family.bindControllers(ref, session, 'top-level');
  family.bindRoot(session);

  return {
    aborting: false,
    bridge,
    id: sessionId.current,
    init,
    promptInFlight: undefined,
    // Reopening an existing file preserves the upstream session id — the
    // acked id matching resumeSessionId is exactly "really resumed".
    resumed: sessionId.current === resumeSessionId,
    session,
    unsubscribe: session.subscribe((event) => {
      const wire = mapAgentSessionEvent(event);
      if (wire)
        link.notify(HARNESS_EVENT_NOTIFICATION, { sessionId: sessionId.current, event: wire });
    }),
  };
};

const teardown = (entry: RunnerSession | undefined): void => {
  if (!entry) return;
  entry.unsubscribe();
  entry.bridge.abortAll();
  void entry.session
    .disposeAsync()
    .catch((error) => console.error('session dispose failed', error));
};

const isResumeParams = (params: unknown): params is HarnessResumeParams =>
  isRecord(params) &&
  isNonEmptyString(params.sessionId) &&
  isNonEmptyString(params.resumeSessionId);

const handleRequest = async (
  id: number | string,
  method: string,
  params: unknown,
): Promise<void> => {
  switch (method) {
    case HARNESS_INIT_METHOD: {
      if (!isInitParams(params)) {
        link.respondError(id, -32602, 'Invalid harness.init params');
        return;
      }
      if (current) {
        link.respondError(id, -32603, 'Session already initialized');
        return;
      }
      try {
        current = await buildSession(params, params.resumeSessionId);
      } catch (error) {
        console.error('createAgentSession failed', error);
        link.respondError(id, -32603, 'Failed to create agent session');
        return;
      }
      link.respond(id, {
        protocolVersion: HARNESS_PROTOCOL_VERSION,
        sessionId: current.id,
        pin: { ...RUNNER_PIN },
        capabilities: {
          prompt: true,
          stream: true,
          cancel: true,
          tools: current.session.getActiveToolNames(),
          requests: [BROKER_INFER_METHOD, BROKER_CANCEL_METHOD],
        },
      });
      return;
    }
    case HARNESS_RESUME_METHOD: {
      const entry = current;
      if (!entry || !isResumeParams(params) || params.sessionId !== entry.id) {
        link.respondError(id, -32602, 'Invalid session.resume params');
        return;
      }
      try {
        const next = await buildSession(entry.init, params.resumeSessionId);
        teardown(entry);
        current = next;
        link.respond(id, { sessionId: next.id, resumed: next.resumed });
      } catch (error) {
        console.error('session.resume failed', error);
        link.respondError(id, -32603, 'Failed to resume agent session');
      }
      return;
    }
    case HARNESS_LIST_SESSIONS_METHOD: {
      const entry = current;
      if (!entry || !isRecord(params) || params.sessionId !== entry.id) {
        link.respondError(id, -32602, 'Invalid session.list params');
        return;
      }
      const agentDir = isNonEmptyString(entry.init.stateDir)
        ? entry.init.stateDir
        : path.join(entry.init.workspace, '.prime', 'agent');
      const sessionsDir = getSessionsDir(agentDir);
      const sessions = existsSync(sessionsDir)
        ? readdirSync(sessionsDir)
            .filter((name) => name.endsWith('.jsonl'))
            .map((name) => name.slice(0, -'.jsonl'.length))
        : [];
      link.respond(id, { sessions });
      return;
    }
    case HARNESS_PROMPT_METHOD: {
      const entry = current;
      if (
        !entry ||
        !isRecord(params) ||
        params.sessionId !== entry.id ||
        !isNonEmptyString(params.text)
      ) {
        link.respondError(id, -32602, 'Invalid session.prompt params');
        return;
      }
      if (entry.promptInFlight) {
        link.respondError(id, -32603, 'Prompt already in flight');
        return;
      }
      const text = params.text;
      let lastStopReason: string | undefined;
      const trackStop = entry.session.subscribe((event) => {
        if (
          (event.type === 'message_update' || event.type === 'message_end') &&
          isRecord(event.message) &&
          event.message.role === 'assistant' &&
          typeof event.message.stopReason === 'string'
        ) {
          lastStopReason = event.message.stopReason;
        }
      });
      const prompt = (async () => {
        try {
          await entry.session.promptAndWait(text);
        } finally {
          trackStop();
        }
      })();
      entry.promptInFlight = prompt;
      try {
        await prompt;
        link.respond(id, mapStopReason(lastStopReason, entry.aborting));
      } catch (error) {
        console.error('promptAndWait failed', error);
        link.respond(id, {
          stopReason: 'error',
          error: error instanceof Error ? error.message : 'Prompt failed',
        });
      } finally {
        entry.promptInFlight = undefined;
      }
      return;
    }
    case HARNESS_ABORT_METHOD: {
      const entry = current;
      if (!entry || !isRecord(params) || params.sessionId !== entry.id) {
        link.respondError(id, -32602, 'Invalid session.abort params');
        return;
      }
      entry.aborting = true;
      try {
        await entry.session.abort();
        link.respond(id, { ok: true });
      } catch (error) {
        console.error('session.abort failed', error);
        link.respondError(id, -32603, 'Abort failed');
      }
      return;
    }
    default: {
      link.respondError(id, -32601, `Unsupported method: ${method}`);
    }
  }
};

link.setRequestHandler((id, method, params) => {
  void handleRequest(id, method, params).catch((error) => {
    console.error('unhandled request failure', error);
    link.respondError(id, -32603, 'Runner request failed');
  });
});

link.setNotificationHandler((method, params) => {
  // Host-initiated session.abort arrives as a notification (fire-and-forget —
  // the supervisor's tree kill is authoritative).
  if (method === HARNESS_ABORT_METHOD) {
    const entry = current;
    if (entry && isRecord(params) && params.sessionId === entry.id) {
      entry.aborting = true;
      void entry.session.abort().catch((error) => console.error('abort notify failed', error));
    }
    return;
  }
  if (method === BROKER_EVENT_NOTIFICATION) {
    current?.bridge.deliverEvent(params);
  }
});
