import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPullRequestFileListIsComplete,
  evaluateDocumentationRequirement,
  isFunctionalSourceChange,
} from './require-docs-for-functional-changes.mjs';

test('recognizes product source changes while excluding tests and prose', () => {
  assert.equal(isFunctionalSourceChange('apps/server/src/routers/tasks.ts'), true);
  assert.equal(isFunctionalSourceChange('packages/database/drizzle/schema.ts'), true);
  assert.equal(isFunctionalSourceChange('plugins/vite/customBrandingLoadingScreen.ts'), true);
  assert.equal(isFunctionalSourceChange('src/features/chat/Composer.tsx'), true);
  assert.equal(isFunctionalSourceChange('next.config.ts'), true);
  assert.equal(isFunctionalSourceChange('package.json'), true);
  assert.equal(isFunctionalSourceChange('index.auth.html'), true);
  assert.equal(isFunctionalSourceChange('apps/server/src/routers/tasks.test.ts'), false);
  assert.equal(isFunctionalSourceChange('packages/database/tests/schema.test.ts'), false);
  assert.equal(isFunctionalSourceChange('apps/cli/README.md'), false);
  assert.equal(isFunctionalSourceChange('vitest.config.mts'), false);
  assert.equal(isFunctionalSourceChange('e2e/features/chat.feature'), false);
});

test('requires docs only when a pull request changes functional source', () => {
  assert.deepEqual(
    evaluateDocumentationRequirement(['apps/server/src/routers/tasks.ts']),
    {
      functionalFiles: ['apps/server/src/routers/tasks.ts'],
      requiresDocumentation: true,
      satisfied: false,
    },
  );
  assert.deepEqual(
    evaluateDocumentationRequirement([
      { filename: 'scripts/retired-feature.ts', previous_filename: 'src/features/retired-feature.ts' },
    ]),
    {
      functionalFiles: ['src/features/retired-feature.ts'],
      requiresDocumentation: true,
      satisfied: false,
    },
  );
  assert.deepEqual(
    evaluateDocumentationRequirement([
      { filename: 'src/features/renamed-feature.ts', previous_filename: 'docs/development/renamed-feature.mdx' },
    ]),
    {
      functionalFiles: ['src/features/renamed-feature.ts'],
      requiresDocumentation: true,
      satisfied: false,
    },
  );
  assert.deepEqual(
    evaluateDocumentationRequirement(['apps/server/src/routers/tasks.ts', 'docs/development/tasks.mdx']),
    {
      functionalFiles: ['apps/server/src/routers/tasks.ts'],
      requiresDocumentation: true,
      satisfied: true,
    },
  );
  assert.deepEqual(
    evaluateDocumentationRequirement(['apps/server/src/routers/tasks.test.ts', '.github/workflows/test.yml']),
    { functionalFiles: [], requiresDocumentation: false, satisfied: true },
  );
});

test('fails closed when GitHub could truncate the pull request file list', () => {
  assert.doesNotThrow(() => assertPullRequestFileListIsComplete(2999));
  assert.throws(() => assertPullRequestFileListIsComplete(3000), /unable to verify/);
});
