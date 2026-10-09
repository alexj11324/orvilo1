import { createStaticStyles, cx } from 'antd-style';
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

const styles = createStaticStyles(({ css, cssVar }) => ({
  floatingChunkBadge: css`
    position: absolute;
    z-index: 3;
    inset-block-end: 8px;
    inset-inline-end: 8px;

    border-radius: ${cssVar.borderRadius};

    opacity: 0;
    background: ${cssVar.colorBgContainer};
    box-shadow: ${cssVar.boxShadow};

    transition: opacity ${cssVar.motionDurationMid};
  `,
  iconWrapper: css`
    display: flex;
    align-items: center;
    justify-content: center;

    height: 120px;
    margin-block-end: 12px;
    border-radius: ${cssVar.borderRadius};

    background: ${cssVar.colorFillQuaternary};
  `,
  noteContent: css`
    display: flex;
    flex-direction: column;
    gap: 12px;

    width: 100%;
    min-height: 120px;
    padding: 16px;
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorFillQuaternary};
  `,
  notePreview: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 6;

    font-size: 13px;
    line-height: 1.6;
    color: ${cssVar.colorTextSecondary};
  `,
  noteTitle: css`
    display: flex;
    gap: 8px;
    align-items: center;

    font-size: 16px;
    font-weight: ${cssVar.fontWeightStrong};
    line-height: 1.4;
    color: ${cssVar.colorText};
  `,
}));

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
        <div style={{ position: 'relative' }}>
          <div className={styles.noteContent}>
            <div className={styles.noteTitle}>
              {emoji && <span style={{ fontSize: 20 }}>{emoji}</span>}
              <span>{displayTitle}</span>
            </div>
            {contentPreview ? (
              <div className={styles.notePreview}>{contentPreview}</div>
            ) : (
              <div className={styles.notePreview}>
                <span style={{ color: 'var(--lobe-text-tertiary)', fontStyle: 'italic' }}>
                  {t('common:noContent')}
                </span>
              </div>
            )}
          </div>
        </div>
        {/* Floating chunk badge or action button */}
        {!isNull(chunkingStatus) && chunkingStatus ? (
          <div
            className={cx('floatingChunkBadge', styles.floatingChunkBadge)}
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
                style={{ cursor: 'pointer' }}
                className={cn(
                  cx('floatingChunkBadge', styles.floatingChunkBadge),
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
                  size="sm"
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
