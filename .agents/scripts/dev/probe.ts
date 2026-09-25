/**
 * Read-only probes of the local dev environment. Every fact is derived from the
 * live system (ports → processes → working directories → git), never from a
 * registry that could go stale after a crash.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  compareMigrations,
  databaseNameOf,
  type Listener,
  type MigrationState,
  parseCdpPort,
  parseLsofListeners,
  parseProcessEnv,
  readDotenvValue,
} from './model';

/** Must match DEV_RENDERER_URL_FILE in apps/desktop/.../devRendererOrigin.ts. */
export const DEV_RENDERER_URL_FILE = 'dev-renderer-url';
const DEFAULT_DESKTOP_USER_DATA = path.join(
  os.homedir(),
  'Library/Application Support/orvilo-desktop-dev',
);

export const sh = (command: string, args: string[], cwd?: string, timeout = 8000): string => {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout,
    });
  } catch {
    return '';
  }
};

export const listeners = (): Listener[] =>
  parseLsofListeners(sh('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn']));

export const listenerOn = (port: number) => listeners().find((l) => l.port === port);

export const cwdOf = (pid: number): string | null => {
  const line = sh('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
    .split('\n')
    .find((l) => l.startsWith('n'));
  return line ? line.slice(1) : null;
};

export interface GitInfo {
  branch: string;
  dirty: number;
  head: string;
  root: string;
}

const gitInfoCache = new Map<string, GitInfo | null>();

/** Memoized per directory: one CLI run looks at the same checkouts many times. */
export const gitInfo = (dir: string): GitInfo | null => {
  if (!gitInfoCache.has(dir)) gitInfoCache.set(dir, readGitInfo(dir));
  return gitInfoCache.get(dir)!;
};

const readGitInfo = (dir: string): GitInfo | null => {
  const root = sh('git', ['-C', dir, 'rev-parse', '--show-toplevel']).trim();
  if (!root) return null;
  return {
    branch: sh('git', ['-C', root, 'branch', '--show-current']).trim() || '(detached)',
    dirty: sh('git', ['-C', root, 'status', '--porcelain']).split('\n').filter(Boolean).length,
    head: sh('git', ['-C', root, 'rev-parse', '--short', 'HEAD']).trim(),
    root,
  };
};

export const describeGit = (info: GitInfo | null) =>
  info
    ? `${info.root} [${info.branch} @ ${info.head}${info.dirty ? ` +${info.dirty} dirty` : ''}]`
    : '(not a git checkout)';

/**
 * Identity of the code under `subPath` as it runs: the committed tree hash, or
 * null when there are uncommitted changes (a running process uses the working
 * tree, so HEAD alone would hide them).
 */
export const codeIdentity = (root: string, subPath: string): string | null => {
  const dirty = sh('git', ['-C', root, 'status', '--porcelain', '--', subPath]).trim();
  return dirty ? null : sh('git', ['-C', root, 'rev-parse', `HEAD:${subPath}`]).trim();
};

export type DepsState = 'ok' | 'missing' | 'borrowed';

/** A `.pnpm` symlinked into another checkout breaks Turbopack and node-gyp. */
export const depsState = (dir: string): DepsState => {
  const store = path.join(dir, 'node_modules/.pnpm');
  if (!existsSync(store)) return 'missing';
  return lstatSync(store).isSymbolicLink() ? 'borrowed' : 'ok';
};

const readEnvFile = (root: string, key: string) => {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(root, file);
    if (!existsSync(full)) continue;
    const value = readDotenvValue(readFileSync(full, 'utf8'), key);
    if (value) return value;
  }
  return null;
};

type MigrationResult = MigrationState | { kind: 'unknown'; reason: string };

export const readEnvValue = (root: string, key: string) => readEnvFile(root, key);

/**
 * Compare `root`'s migration journal with the database configured in
 * `envRoot`'s env files (defaults to the same checkout).
 */
export const migrationState = (
  root: string,
  envRoot: string = root,
): { database: string | null; state: MigrationResult } => {
  const databaseUrl = readEnvFile(envRoot, 'DATABASE_URL');
  const database = databaseUrl ? databaseNameOf(databaseUrl) : null;
  const journalFile = path.join(root, 'packages/database/migrations/meta/_journal.json');
  if (!existsSync(journalFile)) {
    return { database, state: { kind: 'unknown', reason: 'no migration journal' } };
  }
  if (!databaseUrl) {
    return { database, state: { kind: 'unknown', reason: 'no DATABASE_URL in .env/.env.local' } };
  }
  // The URL is passed as an argument only; it is never printed.
  const row = sh('psql', [
    databaseUrl,
    '-Atc',
    'select count(*), coalesce(max(created_at), 0) from drizzle.__drizzle_migrations',
  ]).trim();
  const [count, latest] = row.split('|').map(Number);
  if (!row || Number.isNaN(count)) {
    return { database, state: { kind: 'unknown', reason: 'database not reachable' } };
  }
  const journal = JSON.parse(readFileSync(journalFile, 'utf8')).entries as {
    tag: string;
    when: number;
  }[];
  return { database, state: compareMigrations(journal, { count, latest }) };
};

const describeState = (state: MigrationResult) => {
  switch (state.kind) {
    case 'in-sync': {
      return `in sync (${state.applied} applied)`;
    }
    case 'pending': {
      const shown = state.pending.slice(0, 3).join(', ');
      return `${state.pending.length} pending: ${shown}${state.pending.length > 3 ? ', …' : ''}`;
    }
    case 'db-ahead': {
      return 'DATABASE IS AHEAD of this worktree — another migration line migrated it';
    }
    default: {
      return `unknown (${state.reason})`;
    }
  }
};

export const worktreeRoots = (root: string) =>
  sh('git', ['-C', root, 'worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));

export const describeMigration = ({ database, state }: ReturnType<typeof migrationState>) =>
  `db ${database ?? '?'} — ${describeState(state)}`;

export interface ElectronHost {
  cdpPort: number;
  defaultRendererUrl: string | null;
  overrideFile: string;
  overrideUrl: string | null;
  pid: number;
  /** The running main bundle can follow the override file. */
  supportsSwitch: boolean;
  worktree: GitInfo | null;
}

export const electronHosts = (): ElectronHost[] =>
  listeners()
    .filter((l) => l.command.startsWith('Electron'))
    .flatMap((l) => {
      const command = sh('ps', ['-o', 'command=', '-p', String(l.pid)]);
      const cdpPort = parseCdpPort(command);
      if (cdpPort !== l.port) return [];
      const env = parseProcessEnv(sh('ps', ['eww', '-o', 'command=', '-p', String(l.pid)]), [
        'ELECTRON_RENDERER_URL',
        'ORVILO_DESKTOP_USER_DATA_DIR',
      ]);
      const cwd = cwdOf(l.pid);
      const userData = env.ORVILO_DESKTOP_USER_DATA_DIR ?? DEFAULT_DESKTOP_USER_DATA;
      const overrideFile = path.join(userData, DEV_RENDERER_URL_FILE);
      // The main bundle is code-split, so search every chunk rather than index.js.
      const mainDist = cwd ? path.join(cwd, 'dist/main') : '';
      return [
        {
          cdpPort,
          defaultRendererUrl: env.ELECTRON_RENDERER_URL ?? null,
          overrideFile,
          overrideUrl: existsSync(overrideFile) ? readFileSync(overrideFile, 'utf8').trim() : null,
          pid: l.pid,
          supportsSwitch:
            !!mainDist &&
            existsSync(mainDist) &&
            sh('grep', ['-rl', '--include=*.js', DEV_RENDERER_URL_FILE, mainDist]).trim() !== '',
          worktree: cwd ? gitInfo(cwd) : null,
        },
      ];
    });

export const portOf = (url: string | null) => (url ? Number(new URL(url).port) || null : null);
