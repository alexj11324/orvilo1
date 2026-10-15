/** Checks declared project boundaries and reports consumers still covered by the full CI gate. */
import { execFile, spawn } from 'node:child_process';
import { glob, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { parse } from 'yaml';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

export function affectedPackages(packages, files) {
  const affected = new Set();
  const globalChange = files.some((file) =>
    /^(?:package\.json|pnpm-|tsconfig|scripts\/type-check)/.test(file),
  );
  for (const pkg of packages) {
    if (
      globalChange ||
      (pkg.directory === '.' && files.some(Boolean)) ||
      files.some((file) => file.startsWith(`${pkg.directory}/`))
    )
      affected.add(pkg.name);
  }
  let previousSize;
  do {
    previousSize = affected.size;
    for (const pkg of packages) {
      if (pkg.dependencies.some((dependency) => affected.has(dependency))) affected.add(pkg.name);
    }
  } while (previousSize !== affected.size);
  return packages.filter((pkg) => affected.has(pkg.name));
}

async function main() {
  const packages = [];
  const workspace = parse(await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'));
  const patterns = workspace.packages
    .filter((pattern) => !pattern.startsWith('!'))
    .map((pattern) => `${pattern}/package.json`);
  const exclude = [
    '**/node_modules/**',
    '**/.git/**',
    ...workspace.packages
      .filter((pattern) => pattern.startsWith('!'))
      .map((pattern) => `${pattern.slice(1)}/**`),
  ];
  for await (const manifestPath of glob(patterns, { cwd: root, exclude })) {
    const manifest = JSON.parse(await readFile(path.join(root, manifestPath), 'utf8'));
    packages.push({
      name: manifest.name ?? manifestPath,
      directory: path.dirname(manifestPath),
      boundary: manifest.orviloTypecheck,
      dependencies: Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      }),
    });
  }
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf('--base');
  const validArgs =
    args.length === 0 ||
    (args.length === 1 && args[0] === '--all') ||
    (args.length === 2 && args[0] === '--base' && args[1] && !args[1].startsWith('-'));
  if (!validArgs)
    throw new Error('Usage: node scripts/type-check-affected.mjs [--all | --base <revision>]');
  const files = args.includes('--all')
    ? ['tsconfig.base.json']
    : baseIndex >= 0
      ? (
          await exec('git', ['diff', '--name-only', `${args[baseIndex + 1]}...HEAD`], { cwd: root })
        ).stdout
          .trim()
          .split('\n')
      : (
          await Promise.all([
            exec('git', ['diff', '--name-only', 'HEAD'], { cwd: root }),
            exec('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root }),
          ])
        ).flatMap(({ stdout }) => stdout.trim().split('\n'));
  const affected = affectedPackages(packages, files);
  // Explicit contracts describe migrated scope. Auto-discovered composites must
  // enforce rootDir; legacy include-only application configs are not isolated.
  const projects = [];
  const checks = [];
  const deferred = [];
  for (const pkg of affected) {
    if (pkg.boundary) {
      const boundaries = Array.isArray(pkg.boundary) ? pkg.boundary : [pkg.boundary];
      for (const boundary of boundaries) {
        const { project, mode, coverage, compiler = 'tsc' } = boundary;
        if (
          !project ||
          !['build', 'check'].includes(mode) ||
          !['full', 'partial', 'production'].includes(coverage) ||
          !['tsc', 'tsgo'].includes(compiler)
        )
          throw new Error(`Invalid orviloTypecheck contract: ${pkg.name}`);
        if (mode === 'build') projects.push(`${pkg.directory}/${project}`);
        else checks.push({ compiler, args: ['-p', `${pkg.directory}/${project}`] });
      }
      if (!boundaries.some((boundary) => boundary.coverage === 'full')) deferred.push(pkg.name);
      continue;
    }
    const config = `${pkg.directory}/tsconfig.build.json`;
    try {
      const contents = JSON.parse(await readFile(path.join(root, config), 'utf8'));
      if (!contents.compilerOptions?.composite || !contents.compilerOptions?.rootDir) {
        deferred.push(pkg.name);
        continue;
      }
      projects.push(config);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      deferred.push(pkg.name);
    }
  }
  if (deferred.length) console.log(`Full CI typecheck still required for: ${deferred.join(', ')}`);
  if (projects.length) checks.unshift({ compiler: 'tsc', args: ['-b', ...projects] });
  if (!checks.length) console.log('No independent typecheck units affected.');
  for (const { compiler, args } of checks) {
    console.log(`Typecheck: ${compiler} ${args.join(' ')}`);
    const status = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.join(
            root,
            compiler === 'tsgo'
              ? 'node_modules/@typescript/native-preview/bin/tsgo'
              : 'node_modules/typescript/bin/tsc',
          ),
          ...args,
        ],
        {
          cwd: root,
          stdio: 'inherit',
          env: {
            ...process.env,
            GOMEMLIMIT: process.env.GOMEMLIMIT ?? '2GiB',
            GOMAXPROCS: process.env.GOMAXPROCS ?? '2',
          },
        },
      );
      child.on('error', reject);
      child.on('exit', (code) => resolve(code ?? 1));
    });
    if (status !== 0) {
      process.exitCode = status;
      return;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
