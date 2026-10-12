import { spawn as nodeSpawn } from 'node:child_process';
import {
  existsSync as nodeExistsSync,
  mkdirSync as nodeMkdirSync,
  readFileSync as nodeReadFileSync,
  rmSync as nodeRmSync,
  statSync as nodeStatSync,
  watch as nodeWatch,
  writeFileSync as nodeWriteFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const defaultCheckPort = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });

const defaultIsProcessAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return error.code === 'EPERM';
  }
};

// The CLI build runs nested commands (`npm ci`, the harness build). Killing only
// the direct child would leave them writing build output after the orchestrator exits.
const defaultKillTree = (child) => {
  if (!child.pid) return child.kill();
  if (process.platform === 'win32') {
    nodeSpawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill();
  }
};

export function createDevOrchestrator({
  desktopRoot,
  electronBin,
  viteBin,
  vitePort,
  electronArgs = [],
  cliBuildCommand,
  nodeBin = process.execPath,
  pollIntervalMs = 200,
  bundleQuietMs = 1000,
  initialBuildTimeoutMs = 120_000,
  restartDebounceMs = 400,
  spawn = nodeSpawn,
  existsSync = nodeExistsSync,
  rmSync = nodeRmSync,
  statSync = nodeStatSync,
  watch = nodeWatch,
  mkdirSync = nodeMkdirSync,
  readFileSync = nodeReadFileSync,
  writeFileSync = nodeWriteFileSync,
  checkPort = defaultCheckPort,
  isProcessAlive = defaultIsProcessAlive,
  killTree = defaultKillTree,
  pid = process.pid,
  exit = (code) => process.exit(code),
  log = console.log,
  logError = console.error,
}) {
  const MAIN_BUNDLE = path.join(desktopRoot, 'dist/main/index.js');
  const PRELOAD_BUNDLE = path.join(desktopRoot, 'dist/preload/index.js');

  const children = [];
  let electron = null;
  let restarting = false;
  let shuttingDown = false;
  let poll = null;
  let debounce = null;
  let cliBuild = null;
  let cliBuildSettled = !cliBuildCommand;
  let ownsCliBuild = false;

  // Spawn vite through the current node binary instead of a `pnpm` shim:
  // on Windows the shim is `pnpm.cmd`, which a shell-less spawn cannot start.
  const spawnVite = (args) =>
    spawn(nodeBin, [viteBin, ...args], { cwd: desktopRoot, stdio: 'inherit' });

  function shutdown(code) {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(poll);
    clearTimeout(debounce);
    electron?.kill();
    if (cliBuild) killTree(cliBuild);
    if (ownsCliBuild) rmSync(cliBuildCommand.lockFile, { force: true });
    for (const child of children) child.kill();
    exit(code);
  }

  function startElectron() {
    // Automation scripts (e.g. record-electron-demo.sh) grep the log for
    // "starting electron" as the readiness signal — keep this line stable.
    log('[desktop-dev] starting electron');
    electron = spawn(electronBin, ['.', ...electronArgs], {
      cwd: desktopRoot,
      env: {
        ...process.env,
        ELECTRON_RENDERER_URL: `http://127.0.0.1:${vitePort}`,
        NODE_ENV: 'development',
      },
      stdio: 'inherit',
    });
    electron.on('exit', (code) => {
      if (shuttingDown) return;
      if (restarting) {
        restarting = false;
        startElectron();
        return;
      }
      // The app was quit by hand — stop the watchers instead of idling forever.
      log('[desktop-dev] electron exited, stopping dev watchers');
      shutdown(code ?? 0);
    });
  }

  const pendingChanges = new Map();

  function scheduleRestart(dir, eventType, filename) {
    const file = path.join(dir, filename ?? '');
    const detail = existsSync(file)
      ? `${statSync(file).size}B @${new Date(statSync(file).mtimeMs).toISOString()}`
      : 'missing';
    pendingChanges.set(path.relative(desktopRoot, file), `${eventType} ${detail}`);
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const changes = [...pendingChanges].map(([f, d]) => `  ${f}: ${d}`).join('\n');
      pendingChanges.clear();
      if (shuttingDown || !electron) return;
      log(`[desktop-dev] main/preload bundle changed, restarting electron\n${changes}`);
      restarting = true;
      electron.kill();
    }, restartDebounceMs);
  }

  function watchBundles() {
    for (const dir of [path.dirname(MAIN_BUNDLE), path.dirname(PRELOAD_BUNDLE)]) {
      watch(dir, (eventType, filename) => scheduleRestart(dir, eventType, filename));
    }
  }

  // Every dev instance of one checkout runs the CLI from the same output
  // directory, and the build empties it first. The instance that builds keeps the
  // claim until it stops, so a later instance cannot pull the CLI out from under it.
  function claimCliBuild() {
    const { lockFile } = cliBuildCommand;
    if (!lockFile) return true;
    mkdirSync(path.dirname(lockFile), { recursive: true });
    try {
      writeFileSync(lockFile, String(pid), { flag: 'wx' });
      return true;
    } catch {
      // Another instance wrote the claim first; see whether it is still running.
    }
    let owner = Number.NaN;
    try {
      owner = Number(readFileSync(lockFile, 'utf8'));
    } catch {
      // The owner released the claim between the two calls.
    }
    if (Number.isInteger(owner) && owner !== pid && isProcessAlive(owner)) return false;
    writeFileSync(lockFile, String(pid));
    return true;
  }

  // A local Agent run spawns the CLI from `apps/cli/dist`, which nothing else in
  // the dev flow produces. Building it on every start also keeps it from going stale.
  function buildCli() {
    if (!cliBuildCommand) return;
    if (!claimCliBuild()) {
      cliBuildSettled = true;
      log('[desktop-dev] another dev instance of this checkout owns the embedded CLI; reusing it');
      return;
    }
    ownsCliBuild = true;
    log('[desktop-dev] building the embedded CLI');
    const settle = (problem) => {
      if (cliBuildSettled) return;
      cliBuildSettled = true;
      cliBuild = null;
      if (!problem) return;
      // A build that failed before emptying the output leaves the previous CLI
      // in place, and Agent runs would silently execute that older revision.
      if (cliBuildCommand.output) rmSync(cliBuildCommand.output, { force: true });
      logError(
        `[desktop-dev] embedded CLI build failed (${problem}); local Agent runs will fail until it builds`,
      );
    };
    cliBuild = spawn(cliBuildCommand.bin, cliBuildCommand.args, {
      cwd: cliBuildCommand.cwd,
      // Its own process group, so shutdown can stop the commands it starts too.
      detached: process.platform !== 'win32',
      stdio: 'inherit',
    });
    cliBuild.on('error', (error) => settle(error.message));
    cliBuild.on('exit', (code) => settle(code === 0 ? undefined : `exit code ${code}`));
  }

  function start() {
    rmSync(path.join(desktopRoot, 'dist'), { force: true, recursive: true });
    buildCli();
    children.push(
      spawnVite(['--config', 'vite.renderer.config.ts']),
      spawnVite(['build', '--watch', '--mode', 'development', '--config', 'vite.main.config.ts']),
      spawnVite([
        'build',
        '--watch',
        '--mode',
        'development',
        '--config',
        'vite.preload.config.ts',
      ]),
    );

    for (const child of children) {
      child.on('exit', (code) => {
        if (!shuttingDown) shutdown(code ?? 1);
      });
    }

    // The two build configs `emptyOutDir` on startup and finish at different times,
    // so wait until the renderer server accepts connections and both bundles exist
    // and have been quiet for a second before launching electron or attaching watchers.
    // Bundles left over from a previous run look "quiet" too, so ignore anything
    // written before this run started — otherwise electron boots on the stale dist
    // right as the watch build empties it.
    const started = Date.now();
    let lastChange = Date.now();
    let lastSignature = '';
    let checking = false;
    let bundlesReady = false;
    poll = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        // The deadline covers the bundles only: a first CLI build installs and
        // builds the harness, which can legitimately outlast it.
        if (!bundlesReady && Date.now() - started > initialBuildTimeoutMs) {
          logError(
            `[desktop-dev] initial build did not produce bundles within ${Math.round(initialBuildTimeoutMs / 1000)}s`,
          );
          shutdown(1);
          return;
        }
        if (!existsSync(MAIN_BUNDLE) || !existsSync(PRELOAD_BUNDLE)) return;
        const mtimes = [MAIN_BUNDLE, PRELOAD_BUNDLE].map((f) => statSync(f).mtimeMs);
        if (mtimes.some((mtime) => mtime < started)) return;
        const signature = mtimes.join(':');
        if (signature !== lastSignature) {
          lastSignature = signature;
          lastChange = Date.now();
          return;
        }
        if (Date.now() - lastChange < bundleQuietMs) return;
        if (!(await checkPort(vitePort))) return;
        bundlesReady = true;
        // A failed CLI build is reported and does not hold the app back; a running one does.
        if (!cliBuildSettled) return;
        clearInterval(poll);
        watchBundles();
        startElectron();
      } finally {
        checking = false;
      }
    }, pollIntervalMs);
  }

  return { shutdown, start };
}
