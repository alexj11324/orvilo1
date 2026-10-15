import { existsSync } from 'node:fs';
import path from 'node:path';

import type { HeterogeneousAgentModel } from '@orvilo/types';

import type { HeterogeneousAgentPermissionCatalog } from '../types';
import {
  detectManagedAcpBridgeCommand,
  onManagedAcpBridgeInstalled,
  resolveAcpBridgeRoot,
  scheduleManagedAcpBridgeInstall,
} from './acpBridgeInstall';
import {
  buildAcpBridgeNotFoundError,
  detectAcpBridgeCommand,
  detectAcpBridgeRunner,
  getAcpAgentRuntime,
  readAcpBridgeOverrideEnv,
} from './acpRuntime';
import type { StandardAcpConfigOption, StandardAcpSessionOptions } from './standardAcpSession';
import { StandardAcpSession } from './standardAcpSession';

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
  /**
   * argv prepended before the session-built args — non-empty only when the
   * ACP endpoint is a package-runner fallback (`bunx pkg@ver` / `npx -p …`).
   * The native ACP prefix (`acp`, `--acp`) is owned by the session factory,
   * not repeated here.
   */
  commandArgs: string[];
  commandPath: string;
  /** Extra env merged into the child (native-command forwarding + PATH fixups). */
  env: NodeJS.ProcessEnv;
}

export interface ResolveAcpSpawnTargetOptions {
  /**
   * Whether a missing bridge may be fetched through `bunx`/`npx`. A run allows
   * it; a catalog probe must not, because it starts when a page opens and would
   * download and execute a package the user never asked to run.
   */
  allowPackageRunner?: boolean;
}

/** Spawn-relevant part of a resolution; `env` is rebuilt from each caller's env. */
interface ResolvedAcpBridgeLaunch {
  commandArgs: string[];
  commandPath: string;
  resolvedPathEnv?: string;
}

/**
 * How long a bridge resolution is reused. A warm conversation sends a message
 * every few seconds; without the cache each one re-runs the `--version`
 * probes (and, when the bridge is absent, the runner probes).
 */
const ACP_SPAWN_TARGET_CACHE_TTL_MS = 60_000;

const acpSpawnTargetCache = new Map<
  string,
  { expiresAt: number; launch: ResolvedAcpBridgeLaunch }
>();

// A managed install that lands makes every cached runner fallback obsolete.
onManagedAcpBridgeInstalled(() => acpSpawnTargetCache.clear());

/** Test hook: drop every cached bridge resolution. */
export const resetAcpSpawnTargetCache = (): void => acpSpawnTargetCache.clear();

const readCachedLaunch = (key: string): ResolvedAcpBridgeLaunch | undefined => {
  const entry = acpSpawnTargetCache.get(key);
  if (!entry) return undefined;
  const { commandPath } = entry.launch;
  if (
    entry.expiresAt <= Date.now() ||
    (path.isAbsolute(commandPath) && !existsSync(commandPath))
  ) {
    acpSpawnTargetCache.delete(key);
    return undefined;
  }
  return entry.launch;
};

/**
 * Resolve the process to spawn for `agentType`'s ACP endpoint.
 *
 * Native runtimes return the vendor command unchanged. Bridge agents resolve,
 * in order: the bridge binary (env override → PATH → well-known global bins)
 * → the Orvilo-managed install (`acpBridgeInstall`) → a package runner
 * (`bunx`/`npx`). Falling back to the runner also starts a background managed
 * install so the next run launches the binary directly. The resolved vendor
 * command is forwarded to the bridge through `spec.bridge.nativeCommandEnv`,
 * so the bridge drives the exact CLI install the host detected.
 *
 * Successful resolutions are cached in-process for a short TTL (or until the
 * resolved executable disappears) so consecutive messages skip the probes.
 */
export const resolveAcpSpawnTarget = async (
  agentType: string,
  vendorCommand: string,
  env: NodeJS.ProcessEnv,
  options: ResolveAcpSpawnTargetOptions = {},
): Promise<AcpSpawnTarget> => {
  const spec = getAcpAgentRuntime(agentType);
  if (!spec) throw new Error(`No ACP runtime is registered for agent type "${agentType}"`);
  const bridge = spec.bridge;
  if (!bridge) {
    return { commandArgs: [], commandPath: vendorCommand, env };
  }

  const toTarget = (launch: ResolvedAcpBridgeLaunch): AcpSpawnTarget => ({
    commandArgs: launch.commandArgs,
    commandPath: launch.commandPath,
    env: {
      ...env,
      [bridge.nativeCommandEnv]: vendorCommand,
      ...(launch.resolvedPathEnv ? { PATH: launch.resolvedPathEnv } : {}),
    },
  });

  const allowRunner = options.allowPackageRunner !== false;
  const cacheKey = JSON.stringify([
    agentType,
    vendorCommand,
    env.PATH ?? process.env.PATH ?? '',
    readAcpBridgeOverrideEnv(bridge, env) ?? '',
    resolveAcpBridgeRoot(env),
  ]);
  const cached = readCachedLaunch(cacheKey);
  // A runner launch cached by a run must not leak into a caller that forbids it.
  if (cached && (allowRunner || cached.commandArgs.length === 0)) return toTarget(cached);

  const remember = (launch: ResolvedAcpBridgeLaunch) => {
    acpSpawnTargetCache.set(cacheKey, {
      expiresAt: Date.now() + ACP_SPAWN_TARGET_CACHE_TTL_MS,
      launch,
    });
    return toTarget(launch);
  };

  const status = await detectAcpBridgeCommand(bridge, env);
  if (status.available && status.path) {
    return remember({
      commandArgs: [],
      commandPath: status.path,
      resolvedPathEnv: status.resolvedPathEnv,
    });
  }

  const managed = await detectManagedAcpBridgeCommand(bridge, env);
  if (managed.available && managed.path) {
    return remember({
      commandArgs: [],
      commandPath: managed.path,
      resolvedPathEnv: managed.resolvedPathEnv,
    });
  }

  // Rollout-compatible fallback: installs that predate the bridge requirement
  // can still launch through an on-machine package runner (bunx/npx fetches
  // and caches the pinned bridge package) instead of failing every prompt
  // until the user hand-installs the bridge.
  const runner = allowRunner ? await detectAcpBridgeRunner(bridge, env) : undefined;
  if (!runner) throw buildAcpBridgeNotFoundError(agentType);

  // Install the pinned bridge in the background so the next run skips the
  // runner's per-launch package resolution. Never awaited, never throws.
  scheduleManagedAcpBridgeInstall(bridge, runner, env);

  return remember({
    commandArgs: runner.args,
    commandPath: runner.commandPath,
    resolvedPathEnv: runner.resolvedPathEnv,
  });
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
 * `options.commandArgs` carries the spawn prefix from
 * {@link resolveAcpSpawnTarget} — the package-runner argv that boots the
 * bridge when no bridge binary is installed.
 */
export const createStandardAcpSession = (
  agentType: string,
  options: StandardAcpSessionOptions,
): StandardAcpSession => {
  const spec = getAcpAgentRuntime(agentType);
  if (!spec) throw new Error(`No ACP runtime is registered for agent type "${agentType}"`);

  // Vendor-CLI flags cannot ride along on a bridge's own argv — surface the
  // drop explicitly in the run trace instead of silently ignoring them.
  if (spec.bridge && options.args.length > 0) {
    void Promise.resolve(
      options.onStderr(
        `[${spec.label}] ignoring ${options.args.length} agent CLI arg(s) unsupported by the ` +
          `ACP bridge: ${options.args.join(' ')}\n`,
      ),
    ).catch(() => {});
  }

  return new StandardAcpSession(options, {
    agentType,
    args: [...(options.commandArgs ?? []), ...buildStandardAcpArgs(agentType, options.args)],
    configOptions: options.configOptions,
    spec,
  });
};

export interface ListStandardAcpModelsOptions {
  args?: string[];
  clientVersion?: string;
  /** Spawn prefix from `resolveAcpSpawnTarget` (bridge runner fallback). */
  commandArgs?: string[];
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
    commandArgs: options.commandArgs,
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

/** Read permission choices from a throwaway ACP session without changing its defaults. */
export const listStandardAcpPermissions = async (
  agentType: string,
  options: ListStandardAcpModelsOptions,
): Promise<HeterogeneousAgentPermissionCatalog[]> =>
  createStandardAcpSession(agentType, {
    args: options.args ?? [],
    clientVersion: options.clientVersion ?? '1.0.0',
    commandArgs: options.commandArgs,
    commandPath: options.commandPath,
    cwd: options.cwd,
    env: options.env,
    onEvents: () => {},
    onRawMessage: () => {},
    onRuntimeStatus: () => {},
    onSessionId: () => {},
    onStderr: () => {},
    operationId: `${agentType}-permission-discovery`,
    prompt: '',
    requestTimeoutMs: options.timeoutMs,
    sessionId: `${agentType}-permission-discovery`,
  }).discoverPermissions();
