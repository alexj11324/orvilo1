import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// This is deliberately a small, reviewable policy instead of an opaque build
// graph. Unknown or high-fan-out changes fail closed into the full suite.

const FULL_SUITE_PATHS = [
  /^\.github\/(?:workflows\/(?:test|e2e)\.yml|actions\/setup-env\/|scripts\/(?:plan-affected-checks|verify-affected-static-checks)\.)/,
  /^\.agents\/scripts\/check\//,
  /^(?:package\.json|pnpm-lock\.yaml|tsconfig\.json|vitest\.config\.mts|scripts\/type-check\.mjs)$/,
];

const DOCUMENTATION_PATHS = [
  /^docs\/.*\.(?:md|mdx|txt|pdf|png|jpe?g|gif|webp|avif|svg)$/i,
  /^\.github\/ISSUE_TEMPLATE\//,
  /^(?:README|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY|LICENSE|NOTICE)(?:\.|$)/,
  /^\.gitignore$/,
];

const DATABASE_PATHS = [
  /^packages\/database\//,
  /^(?:drizzle\.config|scripts\/(?:migrateServerDB|installFtsSearchSyncCapture|elasticsearchSync|pgSearchCleanup))\//,
  /(?:^|\/)(?:migrations?|schema)\//,
];

const SHARED_PACKAGE_NAMES = new Set([
  '@orvilo/app-config',
  '@orvilo/env',
  '@orvilo/locales',
  '@orvilo/trpc',
  '@orvilo/types',
  '@orvilo/utils',
]);

const TYPED_SOURCE_PATH = /\.(?:[cm]?tsx?)$/;

const packageNameForPath = (file, packages) => {
  // Some workspaces are nested (for example packages/achaos/core); resolving
  // against the manifest directories avoids treating src/ as a package segment.
  const matchingDirectory = [...packages.byDirectory.keys()]
    .filter((directory) => file.startsWith(`${directory}/`))
    .sort((left, right) => right.length - left.length)[0];
  return matchingDirectory ? packages.byDirectory.get(matchingDirectory) : undefined;
};

const packageGraph = (rootDir) => {
  const manifests = [];
  const candidates = execFileSync('git', ['ls-files', 'packages/**/package.json'], {
    cwd: rootDir,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

  for (const file of candidates) {
    const manifest = JSON.parse(readFileSync(resolve(rootDir, file), 'utf8'));
    if (!manifest.name) continue;
    manifests.push({
      dependencies: {
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      },
      directory: file.slice(0, -'/package.json'.length),
      name: manifest.name,
      testable: Boolean(manifest.scripts?.test || manifest.scripts?.['test:coverage']),
    });
  }

  const byDirectory = new Map(manifests.map(({ directory, name }) => [directory, name]));
  const reverseDependencies = new Map();
  const consumerScopes = new Map();
  const names = new Set(manifests.map(({ name }) => name));
  for (const { name, dependencies } of manifests) {
    for (const dependency of Object.keys(dependencies)) {
      if (!names.has(dependency)) continue;
      const consumers = reverseDependencies.get(dependency) ?? new Set();
      consumers.add(name);
      reverseDependencies.set(dependency, consumers);
    }
  }

  for (const { file, scope } of [
    { file: 'apps/cli/package.json', scope: 'cli' },
    { file: 'apps/desktop/package.json', scope: 'desktop' },
    { file: 'apps/server/package.json', scope: 'server' },
  ]) {
    const manifestPath = resolve(rootDir, file);
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    };
    for (const dependency of Object.keys(dependencies)) {
      if (!names.has(dependency)) continue;
      const scopes = consumerScopes.get(dependency) ?? new Set();
      scopes.add(scope);
      consumerScopes.set(dependency, scopes);
    }
  }

  return {
    byDirectory,
    consumerScopes,
    reverseDependencies,
    testPackageNames: new Set(manifests.filter(({ testable }) => testable).map(({ name }) => name)),
  };
};

const newPlan = () => ({
  reasons: [],
  run_app: false,
  run_cli: false,
  run_database: false,
  run_desktop: false,
  run_e2e: false,
  run_packages: false,
  run_server: false,
  run_static: false,
  run_typecheck: false,
  run_windows_shell: false,
  test_packages: [],
});

const markFullSuite = (plan, packages, reason) => {
  Object.assign(plan, {
    run_app: true,
    run_cli: true,
    run_database: true,
    run_desktop: true,
    run_e2e: true,
    run_packages: true,
    run_server: true,
    run_static: true,
    run_typecheck: true,
    run_windows_shell: true,
  });
  plan.test_packages = [...packages.testPackageNames].sort();
  plan.reasons.push(reason);
};

const affectedPackageTests = (changedPackages, packages) => {
  const affected = new Set(changedPackages);
  const queue = [...changedPackages];
  while (queue.length > 0) {
    const dependency = queue.shift();
    for (const consumer of packages.reverseDependencies.get(dependency) ?? []) {
      if (affected.has(consumer)) continue;
      affected.add(consumer);
      queue.push(consumer);
    }
  }

  return [...affected].filter((name) => packages.testPackageNames.has(name)).sort();
};

/**
 * Produce the quality plan for a list of repository-relative changed files.
 * `packages` is injectable so the policy is unit-testable without a checkout.
 */
export const planAffectedChecks = (files, { forceE2E = false, forceFull = false, packages } = {}) => {
  const plan = newPlan();
  const graph = packages ?? {
    byDirectory: new Map(),
    consumerScopes: new Map(),
    reverseDependencies: new Map(),
    testPackageNames: new Set(),
  };
  if (forceFull) {
    markFullSuite(plan, graph, 'protected branch push');
    return plan;
  }

  const changedPackages = new Set();
  for (const file of files) {
    if (FULL_SUITE_PATHS.some((pattern) => pattern.test(file))) {
      markFullSuite(plan, graph, `high-fan-out CI or tooling change: ${file}`);
      return plan;
    }
    if (DOCUMENTATION_PATHS.some((pattern) => pattern.test(file))) continue;

    plan.run_static = true;
    if (TYPED_SOURCE_PATH.test(file)) plan.run_typecheck = true;
    if (file.startsWith('e2e/')) {
      plan.run_e2e = true;
      plan.reasons.push(`E2E suite changed: ${file}`);
      continue;
    }
    if (DATABASE_PATHS.some((pattern) => pattern.test(file))) {
      Object.assign(plan, {
        run_app: true,
        run_database: true,
        run_e2e: true,
        run_server: true,
        run_typecheck: true,
      });
      plan.reasons.push(`database boundary changed: ${file}`);
      continue;
    }
    if (file.startsWith('apps/desktop/')) {
      plan.run_desktop = true;
      plan.reasons.push(`desktop changed: ${file}`);
      continue;
    }
    if (file.startsWith('apps/cli/')) {
      plan.run_cli = true;
      plan.reasons.push(`CLI changed: ${file}`);
      continue;
    }
    if (file.startsWith('apps/server/')) {
      plan.run_server = true;
      plan.reasons.push(`server changed: ${file}`);
      continue;
    }
    if (file.startsWith('src/app/(backend)/')) {
      Object.assign(plan, { run_app: true, run_server: true });
      plan.reasons.push(`backend route shell changed: ${file}`);
      continue;
    }
    if (file.startsWith('packages/') && file.endsWith('/package.json')) {
      markFullSuite(plan, graph, `package manifest changed: ${file}`);
      return plan;
    }
    if (file.startsWith('packages/local-file-shell/')) {
      plan.run_windows_shell = true;
      changedPackages.add(packageNameForPath(file, graph));
      plan.reasons.push(`Windows shell changed: ${file}`);
      continue;
    }
    if (file.startsWith('packages/')) {
      const packageName = packageNameForPath(file, graph);
      if (!packageName) {
        markFullSuite(plan, graph, `unmapped package path: ${file}`);
        return plan;
      }
      changedPackages.add(packageName);
      // Shared packages cross the web/server/desktop boundaries. Other package
      // changes still exercise their package suite and the two primary consumers.
      Object.assign(plan, { run_app: true, run_server: true });
      if (SHARED_PACKAGE_NAMES.has(packageName)) {
        Object.assign(plan, { run_desktop: true, run_typecheck: true });
      }
      for (const scope of graph.consumerScopes.get(packageName) ?? []) {
        if (scope === 'desktop') plan.run_desktop = true;
        if (scope === 'server') plan.run_server = true;
        if (scope === 'cli') plan.run_cli = true;
      }
      plan.reasons.push(`workspace package changed: ${packageName}`);
      continue;
    }
    if (file.startsWith('src/') || file.startsWith('tests/')) {
      plan.run_app = true;
      plan.reasons.push(`web application changed: ${file}`);
      continue;
    }

    markFullSuite(plan, graph, `unclassified change: ${file}`);
    return plan;
  }

  if (forceE2E) {
    plan.run_e2e = true;
    plan.reasons.push('ci:e2e label requested browser regression coverage');
  }
  plan.test_packages = affectedPackageTests([...changedPackages].filter(Boolean), graph);
  // The existing package job also owns the CLI configuration contract.
  plan.run_packages = plan.test_packages.length > 0 || plan.run_cli;
  return plan;
};

const changedFiles = (rootDir, base, head) =>
  execFileSync('git', ['diff', '--name-only', '--no-renames', base, head], {
    cwd: rootDir,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

const main = async () => {
  const args = process.argv.slice(2);
  const valueFor = (flag) => args[args.indexOf(flag) + 1];
  const rootDir = process.cwd();
  const base = valueFor('--base');
  const head = valueFor('--head');
  if (!base || !head) throw new Error('Usage: plan-affected-checks.mjs --base <sha> --head <sha>');
  const forceFull = args.includes('--force-full');
  const plan = planAffectedChecks(forceFull ? [] : changedFiles(rootDir, base, head), {
    forceE2E: args.includes('--force-e2e'),
    forceFull,
    packages: packageGraph(rootDir),
  });
  console.log(JSON.stringify(plan, null, 2));
};

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === new URL(`file://${process.argv[1]}`).href)
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
