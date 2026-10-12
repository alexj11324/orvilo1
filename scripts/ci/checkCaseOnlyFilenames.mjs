#!/usr/bin/env node
/**
 * Case-only filename gate.
 *
 * Two source files in one directory whose names differ only by letter case
 * once the extension is dropped (`AgentInfo.tsx` + `agentInfo.ts`) are two
 * modules on Linux and one on macOS and Windows: `import './AgentInfo'`
 * resolves to whichever extension the bundler tries first. CI runs on Linux,
 * so nothing else catches it. Test, spec and declaration files are compared
 * with their own kind, since `Foo.tsx` + `foo.test.ts` cannot be confused.
 *
 *   node scripts/ci/checkCaseOnlyFilenames.mjs
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = /\.[cm]?[jt]sx?$/;
const KIND = /\.(test|spec|d)$/;

/** @param {string[]} paths repo-relative source paths */
export const findCaseOnlyCollisions = (paths) => {
  const groups = new Map();
  for (const file of paths) {
    if (!SOURCE.test(file)) continue;
    const stem = file.replace(SOURCE, '');
    const kind = KIND.exec(stem)?.[1] ?? 'module';
    const key = `${kind}:${stem.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), { file, stem }]);
  }

  return [...groups.values()]
    .filter((group) => new Set(group.map((entry) => entry.stem)).size > 1)
    .map((group) => group.map((entry) => entry.file).sort());
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const files = execFileSync('git', ['ls-files', '--', 'src', 'apps', 'packages'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean);
  const collisions = findCaseOnlyCollisions(files);

  if (collisions.length > 0) {
    console.error(`FAIL — ${collisions.length} case-only filename collision(s):`);
    for (const group of collisions) console.error(`  ${group.join('  <->  ')}`);
    console.error('Rename one of each pair: macOS and Windows resolve both to the same file.');
    process.exit(1);
  }
  console.log(`PASS — no case-only filename collisions in ${files.length} tracked files`);
}
