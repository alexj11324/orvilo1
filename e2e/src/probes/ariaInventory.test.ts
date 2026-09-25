import { describe, expect, it } from 'vitest';

import {
  ariaNamePattern,
  diffAriaInventory,
  formatAriaDiff,
  normalizeAriaName,
  parseAriaInventory,
} from './ariaInventory';

// Hand-written in the shape `locator.ariaSnapshot()` emits; not captured from
// any third-party product.
const RAIL = `- complementary "Properties":
  - heading "Properties" [level=2]
  - button "Backlog":
    - img
    - text: Backlog
  - button "Set priority" [expanded=false]
  - 'button "Assignee: E2E User"'
  - group:
    - button "Remove"
    - button "Remove"
  - link "Docs":
    - /url: /docs
  - paragraph: Created 3 days ago
  - text: |
      - not a node
      still text
  - heading /Issue \\d+/ [level=3]
  - button "Say \\"hi\\""`;

describe('parseAriaInventory', () => {
  it('flattens nested entries with their depth', () => {
    const nodes = parseAriaInventory(RAIL);

    expect(nodes.slice(0, 5)).toEqual([
      { depth: 0, name: 'Properties', role: 'complementary' },
      { depth: 1, name: 'Properties', role: 'heading' },
      { depth: 1, name: 'Backlog', role: 'button' },
      { depth: 2, name: '', role: 'img' },
      { depth: 2, name: 'Backlog', role: 'text' },
    ]);
  });

  it('reads quoted keys, attributes, inline text and escaped quotes', () => {
    const nodes = parseAriaInventory(RAIL);

    expect(nodes).toContainEqual({ depth: 1, name: 'Set priority', role: 'button' });
    expect(nodes).toContainEqual({ depth: 1, name: 'Assignee: E2E User', role: 'button' });
    expect(nodes).toContainEqual({ depth: 1, name: 'Created 3 days ago', role: 'paragraph' });
    expect(nodes).toContainEqual({ depth: 1, name: 'Say "hi"', role: 'button' });
  });

  it('keeps duplicate names as separate entries', () => {
    const removes = parseAriaInventory(RAIL).filter((node) => node.name === 'Remove');

    expect(removes).toEqual([
      { depth: 2, name: 'Remove', role: 'button' },
      { depth: 2, name: 'Remove', role: 'button' },
    ]);
  });

  it('skips property lines and block-scalar text', () => {
    const nodes = parseAriaInventory(RAIL);

    expect(nodes.some((node) => node.role.startsWith('/'))).toBe(false);
    expect(nodes.some((node) => node.name.includes('not a node'))).toBe(false);
    expect(nodes).toContainEqual({ depth: 1, name: '', role: 'text' });
  });

  it('keeps a regex name as written', () => {
    expect(parseAriaInventory(RAIL)).toContainEqual({
      depth: 1,
      name: '/Issue \\d+/',
      role: 'heading',
    });
  });
});

describe('normalizeAriaName', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeAriaName('  Set\n  Priority ')).toBe('set priority');
  });

  it('applies an alias after normalizing', () => {
    expect(normalizeAriaName('Add  Label', { 'add label': 'Labels' })).toBe('labels');
  });
});

describe('ariaNamePattern', () => {
  it('compiles a regex name case-insensitively, dropping stateful flags', () => {
    const pattern = ariaNamePattern('/issue \\d+/g')!;

    expect(pattern.flags).toBe('i');
    expect(pattern.test('ISSUE 12')).toBe(true);
    expect(pattern.test('issue 12')).toBe(true);
  });

  it('returns undefined for a plain or invalid name', () => {
    expect(ariaNamePattern('Issue 12')).toBeUndefined();
    expect(ariaNamePattern('/(/')).toBeUndefined();
  });
});

describe('diffAriaInventory', () => {
  const node = (role: string, name: string, depth = 0) => ({ depth, name, role });

  it('pairs by role and normalized name, ignoring depth', () => {
    const diff = diffAriaInventory(
      [node('button', 'Set Priority'), node('heading', 'Properties')],
      [node('button', 'set  priority', 3), node('heading', 'Properties', 1)],
    );

    expect(diff).toEqual({ extra: [], missing: [] });
  });

  it('does not pair the same name across roles', () => {
    const diff = diffAriaInventory([node('button', 'Labels')], [node('link', 'Labels')]);

    expect(diff).toEqual({ extra: [node('link', 'Labels')], missing: [node('button', 'Labels')] });
  });

  it('counts duplicate names as a multiset', () => {
    const diff = diffAriaInventory(
      [node('button', 'Remove'), node('button', 'Remove'), node('button', 'Remove')],
      [node('button', 'Remove')],
    );

    expect(diff.missing).toHaveLength(2);
    expect(diff.extra).toEqual([]);
  });

  it('pairs names through the alias table', () => {
    const diff = diffAriaInventory([node('button', 'Add label')], [node('button', 'Labels')], {
      aliases: { 'add label': 'labels' },
    });

    expect(diff).toEqual({ extra: [], missing: [] });
  });

  it('pairs a regex name with a matching name on either side', () => {
    const diff = diffAriaInventory(
      [node('heading', '/Issue \\d+/'), node('button', 'Copy link')],
      [node('heading', 'ISSUE 42'), node('button', '/copy (link|url)/')],
    );

    expect(diff).toEqual({ extra: [], missing: [] });
  });

  it('prefers exact pairs before a regex claims an entry', () => {
    const diff = diffAriaInventory(
      [node('heading', '/Issue \\d+/'), node('heading', 'Issue 7')],
      [node('heading', 'Issue 7'), node('heading', 'Issue 8')],
    );

    expect(diff).toEqual({ extra: [], missing: [] });
  });

  it('leaves a regex that matches nothing as missing', () => {
    const diff = diffAriaInventory([node('heading', '/Issue \\d+/')], [node('heading', 'Inbox')]);

    expect(diff.missing).toEqual([node('heading', '/Issue \\d+/')]);
    expect(diff.extra).toEqual([node('heading', 'Inbox')]);
  });

  it('drops ignored roles from both sides', () => {
    const diff = diffAriaInventory(
      [node('generic', ''), node('button', 'Save')],
      [node('button', 'Save')],
      {
        ignoreRoles: ['generic'],
      },
    );

    expect(diff).toEqual({ extra: [], missing: [] });
  });
});

describe('formatAriaDiff', () => {
  it('lists missing and extra entries with indentation by depth', () => {
    expect(
      formatAriaDiff({
        extra: [{ depth: 0, name: 'Share', role: 'button' }],
        missing: [{ depth: 1, name: 'Labels', role: 'button' }],
      }),
    ).toBe(
      'missing in candidate (1):\n  -   button "Labels"\nextra in candidate (1):\n  + button "Share"',
    );
  });
});
