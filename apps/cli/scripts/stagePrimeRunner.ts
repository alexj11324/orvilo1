import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Stage the Prime harness artifact into `dist/` so the bundled CLI ships the
 * device-execution runner — the contract's "device-side host must SHIP the
 * Prime artifacts". `resolvePrimeRunnerArtifact` probes
 * `<bundle-dir>/runner.mjs` first, so copying runner.mjs +
 * runner.manifest.json next to `dist/index.js` covers the npm-published CLI
 * AND the desktop-embedded bundle in one place.
 *
 * The artifact is built from the vendored Prime sources when missing (the
 * `packages/prime-harness` esbuild bundle + provenance manifest). Vendor
 * dependencies come from `vendor/prime/package-lock.json` — installed once
 * via `npm ci` when `vendor/prime/node_modules` is absent.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '..');
const ROOT = path.resolve(CLI, '..', '..');
const HARNESS = path.join(ROOT, 'packages', 'prime-harness');
const VENDOR = path.join(ROOT, 'vendor', 'prime');

const runnerDist = path.join(HARNESS, 'dist', 'runner.mjs');
const manifestDist = path.join(HARNESS, 'dist', 'runner.manifest.json');

if (!fs.existsSync(runnerDist)) {
  if (!fs.existsSync(path.join(VENDOR, 'node_modules'))) {
    console.info('🔧 vendored Prime dependencies missing — npm ci in vendor/prime');
    execFileSync('npm', ['ci', '--ignore-scripts'], { cwd: VENDOR, stdio: 'inherit' });
  }
  console.info('📦 building the Prime harness artifact (packages/prime-harness)');
  execFileSync('npm', ['run', 'build'], { cwd: HARNESS, stdio: 'inherit' });
}

for (const file of [runnerDist, manifestDist]) {
  if (!fs.existsSync(file)) {
    throw new Error(
      `Prime harness build did not produce ${file} — the bundled CLI cannot ship device Prime execution.`,
    );
  }
}

fs.copyFileSync(runnerDist, path.join(CLI, 'dist', 'runner.mjs'));
fs.copyFileSync(manifestDist, path.join(CLI, 'dist', 'runner.manifest.json'));
console.info('✅ Prime runner artifact staged into dist/');
