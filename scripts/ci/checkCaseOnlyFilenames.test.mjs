import assert from 'node:assert/strict';
import test from 'node:test';

import { findCaseOnlyCollisions } from './checkCaseOnlyFilenames.mjs';

test('reports a component and a helper that differ only by letter case', () => {
  assert.deepEqual(
    findCaseOnlyCollisions([
      'src/features/AIChatbot/AgentInfo.tsx',
      'src/features/AIChatbot/agentInfo.ts',
      'src/features/AIChatbot/Composer.tsx',
    ]),
    [['src/features/AIChatbot/AgentInfo.tsx', 'src/features/AIChatbot/agentInfo.ts']],
  );
});

test('accepts the same name in different directories or with different stems', () => {
  assert.deepEqual(
    findCaseOnlyCollisions([
      'src/features/AIChatbot/AgentInfo.tsx',
      'src/features/AIChatbot/hasAgentInfo.ts',
      'src/features/AgentHome/agentInfo.ts',
    ]),
    [],
  );
});

test('does not pair a module with its own test or type file', () => {
  assert.deepEqual(
    findCaseOnlyCollisions(['src/a/Foo.tsx', 'src/a/Foo.test.tsx', 'src/a/foo.d.ts']),
    [],
  );
});

test('ignores files that are not source', () => {
  assert.deepEqual(findCaseOnlyCollisions(['docs/README.md', 'docs/readme.MD']), []);
});
