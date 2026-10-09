'use client';

import { createStaticStyles, cx } from 'antd-style';
import { ChevronDown, FolderIcon, FolderOpenIcon } from 'lucide-react';
import * as m from 'motion/react-m';
import { createElement, memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';

const styles = createStaticStyles(({ css, cssVar }) => ({
  folderHeader: css`
    cursor: pointer;

    padding-block: 4px;
    padding-inline: 8px;

    color: ${cssVar.colorTextSecondary};

    transition: background-color 0.2s;

    &:hover {
      background-color: ${cssVar.colorFillTertiary};
    }
  `,
  folderHeaderActive: css`
    color: ${cssVar.colorText};
    background-color: ${cssVar.colorFillSecondary};
  `,
}));

export interface FolderTreeItem {
  children?: FolderTreeItem[];
  id: string;
  name: string;
  slug?: string | null;
}

interface FolderTreeItemProps {
  expandedFolders: Set<string>;
  item: FolderTreeItem;
  level?: number;
  loadedFolders: Set<string>;
  onFolderClick?: (folderId: string, folderSlug?: string | null) => void;
  onLoadFolder: (folderId: string) => Promise<void>;
  onToggleFolder: (folderId: string) => void;
  selectedKey?: string | null;
}

// Recursive component to render folder tree
export const FolderTreeItemComponent = memo<FolderTreeItemProps>(
  ({
    item,
    level = 0,
    expandedFolders,
    loadedFolders,
    onToggleFolder,
    onLoadFolder,
    selectedKey,
    onFolderClick,
  }) => {
    const { t: tCommon } = useTranslation('common');
    const itemKey = item.slug || item.id;
    const isExpanded = expandedFolders.has(itemKey);
    // Compare selectedKey with item.id since selectedKey is always the ID
    const isActive = selectedKey === item.id;

    const handleToggle = useCallback(async () => {
      // Toggle folder expansion
      onToggleFolder(itemKey);

      // Load children if not already loaded
      if (!isExpanded && !loadedFolders.has(itemKey)) {
        await onLoadFolder(itemKey);
      }
    }, [itemKey, isExpanded, loadedFolders, onToggleFolder, onLoadFolder]);

    const handleClick = useCallback(() => {
      if (onFolderClick) {
        // Pass both id and slug so the caller can use the id
        onFolderClick(item.id, item.slug);
      }
    }, [item.id, item.slug, onFolderClick]);

    return (
      <div className="flex flex-col gap-0.5">
        <div
          style={{ paddingInlineStart: level * 16 + 8 }}
          className={cx(
            'flex flex-row items-center',
            cx(styles.folderHeader, isActive && styles.folderHeaderActive),
          )}
          onClick={handleClick}
        >
          <m.div
            animate={{ rotate: isExpanded ? 0 : -90 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <ActionIcon
              aria-label={tCommon('toggle')}
              icon={ChevronDown}
              size={'small'}
              onClick={(e) => {
                e.stopPropagation();
                handleToggle();
              }}
            />
          </m.div>
          <div
            className="flex flex-row items-center flex-1 gap-2"
            style={{ minHeight: 28, minWidth: 0 }}
          >
            <span className="anticon" role="img">
              {createElement(isExpanded ? FolderOpenIcon : FolderIcon, {
                size: 16,
                width: 16,
                height: 16,
                fill: 'transparent',
              })}
            </span>
            <span
              style={{
                flex: 1,
                fontSize: 14,
                lineHeight: '20px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.name}
            </span>
          </div>
        </div>

        {isExpanded && item.children && item.children.length > 0 && (
          <m.div
            animate={{ height: 'auto', opacity: 1 }}
            initial={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="flex flex-col gap-0.5">
              {item.children.map((child) => (
                <FolderTreeItemComponent
                  expandedFolders={expandedFolders}
                  item={child}
                  key={child.id}
                  level={level + 1}
                  loadedFolders={loadedFolders}
                  selectedKey={selectedKey}
                  onFolderClick={onFolderClick}
                  onLoadFolder={onLoadFolder}
                  onToggleFolder={onToggleFolder}
                />
              ))}
            </div>
          </m.div>
        )}
      </div>
    );
  },
);

FolderTreeItemComponent.displayName = 'FolderTreeItemComponent';

interface FolderTreeProps {
  expandedFolders: Set<string>;
  items: FolderTreeItem[];
  loadedFolders: Set<string>;
  onFolderClick?: (folderId: string, folderSlug?: string | null) => void;
  onLoadFolder: (folderId: string) => Promise<void>;
  onToggleFolder: (folderId: string) => void;
  selectedKey?: string | null;
}

const FolderTree = memo<FolderTreeProps>(
  ({
    items,
    expandedFolders,
    loadedFolders,
    onToggleFolder,
    onLoadFolder,
    selectedKey,
    onFolderClick,
  }) => {
    return (
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <FolderTreeItemComponent
            expandedFolders={expandedFolders}
            item={item}
            key={item.id}
            loadedFolders={loadedFolders}
            selectedKey={selectedKey}
            onFolderClick={onFolderClick}
            onLoadFolder={onLoadFolder}
            onToggleFolder={onToggleFolder}
          />
        ))}
      </div>
    );
  },
);

FolderTree.displayName = 'FolderTree';

export default FolderTree;
