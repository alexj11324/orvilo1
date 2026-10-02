/**
 * Orvilo-side integration for the vendored Aegis method pack
 * (`vendor/aegis/`, pinned in `VENDORED.md`).
 *
 * Aegis is prompt discipline, not a runtime: installing it writes the pack's
 * skills into the run workspace's host-discovery skills directory so the
 * spawned CLI picks them up, and the opt-in env/context contract tells the
 * agent to leave its verification evidence under `.aegis/`. Everything under
 * that directory (plus the pack's own `docs/aegis/` workspace reports) is
 * collected at run end and shipped back inside `heteroFinish` — the server
 * turns it into verify-gate input and task artifacts. Nothing here is
 * authoritative; the server-side verify pipeline stays the gate.
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AEGIS_PACK_FILES, AEGIS_PACK_REVISION } from './files.generated';

const { dirname, join, relative, sep } = path;

export { AEGIS_PACK_REVISION };

/** Skills dir discovered per host family, relative to the run workspace. */
const AEGIS_GENERIC_SKILLS_DIR = join('.agents', 'skills', 'aegis');
/** Agents that additionally read a host-native project skills dir. */
const AEGIS_HOST_SKILLS_DIRS: Record<string, string> = {
  'claude-code': join('.claude', 'skills', 'aegis'),
  'codebuddy': join('.codebuddy', 'skills', 'aegis'),
  'kimi-code': join('.kimi', 'skills', 'aegis'),
  'opencode': join('.opencode', 'skills', 'aegis'),
};

/** Orvilo contract artifact dir — see packages/types AEGIS_ARTIFACT_DIR. */
export const AEGIS_ARTIFACT_DIR = '.aegis';
const AEGIS_MAX_ARTIFACT_FILES = 64;
const AEGIS_MAX_ARTIFACT_BYTES = 128 * 1024;
const AEGIS_MAX_ARTIFACT_TOTAL_BYTES = 2 * 1024 * 1024;

export interface AegisMaterializeResult {
  /** Skills dirs (workspace-relative) the pack was written into. */
  dirs: string[];
  packRevision: string;
}

/**
 * Write the embedded pack into `cwd` under the skills dirs the spawned host
 * discovers. Returns the dirs written so the caller can surface them in the
 * run log. The embedded manifest is generated and immutable; I/O failures
 * propagate so the caller can log-and-continue — an install failure must
 * never kill the run.
 */
export const materializeAegisPack = async (params: {
  agentType?: string;
  cwd: string;
}): Promise<AegisMaterializeResult> => {
  const dirs = [AEGIS_GENERIC_SKILLS_DIR];
  const hostDir = params.agentType ? AEGIS_HOST_SKILLS_DIRS[params.agentType] : undefined;
  if (hostDir && !dirs.includes(hostDir)) dirs.push(hostDir);

  const skillEntries = Object.entries(AEGIS_PACK_FILES).filter(([packPath]) =>
    packPath.startsWith('skills/'),
  );

  for (const dir of dirs) {
    await Promise.all(
      skillEntries.map(async ([packPath, content]) => {
        // `skills/<name>/…` → `<dir>/<name>/…`: each skill keeps its own
        // folder under the shared `aegis/` namespace inside the host skills
        // root, so it never collides with the repo's own `.agents/skills`.
        const target = join(params.cwd, dir, packPath.slice('skills/'.length));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
      }),
    );
    if (AEGIS_PACK_FILES.LICENSE) {
      await writeFile(join(params.cwd, dir, 'LICENSE'), AEGIS_PACK_FILES.LICENSE);
    }
  }

  return { dirs, packRevision: AEGIS_PACK_REVISION };
};

export interface AegisCollectedFile {
  /** Inline file body. */
  content: string;
  /** Workspace-relative POSIX path (e.g. `.aegis/closeout.json`). */
  path: string;
}

const isProbablyBinary = (buffer: Buffer): boolean => {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  return sample.includes(0);
};

const collectTree = async (root: string, acc: string[]): Promise<void> => {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return; // missing root is the normal "no artifacts" case
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) await collectTree(full, acc);
    else if (entry.isFile()) acc.push(full);
  }
};

/**
 * Read the run's Aegis artifacts for the finish report:
 *   - `<cwd>/.aegis/**` — the Orvilo contract dir (`closeout.json`, reports
 *     the agent was instructed to leave behind)
 *   - `<cwd>/docs/aegis/**` JSON — the pack's own workspace output
 *     (`aegis-workspace.py` drift-check drafts, etc.)
 *
 * Bounded on file count, per-file size and total bytes; oversized or binary
 * files are skipped, never fatal — collection runs inside the terminal
 * callback and must not fail the finish path.
 */
export const collectAegisArtifacts = async (cwd: string): Promise<AegisCollectedFile[]> => {
  const files: string[] = [];
  await collectTree(join(cwd, AEGIS_ARTIFACT_DIR), files);
  const docsFiles: string[] = [];
  await collectTree(join(cwd, 'docs', 'aegis'), docsFiles);
  files.push(...docsFiles.filter((f) => f.endsWith('.json')));

  const out: AegisCollectedFile[] = [];
  let totalBytes = 0;
  for (const file of files.slice(0, AEGIS_MAX_ARTIFACT_FILES)) {
    try {
      const { size } = await stat(file);
      if (size > AEGIS_MAX_ARTIFACT_BYTES) continue;
      const buffer = await readFile(file);
      if (isProbablyBinary(buffer)) continue;
      if (totalBytes + buffer.length > AEGIS_MAX_ARTIFACT_TOTAL_BYTES) break;
      totalBytes += buffer.length;
      out.push({
        content: buffer.toString('utf8'),
        path: relative(cwd, file).split(sep).join('/'),
      });
    } catch {
      // unreadable file — skip
    }
  }
  return out;
};
