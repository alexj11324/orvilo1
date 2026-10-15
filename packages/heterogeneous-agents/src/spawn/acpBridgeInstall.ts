import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AcpBridgeRunnerTarget, AcpBridgeSpec } from './acpRuntime';
import { BRIDGE_VERSION_PATTERN, pinnedBridgePackage } from './acpRuntime';
import type { CliCommandStatus } from './resolveCliCommand';

/**
 * Orvilo-managed ACP bridge installs.
 *
 * The package-runner fallback (`bunx pkg@ver` / `npx -p pkg@ver`) re-resolves
 * the pinned bridge package and rewrites a lockfile on every launch, which
 * costs seconds per prompt. When a run has to fall back to the runner, the
 * pinned package is installed once into a per-version directory in the
 * background; later resolutions launch `<dir>/node_modules/.bin/<command>`
 * directly.
 *
 * Layout: `<root>/<sanitized package>@<version>/node_modules/.bin/<command>`.
 * Installs are staged in `<root>/.tmp-*` and moved into place with a single
 * `rename`, so concurrent processes never observe a half-written install —
 * the first rename wins and the loser discards its staging copy.
 */

/** Env var overriding the managed bridge root directory. */
export const ACP_BRIDGE_DIR_ENV = 'ORVILO_ACP_BRIDGE_DIR';

/**
 * Mirrors the CLI's home resolution (`apps/cli` `resolveCliDirName`):
 * `~/<ORVILO_CLI_HOME || .orvilo>`. Duplicated here because this package must
 * not import from apps.
 */
const CLI_HOME_ENV = 'ORVILO_CLI_HOME';
const DEFAULT_CLI_DIR_NAME = '.orvilo';

const STAGING_PREFIX = '.tmp-';
/** Staging dirs older than this belong to an install whose process died. */
const STALE_STAGING_MS = 60 * 60 * 1000;
/** Upper bound for one background install. */
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
/** After a failed install, wait this long before trying again in this process. */
const INSTALL_RETRY_BACKOFF_MS = 10 * 60 * 1000;

const readEnv = (name: string, env?: NodeJS.ProcessEnv): string | undefined => {
  const value = (env?.[name] ?? process.env[name])?.trim();
  return value || undefined;
};

export const resolveAcpBridgeRoot = (env?: NodeJS.ProcessEnv): string =>
  readEnv(ACP_BRIDGE_DIR_ENV, env) ??
  path.join(os.homedir(), readEnv(CLI_HOME_ENV, env) ?? DEFAULT_CLI_DIR_NAME, 'acp-bridges');

const sanitizeSegment = (value: string) => value.replace(/^@/, '').replaceAll(/[^\w.-]+/g, '_');

/** Per-package-version install directory for `spec`. */
export const getManagedAcpBridgeDir = (spec: AcpBridgeSpec, env?: NodeJS.ProcessEnv): string =>
  path.join(
    resolveAcpBridgeRoot(env),
    `${sanitizeSegment(spec.package)}@${sanitizeSegment(spec.packageVersion)}`,
  );

/**
 * Bin entries an install may produce: npm writes `.cmd` shims on Windows, bun
 * writes `.exe` shims; POSIX installs symlink the bare name.
 */
const managedBinCandidates = (installDir: string, command: string): string[] => {
  const binDir = path.join(installDir, 'node_modules', '.bin');
  return os.platform() === 'win32'
    ? [path.join(binDir, `${command}.cmd`), path.join(binDir, `${command}.exe`)]
    : [path.join(binDir, command)];
};

const findManagedBin = (installDir: string, command: string): string | undefined =>
  managedBinCandidates(installDir, command).find((candidate) => existsSync(candidate));

/**
 * Validate the managed install with the same `--version` + semver check used
 * for bridges found on PATH. A missing install short-circuits without any
 * probe (and without login-shell PATH recovery).
 */
export const detectManagedAcpBridgeCommand = async (
  spec: AcpBridgeSpec,
  probeEnv?: NodeJS.ProcessEnv,
): Promise<CliCommandStatus> => {
  const bin = findManagedBin(getManagedAcpBridgeDir(spec, probeEnv), spec.command);
  if (!bin) return { available: false };

  const { detectValidatedCommandCandidates } = await import('./resolveCliCommand');
  return detectValidatedCommandCandidates(
    [bin],
    { validateFlag: '--version', validatePattern: BRIDGE_VERSION_PATTERN },
    probeEnv,
  );
};

interface InstallerCommand {
  args: string[];
  command: string;
}

/**
 * Pick the package manager that matches the runner the fallback found:
 * `bunx` → sibling `bun add`, `npx` → sibling `npm install`. Lifecycle scripts
 * are skipped: the pinned bridges and their dependency trees declare no
 * install scripts (platform binaries arrive as optional dependencies).
 */
const buildInstallerCommand = (
  runner: AcpBridgeRunnerTarget,
  spec: AcpBridgeSpec,
  installDir: string,
): InstallerCommand | undefined => {
  const pinned = pinnedBridgePackage(spec);
  const runnerDir = path.dirname(runner.commandPath);
  const runnerBase = path.basename(runner.commandPath);
  const sibling = (from: RegExp, to: string) => {
    const candidate = path.join(runnerDir, runnerBase.replace(from, to));
    return path.isAbsolute(candidate) && existsSync(candidate) ? candidate : to;
  };

  if (/^bunx(?:\.\w+)?$/i.test(runnerBase)) {
    return {
      args: ['add', '--cwd', installDir, '--ignore-scripts', '--no-summary', pinned],
      command: sibling(/^bunx/i, 'bun'),
    };
  }
  if (/^npx(?:\.\w+)?$/i.test(runnerBase)) {
    return {
      args: [
        'install',
        '--prefix',
        installDir,
        '--no-save',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--omit=dev',
        '--loglevel=error',
        pinned,
      ],
      command: sibling(/^npx/i, 'npm'),
    };
  }
  return undefined;
};

/**
 * Run the installer without tying the host to it: stdio is ignored and the
 * child is unref'd, so a one-shot CLI run can exit while an install is still
 * in flight (its staging dir is then reaped as stale by a later attempt).
 */
const runInstaller = async (
  installer: InstallerCommand,
  env: NodeJS.ProcessEnv,
): Promise<boolean> => {
  const { resolveCliSpawnPlan } = await import('./cliSpawn');
  const plan = await resolveCliSpawnPlan(installer.command, installer.args, env);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };

    const child = spawn(plan.command, plan.args, {
      env,
      stdio: 'ignore',
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      settle(false);
    }, INSTALL_TIMEOUT_MS);
    timer.unref?.();

    child.once('error', () => settle(false));
    child.once('exit', (code) => settle(code === 0));
    child.unref();
  });
};

const reapStaleStaging = async (root: string): Promise<void> => {
  const entries = await readdir(root).catch(() => [] as string[]);
  const now = Date.now();
  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(STAGING_PREFIX))
      .map(async (entry) => {
        const target = path.join(root, entry);
        const info = await stat(target).catch(() => undefined);
        if (info && now - info.mtimeMs > STALE_STAGING_MS) {
          await rm(target, { force: true, recursive: true }).catch(() => {});
        }
      }),
  );
};

const performInstall = async (
  spec: AcpBridgeSpec,
  runner: AcpBridgeRunnerTarget,
  env: NodeJS.ProcessEnv,
): Promise<boolean> => {
  const installDir = getManagedAcpBridgeDir(spec, env);
  if (findManagedBin(installDir, spec.command)) return true;

  const root = path.dirname(installDir);
  await mkdir(root, { recursive: true });
  await reapStaleStaging(root);

  const staging = path.join(
    root,
    `${STAGING_PREFIX}${path.basename(installDir)}-${process.pid}-${Date.now().toString(36)}`,
  );
  const installer = buildInstallerCommand(runner, spec, staging);
  if (!installer) return false;

  try {
    await mkdir(staging, { recursive: true });
    const installEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...env,
      ...(runner.resolvedPathEnv ? { PATH: runner.resolvedPathEnv } : {}),
    };
    if (!(await runInstaller(installer, installEnv))) return false;
    if (!findManagedBin(staging, spec.command)) return false;

    // A dir without the bin is a broken leftover; clear it so the rename can land.
    if (existsSync(installDir) && !findManagedBin(installDir, spec.command)) {
      await rm(installDir, { force: true, recursive: true });
    }
    try {
      await rename(staging, installDir);
    } catch {
      // Another process won the race — its install is as good as ours.
      return Boolean(findManagedBin(installDir, spec.command));
    }
    return true;
  } finally {
    await rm(staging, { force: true, recursive: true }).catch(() => {});
  }
};

const inFlight = new Map<string, Promise<boolean>>();
const failedAt = new Map<string, number>();
const installedListeners = new Set<() => void>();

/**
 * Install `spec`'s pinned bridge into its managed directory. Single-flight per
 * install directory within the process, backed off after a failure, and never
 * rejects — a failed install only means the runner fallback keeps being used.
 */
export const ensureManagedAcpBridgeInstall = (
  spec: AcpBridgeSpec,
  runner: AcpBridgeRunnerTarget,
  env: NodeJS.ProcessEnv = {},
): Promise<boolean> => {
  const key = getManagedAcpBridgeDir(spec, env);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const lastFailure = failedAt.get(key);
  if (lastFailure !== undefined && Date.now() - lastFailure < INSTALL_RETRY_BACKOFF_MS) {
    return Promise.resolve(false);
  }

  const task = performInstall(spec, runner, env)
    .catch(() => false)
    .then((ok) => {
      inFlight.delete(key);
      if (ok) {
        failedAt.delete(key);
        for (const listener of installedListeners) listener();
      } else {
        failedAt.set(key, Date.now());
      }
      return ok;
    });
  inFlight.set(key, task);
  return task;
};

/** Fire-and-forget {@link ensureManagedAcpBridgeInstall}. */
export const scheduleManagedAcpBridgeInstall = (
  spec: AcpBridgeSpec,
  runner: AcpBridgeRunnerTarget,
  env?: NodeJS.ProcessEnv,
): void => {
  void ensureManagedAcpBridgeInstall(spec, runner, env);
};

/** Notified after any managed install lands (used to drop cached runner targets). */
export const onManagedAcpBridgeInstalled = (listener: () => void): (() => void) => {
  installedListeners.add(listener);
  return () => installedListeners.delete(listener);
};

/** Test hook: forget in-flight installs and failure backoff. */
export const resetManagedAcpBridgeInstallState = (): void => {
  inFlight.clear();
  failedAt.clear();
};
