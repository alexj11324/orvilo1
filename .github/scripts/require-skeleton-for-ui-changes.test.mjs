import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPullRequestFileListIsComplete,
  evaluateSkeletonRequirement,
  isUiSourceChange,
} from './require-skeleton-for-ui-changes.mjs';

test('recognizes UI source changes while excluding tests and non-UI paths', () => {
  assert.equal(isUiSourceChange('src/features/MyWork/MyWorkPage.tsx'), true);
  assert.equal(isUiSourceChange('src/routes/(main)/task/[taskId]/index.tsx'), true);
  assert.equal(
    isUiSourceChange('src/business/client/BusinessSettingPages/WorkspaceGeneral.tsx'),
    true,
  );
  assert.equal(isUiSourceChange('src/spa/router/desktopRouter.shared.tsx'), true);
  assert.equal(isUiSourceChange('apps/desktop/src/main/index.ts'), false);
  assert.equal(isUiSourceChange('apps/desktop/src/renderer/App.tsx'), true);
  assert.equal(isUiSourceChange('apps/server/src/routers/task.ts'), false);
  assert.equal(isUiSourceChange('packages/database/src/models/task.ts'), false);
  assert.equal(isUiSourceChange('src/features/MyWork/MyWorkPage.test.tsx'), false);
  assert.equal(isUiSourceChange('src/features/MyWork/__tests__/x.tsx'), false);
  assert.equal(isUiSourceChange('src/store/global/initialState.ts'), false);
  assert.equal(isUiSourceChange('docs/guide.md'), false);
});

test('requires skeleton only when a pull request changes UI source', () => {
  assert.equal(evaluateSkeletonRequirement(['apps/server/src/routers/task.ts']).satisfied, true);
  assert.equal(
    evaluateSkeletonRequirement(['src/features/MyWork/MyWorkPage.tsx']).satisfied,
    false,
  );
});

test('satisfied by a skeleton file change or the opt-out marker', () => {
  assert.equal(
    evaluateSkeletonRequirement([
      'src/features/MyWork/MyWorkPage.tsx',
      'src/components/Skeleton/Surface.tsx',
    ]).satisfied,
    true,
  );
  assert.equal(
    evaluateSkeletonRequirement([
      'src/features/MyWork/MyWorkPage.tsx',
      'src/features/MyWork/MyWorkPageSkeleton.tsx',
    ]).satisfied,
    true,
  );
  assert.equal(
    evaluateSkeletonRequirement(
      ['src/features/MyWork/MyWorkPage.tsx'],
      'Layout unchanged — skeleton: no-change',
    ).satisfied,
    true,
  );
  assert.equal(
    evaluateSkeletonRequirement(['src/features/MyWork/MyWorkPage.tsx'], 'unrelated body').satisfied,
    false,
  );
});

test('rename paths are considered', () => {
  const renamed = {
    filename: 'src/features/MyWork/MyWorkPage.tsx',
    previous_filename: 'src/features/MyWork/OldPage.tsx',
  };
  assert.equal(evaluateSkeletonRequirement([renamed]).satisfied, false);
});

test('rejects an oversized pull request file list', () => {
  assert.throws(() => assertPullRequestFileListIsComplete(3000), /3,000 or more/);
});
