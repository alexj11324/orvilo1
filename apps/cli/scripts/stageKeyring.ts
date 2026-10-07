import { cp, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const manifestPath = require.resolve('@napi-rs/keyring/package.json');
const nativeRequire = createRequire(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
  optionalDependencies: Record<string, string>;
};
const target = path.resolve(import.meta.dirname, '../dist/node_modules/@napi-rs');
await mkdir(target, { recursive: true });
await cp(path.dirname(manifestPath), path.join(target, 'keyring'), { recursive: true });
let nativePackages = 0;
for (const name of Object.keys(manifest.optionalDependencies)) {
  let nativeManifest: string;
  try {
    nativeManifest = nativeRequire.resolve(`${name}/package.json`);
  } catch {
    continue;
  }
  await cp(path.dirname(nativeManifest), path.join(target, name.split('/')[1]), {
    recursive: true,
  });
  nativePackages += 1;
}
if (!nativePackages) throw new Error('No native keyring binary installed for the CLI artifact');
