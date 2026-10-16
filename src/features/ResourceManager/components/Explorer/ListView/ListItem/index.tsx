import { cn } from 'cn';
import { isEqual } from 'es-toolkit';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { shallow } from 'zustand/shallow';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import Avatar from '@/components/Avatar';
import { remoteAvatarSrc } from '@/components/Avatar/fallback';
import { ContextMenuTrigger } from '@/components/ItemsMenu';
import { Checkbox } from '@/components/ui/checkbox';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { isExplorerItemSelected } from '@/features/ResourceManager/store/selectors';
import { fileManagerSelectors, getChunkTargetId, useFileStore } from '@/store/file';
import type { FileListItem as FileListItemType } from '@/types/files';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';
import { formatSize } from '@/utils/format';

import { useFileItemClick } from '../../hooks/useFileItemClick';
import { useFileItemDropdown } from '../../ItemDropdown/useFileItemDropdown';
import { getListViewMinWidth } from './constants';
import FileListItemActions from './FileListItemActions';
import FileListItemName from './FileListItemName';
import { useFileListItemDrag } from './useFileListItemDrag';
import { useFileListItemMeta } from './useFileListItemMeta';
import { useFileListItemRename } from './useFileListItemRename';

export const FILE_DATE_WIDTH = 160;
export const FILE_SIZE_WIDTH = 140;

interface FileListItemProps extends FileListItemType {
  columnWidths: {
    date: number;
    name: number;
    size: number;
    uploader: number;
  };
  index: number;
  onSelectedChange: (id: string, selected: boolean, shiftKey: boolean, index: number) => void;
  selectable?: boolean;
  selected?: boolean;
  showUploader?: boolean;
  slug?: string | null;
}

const FileListItem = ({
  chunkCount,
  chunkingError,
  chunkingStatus,
  columnWidths,
  createdAt,
  embeddingError,
  embeddingStatus,
  fileId,
  fileType,
  finishEmbedding,
  id,
  index,
  metadata,
  name,
  onSelectedChange,
  selectable = true,
  selected,
  showUploader = true,
  size,
  slug,
  sourceType,
  uploader,
  url,
  userId,
  visibility,
}: FileListItemProps) => {
  const { t } = useTranslation(['components', 'file', 'chat']);
  const uploaderName =
    uploader?.fullName || uploader?.username || (uploader?.id ? uploader.id.slice(0, 8) : '');
  const chunkTargetId = getChunkTargetId({ fileId, id });
  const fileStoreState = useFileStore(
    (s) => ({
      isCreatingFileParseTask: fileManagerSelectors.isCreatingFileParseTask(chunkTargetId)(s),
      parseFiles: s.parseFilesToChunks,
      refreshFileList: s.refreshFileList,
      updateResource: s.updateResource,
    }),
    isEqual,
  );
  const resourceManagerState = useResourceManagerStore(
    (s) => ({
      isPendingRename: s.pendingRenameItemId === id,
      libraryId: s.libraryId,
      selected: isExplorerItemSelected({
        id,
        selectAllState: s.selectAllState,
        selectedIds: s.selectedFileIds,
      }),
      setPendingRenameItemId: s.setPendingRenameItemId,
    }),
    shallow,
  );
  const isSelected = selected ?? resourceManagerState.selected;

  const { displayTime, emoji, isFolder, isPage, isSupportedForChunking } = useFileListItemMeta({
    createdAt,
    fileType,
    metadata,
    name,
    sourceType,
  });

  // Personal mode has no second audience, so `visibility` carries no meaning
  // there and every row would wear a lock for nothing.
  const activeWorkspaceId = useActiveWorkspaceId();
  const isPrivate = Boolean(activeWorkspaceId) && visibility === 'private';
  const {
    handleDragEnd,
    handleDragLeave,
    handleDragOver,
    handleDragStart,
    handleDrop,
    isDragging,
    isOver,
  } = useFileListItemDrag({
    fileType,
    id,
    isFolder,
    libraryId: resourceManagerState.libraryId,
    name,
    sourceType,
  });
  const {
    handleRenameCancel,
    handleRenameConfirm,
    handleRenameStart,
    inputRef,
    isRenaming,
    renamingValue,
    setRenamingValue,
  } = useFileListItemRename({
    id,
    isPendingRename: resourceManagerState.isPendingRename,
    isFolder,
    libraryId: resourceManagerState.libraryId,
    name,
    refreshFileList: fileStoreState.refreshFileList,
    setPendingRenameItemId: resourceManagerState.setPendingRenameItemId,
    updateResource: fileStoreState.updateResource,
  });

  const handleItemClick = useFileItemClick({
    id,
    isFolder,
    isPage,
    libraryId: resourceManagerState.libraryId,
    slug,
  });
  const { menuItems } = useFileItemDropdown({
    fileId,
    fileType,
    filename: name,
    id,
    libraryId: resourceManagerState.libraryId,
    onRenameStart: isFolder ? handleRenameStart : undefined,
    size,
    sourceType,
    url,
    userId,
    visibility,
  });

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!selectable) return;
      onSelectedChange(id, !isSelected, e.shiftKey, index);
    },
    [id, index, isSelected, onSelectedChange, selectable],
  );

  const handleCheckboxPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.shiftKey) {
      e.preventDefault();
    }
  }, []);

  return (
    <ContextMenuTrigger items={menuItems}>
      <div
        {...clickableProps()}
        data-drop-target-id={id}
        data-is-folder={String(isFolder)}
        data-row-index={index}
        draggable={!!resourceManagerState.libraryId}
        className={cn(
          cn(
            'flex flex-row items-center h-12 px-2 border-be border-solid border-divider select-none',
            cn(
              'cursor-pointer min-w-260 text-sm leading-5.5 transition-[background-color] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-in-out) hover:bg-accent',
              'file-list-item-group',
              index % 2 === 0 &&
                'bg-fill-quaternary hover:bg-accent [.any-row-hovered_&]:bg-transparent [.any-row-hovered_&]:hover:bg-accent',
              isSelected &&
                'bg-selected hover:bg-selected [.any-row-hovered_&]:bg-selected [.any-row-hovered_&]:hover:bg-selected',
              isDragging && 'will-change-transform opacity-50',
              isOver &&
                'outline outline-1 outline-dashed outline-primary-border -outline-offset-2 bg-primary-wash hover:bg-primary-wash [.any-row-hovered_&]:bg-primary-wash [.any-row-hovered_&]:hover:bg-primary-wash',
            ),
          ),
          CLICKABLE_FOCUS_RING,
        )}
        style={{
          minWidth: getListViewMinWidth(showUploader),
        }}
        onClick={handleItemClick}
        onDragEnd={handleDragEnd}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        onDrop={handleDrop}
      >
        <div
          className={'flex flex-col items-center justify-center h-10 px-1'}
          style={{ cursor: selectable ? 'pointer' : 'not-allowed' }}
          title={selectable ? undefined : t('FileManager.selection.onlyOwn')}
          onClick={handleCheckboxClick}
          onPointerDown={handleCheckboxPointerDown}
        >
          <Checkbox checked={isSelected} disabled={!selectable} />
        </div>
        <div
          className="flex flex-row items-center justify-between flex-none px-2 py-0 text-muted-foreground"
          style={{
            maxWidth: columnWidths.name,
            minWidth: columnWidths.name,
            width: columnWidths.name,
          }}
        >
          <FileListItemName
            emoji={emoji}
            fallbackName={t('file:pageList.untitled')}
            fileType={fileType}
            inputRef={inputRef}
            isFolder={isFolder}
            isPage={isPage}
            isPrivate={isPrivate}
            isRenaming={isRenaming}
            name={name}
            privateTooltip={t('resources.visibility.privateTooltip', { ns: 'chat' })}
            renamingValue={renamingValue}
            onRenameCancel={handleRenameCancel}
            onRenameConfirm={handleRenameConfirm}
            onRenamingValueChange={setRenamingValue}
          />
          <FileListItemActions
            chunkCount={chunkCount}
            chunkingError={chunkingError}
            chunkingStatus={chunkingStatus}
            embeddingError={embeddingError}
            embeddingStatus={embeddingStatus}
            fileId={fileId}
            finishEmbedding={finishEmbedding}
            id={id}
            isCreatingFileParseTask={fileStoreState.isCreatingFileParseTask}
            isFolder={isFolder}
            isPage={isPage}
            isSupportedForChunking={isSupportedForChunking}
            menuItems={menuItems}
            parseFiles={fileStoreState.parseFiles}
            t={t}
          />
        </div>
        {!isDragging && (
          <>
            <div
              style={{ width: columnWidths.date }}
              className={cn(
                'flex flex-row items-center gap-2 flex-none text-xs leading-5',
                'py-0 ps-0 pe-6 text-muted-foreground',
              )}
            >
              <span>{displayTime}</span>
            </div>
            {showUploader && (
              <div
                style={{ width: columnWidths.uploader }}
                className={cn(
                  'flex flex-row items-center gap-2 flex-none text-xs leading-5',
                  'py-0 ps-0 pe-6 text-muted-foreground',
                )}
              >
                {uploaderName ? (
                  <SimpleTooltip title={t('file:listView.uploadedBy', { name: uploaderName })}>
                    <div className="flex flex-row items-center gap-2 min-w-0">
                      <Avatar
                        alt={uploaderName}
                        avatar={remoteAvatarSrc(uploader?.avatar) || undefined}
                        className="flex-none"
                        name={uploaderName}
                        shape={'circle'}
                        size={20}
                      />
                      <span className="truncate flex-1 min-w-0">{uploaderName}</span>
                    </div>
                  </SimpleTooltip>
                ) : (
                  '-'
                )}
              </div>
            )}
            <div
              style={{ width: columnWidths.size }}
              className={cn(
                'flex flex-col flex-none text-xs leading-5',
                'py-0 ps-0 pe-6 text-muted-foreground',
              )}
            >
              {isFolder || isPage ? '-' : formatSize(size)}
            </div>
          </>
        )}
      </div>
    </ContextMenuTrigger>
  );
};

export default memo(FileListItem);
