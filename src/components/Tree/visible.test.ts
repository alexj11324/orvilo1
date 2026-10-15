import { describe, expect, it } from 'vitest';

import { type TreeDataNode, visibleTreeNodes } from './index';

const nodes: TreeDataNode[] = [
  {
    key: 'root',
    title: 'Root',
    children: [{ key: 'child', title: 'Child', children: [{ key: 'leaf', title: 'Leaf' }] }],
  },
  { key: 'other', title: 'Other' },
];

describe('visible tree traversal', () => {
  it('collapsed descendants never appear in the keyboard navigation order', () => {
    expect(visibleTreeNodes(nodes, new Set()).map(({ node }) => node.key)).toEqual([
      'root',
      'other',
    ]);
  });
  it('only opened branches contribute descendants, preserving sibling order', () => {
    expect(visibleTreeNodes(nodes, new Set(['root'])).map(({ node }) => node.key)).toEqual([
      'root',
      'child',
      'other',
    ]);
  });
  it('retains parent and level metadata needed for left-arrow navigation and ARIA', () => {
    expect(visibleTreeNodes(nodes, new Set(['root', 'child']))[2]).toMatchObject({
      node: { key: 'leaf' },
      parent: 'child',
      level: 3,
      position: 1,
      count: 1,
    });
  });
});
