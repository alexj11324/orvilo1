import { describe, expect, it } from 'vitest';

import { flattenVisible, getAllKeys, guidePath, resolveTreeKey, type TreeDataNode } from './utils';

const treeData: TreeDataNode[] = [
  {
    children: [
      { key: 'a-1', title: 'A1' },
      { children: [{ key: 'a-2-1', title: 'A21' }], key: 'a-2', title: 'A2' },
    ],
    key: 'a',
    title: 'A',
  },
  { key: 'b', title: 'B' },
];

describe('tree utils', () => {
  it('lists every key parent-first', () => {
    expect(getAllKeys(treeData)).toEqual(['a', 'a-1', 'a-2', 'a-2-1', 'b']);
  });

  it('flattens only the expanded branches', () => {
    expect(flattenVisible(treeData, new Set()).map((r) => [r.node.key, r.depth])).toEqual([
      ['a', 0],
      ['b', 0],
    ]);
    expect(flattenVisible(treeData, new Set(['a'])).map((r) => r.node.key)).toEqual([
      'a',
      'a-1',
      'a-2',
      'b',
    ]);
    // A collapsed parent hides its expanded descendants.
    expect(flattenVisible(treeData, new Set(['a-2'])).map((r) => r.node.key)).toEqual(['a', 'b']);
  });

  it('draws a guide elbow that stops at the last child', () => {
    expect(guidePath(1, true, [], 20, 36)).toBe('M11.5 0V12A6 6 0 0 0 17.5 18H29.5');
    expect(guidePath(1, false, [], 20, 36)).toBe('M11.5 0V36M11.5 12A6 6 0 0 0 17.5 18H29.5');
    expect(guidePath(2, true, [true, true], 20, 36)).toBe(
      'M31.5 0V36M31.5 0V12A6 6 0 0 0 37.5 18H49.5',
    );
  });
});

describe('resolveTreeKey', () => {
  const collapsed = new Set<string>();
  const open = new Set(['a']);
  const flatClosed = flattenVisible(treeData, collapsed);
  const flatOpen = flattenVisible(treeData, open);

  it('expands a closed branch on ArrowRight, then moves into it', () => {
    expect(resolveTreeKey(flatClosed, collapsed, 'a', 'ArrowRight')).toEqual({
      node: treeData[0],
      type: 'toggle',
    });
    expect(resolveTreeKey(flatOpen, open, 'a', 'ArrowRight')).toEqual({
      key: 'a-1',
      type: 'focus',
    });
    expect(resolveTreeKey(flatOpen, open, 'a-1', 'ArrowRight')).toBeUndefined();
  });

  it('collapses an open branch on ArrowLeft, else moves to the parent', () => {
    expect(resolveTreeKey(flatOpen, open, 'a', 'ArrowLeft')).toEqual({
      node: treeData[0],
      type: 'toggle',
    });
    expect(resolveTreeKey(flatOpen, open, 'a-2', 'ArrowLeft')).toEqual({ key: 'a', type: 'focus' });
    expect(resolveTreeKey(flatOpen, open, 'b', 'ArrowLeft')).toBeUndefined();
  });

  it('moves through visible rows and selects with Enter or Space', () => {
    expect(resolveTreeKey(flatOpen, open, 'a-1', 'ArrowDown')).toEqual({
      key: 'a-2',
      type: 'focus',
    });
    expect(resolveTreeKey(flatOpen, open, 'a-1', 'ArrowUp')).toEqual({ key: 'a', type: 'focus' });
    expect(resolveTreeKey(flatOpen, open, 'b', 'ArrowDown')).toBeUndefined();
    expect(resolveTreeKey(flatOpen, open, 'a-2', 'Home')).toEqual({ key: 'a', type: 'focus' });
    expect(resolveTreeKey(flatOpen, open, 'a', 'End')).toEqual({ key: 'b', type: 'focus' });
    expect(resolveTreeKey(flatOpen, open, 'b', 'Enter')).toEqual({
      node: treeData[1],
      type: 'select',
    });
    expect(resolveTreeKey(flatOpen, open, 'b', ' ')).toEqual({ node: treeData[1], type: 'select' });
    expect(resolveTreeKey(flatOpen, open, 'b', 'x')).toBeUndefined();
    expect(resolveTreeKey(flatOpen, open, 'missing', 'Enter')).toBeUndefined();
  });
});
