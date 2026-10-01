#!/usr/bin/env node
/**
 * Vendor manifest for the Prime snapshot under vendor/prime/.
 *
 *   node scripts/vendor-manifest.mjs          # rewrite vendor/prime/MANIFEST.json
 *   node scripts/vendor-manifest.mjs --check  # verify hashes, exit 1 on drift
 *
 * The manifest pins the provenance (upstream remote + commit + license) and a
 * SHA-256 hash of every vendored file. `node_modules`, manifests themselves and
 * OS metadata are excluded.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const VENDOR_DIR = path.join(ROOT, 'vendor/prime');
const MANIFEST_PATH = path.join(VENDOR_DIR, 'MANIFEST.json');
const CHECK = process.argv.includes('--check');

const PROVENANCE = {
  upstream: 'https://github.com/PrimeIntellect-ai/prime-agent',
  commit: '7d442aafa985f9342134fac16c2ef41f03fb45c1',
  version: '0.9.8',
  license: 'MIT',
  packages: [
    '@earendil-works/pi-ai',
    '@earendil-works/pi-agent-core',
    '@earendil-works/pi-coding-agent',
    '@earendil-works/pi-tui',
  ],
  treeTrimming:
    'upstream checkout trimmed to package.json(edited workspaces)+package-lock.json+tsconfig.base.json+LICENSE+packages/{ai,agent,coding-agent,tui} src/manifests/readmes; see README.orvilo.md',
};

const SKIP_NAMES = new Set(['MANIFEST.json', '.DS_Store', 'Thumbs.db', 'README.orvilo.md']);

function* walk(dir) {
  for (const entry of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* walk(p);
    } else if (entry.isFile() && !SKIP_NAMES.has(entry.name)) {
      yield p;
    }
  }
}

const sha256File = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const collectHashes = () => {
  const hashes = {};
  for (const file of walk(VENDOR_DIR)) {
    const rel = path.relative(VENDOR_DIR, file).split(path.sep).join('/');
    hashes[rel] = sha256File(file);
  }
  return hashes;
};

const buildManifest = (hashes) => ({
  $schema: './manifest.schema.json',
  ...PROVENANCE,
  fileCount: Object.keys(hashes).length,
  files: hashes,
});

const readManifest = () => {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return null;
  }
};

const hashes = collectHashes();
const manifest = buildManifest(hashes);

if (CHECK) {
  const existing = readManifest();
  const drift = [];
  if (!existing) {
    drift.push('MANIFEST.json is missing');
  } else {
    const recorded = existing.files ?? {};
    for (const [file, hash] of Object.entries(hashes)) {
      if (recorded[file] === undefined) drift.push(`untracked file: ${file}`);
      else if (recorded[file] !== hash) drift.push(`hash mismatch: ${file}`);
    }
    for (const file of Object.keys(recorded)) {
      if (hashes[file] === undefined) drift.push(`missing file: ${file}`);
    }
  }
  if (drift.length > 0) {
    console.error(`vendor/prime drift (${drift.length}):`);
    for (const d of drift.slice(0, 50)) console.error(`  ${d}`);
    process.exit(1);
  }
  console.log(
    `vendor/prime manifest verified: ${Object.keys(hashes).length} files @ ${PROVENANCE.commit.slice(0, 7)}`,
  );
} else {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${MANIFEST_PATH}: ${manifest.fileCount} files`);
}
