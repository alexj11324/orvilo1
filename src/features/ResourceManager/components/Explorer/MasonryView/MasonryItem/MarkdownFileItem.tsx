import { cn } from 'cn';
import { isNull } from 'es-toolkit/compat';
import { FileBoxIcon } from 'lucide-react';
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

interface MarkdownFileItemProps {
  chunkCount?: number | null;
  chunkingError?: IAsyncTaskError | null;
  chunkingStatus?: AsyncTaskStatus | null;
  contentPreview?: string | null;
  embeddingError?: IAsyncTaskError | null;
  embeddingStatus?: AsyncTaskStatus | null;
  fileType?: string;
  finishEmbedding?: boolean;
  id: string;
  name: string;
  size: number;
}

const MarkdownFileItem = memo<MarkdownFileItemProps>(
  ({
    chunkCount,
    chunkingError,
    chunkingStatus,
    contentPreview,
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

    const isSupportedForChunking = !isChunkingUnsupported(fileType || '');

    return (
      <>
        <div className="relative">
          {contentPreview ? (
            <div className="relative overflow-hidden w-full min-h-30 max-h-75 p-4 rounded-(--radius-card) text-sm leading-5.5 text-muted-foreground wrap-break-word whitespace-pre-wrap bg-fill-quaternary after:pointer-events-none after:content-[''] after:absolute after:inset-be-0 after:inset-x-0 after:h-15 after:bg-[linear-gradient(to_bottom,transparent,var(--fill-quaternary))]">
              {contentPreview}
            </div>
          ) : (
            <div className="flex items-center justify-center h-30 mbe-3 rounded-(--radius-card) bg-fill-quaternary">
              <FileIcon fileName={name} fileType={fileType} size={64} />
            </div>
          )}
          {/* Hover overlay */}
          <div className="absolute z-1 inset-0 flex flex-col items-center justify-center p-4 opacity-0 bg-overlay-mask transition-opacity duration-(--orvilo-motion-mid) ease-[ease] hover:opacity-100 rounded-(--radius-card)">
            <div className="line-clamp-3 max-w-full mbe-2 text-sm leading-5.5 font-semibold text-overlay-mask-foreground text-center [word-break:break-word]">
              {name}
            </div>
            <div className="text-xs leading-5 text-overlay-mask-foreground opacity-90">
              {formatSize(size)}
            </div>
          </div>
        </div>
        {/* Floating chunk badge or action button */}
        {!isNull(chunkingStatus) && chunkingStatus ? (
          <div
            className={cn(
              'floatingChunkBadge',
              'absolute z-3 inset-be-2 end-2 rounded-(--radius-button) opacity-0 bg-card shadow-(--shadow-raised) transition-opacity duration-(--orvilo-motion-mid) ease-[ease]',
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
                    'cursor-pointer absolute z-3 inset-be-2 end-2 rounded-(--radius-button) opacity-0 bg-card shadow-(--shadow-raised) transition-opacity duration-(--orvilo-motion-mid) ease-[ease]',
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
        )}
      </>
    );
  },
);

export default MarkdownFileItem;
