import { readFileSync } from 'node:fs';

// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { primeLexicalSearch } from '../primeLexical';
import { primeLexicalSource } from '../primeLexicalSource';

// Run against the real explicitly configured pinned upstream; never substitute a mock scorer.
describe.skipIf(!process.env.PRIME_AGENT_ROOT)('pinned Prime lexical bridge', () => {
  const row = (id: string, content: string) => ({
    id,
    content,
    revision: 1,
    source: 'prime' as const,
    updatedAt: new Date('2026-09-30'),
  });
  it('recalls Chinese and English and forgets deleted rows across independent subprocesses', async () => {
    const rows = [
      row('zh', '构建失败先检查 Node 版本'),
      row('en', 'Build failures require checking Node version'),
    ];
    expect(await primeLexicalSearch(rows, '构建失败', 5)).toContain('zh');
    expect(await primeLexicalSearch(rows, 'build failures', 5)).toContain('en');
    expect(await primeLexicalSearch([], 'build failures', 5)).toEqual([]);
    expect(await primeLexicalSearch(rows, 'quantum entanglement', 5)).toEqual([]);
  });
});

it('embeds exactly the reviewed Python source without bundler-specific loaders', () => {
  expect(primeLexicalSource).toBe(
    readFileSync(new URL('../primeLexical.py', import.meta.url), 'utf8'),
  );
});
