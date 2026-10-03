/**
 * `@orvilo/prime-harness` runner — container PID 1.
 *
 * Boots an upstream `createAgentSession` with every ambient capability sealed:
 * in-memory empty AuthStorage (zero credentials), in-memory SessionManager,
 * in-memory SettingsManager with telemetry off, an EmptyResourceLoader (the
 * workspace mount is untrusted — nothing scans it), an effectively-empty
 * McpManager, `noTools: 'all'`, and a ModelRegistry whose ONLY provider is
 * `orvilo-broker` (all inference exits through the host's broker over the
 * ndjson link — there is no other path out).
 *
 * Protocol channel: stdin/stdout carry ndjson JSON-RPC frames only. Every
 * diagnostic — ours or a stray upstream `console.log` — goes to stderr so it
 * can never corrupt the wire.
 */

import type { Model } from '@earendil-works/pi-ai';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import {
  type McpConnectionStoreLike,
  McpManager,
} from '@earendil-works/pi-coding-agent/core/mcp/mcp-manager.js';
import type { HarnessInitParams } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import {
  BROKER_CANCEL_METHOD,
  BROKER_EVENT_NOTIFICATION,
  BROKER_INFER_METHOD,
  HARNESS_ABORT_METHOD,
  HARNESS_EVENT_NOTIFICATION,
  HARNESS_INIT_METHOD,
  HARNESS_PROMPT_METHOD,
  HARNESS_PROTOCOL_VERSION,
} from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { isNonEmptyString, isRecord } from '@orvilo/utils/object';

import type { BrokerBridge } from './broker';
import { createBrokerBridge } from './broker';
import { EmptyResourceLoader } from './emptyResourceLoader';
import { mapAgentSessionEvent, mapStopReason } from './events';
import { RunnerLink } from './ndjson';

/** The runner MUST echo this pin or the host refuses the handshake. */
const RUNNER_PIN = {
  commit: '7d442aafa985f9342134fac16c2ef41f03fb45c1',
  version: '0.9.8',
  license: 'MIT',
} as const;

/**
 * The runner presents the host-pinned route from `harness.init` upstream — the
 * model.id on the wire is the route the run's issued binding actually granted,
 * not a placeholder. baseUrl/api/provider stay inert: no egress exists.
 */
const brokerModel = (init: HarnessInitParams['model']): Model => ({
  id: init.id,
  name: `Orvilo Broker (${init.id})`,
  api: 'orvilo-broker',
  provider: 'orvilo-broker',
  baseUrl: 'orvilo-broker://local',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: init.maxOutputTokens,
});

/** In-memory MCP connection store — keeps the manager away from the fs. */
const emptyConnectionStore = (): McpConnectionStoreLike => ({
  load: () => {},
  records: () => [],
  get: () => undefined,
  remove: () => {},
  upsert: () => {},
  queueVerifyResult: () => undefined,
  flush: () => Promise.resolve(),
});

// stdout is the protocol channel — anything else must go to stderr.
const stderrWrite = (args: unknown[]) => process.stderr.write(`${args.map(String).join(' ')}\n`);
const hush = (...args: unknown[]) => stderrWrite(args);
Object.assign(console, { debug: hush, info: hush, log: hush, warn: hush });

const link = new RunnerLink({ input: process.stdin, output: process.stdout });

interface RunnerSession {
  aborting: boolean;
  bridge: BrokerBridge;
  id: string;
  promptInFlight: Promise<void> | undefined;
  session: AgentSession;
  unsubscribe: () => void;
}

let current: RunnerSession | undefined;

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
  params.model.maxOutputTokens >= 1;

const buildSession = async (init: HarnessInitParams, sessionId: string): Promise<RunnerSession> => {
  const authStorage = AuthStorage.inMemory({});
  const modelRegistry = ModelRegistry.inMemory(authStorage);

  const model = brokerModel(init.model);
  const bridge = createBrokerBridge(link, sessionId);
  modelRegistry.registerProvider('orvilo-broker', {
    api: 'orvilo-broker',
    baseUrl: 'orvilo-broker://local',
    apiKey: 'embedded',
    streamSimple: bridge.streamSimple,
    models: [model],
  });

  const settingsManager = SettingsManager.inMemory({ telemetry: { enabled: false } });
  const sessionManager = SessionManager.inMemory(init.workspace);
  const mcpManager = new McpManager({
    authStorage,
    connectionStore: emptyConnectionStore(),
    getUserServers: () => undefined,
    noBackgroundVerification: true,
  });

  const { session } = await createAgentSession({
    agentDir: isNonEmptyString(init.stateDir) ? init.stateDir : '/tmp/agent',
    authStorage,
    customTools: [],
    cwd: init.workspace,
    mcpManager,
    model,
    modelRegistry,
    noTools: 'all',
    resourceLoader: new EmptyResourceLoader(),
    sessionManager,
    settingsManager,
    thinkingLevel: 'off',
    tools: [],
  });

  return {
    aborting: false,
    bridge,
    id: sessionId,
    promptInFlight: undefined,
    session,
    unsubscribe: session.subscribe((event) => {
      const wire = mapAgentSessionEvent(event);
      if (wire) link.notify(HARNESS_EVENT_NOTIFICATION, { sessionId, event: wire });
    }),
  };
};

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
      const sessionId = `embedded-${Date.now().toString(36)}`;
      try {
        current = await buildSession(params, sessionId);
      } catch (error) {
        console.error('createAgentSession failed', error);
        link.respondError(id, -32603, 'Failed to create agent session');
        return;
      }
      link.respond(id, {
        protocolVersion: HARNESS_PROTOCOL_VERSION,
        sessionId,
        pin: { ...RUNNER_PIN },
        capabilities: {
          prompt: true,
          stream: true,
          cancel: true,
          tools: [],
          requests: [BROKER_INFER_METHOD, BROKER_CANCEL_METHOD],
        },
      });
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
