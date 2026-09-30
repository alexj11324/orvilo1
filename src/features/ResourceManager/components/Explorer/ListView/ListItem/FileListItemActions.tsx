import { Button } from '@lobehub/ui/base-ui';
import type { IAsyncTaskError } from '@orvilo/types';
import { isNull } from 'es-toolkit/compat';
import { FileBoxIcon } from 'lucide-react';
import { useMemo } from 'react';

import { useFileTransferMenuItem } from '@/business/client/hooks/useFileTransferMenuItem';
import type { DropdownItem } from '@/components/ItemsMenu';
import { usePermission } from '@/hooks/usePermission';
import { getChunkTargetId } from '@/store/file';

import DropdownMenu from '../../ItemDropdown/DropdownMenu';
import ChunksBadge from './ChunkTag';
import { styles } from './styles';

interface FileListItemActionsProps {
  chunkCount?: number | null;
  chunkingError?: IAsyncTaskError | null;
  chunkingStatus?: unknown;
  embeddingError?: IAsyncTaskError | null;
  embeddingStatus?: unknown;
  fileId?: string | null;
  finishEmbedding?: boolean;
  id: string;
  isCreatingFileParseTask: boolean;
  isFolder: boolean;
  isPage: boolean;
  isSupportedForChunking: boolean;
  menuItems: DropdownItem[] | (() => DropdownItem[]);
  parseFiles: (ids: string[]) => void;
  t: any;
}

const isDeleteMenuItem = (item: DropdownItem) =>
  item !== null && 'key' in item && item.key === 'delete';

const isDividerMenuItem = (item: DropdownItem) =>
  item !== null && 'type' in item && item.type === 'divider';

export const appendTransferMenuItemsBeforeDelete = (
  baseItems: DropdownItem[],
  transferMenuItems: DropdownItem[] | null,
) => {
  if (!transferMenuItems || transferMenuItems.length === 0) return baseItems;

  const deleteIndex = baseItems.findIndex(isDeleteMenuItem);
  if (deleteIndex === -1) return [...baseItems, ...transferMenuItems];

  const insertIndex =
    deleteIndex > 0 && isDividerMenuItem(baseItems[deleteIndex - 1])
      ? deleteIndex - 1
      : deleteIndex;

  return [
    ...baseItems.slice(0, insertIndex),
    ...transferMenuItems,
    ...baseItems.slice(insertIndex),
  ];
};

const FileListItemActions = ({
  chunkCount,
  chunkingError,
  chunkingStatus,
  embeddingError,
  embeddingStatus,
  fileId,
  finishEmbedding,
  id,
  isCreatingFileParseTask,
  isFolder,
  isPage,
  isSupportedForChunking,
  menuItems,
  parseFiles,
  t,
}: FileListItemActionsProps) => {
  const { allowed: canEditResources } = usePermission('edit_own_content');
  const chunkTargetId = getChunkTargetId({ fileId, id });
  const transferMenuItems = useFileTransferMenuItem(
    id,
    isPage ? 'document' : isFolder ? 'folder' : 'file',
  );

  const mergedMenuItems = useMemo(() => {
    const baseItems = typeof menuItems === 'function' ? menuItems() : menuItems;
    return appendTransferMenuItemsBeforeDelete(
      baseItems,
      transferMenuItems as DropdownItem[] | null,
    );
  }, [menuItems, transferMenuItems]);

  return (
    <div
      className="flex flex-row items-center gap-2 px-2"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {!isFolder &&
        !isPage &&
        (isCreatingFileParseTask || isNull(chunkingStatus) || !chunkingStatus ? (
          // Unsupported file types simply hide the entry instead of surfacing a
          // permanently disabled button.
          canEditResources &&
          isSupportedForChunking && (
            <div
              className={isCreatingFileParseTask ? undefined : styles.hover}
              title={t('FileManager.actions.chunkingTooltip')}
            >
              <Button
                icon={FileBoxIcon}
                loading={isCreatingFileParseTask}
                size={'small'}
                type={'text'}
                onClick={() => {
                  parseFiles([chunkTargetId]);
                }}
              >
                {t(
                  isCreatingFileParseTask
                    ? 'FileManager.actions.createChunkingTask'
                    : 'FileManager.actions.chunking',
                )}
              </Button>
            </div>
          )
        ) : (
          <div style={{ cursor: 'default' }}>
            <ChunksBadge
              chunkCount={chunkCount}
              chunkingError={chunkingError}
              chunkingStatus={chunkingStatus as any}
              embeddingError={embeddingError}
              embeddingStatus={embeddingStatus as any}
              finishEmbedding={finishEmbedding}
              id={chunkTargetId}
            />
          </div>
        ))}
      <DropdownMenu className={styles.hover} items={mergedMenuItems} />
    </div>
  );
};

export default FileListItemActions;
