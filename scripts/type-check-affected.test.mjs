import assert from 'node:assert/strict';
import { test } from 'node:test';

import { affectedPackages } from './type-check-affected.mjs';

const packages = [
  { name: 'consumer', directory: 'apps/consumer', dependencies: ['database'] },
  { name: 'database', directory: 'packages/database', dependencies: ['cipher'] },
  { name: 'cipher', directory: 'packages/cipher', dependencies: [] },
  { name: 'unrelated', directory: 'packages/unrelated', dependencies: [] },
];
test('a changed foundation checks transitive consumers regardless of manifest order', () => {
  assert.deepEqual(
    affectedPackages(packages, ['packages/cipher/src/index.ts']).map((pkg) => pkg.name),
    ['consumer', 'database', 'cipher'],
  );
});
test('shared compiler configuration invalidates every project', () => {
  assert.equal(affectedPackages(packages, ['tsconfig.base.json']).length, packages.length);
});
test('directory prefixes do not select sibling packages', () => {
  assert.deepEqual(affectedPackages(packages, ['packages/cipher-extra/index.ts']), []);
});

test('nested workspace changes select their direct owner and root full gate', () => {
  const nested = [
    { name: 'web', directory: '.', dependencies: [] },
    { name: 'business', directory: 'packages/business/const', dependencies: [] },
  ];
  assert.deepEqual(
    affectedPackages(nested, ['packages/business/const/src/index.ts']).map((pkg) => pkg.name),
    ['web', 'business'],
  );
  assert.deepEqual(
    affectedPackages(nested, ['src/index.ts']).map((pkg) => pkg.name),
    ['web'],
  );
});
