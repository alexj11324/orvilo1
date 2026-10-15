import type { ReactNode } from 'react';

export interface TreeDataNode {
  children?: TreeDataNode[];
  disabled?: boolean;
  isLeaf?: boolean;
  key: string;
  selectable?: boolean;
  title: ReactNode;
}

export interface TreeFlatRow {
  depth: number;
  hasChildren: boolean;
  node: TreeDataNode;
  parentKey: string | null;
}

export const hasChildren = (
  node: TreeDataNode,
): node is TreeDataNode & {
  children: TreeDataNode[];
} => !node.isLeaf && !!node.children && node.children.length > 0;

/** Every key in the tree, parents before their children. */
export const getAllKeys = (data: TreeDataNode[], out: string[] = []): string[] => {
  for (const node of data) {
    out.push(node.key);
    if (node.children) getAllKeys(node.children, out);
  }
  return out;
};

/** The rows a reader can currently see, in document order. */
export const flattenVisible = (
  data: TreeDataNode[],
  expanded: ReadonlySet<string>,
  depth = 0,
  parentKey: string | null = null,
  out: TreeFlatRow[] = [],
): TreeFlatRow[] => {
  for (const node of data) {
    const expandable = hasChildren(node);
    out.push({ depth, hasChildren: expandable, node, parentKey });
    if (expandable && expanded.has(node.key))
      flattenVisible(node.children, expanded, depth + 1, node.key, out);
  }
  return out;
};

const ARC = 6;
const SWITCHER_CENTER = 11.5;

/**
 * SVG path for the indent guides of one row: a vertical line for each open
 * ancestor branch plus a rounded elbow into this row.
 */
export const guidePath = (
  depth: number,
  isLast: boolean,
  trail: boolean[],
  indent: number,
  height: number,
) => {
  const centerX = (i: number) => i * indent + SWITCHER_CENTER;
  let d = '';
  trail.forEach((more, i) => {
    if (more && i > 0) d += `M${centerX(i)} 0V${height}`;
  });
  const x = centerX(depth - 1);
  const y = height / 2;
  const curve = `A${ARC} ${ARC} 0 0 0 ${x + ARC} ${y}H${x + indent - 2}`;
  d += isLast ? `M${x} 0V${y - ARC}${curve}` : `M${x} 0V${height}M${x} ${y - ARC}${curve}`;
  return d;
};

export type TreeKeyAction =
  | { key: string; type: 'focus' }
  | { node: TreeDataNode; type: 'select' }
  | { node: TreeDataNode; type: 'toggle' };

/**
 * WAI-ARIA tree keyboard model: what a key press on the focused row does.
 * Returns `undefined` for keys the tree does not handle.
 */
export const resolveTreeKey = (
  flat: TreeFlatRow[],
  expanded: ReadonlySet<string>,
  currentKey: string | undefined,
  key: string,
): TreeKeyAction | undefined => {
  const index = flat.findIndex((row) => row.node.key === currentKey);
  const row = flat[index];
  if (!row) return;
  const focus = (target?: TreeFlatRow): TreeKeyAction | undefined =>
    target && { key: target.node.key, type: 'focus' };

  switch (key) {
    case ' ':
    case 'Enter': {
      return { node: row.node, type: 'select' };
    }
    case 'ArrowDown': {
      return focus(flat[index + 1]);
    }
    case 'ArrowUp': {
      return focus(flat[index - 1]);
    }
    case 'Home': {
      return focus(flat[0]);
    }
    case 'End': {
      return focus(flat.at(-1));
    }
    case 'ArrowRight': {
      if (!row.hasChildren) return;
      return expanded.has(row.node.key)
        ? focus(flat[index + 1])
        : { node: row.node, type: 'toggle' };
    }
    case 'ArrowLeft': {
      if (row.hasChildren && expanded.has(row.node.key)) return { node: row.node, type: 'toggle' };
      return row.parentKey ? { key: row.parentKey, type: 'focus' } : undefined;
    }
  }
};
