'use client';

import { Collapsible } from '@base-ui/react/collapsible';
import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';
import {
  type CSSProperties,
  type KeyboardEvent,
  memo,
  type MouseEvent,
  useMemo,
  useRef,
  useState,
} from 'react';

import { flattenVisible, getAllKeys, guidePath, hasChildren, type TreeDataNode } from './utils';

export type { TreeDataNode } from './utils';

interface TreeSlots<T> {
  guide?: T;
  node?: T;
  root?: T;
  switcher?: T;
  title?: T;
}

export interface TreeProps {
  /** Make the whole row the click target instead of only the title. */
  blockNode?: boolean;
  className?: string;
  classNames?: TreeSlots<string>;
  /** Expand every node on mount. Nodes added later start collapsed. */
  defaultExpandAll?: boolean;
  defaultExpandedKeys?: string[];
  defaultSelectedKeys?: string[];
  disabled?: boolean;
  expandedKeys?: string[];
  /** Horizontal offset per depth level, in pixels. */
  indent?: number;
  onExpand?: (keys: string[], info: { expanded: boolean; node: TreeDataNode }) => void;
  onRightClick?: (info: { event: MouseEvent<HTMLDivElement>; node: TreeDataNode }) => void;
  onSelect?: (keys: string[], info: { node: TreeDataNode; selected: boolean }) => void;
  selectedKeys?: string[];
  /** Draw indent guides connecting each row to its parent. */
  showLine?: boolean;
  style?: CSSProperties;
  styles?: TreeSlots<CSSProperties>;
  treeData: TreeDataNode[];
}

const DEFAULT_ROW_HEIGHT = 32;

const styles = {
  guide:
    'pointer-events-none absolute inset-bs-0 inset-s-0 h-full overflow-visible [&_path]:fill-none [&_path]:stroke-divider [&_path]:stroke-1 [&_path]:[stroke-linecap:round]',
  node: 'group/tree-row relative flex items-center rounded-(--radius-button) text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
  nodeBlock: 'cursor-pointer hover:bg-accent aria-selected:bg-selected',
  nodeDisabled: 'cursor-not-allowed text-foreground-quaternary hover:bg-transparent',
  panel:
    'h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none',
  switcher:
    'grid size-6 flex-none cursor-pointer place-items-center rounded-(--radius-input) border-0 bg-transparent p-0 text-muted-foreground hover:bg-selected hover:text-foreground [&_svg]:transition-transform [&_svg]:duration-200 motion-reduce:[&_svg]:transition-none group-aria-expanded/tree-row:[&_svg]:rotate-90',
  switcherLeaf: 'pointer-events-none invisible',
  title:
    'inline-flex min-w-0 items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap rounded-(--radius-input) px-1.5 py-0.5',
  titleBlock: 'flex-1',
  titleInline:
    'cursor-pointer hover:bg-accent group-aria-selected/tree-row:bg-selected group-aria-disabled/tree-row:cursor-not-allowed group-aria-disabled/tree-row:bg-transparent',
};

interface TreeContextValue {
  activeKey: string | null;
  blockNode: boolean;
  classNames: TreeSlots<string>;
  disabled: boolean;
  expanded: ReadonlySet<string>;
  indent: number;
  onRightClick: (event: MouseEvent<HTMLDivElement>, node: TreeDataNode) => void;
  rowHeight: number;
  selected: ReadonlySet<string>;
  setActiveKey: (key: string) => void;
  showLine: boolean;
  slotStyles: TreeSlots<CSSProperties>;
  toggleExpand: (node: TreeDataNode) => void;
  toggleSelect: (node: TreeDataNode) => void;
}

interface TreeNodeProps {
  ctx: TreeContextValue;
  depth: number;
  isLast: boolean;
  node: TreeDataNode;
  trail: boolean[];
}

const TreeNode = ({ ctx, depth, isLast, node, trail }: TreeNodeProps) => {
  const expandable = hasChildren(node);
  const expanded = expandable && ctx.expanded.has(node.key);
  const disabled = ctx.disabled || !!node.disabled;
  const select = () => ctx.toggleSelect(node);

  return (
    <>
      <div
        aria-disabled={disabled || undefined}
        aria-expanded={expandable ? expanded : undefined}
        aria-level={depth + 1}
        aria-selected={ctx.selected.has(node.key)}
        data-key={node.key}
        role="treeitem"
        tabIndex={ctx.activeKey === node.key ? 0 : -1}
        className={cn(
          styles.node,
          ctx.blockNode && styles.nodeBlock,
          disabled && styles.nodeDisabled,
          ctx.classNames.node,
        )}
        style={{
          height: ctx.rowHeight,
          paddingInlineStart: depth * ctx.indent,
          ...ctx.slotStyles.node,
        }}
        onClick={ctx.blockNode ? select : undefined}
        onContextMenu={(event) => ctx.onRightClick(event, node)}
        onFocus={() => ctx.setActiveKey(node.key)}
      >
        {ctx.showLine && depth > 0 && (
          <svg
            aria-hidden
            className={cn(styles.guide, ctx.classNames.guide)}
            height={ctx.rowHeight}
            style={ctx.slotStyles.guide}
            width={depth * ctx.indent}
          >
            <path d={guidePath(depth, isLast, trail, ctx.indent, ctx.rowHeight)} />
          </svg>
        )}
        <button
          aria-hidden
          style={ctx.slotStyles.switcher}
          tabIndex={-1}
          type="button"
          className={cn(
            styles.switcher,
            !expandable && styles.switcherLeaf,
            ctx.classNames.switcher,
          )}
          onClick={(event) => {
            event.stopPropagation();
            ctx.toggleExpand(node);
          }}
        >
          <ChevronRight size={14} />
        </button>
        <span
          style={ctx.slotStyles.title}
          className={cn(
            styles.title,
            ctx.blockNode ? styles.titleBlock : styles.titleInline,
            ctx.classNames.title,
          )}
          onClick={ctx.blockNode ? undefined : select}
        >
          {node.title}
        </span>
      </div>
      {expandable && (
        <Collapsible.Root open={expanded}>
          <Collapsible.Panel className={styles.panel}>
            {node.children.map((child, i) => (
              <TreeNode
                ctx={ctx}
                depth={depth + 1}
                isLast={i === node.children.length - 1}
                key={child.key}
                node={child}
                trail={[...trail, !isLast]}
              />
            ))}
          </Collapsible.Panel>
        </Collapsible.Root>
      )}
    </>
  );
};

const EMPTY: string[] = [];

/**
 * Single-select tree with indent guides, animated expand/collapse and
 * WAI-ARIA tree keyboard navigation (arrows, Home/End, Enter/Space).
 */
const Tree = memo<TreeProps>(
  ({
    blockNode = false,
    className,
    classNames = {},
    defaultExpandAll = false,
    defaultExpandedKeys = EMPTY,
    defaultSelectedKeys = EMPTY,
    disabled = false,
    expandedKeys: expandedKeysProp,
    indent = 20,
    onExpand,
    onRightClick,
    onSelect,
    selectedKeys: selectedKeysProp,
    showLine = false,
    style,
    styles: slotStyles = {},
    treeData,
  }) => {
    const [innerExpanded, setInnerExpanded] = useState(() =>
      defaultExpandAll ? getAllKeys(treeData) : defaultExpandedKeys,
    );
    const [innerSelected, setInnerSelected] = useState(defaultSelectedKeys);
    const [activeKeyState, setActiveKey] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    const expandedKeys = expandedKeysProp ?? innerExpanded;
    const selectedKeys = selectedKeysProp ?? innerSelected;
    const expanded = useMemo(() => new Set(expandedKeys), [expandedKeys]);
    const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);
    const flat = useMemo(() => flattenVisible(treeData, expanded), [treeData, expanded]);

    const isVisible = (key: string | null | undefined) =>
      !!key && flat.some((row) => row.node.key === key);
    const activeKey = isVisible(activeKeyState)
      ? activeKeyState
      : (selectedKeys.find(isVisible) ?? flat[0]?.node.key ?? null);

    const setExpandedKeys = (next: string[], node: TreeDataNode, willExpand: boolean) => {
      if (expandedKeysProp === undefined) setInnerExpanded(next);
      onExpand?.(next, { expanded: willExpand, node });
    };

    const toggleExpand = (node: TreeDataNode) => {
      const willExpand = !expanded.has(node.key);
      setExpandedKeys(
        willExpand ? [...expandedKeys, node.key] : expandedKeys.filter((key) => key !== node.key),
        node,
        willExpand,
      );
    };

    const toggleSelect = (node: TreeDataNode) => {
      if (disabled || node.disabled || node.selectable === false) return;
      const next = [node.key];
      if (selectedKeysProp === undefined) setInnerSelected(next);
      setActiveKey(node.key);
      onSelect?.(next, { node, selected: true });
    };

    const focusRow = (key: string) => {
      setActiveKey(key);
      rootRef.current
        ?.querySelector<HTMLElement>(`[role="treeitem"][data-key="${CSS.escape(key)}"]`)
        ?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      const current = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
      const index = flat.findIndex((row) => row.node.key === current?.dataset.key);
      const row = flat[index];
      if (!row) return;

      const actions: Record<string, () => void> = {
        ' ': () => toggleSelect(row.node),
        'ArrowDown': () => flat[index + 1] && focusRow(flat[index + 1].node.key),
        'ArrowLeft': () => {
          if (row.hasChildren && expanded.has(row.node.key)) toggleExpand(row.node);
          else if (row.parentKey) focusRow(row.parentKey);
        },
        'ArrowRight': () => {
          if (!row.hasChildren) return;
          if (expanded.has(row.node.key)) focusRow(flat[index + 1].node.key);
          else toggleExpand(row.node);
        },
        'ArrowUp': () => flat[index - 1] && focusRow(flat[index - 1].node.key),
        'End': () => focusRow(flat.at(-1)!.node.key),
        'Enter': () => toggleSelect(row.node),
        'Home': () => focusRow(flat[0].node.key),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };

    const ctx: TreeContextValue = {
      activeKey,
      blockNode,
      classNames,
      disabled,
      expanded,
      indent,
      onRightClick: (event, node) => onRightClick?.({ event, node }),
      rowHeight:
        typeof slotStyles.node?.height === 'number' ? slotStyles.node.height : DEFAULT_ROW_HEIGHT,
      selected,
      setActiveKey,
      showLine,
      slotStyles,
      toggleExpand,
      toggleSelect,
    };

    return (
      <div
        className={cn('flex select-none flex-col outline-none', classNames.root, className)}
        ref={rootRef}
        role="tree"
        style={{ ...slotStyles.root, ...style }}
        onKeyDown={handleKeyDown}
      >
        {treeData.map((node, i) => (
          <TreeNode
            ctx={ctx}
            depth={0}
            isLast={i === treeData.length - 1}
            key={node.key}
            node={node}
            trail={[]}
          />
        ))}
      </div>
    );
  },
);
Tree.displayName = 'Tree';

export default Tree;
