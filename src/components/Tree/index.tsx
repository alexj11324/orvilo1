'use client';

import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';
import type { ComponentProps, CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';

export interface TreeDataNode {
  children?: TreeDataNode[];
  disabled?: boolean;
  icon?: ReactNode;
  key: string;
  label?: string;
  selectable?: boolean;
  title: ReactNode;
}

export interface TreeProps extends Omit<ComponentProps<'div'>, 'onSelect'> {
  blockNode?: boolean;
  classNames?: { node?: string; title?: string };
  defaultExpandAll?: boolean;
  defaultExpandedKeys?: string[];
  defaultSelectedKeys?: string[];
  expandedKeys?: string[];
  onExpand?: (keys: string[], info: { expanded: boolean; node: TreeDataNode }) => void;
  onRightClick?: (info: { event: MouseEvent; node: TreeDataNode }) => void;
  onSelect?: (
    keys: string[],
    info: { selected: boolean; node: TreeDataNode; event: MouseEvent | KeyboardEvent },
  ) => void;
  selectedKeys?: string[];
  showIcon?: boolean;
  showLine?: boolean;
  styles?: { node?: CSSProperties; title?: CSSProperties };
  treeData: TreeDataNode[];
}

interface VisibleNode {
  count: number;
  level: number;
  node: TreeDataNode;
  parent?: string;
  position: number;
}

export function visibleTreeNodes(
  nodes: TreeDataNode[],
  expanded: Set<string>,
  level = 1,
  parent?: string,
): VisibleNode[] {
  return nodes.flatMap((node, index) => [
    { node, level, parent, position: index + 1, count: nodes.length },
    ...(expanded.has(node.key)
      ? visibleTreeNodes(node.children ?? [], expanded, level + 1, node.key)
      : []),
  ]);
}

function allBranchKeys(nodes: TreeDataNode[]): string[] {
  return nodes.flatMap((node) =>
    node.children?.length ? [node.key, ...allBranchKeys(node.children)] : [],
  );
}

export function Tree({
  blockNode,
  className,
  classNames,
  defaultExpandAll,
  defaultExpandedKeys,
  defaultSelectedKeys = [],
  expandedKeys,
  onExpand,
  onRightClick,
  onSelect,
  selectedKeys,
  showIcon,
  showLine,
  styles,
  treeData,
  ...props
}: TreeProps) {
  const [internalExpanded, setInternalExpanded] = useState<string[]>(
    () => defaultExpandedKeys ?? (defaultExpandAll ? allBranchKeys(treeData) : []),
  );
  const [internalSelected, setInternalSelected] = useState(defaultSelectedKeys);
  const expanded = new Set(expandedKeys ?? internalExpanded);
  const selected = selectedKeys ?? internalSelected;
  const rows = visibleTreeNodes(treeData, expanded);
  const [focused, setFocused] = useState<string>();
  const references = useRef<Map<string, HTMLDivElement> | null>(null);
  const focusable = rows.filter(({ node }) => !node.disabled);
  const focusKey = focusable.some(({ node }) => node.key === focused)
    ? focused
    : focusable[0]?.node.key;
  const focus = (key?: string) => {
    if (key) {
      setFocused(key);
      references.current?.get(key)?.focus();
    }
  };
  const toggle = (node: TreeDataNode) => {
    if (node.disabled || !node.children?.length) return;
    const next = new Set(expanded);
    const open = !next.has(node.key);
    if (open) next.add(node.key);
    else next.delete(node.key);
    const keys = [...next];
    if (expandedKeys === undefined) setInternalExpanded(keys);
    onExpand?.(keys, { expanded: open, node });
  };
  const select = (node: TreeDataNode, event: MouseEvent | KeyboardEvent) => {
    if (node.disabled || node.selectable === false) return;
    const keys = [node.key];
    if (selectedKeys === undefined) setInternalSelected(keys);
    onSelect?.(keys, { selected: true, node, event });
  };
  const keyboard = (row: VisibleNode, event: KeyboardEvent<HTMLDivElement>) => {
    // Editors, menus and assignee/status controls own their own keyboard events.
    if (event.target !== event.currentTarget) return;
    const index = focusable.findIndex(({ node }) => node.key === row.node.key);
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        focus(focusable[Math.min(index + 1, focusable.length - 1)]?.node.key);
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        focus(focusable[Math.max(index - 1, 0)]?.node.key);
        break;
      }
      case 'Home': {
        event.preventDefault();
        focus(focusable[0]?.node.key);
        break;
      }
      case 'End': {
        event.preventDefault();
        focus(focusable.at(-1)?.node.key);
        break;
      }
      case 'ArrowRight': {
        event.preventDefault();
        if (!expanded.has(row.node.key)) toggle(row.node);
        else focus(row.node.children?.find((node) => !node.disabled)?.key);
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        if (expanded.has(row.node.key)) toggle(row.node);
        else focus(row.parent);
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        select(row.node, event);
        break;
      }
      case 'ContextMenu': {
        event.preventDefault();
        // This is a native event so the existing menu channel receives real DOM coordinates.
        event.currentTarget.dispatchEvent(
          new globalThis.MouseEvent('contextmenu', {
            bubbles: true,
            clientX: event.currentTarget.getBoundingClientRect().left,
            clientY: event.currentTarget.getBoundingClientRect().bottom,
          }),
        );
        break;
      }
      case 'F10': {
        if (event.shiftKey) {
          event.preventDefault();
          event.currentTarget.dispatchEvent(
            new globalThis.MouseEvent('contextmenu', {
              bubbles: true,
              clientX: event.currentTarget.getBoundingClientRect().left,
              clientY: event.currentTarget.getBoundingClientRect().bottom,
            }),
          );
        }
        break;
      }
    }
  };
  return (
    <div
      className={cn('flex min-w-0 flex-col text-sm text-foreground', className)}
      role="tree"
      {...props}
    >
      {rows.map((row) => {
        const { node, level } = row;
        const open = expanded.has(node.key);
        const branch = Boolean(node.children?.length);
        return (
          <div
            aria-disabled={node.disabled || undefined}
            aria-expanded={branch ? open : undefined}
            aria-label={node.label ?? (typeof node.title === 'string' ? node.title : node.key)}
            aria-level={level}
            aria-posinset={row.position}
            aria-selected={selected.includes(node.key)}
            aria-setsize={row.count}
            key={node.key}
            role="treeitem"
            style={{ paddingInlineStart: (level - 1) * 16, ...styles?.node }}
            tabIndex={node.key === focusKey ? 0 : -1}
            className={cn(
              'flex min-h-9 min-w-0 items-center gap-1 rounded-(--radius-button) hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected.includes(node.key) && 'bg-selected',
              node.disabled && 'cursor-not-allowed text-foreground-quaternary',
              blockNode && 'w-full',
              classNames?.node,
            )}
            ref={(element) => {
              if (element) {
                references.current ??= new Map<string, HTMLDivElement>();
                references.current.set(node.key, element);
              } else references.current?.delete(node.key);
            }}
            onFocus={() => setFocused(node.key)}
            onKeyDown={(event) => keyboard(row, event)}
            onClick={(event) => {
              if (
                node.disabled ||
                (event.target instanceof Element &&
                  event.target.closest(
                    'button, input, select, textarea, a, [role=button], [role=combobox], [role=menuitem]',
                  ))
              )
                return;
              focus(node.key);
              select(node, event);
            }}
            onContextMenu={(event) => {
              if (!node.disabled) onRightClick?.({ event, node });
            }}
          >
            <span
              className={cn(
                'flex h-full w-5 shrink-0 items-center justify-center',
                showLine && level > 1 && 'border-s border-divider',
              )}
            >
              {branch && (
                <button
                  aria-expanded={open}
                  aria-label={node.label ?? node.key}
                  className="flex h-7 w-5 items-center justify-center rounded-(--radius-input) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={node.disabled}
                  tabIndex={-1}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(node);
                  }}
                >
                  <ChevronRight className={cn('size-3.5', open && 'rotate-90')} />
                </button>
              )}
            </span>
            {showIcon && node.icon}
            <div className={cn('min-w-0 flex-1', classNames?.title)} style={styles?.title}>
              {node.title}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Tree;
