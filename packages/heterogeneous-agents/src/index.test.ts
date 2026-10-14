import { expect, it, vi } from 'vitest';

import { ACP_RUNTIME_AGENT_TYPES } from './index';

vi.mock('node:child_process', () => {
  throw new Error('Node subprocess APIs are unavailable in the renderer');
});

it('loads the root exports without Node subprocess APIs', () => {
  expect(ACP_RUNTIME_AGENT_TYPES.has('codex')).toBe(true);
});
