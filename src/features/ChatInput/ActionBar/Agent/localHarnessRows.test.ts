import { describe, expect, it } from 'vitest';

import { buildLocalHarnessRows, collectConnectedHarnessTypes } from './localHarnessRows';

const EMPTY = new Set<string>();

const types = (rows: ReturnType<typeof buildLocalHarnessRows>) =>
  rows.map((row) => row.provider.type);

describe('buildLocalHarnessRows', () => {
  it('returns nothing until the scan settles', () => {
    expect(buildLocalHarnessRows(null, EMPTY)).toEqual([]);
    expect(buildLocalHarnessRows(undefined, EMPTY)).toEqual([]);
  });

  it('ranks installed harnesses above the ones the scan could not find', () => {
    const rows = buildLocalHarnessRows(
      {
        'claude-code': { available: true, version: '2.0.1' },
        'codex': { available: true, version: '0.9.0' },
        // Everything the scan omitted counts as unavailable, so the local CLI
        // that failed a probe belongs in the collapsed group too.
        'opencode': { available: false, reason: 'spawn opencode ENOENT' },
      },
      EMPTY,
    );

    const available = rows.filter((row) => row.available);
    expect(available.map((row) => row.provider.type)).toEqual(['claude-code', 'codex']);
    expect(available[0].version).toBe('2.0.1');
    expect(types(rows).indexOf('claude-code')).toBeLessThan(types(rows).indexOf('cursor'));
    expect(rows.find((row) => row.provider.type === 'opencode')?.reason).toBe(
      'spawn opencode ENOENT',
    );
  });

  it('drops harnesses that already have an agent row', () => {
    const rows = buildLocalHarnessRows(
      { 'claude-code': { available: true }, 'codex': { available: true } },
      new Set(['claude-code']),
    );

    expect(types(rows)).not.toContain('claude-code');
    expect(types(rows)).toContain('codex');
  });

  it('keeps the registry order inside each rank', () => {
    const rows = buildLocalHarnessRows({ opencode: { available: true } }, EMPTY);

    // `opencode` is installed, so it leads — ahead of every unprobed provider,
    // and the unprobed ones keep the order CONNECTABLE_PROVIDERS declared.
    expect(types(rows)[0]).toBe('opencode');
    const unprobed = types(rows).slice(1);
    expect(unprobed).toContain('claude-code');
    expect(unprobed.indexOf('claude-code')).toBeLessThan(unprobed.indexOf('codex'));
  });
});

describe('collectConnectedHarnessTypes', () => {
  it('deduplicates the runtime stamps and ignores agents without one', () => {
    expect(
      collectConnectedHarnessTypes([
        { heterogeneousType: 'claude-code' },
        { heterogeneousType: 'claude-code' },
        { heterogeneousType: null },
        {},
        { heterogeneousType: 'openclaw' },
      ]),
    ).toEqual(new Set(['claude-code', 'openclaw']));
  });
});
