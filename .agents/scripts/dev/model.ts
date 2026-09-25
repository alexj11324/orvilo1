/**
 * Pure helpers for the dev environment CLI: parse system tool output and
 * derive facts. No IO here so every rule is unit-testable.
 */

export interface Listener {
  command: string;
  pid: number;
  port: number;
}

/** Parse `lsof -nP -iTCP -sTCP:LISTEN -F pcn` into one entry per pid+port. */
export const parseLsofListeners = (output: string): Listener[] => {
  const seen = new Set<string>();
  const listeners: Listener[] = [];
  let pid = 0;
  let command = '';
  for (const line of output.split('\n')) {
    const tag = line[0];
    const value = line.slice(1);
    if (tag === 'p') pid = Number(value);
    else if (tag === 'c') command = value;
    else if (tag === 'n') {
      const port = Number(value.slice(value.lastIndexOf(':') + 1));
      const key = `${pid}:${port}`;
      if (!Number.isInteger(port) || seen.has(key)) continue;
      seen.add(key);
      listeners.push({ command, pid, port });
    }
  }
  return listeners.sort((a, b) => a.port - b.port);
};

/** Pick `KEY=value` pairs out of `ps eww -o command= -p <pid>` output. */
export const parseProcessEnv = (output: string, keys: readonly string[]) => {
  const env: Record<string, string> = {};
  for (const token of output.split(/\s+/)) {
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    const key = token.slice(0, eq);
    if (keys.includes(key) && !(key in env)) env[key] = token.slice(eq + 1);
  }
  return env;
};

export const parseCdpPort = (command: string): number | null => {
  const match = /--remote-debugging-port=(\d+)/.exec(command);
  return match ? Number(match[1]) : null;
};

/** Read one key from a dotenv file without evaluating it. */
export const readDotenvValue = (content: string, key: string): string | null => {
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith(`${key}=`)) continue;
    return line.slice(key.length + 1).replace(/^(["'])(.*)\1$/, '$2');
  }
  return null;
};

/** Database name from a connection URL — safe to print, unlike the URL itself. */
export const databaseNameOf = (url: string): string | null => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || null;
  } catch {
    return null;
  }
};

const RENDERER_PORT_BASE = 5300;
const RENDERER_PORT_SPAN = 600;

/**
 * Stable renderer Vite port per worktree (5300–5899), so the same checkout
 * always lands on the same port and never collides with pool ports (5173+id).
 */
export const rendererPortFor = (worktreePath: string): number => {
  let hash = 0x81_1c_9d_c5;
  for (const char of worktreePath) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return RENDERER_PORT_BASE + (hash % RENDERER_PORT_SPAN);
};

export type MigrationState =
  | { kind: 'in-sync'; applied: number }
  | { kind: 'pending'; pending: string[] }
  | { kind: 'db-ahead'; dbLatest: number; codeLatest: number };

/**
 * Compare the database's applied migrations with a worktree's journal.
 * Drizzle stores each migration's journal `when` as `created_at`, so the
 * newest timestamp tells which line last migrated the database.
 */
export const compareMigrations = (
  journal: { tag: string; when: number }[],
  applied: { count: number; latest: number },
): MigrationState => {
  const codeLatest = journal.at(-1)?.when ?? 0;
  if (applied.latest > codeLatest) {
    return { codeLatest, dbLatest: applied.latest, kind: 'db-ahead' };
  }
  const pending = journal.filter((entry) => entry.when > applied.latest).map((e) => e.tag);
  return pending.length > 0
    ? { kind: 'pending', pending }
    : { applied: applied.count, kind: 'in-sync' };
};
