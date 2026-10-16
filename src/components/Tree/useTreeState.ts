import { useMemo, useState } from 'react';

import { flattenVisible, getAllKeys, type TreeDataNode } from './utils';

const EMPTY: string[] = [];

export interface TreeStateOptions {
  defaultExpandAll?: boolean;
  defaultExpandedKeys?: string[];
  defaultSelectedKeys?: string[];
  disabled?: boolean;
  expandedKeys?: string[];
  onExpand?: (keys: string[], info: { expanded: boolean; node: TreeDataNode }) => void;
  onSelect?: (keys: string[], info: { node: TreeDataNode; selected: boolean }) => void;
  selectedKeys?: string[];
  treeData: TreeDataNode[];
}

/**
 * Expanded, selected and roving-focus state for a single-select tree. Each of
 * `expandedKeys` / `selectedKeys` is controlled when passed and owned here
 * otherwise; `defaultExpandAll` only seeds the first render.
 */
export const useTreeState = ({
  defaultExpandAll = false,
  defaultExpandedKeys = EMPTY,
  defaultSelectedKeys = EMPTY,
  disabled = false,
  expandedKeys: expandedKeysProp,
  onExpand,
  onSelect,
  selectedKeys: selectedKeysProp,
  treeData,
}: TreeStateOptions) => {
  const [innerExpanded, setInnerExpanded] = useState(() =>
    defaultExpandAll ? getAllKeys(treeData) : defaultExpandedKeys,
  );
  const [innerSelected, setInnerSelected] = useState(defaultSelectedKeys);
  const [activeKeyState, setActiveKey] = useState<string | null>(null);

  const expandedKeys = expandedKeysProp ?? innerExpanded;
  const selectedKeys = selectedKeysProp ?? innerSelected;
  const expanded = useMemo(() => new Set(expandedKeys), [expandedKeys]);
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const flat = useMemo(() => flattenVisible(treeData, expanded), [treeData, expanded]);

  // The row that takes Tab focus: the last focused row while it is visible,
  // else the first visible selection, else the first row.
  const isVisible = (key: string | null | undefined) =>
    !!key && flat.some((row) => row.node.key === key);
  const activeKey = isVisible(activeKeyState)
    ? activeKeyState
    : (selectedKeys.find(isVisible) ?? flat[0]?.node.key ?? null);

  const toggleExpand = (node: TreeDataNode) => {
    const willExpand = !expanded.has(node.key);
    const next = willExpand
      ? [...expandedKeys, node.key]
      : expandedKeys.filter((key) => key !== node.key);
    if (expandedKeysProp === undefined) setInnerExpanded(next);
    onExpand?.(next, { expanded: willExpand, node });
  };

  const toggleSelect = (node: TreeDataNode) => {
    if (disabled || node.disabled || node.selectable === false) return;
    const next = [node.key];
    if (selectedKeysProp === undefined) setInnerSelected(next);
    setActiveKey(node.key);
    onSelect?.(next, { node, selected: true });
  };

  return { activeKey, expanded, flat, selected, setActiveKey, toggleExpand, toggleSelect };
};
