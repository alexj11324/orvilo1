import { readFileSync, statSync } from 'node:fs';

/**
 * File (inside the instance's userData) that repoints a running dev Electron at
 * another Vite renderer server, so one Electron can show any worktree's renderer
 * without a restart. Written by `bun run dev:env switch` (.agents/scripts/dev/cli.ts).
 */
export const DEV_RENDERER_URL_FILE = 'dev-renderer-url';

interface FsLike {
  readFileSync: (file: string, encoding: 'utf8') => string;
  statSync: (file: string) => { mtimeMs: number };
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// The renderer can reach privileged IPC, so only a local dev server is accepted.
const parseLoopbackOrigin = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
};

/**
 * Resolve the Vite origin per request: the override file when it holds a
 * loopback http origin, otherwise `defaultOrigin`. The file is re-read only
 * when its mtime changes, so the per-request cost is one `stat`.
 */
export const createDevRendererOriginResolver = (
  defaultOrigin: string,
  overrideFile: string,
  fs: FsLike = { readFileSync, statSync },
  onInvalid: (value: string) => void = () => {},
) => {
  let cachedMtime: number | null = null;
  let cachedOrigin = defaultOrigin;

  return (): string => {
    let mtimeMs: number;
    let value: string;
    try {
      mtimeMs = fs.statSync(overrideFile).mtimeMs;
      if (mtimeMs === cachedMtime) return cachedOrigin;
      // The switch script deletes the file to go back to the default; a delete
      // between stat and read lands here too.
      value = fs.readFileSync(overrideFile, 'utf8').trim();
    } catch {
      cachedMtime = null;
      return defaultOrigin;
    }

    cachedMtime = mtimeMs;
    const origin = value ? parseLoopbackOrigin(value) : null;
    if (!origin && value) onInvalid(value);
    cachedOrigin = origin ?? defaultOrigin;
    return cachedOrigin;
  };
};
