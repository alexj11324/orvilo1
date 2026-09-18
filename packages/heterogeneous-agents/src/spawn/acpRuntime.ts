import { homedir, platform } from 'node:os';
import path from 'node:path';

import type { LocalHeterogeneousAgentType } from '../config';
import type { CliCommandStatus } from './resolveCliCommand';
import type { HeterogeneousAgentRuntimeStatus } from './runtimeStatus';

/**
 * How a local heterogeneous agent reaches an ACP v1 stdio transport.
 *
 * Two shapes exist:
 * - `acpArgs` — the vendor CLI itself speaks ACP once launched with these
 *   prefix args (`kimi acp`, `qoder --acp`, …). User args are appended after.
 * - `bridge` — the vendor CLI has no native ACP mode, so the protocol endpoint
 *   is an upstream bridge binary (`claude-agent-acp`, `codex-acp`, `amp-acp`,
 *   `pi-acp`) that drives the native CLI underneath. The bridge locates the
 *   vendor binary through `nativeCommandEnv`.
 */
export interface AcpAgentRuntimeSpec {
  /** Prefix args that put the vendor CLI into ACP mode (native agents). */
  acpArgs?: string[];
  bridge?: AcpBridgeSpec;
  /** Synthetic lifecycle event prefix (`<prefix>_session` / `_prompt_completed` / `_error`). */
  eventPrefix: string;
  /** Agent-facing label used in errors and process names. */
  label: string;
  /** Vendor/provider id stamped on emitted stream events. */
  provider: string;
  /** Runtime-status transport tag surfaced to hosts. */
  transport: HeterogeneousAgentRuntimeStatus['transport'];
}

export interface AcpBridgeSpec {
  /** Bare executable name resolved on PATH (e.g. `claude-agent-acp`). */
  command: string;
  /** Install hint surfaced when the bridge binary cannot be found. */
  installCommand: string;
  /**
   * Env var the bridge reads to locate the vendor CLI. The resolved native
   * command is forwarded here so the bridge drives the same install the user
   * configured — leaving it unset lets the bridge use its own default lookup.
   */
  nativeCommandEnv: string;
  /** Env var that overrides the bridge executable path. */
  overrideEnv: string;
  /** npm package carrying the bridge binary (used by the runner fallback). */
  package: string;
}

type AcpRuntimeAgentType = Extract<
  LocalHeterogeneousAgentType,
  'amp' | 'claude-code' | 'codebuddy' | 'codex' | 'kimi-code' | 'opencode' | 'pi' | 'qoder'
>;

export const ACP_AGENT_RUNTIMES = {
  'amp': {
    bridge: {
      command: 'amp-acp',
      installCommand: 'npm install -g amp-acp',
      package: 'amp-acp',
      nativeCommandEnv: 'AMP_CLI_PATH',
      overrideEnv: 'LOBE_AMP_ACP_COMMAND',
    },
    eventPrefix: 'amp',
    label: 'Amp ACP',
    provider: 'amp',
    transport: 'amp-acp',
  },
  'claude-code': {
    bridge: {
      command: 'claude-agent-acp',
      installCommand: 'npm install -g @agentclientprotocol/claude-agent-acp',
      package: '@agentclientprotocol/claude-agent-acp',
      nativeCommandEnv: 'CLAUDE_CODE_EXECUTABLE',
      overrideEnv: 'LOBE_CLAUDE_CODE_ACP_COMMAND',
    },
    eventPrefix: 'claude_code',
    label: 'Claude Code ACP',
    provider: 'claude-code',
    transport: 'claude-code-acp',
  },
  'codebuddy': {
    acpArgs: ['--acp'],
    eventPrefix: 'codebuddy',
    label: 'CodeBuddy ACP',
    provider: 'codebuddy',
    transport: 'codebuddy-acp',
  },
  'codex': {
    bridge: {
      command: 'codex-acp',
      installCommand: 'npm install -g @agentclientprotocol/codex-acp',
      package: '@agentclientprotocol/codex-acp',
      nativeCommandEnv: 'CODEX_PATH',
      overrideEnv: 'LOBE_CODEX_ACP_COMMAND',
    },
    eventPrefix: 'codex',
    label: 'Codex ACP',
    provider: 'codex',
    transport: 'codex-acp',
  },
  'kimi-code': {
    acpArgs: ['acp'],
    eventPrefix: 'kimi_code',
    label: 'Kimi Code ACP',
    provider: 'kimi-code',
    transport: 'kimi-code-acp',
  },
  'opencode': {
    acpArgs: ['acp'],
    eventPrefix: 'opencode',
    label: 'OpenCode ACP',
    provider: 'opencode',
    transport: 'opencode-acp',
  },
  'pi': {
    bridge: {
      command: 'pi-acp',
      installCommand: 'npm install -g pi-acp',
      package: 'pi-acp',
      nativeCommandEnv: 'PI_ACP_PI_COMMAND',
      overrideEnv: 'LOBE_PI_ACP_COMMAND',
    },
    eventPrefix: 'pi',
    label: 'Pi ACP',
    provider: 'pi',
    transport: 'pi-acp',
  },
  'qoder': {
    acpArgs: ['--acp'],
    eventPrefix: 'qoder',
    label: 'Qoder ACP',
    provider: 'qoder',
    transport: 'qoder-acp',
  },
} satisfies Record<AcpRuntimeAgentType, AcpAgentRuntimeSpec>;

/** Agent types driven through {@link ACP_AGENT_RUNTIMES} sessions. */
export const ACP_RUNTIME_AGENT_TYPES = new Set<string>(Object.keys(ACP_AGENT_RUNTIMES));

export const getAcpAgentRuntime = (agentType: string): AcpAgentRuntimeSpec | undefined =>
  (ACP_AGENT_RUNTIMES as Record<string, AcpAgentRuntimeSpec>)[agentType];

/** Whether the agent's ACP endpoint is an upstream bridge binary. */
export const isAcpBridgeAgent = (agentType: string): boolean =>
  getAcpAgentRuntime(agentType)?.bridge !== undefined;

/**
 * Well-known install locations probed for an ACP bridge binary that isn't on
 * the inherited PATH — mirrors the per-agent `getWellKnownCommandPaths`
 * fallback (npm/bun/pnpm global bin dirs an Electron parent never sees).
 */
const getWellKnownBridgeCommandPaths = (command: string): string[] => {
  if (platform() === 'win32') {
    const appData = process.env.APPDATA;
    return appData ? [path.win32.join(appData, 'npm', `${command}.cmd`)] : [];
  }
  if (platform() !== 'darwin' && platform() !== 'linux') return [];

  return [
    path.join(homedir(), '.local', 'bin', command),
    path.join(homedir(), '.bun', 'bin', command),
    path.join(homedir(), '.npm-global', 'bin', command),
    path.join(homedir(), 'Library', 'pnpm', command),
    path.join('/usr', 'local', 'bin', command),
    path.join('/opt', 'homebrew', 'bin', command),
  ];
};

const BRIDGE_VERSION_PATTERN = /v?\d+\.\d+\.\d+/;

/**
 * Resolve the ACP bridge binary for an agent. Candidates, in order:
 * `spec.overrideEnv` → bare `spec.command` on PATH → well-known npm/bun/pnpm
 * global bin locations. `--version` (semver banner) validates each candidate;
 * the bridge package names are unique enough that no keyword match is needed.
 */
export const detectAcpBridgeCommand = async (
  spec: AcpBridgeSpec,
  probeEnv?: NodeJS.ProcessEnv,
): Promise<CliCommandStatus> => {
  // `resolveCliCommand` runs `promisify(execFile)` at module load, so it is
  // imported lazily — this module is reachable from the adapter registry and
  // must not pull the command-detection machinery into unrelated test mocks.
  const { detectValidatedCommandCandidates } = await import('./resolveCliCommand');

  const candidates: string[] = [];
  const override = probeEnv?.[spec.overrideEnv] ?? process.env[spec.overrideEnv];
  if (override?.trim()) candidates.push(override.trim());
  candidates.push(spec.command, ...getWellKnownBridgeCommandPaths(spec.command));

  return detectValidatedCommandCandidates(
    candidates,
    { validateFlag: '--version', validatePattern: BRIDGE_VERSION_PATTERN },
    probeEnv,
  );
};

/**
 * Package runners that can execute the bridge package on demand — the
 * rollout-compatible path for installs that predate the bridge requirement
 * (vendor CLI present, bridge absent): the runner fetches and caches the
 * pinned bridge package instead of failing every launch.
 */
const ACP_BRIDGE_RUNNERS: ReadonlyArray<{
  args: (spec: AcpBridgeSpec) => string[];
  command: string;
}> = [
  { args: (spec) => [spec.package], command: 'bunx' },
  { args: (spec) => ['--yes', '-p', spec.package, spec.command], command: 'npx' },
];

export interface AcpBridgeRunnerTarget {
  /** Runner argv: package spec + (for npx) the bridge bin to invoke. */
  args: string[];
  /** Resolved runner executable (`bunx` / `npx`). */
  commandPath: string;
  /** Recovered login-shell PATH the child must inherit, when resolution used it. */
  resolvedPathEnv?: string;
}

/**
 * Resolve a package runner able to execute the bridge when no bridge binary
 * is installed. Returns `undefined` when neither `bunx` nor `npx` is usable.
 */
export const detectAcpBridgeRunner = async (
  spec: AcpBridgeSpec,
  probeEnv?: NodeJS.ProcessEnv,
): Promise<AcpBridgeRunnerTarget | undefined> => {
  const { detectValidatedCommandCandidates } = await import('./resolveCliCommand');

  for (const runner of ACP_BRIDGE_RUNNERS) {
    const status = await detectValidatedCommandCandidates(
      [runner.command, ...getWellKnownBridgeCommandPaths(runner.command)],
      { validateFlag: '--version', validatePattern: BRIDGE_VERSION_PATTERN },
      probeEnv,
    );
    if (status.available && status.path) {
      return {
        args: runner.args(spec),
        commandPath: status.path,
        resolvedPathEnv: status.resolvedPathEnv,
      };
    }
  }
  return undefined;
};

/** User-facing error when the ACP bridge binary cannot be located. */
export const buildAcpBridgeNotFoundError = (agentType: string): Error => {
  const spec = getAcpAgentRuntime(agentType);
  const bridge = spec?.bridge;
  if (!bridge) return new Error(`No ACP runtime is registered for agent type "${agentType}"`);

  return new Error(
    `${spec.label} requires the \`${bridge.command}\` ACP bridge. ` +
      `Install it with \`${bridge.installCommand}\`, or point ${bridge.overrideEnv} ` +
      'at the bridge executable.',
  );
};
