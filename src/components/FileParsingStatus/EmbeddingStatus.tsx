import { clsx as cx, cn } from 'cn';
import { BoltIcon, RotateCwIcon } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type FileParsingTask } from '@/types/asyncTask';
import { AsyncTaskStatus } from '@/types/asyncTask';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = {
  errorReason: 'rounded-(--radius-chip) bg-muted p-1 font-mono text-xs leading-5',
};

interface EmbeddingStatusProps extends FileParsingTask {
  className?: string;
  onClick?: (status: AsyncTaskStatus) => void;
  onErrorClick?: (task: 'chunking' | 'embedding') => void;
}

const EmbeddingStatus = memo<EmbeddingStatusProps>(
  ({ chunkCount, embeddingStatus, embeddingError, onClick, onErrorClick, className }) => {
    const { t } = useTranslation(['components', 'common']);

    switch (embeddingStatus) {
      case AsyncTaskStatus.Processing: {
        return (
          <div className={'flex'}>
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Badge className={cx('chunk-tag cursor-pointer', className)} variant="info">
                  {createElement(BoltIcon, { size: 16 })}
                  {chunkCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {t('FileParsingStatus.chunks.embeddingStatus.processing')}
              </TooltipContent>
            </Tooltip>
          </div>
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
                {t('FileParsingStatus.chunks.embeddingStatus.error')}{' '}
                <span
                  {...clickableProps()}
                  title={t('retry', { ns: 'common' })}
                  className={cn(
                    'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-input) [@media(pointer:coarse)]:size-11',
                    CLICKABLE_FOCUS_RING,
                  )}
                  onClick={() => {
                    onErrorClick?.('embedding');
                  }}
                >
                  <RotateCwIcon className="size-4" size={16} />
                </span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-85">
              <div className={'flex flex-col gap-1'}>
                {t('FileParsingStatus.chunks.embeddingStatus.errorResult')}
                {embeddingError && (
                  <div className={cn('flex', styles.errorReason)}>
                    [{embeddingError.name}]:{' '}
                    {embeddingError.body && typeof embeddingError.body !== 'string'
                      ? embeddingError.body.detail
                      : embeddingError.body}
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      }

      case AsyncTaskStatus.Success: {
        return (
          <div className={'flex'}>
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Badge
                  className={cx('chunk-tag cursor-pointer', className)}
                  variant="info"
                  onClick={() => {
                    onClick?.(AsyncTaskStatus.Success);
                  }}
                >
                  {createElement(BoltIcon, { size: 16 })}
                  {chunkCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {t('FileParsingStatus.chunks.embeddingStatus.success')}
              </TooltipContent>
            </Tooltip>
          </div>
        );
      }
    }
  },
);

export default EmbeddingStatus;
