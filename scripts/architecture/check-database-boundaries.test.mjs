import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { inspectSource } from './check-database-boundaries.mjs';

const file = fileURLToPath(new URL('../../packages/database/src/example.ts', import.meta.url));

test('rejects application imports across supported TypeScript syntax and relative paths', () => {
  for (const source of [
    "import { x } from '@/server/service'",
    "export { x } from '@/store/chat'",
    "const x = import('@/features/Settings')",
    "const x = require('@orvilo/server')",
    "type X = import('@/server/service').X",
    "import { x } from '../../../apps/server/src/service'",
    "import { x } from '../../../src/store/chat'",
    "import { x } from '../../../src/features/Settings'",
    `import '${resolve(file, '../../../../apps/server/src/service')}'`,
  ])
    assert.equal(inspectSource(file, source).length, 1, source);
});

test('allows foundation imports, local modules, and non-import strings', () => {
  const source = `
    import { x } from './utils/secretCipher';
    import type { SecretCipher } from '@orvilo/secret-cipher';
    const documentation = '@/server/service';
    call('@/store/chat');
  `;
  assert.deepEqual(inspectSource(file, source), []);
});
