import { CUSTOM_FOLDER_FILE_TYPE } from '@orvilo/const';
import { cn } from 'cn';
import { isNull } from 'es-toolkit/compat';
import { FileBoxIcon, Folder } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import FileIcon from '@/components/FileIcon';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { fileManagerSelectors, useFileStore } from '@/store/file';
import { type AsyncTaskStatus, type IAsyncTaskError } from '@/types/asyncTask';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';
import { formatSize } from '@/utils/format';
import { isChunkingUnsupported } from '@/utils/isChunkingUnsupported';

import ChunksBadge from '../../ListView/ListItem/ChunkTag';

interface DefaultFileItemProps {
  chunkCount?: number | null;
  chunkingError?: IAsyncTaskError | null;
  chunkingStatus?: AsyncTaskStatus | null;
  embeddingError?: IAsyncTaskError | null;
  embeddingStatus?: AsyncTaskStatus | null;
  fileType?: string;
  finishEmbedding?: boolean;
  id: string;
  name: string;
  size: number;
}

const DefaultFileItem = memo<DefaultFileItemProps>(
  ({
    chunkCount,
    chunkingError,
    chunkingStatus,
    embeddingError,
    embeddingStatus,
    fileType,
    finishEmbedding,
    id,
    name,
    size,
  }) => {
    const { t } = useTranslation('components');
    const [isCreatingFileParseTask, parseFiles] = useFileStore((s) => [
      fileManagerSelectors.isCreatingFileParseTask(id)(s),
      s.parseFilesToChunks,
    ]);

    const isFolder = fileType === CUSTOM_FOLDER_FILE_TYPE;
    const isSupportedForChunking = !isChunkingUnsupported(fileType || '');

    return (
      <>
        <div className="flex flex-col items-center gap-3 justify-center py-6 px-3 min-h-45">
          {isFolder ? (
            <Folder size={64} strokeWidth={1.5} />
          ) : (
            <FileIcon fileName={name} fileType={fileType} size={64} />
          )}
          <div className="line-clamp-2 mbe-3 text-sm leading-5.5 font-semibold text-foreground [word-break:break-word] text-center">
            {name}
          </div>
          {!isFolder && (
            <div className="text-xs leading-5 text-foreground-tertiary text-center">
              {formatSize(size)}
            </div>
          )}
        </div>
        {/* Floating chunk badge or action button - only for files, not folders */}
        {!isFolder &&
          (!isNull(chunkingStatus) && chunkingStatus ? (
            <div
              className={cn(
                'floatingChunkBadge',
                'absolute z-3 inset-be-2 end-2 rounded-(--radius-button) opacity-0 bg-card shadow-(--ant-box-shadow-tertiary) transition-opacity duration-(--orvilo-motion-mid) ease-[ease]',
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <ChunksBadge
                chunkCount={chunkCount}
                chunkingError={chunkingError}
                chunkingStatus={chunkingStatus}
                embeddingError={embeddingError}
                embeddingStatus={embeddingStatus}
                finishEmbedding={finishEmbedding}
                id={id}
              />
            </div>
          ) : (
            isSupportedForChunking && (
              <SimpleTooltip title={t('FileManager.actions.chunkingTooltip')}>
                <div
                  {...clickableProps()}
                  className={cn(
                    cn(
                      'floatingChunkBadge',
                      'cursor-pointer absolute z-3 inset-be-2 end-2 rounded-(--radius-button) opacity-0 bg-card shadow-(--ant-box-shadow-tertiary) transition-opacity duration-(--orvilo-motion-mid) ease-[ease]',
                    ),
                    CLICKABLE_FOCUS_RING,
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isCreatingFileParseTask) {
                      parseFiles([id]);
                    }
                  }}
                >
                  <Button
                    aria-label={t('FileManager.actions.chunkingTooltip')}
                    loading={isCreatingFileParseTask}
                    size="compact"
                    variant="ghost"
                  >
                    <FileBoxIcon data-icon="inline-start" />
                  </Button>
                </div>
              </SimpleTooltip>
            )
          ))}
      </>
    );
  },
);

export default DefaultFileItem;
