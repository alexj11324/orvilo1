import { SkillsIcon } from '@lobehub/ui/icons';
import { EMPTY_ARRAY } from '@orvilo/const';
import type { SFSymbol } from '@orvilo/electron-client-ipc';
import { cn } from 'cn';
import { ChevronRightIcon, FileIcon, FolderIcon, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

type GenericItemType = {
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  key: string;
  label: ReactNode;
  onClick?: () => void;
};

export interface SkillListItem {
  description?: string;
  /**
   * File count shown next to the name. Omit (or pass 0) for atomic skills with
   * no embedded files — e.g. user-level skills sourced from MCP servers.
   */
  fileCount?: number;
  /**
   * Optional file tree for skills that bundle markdown/script assets. When
   * empty or omitted the row stays atomic (no chevron, no expansion).
   */
  files?: string[];
  id: string;
  name: string;
  /** Filesystem skill scope when the row comes from a device scan. */
  scope?: 'device' | 'project';
}

/**
 * A per-row action (view / rename / delete …). The same descriptor drives both
 * the hover-revealed icon button on the right of the row and the right-click
 * context menu, so callers wire each capability once. Disabled actions render
 * greyed (used for not-yet-supported operations, e.g. mutating filesystem
 * project skills).
 */
export interface SkillRowAction {
  danger?: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  key: string;
  label: string;
  onClick: (item: SkillListItem) => void;
  sfSymbol?: SFSymbol;
  /** Hover-icon tooltip; falls back to `label`. Use for "coming soon" hints. */
  tooltip?: string;
}

interface SkillsListProps {
  /**
   * Per-row actions. When this returns a non-empty array the row gains a
   * hover-revealed action cluster (right side, swaps with the file count) and a
   * right-click context menu sharing the same actions. Return `[]`/omit for
   * read-only rows (no menu, native right-click preserved).
   */
  getRowActions?: (item: SkillListItem) => SkillRowAction[];
  items: SkillListItem[];
  onOpenFile?: (item: SkillListItem, relativePath: string) => void;
  onOpenSkill?: (item: SkillListItem) => void;
  /**
   * When provided, each skill row becomes draggable and this fires on dragstart.
   * The handler is expected to write the drag payload onto `event.dataTransfer`
   * (see `writeSkillDragData`), letting the chat input resolve it on drop.
   */
  onSkillDragStart?: (item: SkillListItem, event: React.DragEvent) => void;
}

const styles = {
  chevron:
    'shrink-0 text-muted-foreground transition-transform duration-(--orvilo-motion-fast) ease-in-out motion-reduce:transition-none',
  chevronExpanded: 'rotate-90',
  childItem:
    'cursor-pointer h-8 pe-2 rounded-(--radius-button) text-sm leading-5.5 text-foreground hover:bg-accent',
  childItemIcon: 'shrink-0 text-muted-foreground',
  description: 'max-w-80 text-xs leading-5',
  item: 'group/skill-row cursor-pointer h-8 ps-1 pe-2 rounded-(--radius-button) text-sm leading-5.5 text-foreground hover:bg-accent',
  itemCount:
    'shrink-0 text-xs leading-5 tabular-nums text-muted-foreground group-hover/skill-row:hidden group-focus-within/skill-row:hidden',
  rowAction:
    'cursor-pointer flex size-8 items-center justify-center rounded-(--radius-button) text-muted-foreground transition-colors duration-(--orvilo-motion-mid) hover:text-foreground hover:bg-selected motion-reduce:transition-none',
  rowActionDanger: 'hover:text-destructive-text hover:bg-destructive-wash',
  rowActionDisabled:
    'cursor-not-allowed text-foreground-quaternary hover:text-foreground-quaternary hover:bg-transparent',
  rowActions:
    'hidden flex-none items-center gap-0.5 group-hover/skill-row:flex group-focus-within/skill-row:flex',
  itemIcon: 'shrink-0 text-muted-foreground',
  treeChevronSlot: 'flex shrink-0 items-center justify-center size-3.5',
};

interface TreeNode {
  children: TreeNode[];
  isDirectory: boolean;
  name: string;
  path: string;
}

const buildSkillTree = (paths: string[]): TreeNode[] => {
  const root: TreeNode = { children: [], isDirectory: true, name: '', path: '' };

  for (const fullPath of paths) {
    const parts = fullPath.split('/').filter(Boolean);
    let current = root;
    let accumPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumPath = accumPath ? `${accumPath}/${part}` : part;
      const isDirectory = i < parts.length - 1;

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = { children: [], isDirectory, name: part, path: accumPath };
        current.children.push(child);
      }
      current = child;
    }
  }

  const sortNode = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) sortNode(child);
  };
  sortNode(root);

  return root.children;
};

const TREE_BASE_INSET = 24;
const TREE_DEPTH_INDENT = 14;

interface TreeRowProps {
  depth: number;
  expanded: Set<string>;
  node: TreeNode;
  onOpenFile: (relativePath: string) => void;
  onToggleFolder: (folderPath: string) => void;
}

const TreeRow = memo<TreeRowProps>(({ depth, expanded, node, onOpenFile, onToggleFolder }) => {
  const isOpen = expanded.has(node.path);
  const paddingInlineStart = TREE_BASE_INSET + depth * TREE_DEPTH_INDENT;

  if (node.isDirectory) {
    return (
      <>
        <div
          {...clickableProps()}
          className={cn('flex items-center gap-1.5', styles.childItem, CLICKABLE_FOCUS_RING)}
          style={{ paddingInlineStart }}
          onClick={() => onToggleFolder(node.path)}
        >
          <span className={styles.treeChevronSlot}>
            <ChevronRightIcon
              className={`${styles.chevron} ${isOpen ? styles.chevronExpanded : ''}`}
              size={12}
            />
          </span>
          <FolderIcon className={styles.childItemIcon} size={12} />
          <div className="min-w-0 flex-1 truncate text-inherit">{node.name}</div>
        </div>
        {isOpen &&
          node.children.map((child) => (
            <TreeRow
              depth={depth + 1}
              expanded={expanded}
              key={child.path}
              node={child}
              onOpenFile={onOpenFile}
              onToggleFolder={onToggleFolder}
            />
          ))}
      </>
    );
  }

  return (
    <div
      {...clickableProps()}
      className={cn('flex items-center gap-1.5', styles.childItem, CLICKABLE_FOCUS_RING)}
      style={{ paddingInlineStart }}
      title={node.path}
      onClick={() => onOpenFile(node.path)}
    >
      <span className={styles.treeChevronSlot} />
      <FileIcon className={styles.childItemIcon} size={12} />
      <div className="min-w-0 flex-1 truncate text-inherit">{node.name}</div>
    </div>
  );
});

TreeRow.displayName = 'SkillsListTreeRow';

interface SkillRowProps {
  expanded: boolean;
  getRowActions?: (item: SkillListItem) => SkillRowAction[];
  item: SkillListItem;
  onOpenFile?: (item: SkillListItem, relativePath: string) => void;
  onOpenSkill?: (item: SkillListItem) => void;
  onSkillDragStart?: (item: SkillListItem, event: React.DragEvent) => void;
  onToggle: (id: string) => void;
  reserveChevronSlot: boolean;
}

// Rows receive the list-level handlers plus `item` (instead of pre-bound
// closures) so a parent re-render with unchanged data keeps every row's props
// referentially equal and the memo actually bails out.
const SkillRow = memo<SkillRowProps>(
  ({
    expanded,
    getRowActions,
    item,
    onOpenFile,
    onOpenSkill,
    onSkillDragStart,
    onToggle,
    reserveChevronSlot,
  }) => {
    const files = item.files ?? EMPTY_ARRAY;
    const hasFiles = files.length > 0;
    const actions = useMemo(() => getRowActions?.(item) ?? EMPTY_ARRAY, [getRowActions, item]);
    const hasActions = actions.length > 0;
    const tree = useMemo(() => buildSkillTree(files), [files]);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());

    const toggleFolder = useCallback((folderPath: string) => {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        if (next.has(folderPath)) next.delete(folderPath);
        else next.add(folderPath);
        return next;
      });
    }, []);

    const openFile = useCallback(
      (relativePath: string) => onOpenFile?.(item, relativePath),
      [item, onOpenFile],
    );

    const contextMenuItems = useCallback(
      (): (GenericItemType & { sfSymbol?: SFSymbol })[] =>
        actions.map((action) => ({
          danger: action.danger,
          disabled: action.disabled,
          icon: <action.icon />,
          key: action.key,
          label: action.label,
          onClick: () => action.onClick(item),
          sfSymbol: action.sfSymbol,
        })),
      [actions, item],
    );

    // The description Tooltip wraps just the name (a ref-forwarding leaf) and the
    // ContextMenuTrigger wraps just the row Flexbox — both cloning wrappers get
    // a clean DOM-forwarding child. Nesting them (Tooltip around the trigger, or
    // vice versa) would drop `onContextMenu` / the ref on the way through.
    const nameNode = (
      <div
        {...clickableProps(onOpenSkill)}
        className={cn('min-w-0 flex-1 truncate text-inherit', CLICKABLE_FOCUS_RING)}
        onClick={onOpenSkill ? () => onOpenSkill(item) : undefined}
      >
        {item.name}
      </div>
    );

    const row = (
      <div
        className={cn('flex items-center gap-1.5', styles.item)}
        draggable={!!onSkillDragStart}
        onDragStart={onSkillDragStart ? (event) => onSkillDragStart(item, event) : undefined}
      >
        {hasFiles ? (
          <div
            {...clickableProps()}
            aria-expanded={expanded}
            className={cn(
              'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-button)',
              CLICKABLE_FOCUS_RING,
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(item.id);
            }}
          >
            <ChevronRightIcon
              className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`}
              size={14}
            />
          </div>
        ) : reserveChevronSlot ? (
          <span className="size-8 shrink-0" />
        ) : null}
        <SkillsIcon className={styles.itemIcon} size={14} />
        {item.description ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={<span className="inline-flex min-w-0 flex-1">{nameNode}</span>}
              />
              <TooltipContent side="left">
                <span className={styles.description}>{item.description}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          nameNode
        )}
        {typeof item.fileCount === 'number' && item.fileCount > 0 && (
          <span className={cn('skill-row-count', styles.itemCount)}>{item.fileCount}</span>
        )}
        {hasActions && (
          <div className={cn('skill-row-actions', styles.rowActions)} draggable={false}>
            {actions.map((action) => (
              <TooltipProvider key={action.key}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex min-w-0">
                        <div
                          role={'button'}
                          className={cn(
                            styles.rowAction,
                            action.danger && !action.disabled && styles.rowActionDanger,
                            action.disabled && styles.rowActionDisabled,
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (action.disabled) return;
                            action.onClick(item);
                          }}
                        >
                          <action.icon size={14} />
                        </div>
                      </span>
                    }
                  />
                  <TooltipContent>{action.tooltip ?? action.label}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        )}
      </div>
    );

    return (
      <>
        {hasActions ? (
          <ContextMenu>
            <ContextMenuTrigger>{row}</ContextMenuTrigger>
            <ContextMenuContent>
              {contextMenuItems().map((menuItem) => (
                <ContextMenuItem
                  disabled={menuItem.disabled}
                  key={menuItem.key}
                  variant={menuItem.danger ? 'destructive' : 'default'}
                  onClick={menuItem.onClick}
                >
                  {menuItem.icon}
                  {menuItem.label}
                </ContextMenuItem>
              ))}
            </ContextMenuContent>
          </ContextMenu>
        ) : (
          row
        )}
        {expanded &&
          hasFiles &&
          onOpenFile &&
          tree.map((node) => (
            <TreeRow
              depth={0}
              expanded={expandedFolders}
              key={node.path}
              node={node}
              onOpenFile={openFile}
              onToggleFolder={toggleFolder}
            />
          ))}
      </>
    );
  },
);

SkillRow.displayName = 'SkillsListSkillRow';

const SkillsList = memo<SkillsListProps>(
  ({ getRowActions, items, onOpenFile, onOpenSkill, onSkillDragStart }) => {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

    const toggle = useCallback((id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }, []);

    const reserveChevronSlot = useMemo(
      () => items.some((item) => (item.files?.length ?? 0) > 0),
      [items],
    );

    return (
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <SkillRow
            expanded={expanded.has(item.id)}
            getRowActions={getRowActions}
            item={item}
            key={item.id}
            reserveChevronSlot={reserveChevronSlot}
            onOpenFile={onOpenFile}
            onOpenSkill={onOpenSkill}
            onSkillDragStart={onSkillDragStart}
            onToggle={toggle}
          />
        ))}
      </div>
    );
  },
);

SkillsList.displayName = 'SkillsList';

export default SkillsList;
