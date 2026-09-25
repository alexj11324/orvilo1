#!/usr/bin/env node

// Skeleton parity gate: a PR that changes UI surfaces must also update the
// loading skeletons that stand in for them, or explicitly confirm in the PR
// body that no skeleton change is needed.
//
// Opt-out marker (anywhere in the PR body): `skeleton: no-change`
// Skeleton paths that satisfy the gate without a marker:
//   src/components/Skeleton/**, any *.skeleton/Skeleton*.tsx file.

const UI_ROOTS = ['src/features/', 'src/routes/', 'src/business/', 'src/spa/', 'apps/desktop/'];
const UI_FILE_PATTERN = /\.(?:tsx|css|scss)$/i;
const SKELETON_PATH_PATTERN = /Skeleton[/.]|\bskeletons?\//i;
const OPT_OUT_MARKER = /skeleton:\s*no-change/i;
const MAX_LISTED_PULL_REQUEST_FILES = 3000;
const NON_FUNCTIONAL_SEGMENTS = new Set([
  '__fixtures__',
  '__mocks__',
  '__tests__',
  'coverage',
  'fixtures',
  'test',
  'tests',
]);
const TEST_FILE_PATTERN = /(?:^|[/.])[^/]+\.(?:test|spec)\.[^/]+$/;

export function isUiSourceChange(path) {
  if (!UI_ROOTS.some((root) => path.startsWith(root))) return false;
  if (!UI_FILE_PATTERN.test(path)) return false;

  const segments = path.split('/');
  return (
    !segments.some((segment) => NON_FUNCTIONAL_SEGMENTS.has(segment)) &&
    !TEST_FILE_PATTERN.test(path)
  );
}

export function evaluateSkeletonRequirement(changedFiles, prBody = '') {
  const filesWithPaths = changedFiles.map((file) => {
    if (typeof file === 'string') return { filename: file, paths: [file] };

    return {
      filename: file.filename,
      paths: [file.filename, file.previous_filename].filter(Boolean),
    };
  });
  const hasSkeletonChange = filesWithPaths.some(({ filename }) =>
    SKELETON_PATH_PATTERN.test(filename),
  );
  const optedOut = OPT_OUT_MARKER.test(prBody);
  const uiFiles = filesWithPaths.flatMap(({ paths }) => paths.filter(isUiSourceChange));

  return {
    hasSkeletonChange,
    optedOut,
    requiresSkeleton: uiFiles.length > 0,
    satisfied: uiFiles.length === 0 || hasSkeletonChange || optedOut,
    uiFiles,
  };
}

export function assertPullRequestFileListIsComplete(fileCount) {
  if (fileCount >= MAX_LISTED_PULL_REQUEST_FILES) {
    throw new Error(
      'PR has 3,000 or more changed files; unable to verify the skeleton requirement.',
    );
  }
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${url}.`);
  }
  return response.json();
}

async function listPullRequestFiles({ repository, pullRequest, token }) {
  const files = [];
  let page = 1;

  while (true) {
    const pageFiles = await fetchJson(
      `https://api.github.com/repos/${repository}/pulls/${pullRequest}/files?per_page=100&page=${page}`,
      token,
    );
    files.push(...pageFiles);
    // GitHub truncates this endpoint at 3,000 files. Do not silently approve
    // an oversized PR when its undisclosed tail could contain product source.
    assertPullRequestFileListIsComplete(files.length);
    if (pageFiles.length < 100) return files;
    page += 1;
  }
}

async function main() {
  const { GITHUB_REPOSITORY, GITHUB_TOKEN, PR_NUMBER } = process.env;
  if (!GITHUB_REPOSITORY || !GITHUB_TOKEN || !PR_NUMBER) {
    throw new Error('GITHUB_REPOSITORY, GITHUB_TOKEN, and PR_NUMBER are required.');
  }

  const [changedFiles, pullRequest] = await Promise.all([
    listPullRequestFiles({
      repository: GITHUB_REPOSITORY,
      pullRequest: PR_NUMBER,
      token: GITHUB_TOKEN,
    }),
    fetchJson(`https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}`, GITHUB_TOKEN),
  ]);
  const result = evaluateSkeletonRequirement(changedFiles, pullRequest.body ?? '');

  if (result.satisfied) {
    console.log(
      result.requiresSkeleton
        ? result.hasSkeletonChange
          ? 'UI changes and a skeleton update are both present.'
          : 'UI changes present; PR body confirmed skeletons need no update.'
        : 'No UI source changes detected; no skeleton update is required.',
    );
    return;
  }

  console.error(
    '::error::UI source changes require an accompanying loading-skeleton update,' +
      ' or a `skeleton: no-change` confirmation in the PR body.',
  );
  console.error('UI files:');
  for (const file of result.uiFiles) console.error(`- ${file}`);
  process.exitCode = 1;
}

if (import.meta.main) {
  await main();
}
