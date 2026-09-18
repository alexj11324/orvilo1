import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { consola } from 'consola';
import * as semver from 'semver';

export interface PrepareReleaseOptions {
  buildStaticChangelog?: (cwd: string) => void;
  cwd?: string;
  generateChangelog?: (cwd: string) => void;
}

const getWorkingDirectory = (cwd?: string) => cwd ?? process.cwd();

const runGit = (args: string[], cwd: string, encoding?: BufferEncoding) =>
  execFileSync('git', args, {
    cwd,
    encoding,
    stdio: encoding ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

/**
 * Return the version encoded by a release or hotfix branch name.
 *
 * Hotfix branches only accept stable patch versions because the branch name
 * suffix is reserved for the source commit hash.
 */
export function getExpectedVersionFromBranch(branchName: string): string | null {
  const releaseMatch = /^release\/v(.+)$/.exec(branchName);
  const hotfixMatch = /^hotfix\/v(\d+\.\d+\.\d+)(?:-[a-f0-9]+)?$/.exec(branchName);
  const version = releaseMatch?.[1] ?? hotfixMatch?.[1];

  return version && semver.valid(version) ? version : null;
}

function bumpPatchVersion(version: string): string | null {
  const parsed = semver.parse(version);
  if (!parsed) return null;

  return semver.inc(`${parsed.major}.${parsed.minor}.${parsed.patch}`, 'patch');
}

/**
 * Existing hotfix branches may have a descriptive name instead of embedding
 * their target version. Derive one stable target from the branch's main-line
 * base so rerunning preparation never bumps the already prepared package.
 */
export function getExpectedHotfixVersion(branchName: string, cwd = process.cwd()): string | null {
  const encodedVersion = getExpectedVersionFromBranch(branchName);
  if (encodedVersion && branchName.startsWith('hotfix/')) return encodedVersion;
  if (!branchName.startsWith('hotfix/') || /^hotfix\/v\d/.test(branchName)) return null;

  for (const ref of ['origin/main', 'main']) {
    try {
      const baseCommit = String(runGit(['merge-base', 'HEAD', ref], cwd, 'utf8')).trim();
      const basePackage = JSON.parse(
        String(runGit(['show', `${baseCommit}:package.json`], cwd, 'utf8')),
      ) as Record<string, unknown>;
      if (typeof basePackage.version !== 'string') continue;

      return bumpPatchVersion(basePackage.version);
    } catch {
      // Try the next available main ref. The final error below explains the
      // required branch base when neither ref is available.
    }
  }

  return null;
}

export function getCurrentBranch(cwd = process.cwd()): string {
  return String(runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd, 'utf8')).trim();
}

/**
 * Release preparation must begin from a truly clean checkout. In particular,
 * `git diff` alone misses staged changes and the default status output can hide
 * untracked files in some caller configurations.
 */
export function assertCleanWorkingTree(cwd = process.cwd()): void {
  const status = String(runGit(['status', '--porcelain', '--untracked-files=all'], cwd, 'utf8'));

  if (status.trim()) {
    throw new Error(
      `Working tree is not clean; commit or remove these changes before preparing a release:\n${status.trim()}`,
    );
  }
}

export function assertExpectedBranchVersion(version: string, cwd = process.cwd()): void {
  const branch = getCurrentBranch(cwd);
  const expected = branch.startsWith('hotfix/')
    ? getExpectedHotfixVersion(branch, cwd)
    : getExpectedVersionFromBranch(branch);

  if (!expected) {
    throw new Error(
      `Current branch "${branch}" does not identify a valid release version; use release/v<version>, hotfix/v<version>-<hash>, or base a descriptive hotfix/* branch on main.`,
    );
  }

  if (expected !== version) {
    throw new Error(`Branch "${branch}" expects version ${expected}, not ${version}.`);
  }
}

/**
 * Remove every existing entry for one version while preserving all other
 * changelog entries. The generator can then prepend one fresh entry for the
 * current release, making repeated finalization idempotent.
 */
export function removeVersionEntry(content: string, version: string): string {
  const lines = content.split('\n');
  const versionHeading = new RegExp(`^#{2,3} \\[Version ${escapeRegExp(version)}\\]\\(`);
  const anyVersionHeading = /^#{2,3} \[Version [^\]]+\]\(/;
  const kept: string[] = [];
  let removing = false;

  for (const line of lines) {
    if (anyVersionHeading.test(line)) {
      removing = versionHeading.test(line);
      if (!removing) kept.push(line);
      continue;
    }

    if (!removing) kept.push(line);
  }

  return kept
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function writePackageVersion(version: string, cwd: string): void {
  const packagePath = path.join(cwd, 'package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, unknown>;
  const currentVersion = pkg.version;

  if (typeof currentVersion !== 'string' || !semver.valid(currentVersion)) {
    throw new Error(`package.json contains an invalid version: ${String(currentVersion)}`);
  }

  if (semver.gt(currentVersion, version)) {
    throw new Error(
      `package.json version ${currentVersion} is newer than the expected branch version ${version}.`,
    );
  }

  writeFileSync(packagePath, `${JSON.stringify({ ...pkg, version }, null, 2)}\n`);
}

function defaultGenerateChangelog(cwd: string): void {
  execSync('bun run workflow:changelog:gen', { cwd, stdio: 'inherit' });
}

function defaultBuildStaticChangelog(cwd: string, version: string): void {
  execFileSync('bun', ['run', 'workflow:changelog', `--replace-version=${version}`], {
    cwd,
    stdio: 'inherit',
  });
}

/**
 * Write and commit the version/changelog carried by a release or hotfix PR.
 * Versioned branch names carry their target directly; descriptive hotfix names
 * derive one target from their main-line base. The function refuses to prepare
 * a different branch version and skips an empty commit.
 */
export function prepareRelease(version: string, options: PrepareReleaseOptions = {}): boolean {
  const cwd = getWorkingDirectory(options.cwd);

  if (!semver.valid(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }

  assertCleanWorkingTree(cwd);
  assertExpectedBranchVersion(version, cwd);

  consola.info(`📝 Bumping version and generating changelog for v${version}...`);
  writePackageVersion(version, cwd);
  (options.generateChangelog ?? defaultGenerateChangelog)(cwd);
  (options.buildStaticChangelog ?? defaultBuildStaticChangelog)(cwd, version);

  runGit(['add', 'package.json', 'CHANGELOG.md', 'changelog/'], cwd);

  const staged = String(runGit(['diff', '--cached', '--name-only'], cwd, 'utf8')).trim();
  if (!staged) {
    consola.info(`✅ Release files already contain v${version}; no commit needed`);
    return false;
  }

  runGit(['commit', '-m', `🔖 chore(release): release version v${version}`], cwd);
  consola.success(`✅ Release commit created for v${version}`);
  return true;
}
