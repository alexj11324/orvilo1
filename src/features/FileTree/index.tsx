'use client';

import type { SkillResourceTreeNode } from '@orvilo/types';
import { cn } from 'cn';
import { ChevronDown, ChevronRight, File, FolderIcon, FolderOpenIcon } from 'lucide-react';
import { createElement, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import {
  renderSidebarMenuItems,
  type SidebarMenuItems,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import nativeStyles from './FileTree.module.css';

const styles = {
  item: 'flex min-h-8 cursor-pointer items-center gap-1.5 pe-2 rounded-(--radius-button) text-sm leading-5.5 hover:bg-muted',
  itemSelected: 'bg-selected text-primary-text hover:bg-selected',
  label: 'min-w-0 truncate',
  editingInput: nativeStyles.editingInput,
};

interface FileTreeProps {
  editableFilePath?: string | null;
  getFileContextMenuItems?: (file: { name: string; path: string }) => SidebarMenuItems;
  onCancelRenameFile?: () => void;
  onCommitRenameFile?: (
    file: { name: string; path: string },
    newName: string,
  ) => Promise<void> | void;
  onSelectFile: (path: string) => void;
  resourceTree: SkillResourceTreeNode[];
  rootFile?: {
    label: string;
    path: string;
  } | null;
  selectedFile: string;
}

const TreeNode = memo<{
  depth: number;
  editableFilePath?: string | null;
  expandedFolders: Set<string>;
  getFileContextMenuItems?: (file: { name: string; path: string }) => SidebarMenuItems;
  node: SkillResourceTreeNode;
  onCancelRenameFile?: () => void;
  onCommitRenameFile?: (
    file: { name: string; path: string },
    newName: string,
  ) => Promise<void> | void;
  onSelectFile: (_path: string) => void;
  onToggleFolder: (_path: string) => void;
  selectedFile: string;
}>(
  ({
    node,
    depth,
    selectedFile,
    onSelectFile,
    expandedFolders,
    onToggleFolder,
    getFileContextMenuItems,
    editableFilePath,
    onCancelRenameFile,
    onCommitRenameFile,
  }) => {
    const isDir = node.type === 'directory';
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = !isDir && selectedFile === node.path;
    const isEditing = !isDir && editableFilePath === node.path && !!onCommitRenameFile;
    const [editingName, setEditingName] = useState(node.name);
    const inputRef = useRef<HTMLInputElement>(null);
    const isSubmittingRef = useRef(false);

    useEffect(() => {
      if (!isEditing) return;

      setEditingName(node.name);
      requestAnimationFrame(() => {
        inputRef.current?.focus?.();
        inputRef.current?.select?.();
      });
    }, [isEditing, node.name]);

    const handleClick = () => {
      if (isEditing) return;

      if (isDir) {
        onToggleFolder(node.path);
      } else {
        onSelectFile(node.path);
      }
    };

    const handleCancelRename = useCallback(() => {
      setEditingName(node.name);
      onCancelRenameFile?.();
    }, [node.name, onCancelRenameFile]);

    const handleCommitRename = useCallback(async () => {
      if (!isEditing || !onCommitRenameFile || isSubmittingRef.current) return;

      const nextName = editingName.trim();
      if (nextName === node.name) {
        handleCancelRename();
        return;
      }

      isSubmittingRef.current = true;
      try {
        await onCommitRenameFile({ name: node.name, path: node.path }, nextName);
        onCancelRenameFile?.();
      } finally {
        isSubmittingRef.current = false;
      }
    }, [
      editingName,
      handleCancelRename,
      isEditing,
      node.name,
      node.path,
      onCancelRenameFile,
      onCommitRenameFile,
    ]);

    const contextMenuItems =
      !isDir && !isEditing
        ? getFileContextMenuItems?.({ name: node.name, path: node.path })
        : undefined;

    const nodeContent = (
      <div
        {...clickableProps()}
        style={{ paddingInlineStart: 8 + depth * 16 }}
        title={node.path}
        className={cn(
          `${styles.item} ${isSelected ? styles.itemSelected : ''}`,
          CLICKABLE_FOCUS_RING,
        )}
        onClick={handleClick}
      >
        {isDir &&
          createElement(isExpanded ? ChevronDown : ChevronRight, {
            className: 'size-4 shrink-0',
            size: 16,
          })}
        {!isDir && <span className="w-4 shrink-0" />}
        {createElement(isDir ? (isExpanded ? FolderOpenIcon : FolderIcon) : File, {
          className: 'size-4 shrink-0',
          size: 16,
        })}
        {isEditing ? (
          <Input
            className={styles.editingInput}
            ref={inputRef}
            value={editingName}
            visualSize="small"
            onBlur={() => void handleCommitRename()}
            onChange={(e) => setEditingName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
                void handleCommitRename();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelRename();
              }
            }}
          />
        ) : (
          <span className={styles.label}>{node.name}</span>
        )}
      </div>
    );

    return (
      <>
        {!isDir && contextMenuItems && contextMenuItems.length > 0 ? (
          <ContextMenu>
            <ContextMenuTrigger>{nodeContent}</ContextMenuTrigger>
            <ContextMenuContent>
              {renderSidebarMenuItems(contextMenuItems, [], 'context')}
            </ContextMenuContent>
          </ContextMenu>
        ) : (
          nodeContent
        )}
        {isDir &&
          isExpanded &&
          node.children?.map((child) => (
            <TreeNode
              depth={depth + 1}
              editableFilePath={editableFilePath}
              expandedFolders={expandedFolders}
              getFileContextMenuItems={getFileContextMenuItems}
              key={child.path}
              node={child}
              selectedFile={selectedFile}
              onCancelRenameFile={onCancelRenameFile}
              onCommitRenameFile={onCommitRenameFile}
              onSelectFile={onSelectFile}
              onToggleFolder={onToggleFolder}
            />
          ))}
      </>
    );
  },
);

TreeNode.displayName = 'TreeNode';

const FileTree = memo<FileTreeProps>(
  ({
    resourceTree,
    rootFile,
    selectedFile,
    onSelectFile,
    getFileContextMenuItems,
    editableFilePath,
    onCancelRenameFile,
    onCommitRenameFile,
  }) => {
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());

    useEffect(() => {
      // Expand all directories by default when tree is loaded
      const allDirs = new Set<string>();
      const collectDirs = (nodes: SkillResourceTreeNode[]) => {
        for (const node of nodes) {
          if (node.type === 'directory') {
            allDirs.add(node.path);
            if (node.children) collectDirs(node.children);
          }
        }
      };
      collectDirs(resourceTree);
      setExpandedFolders(allDirs);
    }, [resourceTree]);

    const handleToggleFolder = useCallback((path: string) => {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
    }, []);

    const rootFilePath = rootFile === undefined ? 'SKILL.md' : rootFile?.path;
    const rootFileLabel = rootFile === undefined ? 'SKILL.md' : rootFile?.label;
    const isRootFileSelected = !!rootFilePath && selectedFile === rootFilePath;

    const hasResources = useMemo(() => resourceTree.length > 0, [resourceTree]);
    const rootFileContextMenuItems = useMemo(
      () =>
        rootFilePath && rootFileLabel
          ? getFileContextMenuItems?.({ name: rootFileLabel, path: rootFilePath })
          : undefined,
      [getFileContextMenuItems, rootFileLabel, rootFilePath],
    );

    const rootFileContent = rootFilePath && rootFileLabel && (
      <div
        {...clickableProps()}
        className={cn(
          `${styles.item} ps-2 ${isRootFileSelected ? styles.itemSelected : ''}`,
          CLICKABLE_FOCUS_RING,
        )}
        onClick={() => onSelectFile(rootFilePath)}
      >
        <span className="w-4 shrink-0" />
        <File className="size-4 shrink-0" size={16} />
        <span className={styles.label}>{rootFileLabel}</span>
      </div>
    );

    return (
      <div className="flex flex-col gap-0.5">
        {rootFileContent && rootFileContextMenuItems && rootFileContextMenuItems.length > 0 ? (
          <ContextMenu>
            <ContextMenuTrigger>{rootFileContent}</ContextMenuTrigger>
            <ContextMenuContent>
              {renderSidebarMenuItems(rootFileContextMenuItems, [], 'context')}
            </ContextMenuContent>
          </ContextMenu>
        ) : (
          rootFileContent
        )}
        {hasResources &&
          resourceTree.map((node) => (
            <TreeNode
              depth={0}
              editableFilePath={editableFilePath}
              expandedFolders={expandedFolders}
              getFileContextMenuItems={getFileContextMenuItems}
              key={node.path}
              node={node}
              selectedFile={selectedFile}
              onCancelRenameFile={onCancelRenameFile}
              onCommitRenameFile={onCommitRenameFile}
              onSelectFile={onSelectFile}
              onToggleFolder={handleToggleFolder}
            />
          ))}
      </div>
    );
  },
);

FileTree.displayName = 'FileTree';

export { default as FileTreeSkeleton } from './Skeleton';

export default FileTree;
