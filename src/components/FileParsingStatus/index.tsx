import { Badge, Button, Tag } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { BoltIcon, Loader2Icon, RotateCwIcon } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type FileParsingTask } from '@/types/asyncTask';
import { AsyncTaskStatus } from '@/types/asyncTask';

import EmbeddingStatus from './EmbeddingStatus';

const styles = createStaticStyles(({ css }) => ({
  errorReason: css`
    padding: 4px;
    border-radius: 4px;

    font-family: monospace;
    font-size: 12px;

    background: ${cssVar.colorFillTertiary};
  `,
}));

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
              <Tag
                className={className}
                color={'processing'}
                icon={<Badge status={'processing'} />}
              >
                {t('FileParsingStatus.chunks.status.processing')}
              </Tag>
            </TooltipTrigger>
            <TooltipContent>{t('FileParsingStatus.chunks.status.processingTip')}</TooltipContent>
          </Tooltip>
        );
      }

      case AsyncTaskStatus.Error: {
        return (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Tag className={className} color={'error'} variant={'filled'}>
                {t('FileParsingStatus.chunks.status.error')}{' '}
                {createElement(RotateCwIcon, {
                  size: 16,
                  style: { cursor: 'pointer' },
                  title: t('retry', { ns: 'common' }),
                  onClick: () => {
                    onErrorClick?.('chunking');
                  },
                })}
              </Tag>
            </TooltipTrigger>
            <TooltipContent style={{ maxWidth: 340 }}>
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
                  <Tag
                    className={cx('chunk-tag', className)}
                    style={{ cursor: 'pointer' }}
                    variant={'filled'}
                    icon={
                      preparingEmbedding
                        ? createElement(Loader2Icon, { size: 16 })
                        : createElement(BoltIcon, { size: 16 })
                    }
                    onClick={() => {
                      onClick?.(AsyncTaskStatus.Success);
                    }}
                  >
                    {chunkCount}
                    {
                      // if want to hide button
                      hideEmbeddingButton ||
                      // or if preparing the embedding
                      preparingEmbedding ? null : (
                        <Button
                          type={'link'}
                          style={{
                            fontSize: 12,
                            height: 'auto',
                            paddingBlock: 0,
                            paddingInline: '8px 0',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEmbeddingClick?.();
                          }}
                        >
                          {t('FileParsingStatus.chunks.embeddings')}
                        </Button>
                      )
                    }
                  </Tag>
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
