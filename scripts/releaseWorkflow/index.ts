import { execFileSync, execSync } from 'node:child_process';

import { confirm, select } from '@inquirer/prompts';
import { consola } from 'consola';
import * as semver from 'semver';

// Version type
type VersionType = 'patch' | 'minor' | 'major';

// Check if in a Git repository
function checkGitRepo(): void {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
  } catch {
    consola.error('❌ Current directory is not a Git repository');
    process.exit(1);
  }
}

// Get the version the next release must bump from. The authoritative released
// version lives on main; canary only receives it back through the post-release
// sync, which can lag or fail — so the base is the higher of the two refs.
// Both are read through git refs rather than the working tree: the release
// script no longer checks canary out (see fetchReleaseRefs), so whatever
// branch happens to be checked out must not influence the release base.
function getCurrentVersion(): string {
  const readRefVersion = (ref: string): string | null => {
    try {
      const pkg = JSON.parse(execSync(`git show ${ref}:package.json`, { encoding: 'utf8' }));
      return typeof pkg.version === 'string' ? pkg.version : null;
    } catch {
      return null;
    }
  };

  const versions = [readRefVersion('origin/main'), readRefVersion('origin/canary')].filter(
    (v): v is string => v !== null,
  );
  if (versions.length === 0) {
    consola.error('❌ Unable to read package.json from origin/main or origin/canary');
    process.exit(1);
  }
  return versions.reduce((a, b) => (semver.gt(a, b) ? a : b));
}

// Check whether a release tag already exists on the remote. Read via ls-remote
// so the check does not depend on local tag state.
function remoteTagExists(version: string): boolean {
  try {
    const out = execSync(`git ls-remote --tags origin "refs/tags/v${version}"`, {
      encoding: 'utf8',
    }).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

// Calculate new version based on type
function bumpVersion(currentVersion: string, type: VersionType): string {
  const newVersion = semver.inc(currentVersion, type);
  if (!newVersion) {
    consola.error(`❌ Unable to calculate new version (current: ${currentVersion}, type: ${type})`);
    process.exit(1);
  }
  return newVersion;
}

// Get version type from command line arguments
function getVersionTypeFromArgs(): VersionType | null {
  const args = process.argv.slice(2);

  if (args.includes('--patch')) return 'patch';
  if (args.includes('--minor')) return 'minor';
  if (args.includes('--major')) return 'major';

  return null;
}

// Interactive version type selection
async function selectVersionTypeInteractive(): Promise<VersionType> {
  const currentVersion = getCurrentVersion();

  const choices: { name: string; value: VersionType }[] = [
    {
      value: 'patch',
      name: `🔧 patch - Bug fixes (e.g., ${currentVersion} -> ${bumpVersion(currentVersion, 'patch')})`,
    },
    {
      value: 'minor',
      name: `✨ minor - New features (e.g., ${currentVersion} -> ${bumpVersion(currentVersion, 'minor')})`,
    },
    {
      value: 'major',
      name: `🚀 major - Breaking changes (e.g., ${currentVersion} -> ${bumpVersion(currentVersion, 'major')})`,
    },
  ];

  const answer = await select<VersionType>({
    choices,
    message: 'Select version bump type:',
  });

  return answer;
}

// Secondary confirmation
async function confirmRelease(version: string, type: VersionType): Promise<boolean> {
  const currentVersion = getCurrentVersion();

  consola.box(
    `
📦 Release Confirmation
━━━━━━━━━━━━━━━━━━━━━━━
Current:    ${currentVersion}
New:        ${version}
Type:       ${type}
Branch:     release/v${version}
Target:     main
━━━━━━━━━━━━━━━━━━━━━━━
  `.trim(),
  );

  const confirmed = await confirm({
    default: true,
    message: 'Confirm to create release branch and submit PR?',
  });

  return confirmed;
}

// Fetch the latest canary and main branches.
//
// `canary` is Orvilo's development trunk and the base every release is cut
// from; `main` carries the last released version. This deliberately does NOT
// check either out: in a repository that uses git worktrees, canary is
// frequently already checked out in a sibling worktree, and `git checkout
// canary` then fails with "already used by worktree at ...". Everything the
// release needs — the base commit and the current version — is readable from
// the remote-tracking refs instead.
function fetchReleaseRefs(): void {
  try {
    consola.info('📥 Fetching latest canary and main branches...');
    execSync('git fetch origin canary main', { stdio: 'inherit' });

    const head = execSync('git rev-parse --verify origin/canary', { encoding: 'utf8' }).trim();
    consola.success(`✅ Using origin/canary at ${head.slice(0, 7)}`);
  } catch (error) {
    consola.error('❌ Failed to fetch origin/canary and origin/main');
    consola.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Create release branch
function createReleaseBranch(version: string): void {
  const branchName = `release/v${version}`;

  try {
    consola.info(`🌿 Creating branch: ${branchName} (based on origin/canary)...`);
    execSync(`git checkout -b ${branchName} origin/canary`, { stdio: 'inherit' });
    consola.success(`✅ Created and switched to branch: ${branchName}`);
  } catch (error) {
    consola.error(`❌ Failed to create branch or commit: ${branchName}`);
    consola.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Push branch to remote
function pushBranch(version: string): void {
  const branchName = `release/v${version}`;

  try {
    consola.info(`📤 Pushing branch to remote...`);
    execSync(`git push -u origin ${branchName}`, { stdio: 'inherit' });
    consola.success(`✅ Pushed branch to remote: ${branchName}`);
  } catch (error) {
    consola.error('❌ Failed to push branch');
    consola.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Create Pull Request
function createPullRequest(version: string): void {
  const title = `🚀 release: v${version}`;
  const body = `## 📦 Release v${version}

This branch contains changes for the upcoming v${version} release.

### Change Type
- Cut from the canary branch and merged to the main branch

### Release Process
1. ✅ Release branch created
2. ✅ Pushed to remote
3. 🔄 Waiting for PR review and merge
4. ⏳ Release workflow triggered after merge

---
Created by release script`;

  try {
    consola.info('🔀 Creating Pull Request...');

    // Create PR using gh CLI. execFileSync with an argv array keeps the
    // multi-line body from being re-parsed by a shell.
    execFileSync(
      'gh',
      [
        'pr',
        'create',
        '--title',
        title,
        '--body',
        body,
        '--base',
        'main',
        '--head',
        `release/v${version}`,
        '--label',
        'release',
      ],
      { stdio: 'inherit' },
    );
    consola.success('✅ PR created successfully!');
  } catch (error) {
    consola.error('❌ Failed to create PR');
    consola.error(error instanceof Error ? error.message : String(error));
    consola.info('\n💡 Tip: Make sure GitHub CLI (gh) is installed and logged in');
    consola.info('   Install: https://cli.github.com/');
    consola.info('   Login: gh auth login');
    process.exit(1);
  }
}

// Display completion info
function showCompletion(version: string): void {
  const branchName = `release/v${version}`;

  consola.box(
    `
🎉 Release process started!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Branch created: ${branchName}
✅ Pushed to remote
✅ PR created targeting main branch

📋 PR Title: 🚀 release: v${version}

Next steps:
1. Open the PR link to view details
2. Complete code review
3. Merge PR to main branch
4. Wait for release workflow to complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `.trim(),
  );
}

// Main function
async function main(): Promise<void> {
  consola.info('🚀 Orvilo Release Script\n');

  // 1. Check Git repository
  checkGitRepo();

  // 2. Fetch latest canary and main (the version is bumped from their max)
  fetchReleaseRefs();

  // 3. Get version type
  let versionType = getVersionTypeFromArgs();

  if (!versionType) {
    // No args, enter interactive mode
    versionType = await selectVersionTypeInteractive();
  }

  // 4. Calculate new version — never propose one that already shipped. If the
  // tag exists (e.g. a hotfix already consumed it), keep bumping the same
  // component until the version is free.
  const currentVersion = getCurrentVersion();
  let newVersion = bumpVersion(currentVersion, versionType);
  while (remoteTagExists(newVersion)) {
    consola.warn(`⚠️ Tag v${newVersion} already exists — bumping next ${versionType}`);
    newVersion = bumpVersion(newVersion, versionType);
  }

  // 5. Secondary confirmation
  const confirmed = await confirmRelease(newVersion, versionType);

  if (!confirmed) {
    consola.info('❌ Release process cancelled');
    process.exit(0);
  }

  // 6. Create release branch
  createReleaseBranch(newVersion);

  // 7. Push to remote
  pushBranch(newVersion);

  // 8. Create PR
  createPullRequest(newVersion);

  // 9. Show completion info
  showCompletion(newVersion);
}

main().catch((error) => {
  consola.error('❌ Error occurred:', error);
  process.exit(1);
});
