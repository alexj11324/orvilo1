import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useTreeState } from './useTreeState';
import type { TreeDataNode } from './utils';

const treeData: TreeDataNode[] = [
  {
    children: [
      { key: 'a-1', title: 'A1' },
      { children: [{ key: 'a-2-1', title: 'A21' }], key: 'a-2', title: 'A2' },
    ],
    key: 'a',
    title: 'A',
  },
  { disabled: true, key: 'b', title: 'B' },
];

describe('useTreeState', () => {
  it('starts collapsed and expands a branch', () => {
    const onExpand = vi.fn();
    const { result } = renderHook(() => useTreeState({ onExpand, treeData }));

    expect(result.current.flat.map((r) => r.node.key)).toEqual(['a', 'b']);
    expect(result.current.activeKey).toBe('a');

    act(() => result.current.toggleExpand(treeData[0]));
    expect(result.current.flat.map((r) => r.node.key)).toEqual(['a', 'a-1', 'a-2', 'b']);
    expect(onExpand).toHaveBeenCalledWith(['a'], { expanded: true, node: treeData[0] });
  });

  it('expands everything with defaultExpandAll and collapses one branch', () => {
    const onExpand = vi.fn();
    const { result } = renderHook(() =>
      useTreeState({ defaultExpandAll: true, onExpand, treeData }),
    );

    expect(result.current.flat).toHaveLength(5);

    act(() => result.current.toggleExpand(treeData[0].children![1]));
    expect(result.current.expanded.has('a-2')).toBe(false);
    expect(onExpand).toHaveBeenLastCalledWith(['a', 'a-1', 'a-2-1', 'b'], {
      expanded: false,
      node: treeData[0].children![1],
    });
  });

  it('defers to controlled expanded keys', () => {
    const onExpand = vi.fn();
    const { result } = renderHook(() => useTreeState({ expandedKeys: [], onExpand, treeData }));

    act(() => result.current.toggleExpand(treeData[0]));
    expect(onExpand).toHaveBeenCalledWith(['a'], { expanded: true, node: treeData[0] });
    expect(result.current.expanded.size).toBe(0);
  });

  it('selects one row, skips disabled rows and moves the roving focus', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useTreeState({ defaultExpandAll: true, onSelect, treeData }),
    );

    act(() => result.current.toggleSelect(treeData[0].children![0]));
    expect(onSelect).toHaveBeenCalledWith(['a-1'], {
      node: treeData[0].children![0],
      selected: true,
    });
    expect(result.current.selected.has('a-1')).toBe(true);
    expect(result.current.activeKey).toBe('a-1');

    act(() => result.current.toggleSelect(treeData[1]));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(result.current.selected.has('b')).toBe(false);
  });

  it('falls back to a visible row when the focused row collapses away', () => {
    const { result } = renderHook(() => useTreeState({ defaultExpandAll: true, treeData }));

    act(() => result.current.setActiveKey('a-2-1'));
    expect(result.current.activeKey).toBe('a-2-1');

    act(() => result.current.toggleExpand(treeData[0]));
    expect(result.current.activeKey).toBe('a');
  });
});
