import { cn } from 'cn';
import { isNull } from 'es-toolkit/compat';
import { FileBoxIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { fileManagerSelectors, useFileStore } from '@/store/file';
import { type AsyncTaskStatus, type IAsyncTaskError } from '@/types/asyncTask';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';
import { isChunkingUnsupported } from '@/utils/isChunkingUnsupported';

import ChunksBadge from '../../ListView/ListItem/ChunkTag';

interface NoteFileItemProps {
  chunkCount?: number | null;
  chunkingError?: IAsyncTaskError | null;
  chunkingStatus?: AsyncTaskStatus | null;
  contentPreview?: string | null;
  embeddingError?: IAsyncTaskError | null;
  embeddingStatus?: AsyncTaskStatus | null;
  fileType?: string;
  finishEmbedding?: boolean;
  id: string;
  metadata?: Record<string, any> | null;
  name: string;
}

const NoteFileItem = memo<NoteFileItemProps>(
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
    metadata,
  }) => {
    const { t } = useTranslation(['common', 'components', 'file']);
    const [isCreatingFileParseTask, parseFiles] = useFileStore((s) => [
      fileManagerSelectors.isCreatingFileParseTask(id)(s),
      s.parseFilesToChunks,
    ]);

    const isSupportedForChunking = !isChunkingUnsupported(fileType || '');

    const displayTitle = name || t('file:pageList.untitled');
    const emoji = metadata?.emoji;

    return (
      <>
        <div className="relative">
          <div className="flex flex-col gap-3 w-full min-h-30 p-4 rounded-(--radius-card) bg-fill-quaternary">
            <div className="flex items-center gap-2 text-base leading-6 font-semibold text-foreground">
              {emoji && <span className="text-xl">{emoji}</span>}
              <span>{displayTitle}</span>
            </div>
            {contentPreview ? (
              <div className="line-clamp-6 text-sm leading-5.5 text-muted-foreground">
                {contentPreview}
              </div>
            ) : (
              <div className="line-clamp-6 text-sm leading-5.5 text-muted-foreground">
                <span className="text-foreground-tertiary italic">{t('common:noContent')}</span>
              </div>
            )}
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
            <SimpleTooltip title={t('components:FileManager.actions.chunkingTooltip')}>
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
                  aria-label={t('components:FileManager.actions.chunkingTooltip')}
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

export default NoteFileItem;
