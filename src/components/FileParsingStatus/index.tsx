import { clsx as cx, cn } from 'cn';
import { BoltIcon, RotateCwIcon } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type FileParsingTask } from '@/types/asyncTask';
import { AsyncTaskStatus } from '@/types/asyncTask';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import EmbeddingStatus from './EmbeddingStatus';

const styles = {
  errorReason: 'rounded-(--radius-chip) bg-muted p-1 font-mono text-xs leading-5',
};

interface FileParsingStatusProps extends FileParsingTask {
  className?: string;
  hideEmbeddingButton?: boolean;
  onClick?: (status: AsyncTaskStatus) => void;
  onEmbeddingClick?: () => void;
  onErrorClick?: (task: 'chunking' | 'embedding') => void;
  preparingEmbedding?: boolean;
}

const FileParsingStatus = memo<FileParsingStatusProps>(
  ({
    chunkingStatus,
    onEmbeddingClick,
    chunkingError,
    finishEmbedding,
    chunkCount,
    embeddingStatus,
    embeddingError,
    onClick,
    preparingEmbedding,
    onErrorClick,
    className,
    hideEmbeddingButton,
  }) => {
    const { t } = useTranslation(['components', 'common']);

    switch (chunkingStatus) {
      case AsyncTaskStatus.Processing: {
        return (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Badge className={className} variant="info">
                <span
                  aria-hidden
                  className={
                    'inline-block size-2 animate-pulse rounded-full bg-current motion-reduce:animate-none'
                  }
                />
                {t('FileParsingStatus.chunks.status.processing')}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{t('FileParsingStatus.chunks.status.processingTip')}</TooltipContent>
          </Tooltip>
        );
      }

      case AsyncTaskStatus.Error: {
        return (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Badge
                className={cx('h-auto min-h-7 [@media(pointer:coarse)]:min-h-11', className)}
                variant="destructive"
              >
                {t('FileParsingStatus.chunks.status.error')}{' '}
                <span
                  {...clickableProps()}
                  title={t('retry', { ns: 'common' })}
                  className={cn(
                    'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-input) [@media(pointer:coarse)]:size-11',
                    CLICKABLE_FOCUS_RING,
                  )}
                  onClick={() => {
                    onErrorClick?.('chunking');
                  }}
                >
                  <RotateCwIcon className="size-4" size={16} />
                </span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-85">
              <div className={'flex flex-col gap-1'}>
                {t('FileParsingStatus.chunks.status.errorResult')}
                {chunkingError && (
                  <div className={cn('flex', styles.errorReason)}>
                    [{chunkingError.name}]:{' '}
                    {chunkingError.body && typeof chunkingError.body !== 'string'
                      ? chunkingError.body.detail
                      : chunkingError.body}
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      }

      case AsyncTaskStatus.Success: {
        // if no embedding status, it means that the embedding is not started
        if (!embeddingStatus || preparingEmbedding)
          return (
            <div className={'flex'}>
              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <Badge
                    className={cx('chunk-tag min-h-7 h-auto cursor-pointer', className)}
                    variant="secondary"
                    onClick={() => {
                      onClick?.(AsyncTaskStatus.Success);
                    }}
                  >
                    {preparingEmbedding ? <Spinner /> : createElement(BoltIcon, { size: 16 })}
                    {chunkCount}
                    {
                      // if want to hide button
                      hideEmbeddingButton ||
                      // or if preparing the embedding
                      preparingEmbedding ? null : (
                        <Button
                          className="ps-2 pe-0"
                          size="sm"
                          variant="link"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEmbeddingClick?.();
                          }}
                        >
                          {t('FileParsingStatus.chunks.embeddings')}
                        </Button>
                      )
                    }
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {t('FileParsingStatus.chunks.embeddingStatus.empty')}
                </TooltipContent>
              </Tooltip>
            </div>
          );

        return (
          <EmbeddingStatus
            chunkCount={chunkCount}
            className={className}
            embeddingError={embeddingError}
            embeddingStatus={embeddingStatus}
            finishEmbedding={finishEmbedding}
            onClick={onClick}
            onErrorClick={onErrorClick}
          />
        );
      }
    }
  },
);

export default FileParsingStatus;
