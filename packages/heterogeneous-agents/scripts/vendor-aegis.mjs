#!/usr/bin/env node
/**
 * Regenerates `src/aegis/files.generated.ts` — the embedded copy of the
 * vendored Aegis method pack (`vendor/aegis/`). The `lh` CLI ships `dist`
 * only, so the pack must travel as bundled data, not files. See
 * `vendor/aegis/VENDORED.md` for the pinned upstream commit.
 *
 * Usage: node scripts/vendor-aegis.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { dirname, join, relative } = path;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = join(root, 'vendor', 'aegis');
const outFile = join(root, 'src', 'aegis', 'files.generated.ts');

/** @param {string} dir */
const walk = (dir) =>
  readdirSync(dir)
    .flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    })
    .sort();

const files = walk(vendorDir)
  .filter((path) => !relative(vendorDir, path).startsWith('VENDORED'))
  .map((path) => [relative(vendorDir, path).split('\\').join('/'), readFileSync(path, 'utf8')]);

const revision = readFileSync(join(vendorDir, 'VENDORED.md'), 'utf8').match(
  /`([0-9a-f]{40})`/,
)?.[1];
if (!revision) throw new Error('VENDORED.md is missing the pinned 40-char upstream commit');

const body = `/**
 * GENERATED — do not edit. Regenerate with \`node scripts/vendor-aegis.mjs\`.
 * Embedded copy of the vendored Aegis method pack (\`vendor/aegis/\`).
 */
export const AEGIS_PACK_REVISION = ${JSON.stringify(revision)} as const;

/** Pack-relative path -> file content. Paths are POSIX-style. */
export const AEGIS_PACK_FILES: Record<string, string> = ${JSON.stringify(
  Object.fromEntries(files),
  null,
  2,
)};
`;

writeFileSync(outFile, body);
console.log(`wrote ${relative(root, outFile)}: ${files.length} files, revision ${revision}`);
