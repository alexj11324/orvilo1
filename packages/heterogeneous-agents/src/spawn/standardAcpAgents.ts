import type { HeterogeneousAgentModel } from '@orvilo/types';

import {
  buildAcpBridgeNotFoundError,
  detectAcpBridgeCommand,
  detectAcpBridgeRunner,
  getAcpAgentRuntime,
} from './acpRuntime';
import type { StandardAcpConfigOption, StandardAcpSessionOptions } from './standardAcpSession';
import { StandardAcpSession } from './standardAcpSession';

// bypassPermissions is rejected when the process runs as root (cloud
// sandboxes); `acceptEdits` keeps headless runs working there — mirrors the
// fallback the stream-json spawner applied to `--permission-mode`.
const isRunningAsRoot = () => typeof process.getuid === 'function' && process.getuid() === 0;

/**
 * Session config options that preserve each agent's legacy headless
 * permission posture:
 *   - claude-code  → mode=bypassPermissions (acceptEdits under root)
 *   - codex        → mode=agent-full-access (--dangerously-bypass-approvals-and-sandbox)
 *   - amp          → permission=bypass (--execute's implicit allow-all)
 * Agents without a bypass-shaped config option rely on the session's
 * auto-allow `session/request_permission` policy instead.
 */
const AGENT_CONFIG_OPTIONS = (agentType: string): StandardAcpConfigOption[] => {
  switch (agentType) {
    case 'amp': {
      return [{ configId: 'permission', value: 'bypass' }];
    }
    case 'claude-code': {
      return [{ configId: 'mode', value: isRunningAsRoot() ? 'acceptEdits' : 'bypassPermissions' }];
    }
    case 'codex': {
      return [{ configId: 'mode', value: 'agent-full-access' }];
    }
    default: {
      return [];
    }
  }
};

/**
 * Build the ACP-mode argv for an agent. Native runtimes prepend their
 * activation prefix (`kimi acp`, `qoder --acp`); bridge binaries own their
 * own argv vocabulary, so vendor-CLI user args are dropped rather than fed
 * to the bridge (they would reach `claude-agent-acp --help`-style parsing
 * and fail or be silently misparsed — vendor tuning for bridged agents
 * belongs in env vars and session config options).
 */
export const buildStandardAcpArgs = (agentType: string, userArgs: string[] = []): string[] => {
  const spec = getAcpAgentRuntime(agentType);
  if (!spec) throw new Error(`No ACP runtime is registered for agent type "${agentType}"`);
  return spec.bridge ? [] : [...(spec.acpArgs ?? []), ...userArgs];
};

/** What to spawn for an agent's ACP endpoint after runtime resolution. */
export interface AcpSpawnTarget {
  /** ACP-mode argv prefix for native agents (`['acp']`, `['--acp']`). */
  args: string[];
  commandPath: string;
  /** Extra env merged into the child (native-command forwarding + PATH fixups). */
  env: NodeJS.ProcessEnv;
}

/**
 * Resolve the process to spawn for `agentType`'s ACP endpoint.
 *
 * Native runtimes return the vendor command unchanged; bridge agents probe
 * for the bridge binary (env override → PATH → well-known global bins) and
 * forward the resolved vendor command to the bridge through
 * `spec.bridge.nativeCommandEnv`, so the bridge drives the exact CLI install
 * the host detected.
 */
export const resolveAcpSpawnTarget = async (
  agentType: string,
  vendorCommand: string,
  env: NodeJS.ProcessEnv,
): Promise<AcpSpawnTarget> => {
  const spec = getAcpAgentRuntime(agentType);
  if (!spec) throw new Error(`No ACP runtime is registered for agent type "${agentType}"`);
  if (!spec.bridge) {
    return { args: [...(spec.acpArgs ?? [])], commandPath: vendorCommand, env };
  }

  const status = await detectAcpBridgeCommand(spec.bridge, env);
  if (!status.available || !status.path) {
    // Rollout-compatible fallback: installs that predate the bridge
    // requirement can still launch through an on-machine package runner
    // (bunx/npx fetches and caches the bridge package) instead of failing
    // every prompt until the user hand-installs the bridge.
    const runner = await detectAcpBridgeRunner(spec.bridge, env);
    if (!runner) throw buildAcpBridgeNotFoundError(agentType);

    return {
      args: runner.args,
      commandPath: runner.commandPath,
      env: {
        ...env,
        [spec.bridge.nativeCommandEnv]: vendorCommand,
        ...(runner.resolvedPathEnv ? { PATH: runner.resolvedPathEnv } : {}),
      },
    };
  }

  return {
    args: [],
    commandPath: status.path,
    env: {
      ...env,
      [spec.bridge.nativeCommandEnv]: vendorCommand,
      ...(status.resolvedPathEnv ? { PATH: status.resolvedPathEnv } : {}),
    },
  };
};

export interface StandardAcpSelectors {
  /** User args that survived selector extraction (natives append after the ACP prefix). */
  args: string[];
  /** Additional `session/set_config_option` applications derived from args. */
  configOptions: StandardAcpConfigOption[];
  /** `--model`/`-m` selector pulled out of args — applied via `initialModel`. */
  initialModel?: string;
}

const FLAG_VALUE_PATTERN = /^-[\w-]+$/;

const takeFlagValue = (
  args: string[],
  index: number,
): { consumed: number; value: string | undefined } => {
  const flag = args[index];
  const equals = flag.indexOf('=');
  if (equals > 0) return { consumed: 1, value: flag.slice(equals + 1) };
  const next = args[index + 1];
  if (next === undefined || (FLAG_VALUE_PATTERN.test(next) && !/^-\d/.test(next))) {
    return { consumed: 1, value: undefined };
  }
  return { consumed: 2, value: next };
};

/**
 * Pull the model/effort/mode selectors out of legacy CLI args so
 * provider-binding and user-supplied flags keep working through the ACP
 * session-config surface instead of reaching the child argv (which bridge
 * binaries own outright). Everything pushed here is a user preference, so it
 * is marked `optional`: `StandardAcpSession` applies it only when the agent's
 * advertised config vocabulary accepts it, and skips it with a trace note
 * otherwise.
 *
 * - `--model` / `-m` → `initialModel` (pi additionally folds a preceding
 *   `--provider` into the `provider/model` composite its catalog uses)
 * - `--mode` → `amp-mode` config option (amp — the `amp-acp` bridge advertises
 *   the exact `AMP_AGENT_MODES` vocabulary under that configId)
 * - `--effort` / `--reasoning-effort` → `effort` config option
 *   (claude-agent-acp advertises `effort` when the resolved model supports it)
 * - `-c model_reasoning_effort="…"` / `--effort` / `--reasoning-effort` →
 *   `reasoning_effort` config option (codex)
 * - `-c service_tier="fast"` → `fast-mode` `on` (codex)
 *
 * Flags without a verified ACP configId stay in `args`: native `*--acp`
 * runtimes still forward them to the vendor parser, while bridge agents drop
 * them (the bridge owns its argv).
 */
export const extractStandardAcpSelectors = (
  agentType: string,
  args: string[] = [],
): StandardAcpSelectors => {
  const rest: string[] = [];
  const configOptions: StandardAcpConfigOption[] = [];
  let model: string | undefined;
  let piProvider: string | undefined;
  let effort: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--model' || arg === '-m' || arg.startsWith('--model=')) {
      const { consumed, value } = takeFlagValue(args, index);
      index += consumed - 1;
      if (value) model = value;
      continue;
    }
    if (agentType === 'amp' && (arg === '--mode' || arg.startsWith('--mode='))) {
      const { consumed, value } = takeFlagValue(args, index);
      index += consumed - 1;
      if (value) configOptions.push({ configId: 'amp-mode', optional: true, value });
      continue;
    }
    if (
      agentType === 'claude-code' &&
      (arg === '--effort' ||
        arg === '--reasoning-effort' ||
        arg.startsWith('--effort=') ||
        arg.startsWith('--reasoning-effort='))
    ) {
      const { consumed, value } = takeFlagValue(args, index);
      index += consumed - 1;
      if (value) configOptions.push({ configId: 'effort', optional: true, value });
      continue;
    }
    if (agentType === 'pi' && (arg === '--provider' || arg.startsWith('--provider='))) {
      const { consumed, value } = takeFlagValue(args, index);
      index += consumed - 1;
      if (value) piProvider = value;
      continue;
    }
    if (
      agentType === 'codex' &&
      (arg === '--effort' ||
        arg === '--reasoning-effort' ||
        arg.startsWith('--effort=') ||
        arg.startsWith('--reasoning-effort='))
    ) {
      const { consumed, value } = takeFlagValue(args, index);
      index += consumed - 1;
      if (value) effort = value;
      continue;
    }
    if (agentType === 'codex' && (arg === '-c' || arg === '--config')) {
      const { consumed, value } = takeFlagValue(args, index);
      index += consumed - 1;
      const eqIndex = value?.indexOf('=') ?? -1;
      if (value && eqIndex > 0) {
        const key = value.slice(0, eqIndex).trim();
        const raw = value.slice(eqIndex + 1).trim();
        const inline =
          raw.length > 1 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
        if (key === 'model_reasoning_effort') {
          configOptions.push({ configId: 'reasoning_effort', optional: true, value: inline });
        } else if (key === 'service_tier' && inline === 'fast') {
          configOptions.push({ configId: 'fast-mode', optional: true, value: 'on' });
        }
      }
      continue;
    }

    rest.push(arg);
  }

  if (effort) {
    configOptions.push({ configId: 'reasoning_effort', optional: true, value: effort });
  }

  return {
    args: rest,
    configOptions,
    initialModel:
      model && piProvider && !model.startsWith(`${piProvider}/`) ? `${piProvider}/${model}` : model,
  };
};

/**
 * Instantiate the standard ACP session for `agentType`. `options.args` are
 * the raw user args — the factory applies the agent's ACP prefix (or drops
 * them for bridge agents, whose argv belongs to the bridge binary).
 */
export const createStandardAcpSession = (
  agentType: string,
  options: StandardAcpSessionOptions,
): StandardAcpSession => {
  const spec = getAcpAgentRuntime(agentType);
  if (!spec) throw new Error(`No ACP runtime is registered for agent type "${agentType}"`);

  return new StandardAcpSession(options, {
    agentType,
    args: buildStandardAcpArgs(agentType, options.args),
    configOptions: [...AGENT_CONFIG_OPTIONS(agentType), ...(options.configOptions ?? [])],
    spec,
  });
};

export interface ListStandardAcpModelsOptions {
  args?: string[];
  clientVersion?: string;
  commandPath: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

/**
 * Open a throwaway ACP session against `commandPath` (already resolved by
 * {@link resolveAcpSpawnTarget}) and read the agent's model config option.
 */
export const listStandardAcpModels = async (
  agentType: string,
  options: ListStandardAcpModelsOptions,
): Promise<HeterogeneousAgentModel[]> =>
  createStandardAcpSession(agentType, {
    args: options.args ?? [],
    clientVersion: options.clientVersion ?? '1.0.0',
    commandPath: options.commandPath,
    cwd: options.cwd,
    env: options.env,
    onEvents: () => {},
    onRawMessage: () => {},
    onRuntimeStatus: () => {},
    onSessionId: () => {},
    onStderr: () => {},
    operationId: `${agentType}-model-discovery`,
    prompt: '',
    requestTimeoutMs: options.timeoutMs,
    sessionId: `${agentType}-model-discovery`,
  }).discoverModels();
