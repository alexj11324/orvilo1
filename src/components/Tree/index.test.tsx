import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Tree from './index';
import { flattenVisible, getAllKeys, guidePath, type TreeDataNode } from './utils';

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

const row = (title: string) => screen.getByText(title).closest('[role="treeitem"]') as HTMLElement;

describe('Tree utils', () => {
  it('lists keys and only the expanded rows', () => {
    expect(getAllKeys(treeData)).toEqual(['a', 'a-1', 'a-2', 'a-2-1', 'b']);
    expect(flattenVisible(treeData, new Set(['a'])).map((r) => r.node.key)).toEqual([
      'a',
      'a-1',
      'a-2',
      'b',
    ]);
    expect(flattenVisible(treeData, new Set()).map((r) => [r.node.key, r.depth])).toEqual([
      ['a', 0],
      ['b', 0],
    ]);
  });

  it('draws an elbow that stops at the last child', () => {
    expect(guidePath(1, true, [], 20, 36)).toBe('M11.5 0V12A6 6 0 0 0 17.5 18H29.5');
    expect(guidePath(1, false, [], 20, 36)).toBe('M11.5 0V36M11.5 12A6 6 0 0 0 17.5 18H29.5');
  });
});

describe('Tree', () => {
  it('expands everything with defaultExpandAll and toggles a branch from its switcher', () => {
    const onExpand = vi.fn();
    render(<Tree defaultExpandAll treeData={treeData} onExpand={onExpand} />);

    expect(row('A')).toHaveAttribute('aria-expanded', 'true');
    expect(row('A2')).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(row('A2').querySelector('button')!);
    expect(row('A2')).toHaveAttribute('aria-expanded', 'false');
    expect(onExpand).toHaveBeenLastCalledWith(['a', 'a-1', 'a-2-1', 'b'], {
      expanded: false,
      node: treeData[0].children![1],
    });
  });

  it('starts collapsed and selects a whole row in block mode', () => {
    const onSelect = vi.fn();
    render(<Tree blockNode treeData={treeData} onSelect={onSelect} />);

    expect(row('A')).toHaveAttribute('aria-expanded', 'false');
    expect(row('B')).not.toHaveAttribute('aria-expanded');

    fireEvent.click(row('B'));
    expect(onSelect).toHaveBeenCalledWith(['b'], { node: treeData[1], selected: true });
    expect(row('B')).toHaveAttribute('aria-selected', 'true');
  });

  it('navigates and expands with the keyboard', () => {
    const onSelect = vi.fn();
    render(<Tree treeData={treeData} onSelect={onSelect} />);

    const a = row('A');
    expect(a).toHaveAttribute('tabindex', '0');
    a.focus();

    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(row('A')).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(row('A'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(row('A1'));

    fireEvent.keyDown(row('A1'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(row('A'));

    fireEvent.keyDown(row('A'), { key: 'End' });
    expect(document.activeElement).toBe(row('B'));

    fireEvent.keyDown(row('B'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(['b'], { node: treeData[1], selected: true });
  });

  it('forwards right clicks with the node', () => {
    const onRightClick = vi.fn();
    render(<Tree treeData={treeData} onRightClick={onRightClick} />);

    fireEvent.contextMenu(row('B'));
    expect(onRightClick).toHaveBeenCalledWith(expect.objectContaining({ node: treeData[1] }));
  });
});
