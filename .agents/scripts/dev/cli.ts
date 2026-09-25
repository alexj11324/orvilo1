/**
 * One-command local dev environment for Orvilo worktrees.
 *
 *   bun run dev:env status              what runs where (ports → processes → worktrees)
 *   bun run dev:env up [dir] [--migrate]
 *                                       deps + backend + one shared Electron showing <dir>
 *   bun run dev:env switch [dir|--reset] point the running Electron at <dir>'s renderer
 *   bun run dev:env down [dir]          stop <dir>'s renderer server (Electron stays)
 *   bun run dev:env ref open <url> | ref close <targetId>
 *                                       foreground window in the signed-in reference browser
 *   bun run dev:env cdp <port> <urlPart> <expr|@file> [--viewport 1440x900] [--shot out.png]
 *
 * One Electron is shared across worktrees: only the renderer (a cheap Vite
 * server per worktree) changes, so the heavy app process and its sign-in stay.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { closeTarget, evaluate, openWindow, reloadRendererPages } from './cdp';
import { databaseNameOf, pickEnvSource, rendererPortFor } from './model';
import {
  codeIdentity,
  cwdOf,
  depsState,
  describeGit,
  describeMigration,
  type ElectronHost,
  electronHosts,
  gitInfo,
  listenerOn,
  listeners,
  migrationState,
  portOf,
  readEnvValue,
  worktreeRoots,
} from './probe';

const BACKEND_PORT = Number(process.env.PORT) || 3010;
const REFERENCE_CDP_PORT = Number(process.env.ORVILO_REF_CDP_PORT) || 9222;
const POOL_INSTANCE = process.env.ORVILO_DEV_INSTANCE || '10';
const EPHEMERAL_PORT_START = 49_152;
const LOG_DIR = path.join(os.homedir(), '.orvilo/dev/logs');

const log = (message: string) => console.log(`[dev:env] ${message}`);
const fail = (message: string): never => {
  console.error(`[dev:env] ✗ ${message}`);
  process.exit(1);
};

const rootOf = (dir: string) =>
  gitInfo(path.resolve(dir))?.root ?? fail(`${dir} is not inside a git checkout`);

// ── process helpers ─────────────────────────────────────────────────────────

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const portOpen = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });

/** Wait for a port, failing early if the process that should open it has died. */
const waitForPort = async (port: number, pid: number, timeoutMs: number, logFile: string) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return;
    if (!isAlive(pid)) fail(`process ${pid} exited before :${port} opened — see ${logFile}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`:${port} did not open within ${timeoutMs / 1000}s — see ${logFile}`);
};

const startDetached = (
  name: string,
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
) => {
  mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `${name}.log`);
  const out = openSync(logFile, 'a');
  const child = spawn(command, args, {
    cwd,
    detached: true,
    env: { ...process.env, ...env },
    stdio: ['ignore', out, out],
  });
  child.unref();
  if (!child.pid) fail(`could not start ${command}`);
  return { logFile, pid: child.pid! };
};

const runForeground = (command: string, args: string[], cwd: string) => {
  log(`$ ${command} ${args.join(' ')}   (in ${cwd})`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited with ${result.status}`);
};

// ── steps ───────────────────────────────────────────────────────────────────

/** Root and apps/desktop each need their own install; a borrowed store is replaced. */
const ensureDeps = (root: string) => {
  const targets: [string, string[]][] = [
    [root, ['install']],
    [path.join(root, 'apps/desktop'), ['install', '--frozen-lockfile']],
  ];
  for (const [dir, args] of targets) {
    const state = depsState(dir);
    if (state === 'ok') continue;
    if (state === 'borrowed') {
      // Only the symlink is removed; the checkout it points into is untouched.
      log(
        `${dir}/node_modules/.pnpm is borrowed from another checkout — replacing with a real install`,
      );
      rmSync(path.join(dir, 'node_modules/.pnpm'));
    }
    runForeground('pnpm', args, dir);
  }
};

const LOCAL_ENV_FILES = ['.env', '.env.local'];

/**
 * gitignored env files do not follow `git worktree add`. Copy the missing ones
 * from the sibling worktree whose database matches this code's migrations
 * (so the code runs against a schema and fixtures of its own line), falling
 * back to the checkout serving the backend. Existing files are never touched.
 */
const ensureLocalEnv = (root: string) => {
  if (LOCAL_ENV_FILES.every((file) => existsSync(path.join(root, file)))) return;
  const backend = listenerOn(BACKEND_PORT);
  const backendCwd = backend ? cwdOf(backend.pid) : null;
  const picked = pickEnvSource(
    worktreeRoots(root)
      .filter((candidate) => candidate !== root && existsSync(path.join(candidate, '.env')))
      .map((candidate) => ({ root: candidate, state: migrationState(root, candidate).state })),
    backendCwd ? (gitInfo(backendCwd)?.root ?? null) : null,
  );
  if (!picked) {
    fail(
      `no sibling worktree has a database in sync with ${path.basename(root)}'s migrations and no backend is running — create ${root}/.env by hand`,
    );
  }
  const { reason, source } = picked!;
  for (const file of LOCAL_ENV_FILES) {
    const target = path.join(root, file);
    const from = path.join(source, file);
    if (existsSync(target) || !existsSync(from)) continue;
    copyFileSync(from, target);
    log(
      `copied ${file} from ${source} (${reason === 'matching-database' ? 'database matches this code' : 'backend owner'})`,
    );
  }
  const database = readEnvValue(root, 'DATABASE_URL');
  log(`${path.basename(root)} uses db ${database ? databaseNameOf(database) : '(none)'}`);
};

const ensureBackend = async (root: string) => {
  const owner = listenerOn(BACKEND_PORT);
  if (owner) {
    const cwd = cwdOf(owner.pid);
    log(`backend :${BACKEND_PORT} already running from ${describeGit(cwd ? gitInfo(cwd) : null)}`);
    return;
  }
  if (!existsSync(path.join(root, '.env'))) {
    fail(`${root}/.env is missing — copy it from a working checkout before starting the backend`);
  }
  const { logFile, pid } = startDetached(
    `backend-${BACKEND_PORT}`,
    'bun',
    ['run', 'dev:next'],
    root,
  );
  log(`starting backend (pid ${pid}, log ${logFile}) …`);
  await waitForPort(BACKEND_PORT, pid, 180_000, logFile);
  log(`backend :${BACKEND_PORT} ready`);
};

const checkMigrations = (root: string, migrate: boolean) => {
  const result = migrationState(root);
  const { state } = result;
  log(`database vs ${path.basename(root)}: ${describeMigration(result)}`);
  if (state.kind === 'pending') {
    if (!migrate) {
      log('  → rerun with --migrate to apply them (the database is shared by every worktree)');
      return;
    }
    runForeground('bun', ['run', 'db:migrate'], root);
  }
};

const switchableHost = (): ElectronHost | undefined =>
  electronHosts().find((h) => h.supportsSwitch);

const ensureRenderer = async (root: string) => {
  const desktopDir = path.join(root, 'apps/desktop');
  const port = rendererPortFor(root);
  const owner = listenerOn(port);
  if (owner) {
    if (cwdOf(owner.pid) === desktopDir) return port;
    fail(`:${port} (renderer port for ${root}) is taken by pid ${owner.pid} (${owner.command})`);
  }
  const viteBin = path.join(desktopDir, 'node_modules/vite/bin/vite.js');
  if (!existsSync(viteBin)) fail(`${viteBin} missing — run \`bun run dev:env up ${root}\``);
  const { logFile, pid } = startDetached(
    `renderer-${port}`,
    process.execPath.includes('bun') ? 'node' : process.execPath,
    [viteBin, '--config', 'vite.renderer.config.ts'],
    desktopDir,
    { ORVILO_DESKTOP_VITE_PORT: String(port) },
  );
  log(`starting renderer for ${path.basename(root)} on :${port} (pid ${pid}, log ${logFile}) …`);
  await waitForPort(port, pid, 90_000, logFile);
  return port;
};

const warnOnMainDrift = (host: ElectronHost, root: string) => {
  const hostRoot = host.worktree?.root;
  if (!hostRoot) return;
  const drifted = ['apps/desktop/src/main', 'apps/desktop/src/preload'].filter((p) => {
    const host = codeIdentity(hostRoot, p);
    // Uncommitted changes on either side cannot be proven identical.
    return host === null || host !== codeIdentity(root, p);
  });
  if (drifted.length > 0) {
    log(
      `⚠ main/preload code differs between the Electron host (${path.basename(hostRoot)}) and ${path.basename(root)}: ${drifted.join(', ')}`,
    );
    log('  renderer changes are shown faithfully; features that depend on new IPC may not work');
  }
};

const switchTo = async (host: ElectronHost, root: string | null) => {
  if (root === null || root === host.worktree?.root) {
    rmSync(host.overrideFile, { force: true });
    log(`Electron :${host.cdpPort} → its own renderer (${host.defaultRendererUrl})`);
  } else {
    const port = await ensureRenderer(root);
    mkdirSync(path.dirname(host.overrideFile), { recursive: true });
    writeFileSync(host.overrideFile, `http://127.0.0.1:${port}\n`);
    log(`Electron :${host.cdpPort} → renderer :${port} (${path.basename(root)})`);
    warnOnMainDrift(host, root);
  }
  const reloaded = await reloadRendererPages(host.cdpPort);
  log(`reloaded ${reloaded.length} window(s)`);
};

const startElectronHost = (root: string) => {
  const script = path.join(root, '.agents/acceptance/scripts/electron-dev.sh');
  runForeground('bash', [script, 'start', POOL_INSTANCE], root);
};

// ── commands ────────────────────────────────────────────────────────────────

const status = () => {
  console.log('Services (listening ports inside git checkouts):');
  const cdpPorts = new Set(electronHosts().map((h) => h.cdpPort));
  for (const l of listeners()) {
    // Skip OS-assigned ephemeral ports and Electron's internal (non-CDP) listeners.
    if (l.port >= EPHEMERAL_PORT_START) continue;
    if (l.command.startsWith('Electron') && !cdpPorts.has(l.port)) continue;
    const cwd = cwdOf(l.pid);
    const info = cwd ? gitInfo(cwd) : null;
    if (!info || !existsSync(path.join(info.root, 'apps/desktop'))) continue;
    const role =
      l.port === BACKEND_PORT
        ? 'backend'
        : l.command.startsWith('Electron')
          ? 'electron cdp'
          : cwd?.endsWith('apps/desktop')
            ? 'desktop renderer'
            : 'server';
    console.log(
      `  :${l.port}  ${role.padEnd(16)} pid ${String(l.pid).padEnd(6)} ${describeGit(info)}`,
    );
  }

  console.log('\nElectron:');
  const hosts = electronHosts();
  if (hosts.length === 0) console.log('  (none running)');
  for (const host of hosts) {
    const effective = host.overrideUrl ?? host.defaultRendererUrl;
    const rendererPort = portOf(effective);
    const rendererOwner = rendererPort ? listenerOn(rendererPort) : undefined;
    const rendererCwd = rendererOwner ? cwdOf(rendererOwner.pid) : null;
    console.log(`  cdp :${host.cdpPort} (pid ${host.pid})`);
    console.log(`    main process:  ${describeGit(host.worktree)}`);
    console.log(
      `    renderer:      ${effective}${host.overrideUrl ? ' (switched)' : ''} → ${
        rendererOwner ? describeGit(rendererCwd ? gitInfo(rendererCwd) : null) : 'NOT LISTENING'
      }`,
    );
    console.log(
      `    can switch:    ${host.supportsSwitch ? 'yes' : 'no (started from code without the switch)'}`,
    );
  }

  const backend = listenerOn(BACKEND_PORT);
  const backendCwd = backend ? cwdOf(backend.pid) : null;
  const backendRoot = backendCwd ? gitInfo(backendCwd)?.root : null;
  const here = gitInfo(process.cwd())?.root;
  console.log('\nDatabase:');
  for (const root of new Set([backendRoot, here].filter(Boolean) as string[])) {
    console.log(`  vs ${root}: ${describeMigration(migrationState(root))}`);
  }
  if (here) {
    console.log(
      `\nThis checkout deps: root ${depsState(here)}, apps/desktop ${depsState(path.join(here, 'apps/desktop'))}`,
    );
  }
};

const up = async (dir: string, migrate: boolean) => {
  const root = rootOf(dir);
  log(`bringing up ${describeGit(gitInfo(root))}`);
  ensureDeps(root);
  ensureLocalEnv(root);
  await ensureBackend(root);
  checkMigrations(root, migrate);
  const host = switchableHost();
  if (host) await switchTo(host, root);
  else {
    log(`no switchable Electron running — starting pool instance ${POOL_INSTANCE} from ${root}`);
    startElectronHost(root);
  }
  console.log('');
  status();
};

const switchCommand = async (dir: string | null) => {
  const host =
    switchableHost() ??
    fail(
      'no running Electron can switch renderers — start one with `bun run dev:env up` from a checkout that has this script',
    );
  if (dir !== null) ensureDeps(rootOf(dir));
  await switchTo(host, dir === null ? null : rootOf(dir));
};

const down = async (dir: string) => {
  const root = rootOf(dir);
  const port = rendererPortFor(root);
  for (const host of electronHosts()) {
    if (portOf(host.overrideUrl) === port) await switchTo(host, null);
  }
  const owner = listenerOn(port);
  if (!owner || cwdOf(owner.pid) !== path.join(root, 'apps/desktop')) {
    log(`no renderer running for ${path.basename(root)} (:${port})`);
    return;
  }
  process.kill(owner.pid, 'SIGTERM');
  log(`stopped renderer :${port} (pid ${owner.pid})`);
};

const cdpCommand = async (args: string[]) => {
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args.splice(i, 2)[1];
  };
  const viewport = flag('--viewport');
  const screenshot = flag('--shot');
  const [port, match, expr] = args;
  if (!port || !match || !expr)
    fail('usage: cdp <port> <urlPart> <expr|@file> [--viewport WxH] [--shot out.png]');
  const expression = expr.startsWith('@') ? readFileSync(expr.slice(1), 'utf8') : expr;
  const result = await evaluate(Number(port), match, expression, { screenshot, viewport });
  console.log(JSON.stringify(result.value, null, 2));
  if (screenshot && result.screenshot) {
    writeFileSync(screenshot, result.screenshot);
    log(`screenshot → ${screenshot}`);
  }
};

const main = async () => {
  const [command = 'status', ...rest] = process.argv.slice(2);
  const positional = rest.filter((a) => !a.startsWith('--'));
  switch (command) {
    case 'status': {
      status();
      break;
    }
    case 'up': {
      await up(positional[0] ?? '.', rest.includes('--migrate'));
      break;
    }
    case 'switch': {
      await switchCommand(rest.includes('--reset') ? null : (positional[0] ?? '.'));
      break;
    }
    case 'down': {
      await down(positional[0] ?? '.');
      break;
    }
    case 'ref': {
      const [action, value] = positional;
      if (action === 'open' && value)
        log(`opened target ${await openWindow(REFERENCE_CDP_PORT, value)}`);
      else if (action === 'close' && value)
        log(`closed: ${await closeTarget(REFERENCE_CDP_PORT, value)}`);
      else fail('usage: ref open <url> | ref close <targetId>');
      break;
    }
    case 'cdp': {
      await cdpCommand(rest);
      break;
    }
    default: {
      fail(`unknown command "${command}" — see the header of .agents/scripts/dev/cli.ts`);
    }
  }
};

await main().catch((error: Error) => fail(error.message));
