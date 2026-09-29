import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const workerRoot = path.resolve(process.argv[2]);
const assetsRoot = path.join(workerRoot, 'assets');
const manifest = JSON.parse(readFileSync(path.join(assetsRoot, '.vite/manifest.json'), 'utf8'));

for (const entry of Object.values(manifest)) {
  for (const file of [entry.file, ...(entry.css ?? [])]) {
    assert(existsSync(path.join(assetsRoot, file)), `Missing manifest asset: ${file}`);
  }
}

const assetNames = readdirSync(path.join(assetsRoot, 'assets'));
for (const prefix of ['antd-', 'theme-vars-']) {
  assert(
    assetNames.some(
      (name) =>
        name.startsWith(prefix) &&
        name.endsWith('.css') &&
        statSync(path.join(assetsRoot, 'assets', name)).size > 0,
    ),
    `Missing static CSS: ${prefix}`,
  );
}
const bundleRoot = path.join(workerRoot, 'bundle');
const workerSource = readdirSync(bundleRoot, { recursive: true })
  .filter((file) => file.endsWith('.js'))
  .map((file) => readFileSync(path.join(bundleRoot, file), 'utf8'))
  .join('\n');
const browserManifests = workerSource.match(/\bmanifest-[a-f0-9]{8}\.js\b/g) ?? [];
assert(browserManifests.length > 0, 'Worker has no React Router browser manifest');
for (const file of new Set(browserManifests)) {
  assert(existsSync(path.join(assetsRoot, 'assets', file)), `Missing browser manifest: ${file}`);
}
if (process.env.VITE_CDN_BASE) {
  assert(workerSource.includes(process.env.VITE_CDN_BASE), 'Worker lost the configured CDN base');
}
console.log('Cloudflare assets match the Worker manifest and CDN base.');
