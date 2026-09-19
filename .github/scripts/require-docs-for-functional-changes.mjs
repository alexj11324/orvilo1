#!/usr/bin/env node

const PRODUCT_ROOTS = ['apps/', 'packages/', 'plugins/', 'src/', 'server/'];
const ROOT_RUNTIME_FILES = new Set([
  'Dockerfile',
  'drizzle.config.ts',
  'next.config.ts',
  'package.json',
  'vercel.json',
  'vite.config.ts',
]);
const ROOT_RUNTIME_FILE_PATTERN = /^index(?:\.[a-z0-9-]+)?\.html$/i;
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

export function isFunctionalSourceChange(path) {
  if (
    !ROOT_RUNTIME_FILES.has(path) &&
    !ROOT_RUNTIME_FILE_PATTERN.test(path) &&
    !PRODUCT_ROOTS.some((root) => path.startsWith(root))
  ) {
    return false;
  }
  if (path.endsWith('.md') || path.endsWith('.mdx')) return false;

  const segments = path.split('/');
  return (
    !segments.some((segment) => NON_FUNCTIONAL_SEGMENTS.has(segment)) &&
    !TEST_FILE_PATTERN.test(path)
  );
}

export function evaluateDocumentationRequirement(changedFiles) {
  const filesWithPaths = changedFiles.map((file) => {
    if (typeof file === 'string') return { filename: file, paths: [file] };

    return {
      filename: file.filename,
      paths: [file.filename, file.previous_filename].filter(Boolean),
    };
  });
  const hasDocumentationChange = filesWithPaths.some(({ filename }) =>
    filename.startsWith('docs/'),
  );
  const functionalFiles = filesWithPaths.flatMap(({ paths }) =>
    paths.filter(isFunctionalSourceChange),
  );

  return {
    functionalFiles,
    requiresDocumentation: functionalFiles.length > 0,
    satisfied: functionalFiles.length === 0 || hasDocumentationChange,
  };
}

export function assertPullRequestFileListIsComplete(fileCount) {
  if (fileCount >= MAX_LISTED_PULL_REQUEST_FILES) {
    throw new Error(
      'PR has 3,000 or more changed files; unable to verify the documentation requirement.',
    );
  }
}

async function listPullRequestFiles({ repository, pullRequest, token }) {
  const files = [];
  let page = 1;

  while (true) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/pulls/${pullRequest}/files?per_page=100&page=${page}`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status} while listing PR files.`);
    }

    const pageFiles = await response.json();
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

  const changedFiles = await listPullRequestFiles({
    repository: GITHUB_REPOSITORY,
    pullRequest: PR_NUMBER,
    token: GITHUB_TOKEN,
  });
  const result = evaluateDocumentationRequirement(changedFiles);

  if (result.satisfied) {
    console.log(
      result.requiresDocumentation
        ? 'Functional source changes and a docs/ update are both present.'
        : 'No functional source changes detected; no docs/ update is required.',
    );
    return;
  }

  console.error('::error::Functional source changes require an accompanying update under docs/.');
  console.error('Functional files:');
  for (const file of result.functionalFiles) console.error(`- ${file}`);
  process.exitCode = 1;
}

if (import.meta.main) {
  await main();
}
