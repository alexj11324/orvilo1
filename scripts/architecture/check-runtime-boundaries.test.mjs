import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { inspectRuntimeSource } from './check-runtime-boundaries.mjs';

const file = path.resolve('packages/agent-manager-runtime/src/example.ts');
test('blocks static, dynamic, type-only and relative host dependencies', () => {
  for (const source of [
    "import { state } from '@/store/agent';",
    "export * from 'react';",
    "const state = require('zustand/vanilla');",
    "await import('../../../src/store/agent');",
    "type Store = import('@/store/agent').Store;",
    'window.open(url);',
    'globalThis.document.title;',
  ])
    assert.notEqual(inspectRuntimeSource(file, source).length, 0, source);
});
test('permits injected capabilities and shared package imports', () => {
  assert.deepEqual(
    inspectRuntimeSource(
      file,
      `
    import type { Agent } from '@orvilo/types';
    import { describe } from './heteroAgentDescriptor';
    // window.open is implemented by the host
    host.getConfig(agentId);
  `,
    ),
    [],
  );
});
