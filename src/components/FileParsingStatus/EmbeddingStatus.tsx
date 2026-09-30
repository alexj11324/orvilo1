import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { BoltIcon, RotateCwIcon } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type FileParsingTask } from '@/types/asyncTask';
import { AsyncTaskStatus } from '@/types/asyncTask';

const styles = createStaticStyles(({ css, cssVar }) => ({
  errorReason: css`
    padding: 4px;
    border-radius: 4px;

    font-family: monospace;
    font-size: 12px;

    background: ${cssVar.colorFillTertiary};
  `,
}));

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
                <Badge
                  className={cx('chunk-tag', className)}
                  style={{ cursor: 'pointer' }}
                  variant="info"
                >
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
              <Badge className={className} variant="destructive">
                {t('FileParsingStatus.chunks.embeddingStatus.error')}{' '}
                {createElement(RotateCwIcon, {
                  size: 16,
                  style: { cursor: 'pointer' },
                  title: t('retry', { ns: 'common' }),
                  onClick: () => {
                    onErrorClick?.('embedding');
                  },
                })}
              </Badge>
            </TooltipTrigger>
            <TooltipContent style={{ maxWidth: 340 }}>
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
                  className={cx('chunk-tag', className)}
                  style={{ cursor: 'pointer' }}
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
