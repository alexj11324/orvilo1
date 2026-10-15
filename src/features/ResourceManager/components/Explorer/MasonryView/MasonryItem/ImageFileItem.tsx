import { cn } from 'cn';
import { isNull } from 'es-toolkit/compat';
import { FileBoxIcon } from 'lucide-react';
import { createElement, memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import { Image } from '@/components/ImagePreview';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { fileManagerSelectors, useFileStore } from '@/store/file';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import { type AsyncTaskStatus, type IAsyncTaskError } from '@/types/asyncTask';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';
import { formatSize } from '@/utils/format';
import { isChunkingUnsupported } from '@/utils/isChunkingUnsupported';

import ChunksBadge from '../../ListView/ListItem/ChunkTag';
import { FALLBACK_ASPECT_RATIO, readAspectRatio } from './imageAspectRatio';
import { readPlaceholderIcon } from './placeholderIcon';

interface ImageFileItemProps {
  chunkCount?: number | null;
  chunkingError?: IAsyncTaskError | null;
  chunkingStatus?: AsyncTaskStatus | null;
  embeddingError?: IAsyncTaskError | null;
  embeddingStatus?: AsyncTaskStatus | null;
  fileType?: string;
  finishEmbedding?: boolean;
  id: string;
  isInView: boolean;
  metadata?: Record<string, any> | null;
  name: string;
  size: number;
  url?: string;
}

const ImageFileItem = memo<ImageFileItemProps>(
  ({
    chunkCount,
    chunkingError,
    chunkingStatus,
    embeddingError,
    embeddingStatus,
    fileType,
    finishEmbedding,
    id,
    isInView,
    metadata,
    name,
    size,
    url,
  }) => {
    const { t } = useTranslation('components');
    const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
    const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
    const motionDisabled = animationMode === 'disabled' || prefersReducedMotion;
    const wrapperRef = useRef<HTMLDivElement>(null);
    const knownAspectRatio = readAspectRatio(metadata);
    const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
    // Falls back to a reserved box until the bitmap reports its own ratio.
    const [aspectRatio, setAspectRatio] = useState(knownAspectRatio ?? FALLBACK_ASPECT_RATIO);
    const [isCreatingFileParseTask, parseFiles] = useFileStore((s) => [
      fileManagerSelectors.isCreatingFileParseTask(id)(s),
      s.parseFilesToChunks,
    ]);

    const isSupportedForChunking = !isChunkingUnsupported(fileType || '');
    const imageLoaded = status === 'loaded';

    /**
     * Read the bitmap through the wrapper rather than the load event: `Image`
     * renders the `<img>` inside its own wrapper, so the event's
     * `currentTarget` is not the image and `naturalWidth` reads back undefined.
     * Silently skipping the correction left every upload with no stored
     * dimensions parked on the fallback ratio — and `object-fit: cover` then
     * cropped the thumbnail to a box the image never had.
     */
    const applyNaturalRatio = () => {
      const img = wrapperRef.current?.querySelector('img');
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        setAspectRatio(img.naturalWidth / img.naturalHeight);
      }
    };

    return (
      <>
        <div
          className="relative [container-type:size] overflow-hidden w-full bg-fill-quaternary"
          ref={wrapperRef}
          style={{ aspectRatio }}
        >
          {!imageLoaded && (
            <div
              className={cn(
                'absolute inset-0 overflow-hidden flex flex-col items-center justify-center gap-1.5 px-4 text-muted-foreground opacity-100',
                status === 'loading' &&
                  'animate-pulse [animation-duration:1.5s] [animation-timing-function:ease-in-out]',
              )}
            >
              <span className={cn('anticon', '[@container(height<=56px)]:hidden')} role="img">
                {createElement(readPlaceholderIcon(status), {
                  size: 28,
                  width: 28,
                  height: 28,
                  fill: 'transparent',
                })}
              </span>
              {status === 'error' && (
                <>
                  <div className="text-xs leading-5 text-foreground-tertiary text-center">
                    {t('FileManager.image.loadFailed')}
                  </div>
                  <div className="truncate max-w-full text-xs leading-5 text-muted-foreground text-center [@container(height<=92px)]:hidden">
                    {name}
                  </div>
                </>
              )}
            </div>
          )}
          {isInView && url && (
            <Image
              alt={name}
              loading="lazy"
              src={url}
              variant={'borderless'}
              preview={{
                src: url,
              }}
              style={{
                display: 'block',
                height: '100%',
                pointerEvents: imageLoaded ? 'auto' : 'none',
                width: '100%',
              }}
              styles={{
                image: {
                  display: 'block',
                  height: '100%',
                  opacity: imageLoaded ? 1 : 0,
                  transition: motionDisabled ? 'none' : 'opacity var(--orvilo-motion-mid)',
                  width: '100%',
                },
                wrapper: {
                  display: 'block',
                  height: '100%',
                  width: '100%',
                },
              }}
              onError={() => setStatus('error')}
              onLoad={() => {
                // Trust the bitmap over the stored metadata: a wrong stored
                // ratio would crop the thumbnail for good.
                applyNaturalRatio();
                setStatus('loaded');
              }}
            />
          )}
          {/* Hover overlay - only show when image is loaded */}
          {imageLoaded && (
            <div className="absolute z-1 inset-0 flex flex-col items-center justify-center p-4 opacity-0 bg-overlay-mask transition-opacity duration-(--orvilo-motion-mid) ease-[ease] hover:opacity-100">
              <div className="line-clamp-3 max-w-full mbe-2 text-sm leading-5.5 font-semibold text-overlay-mask-foreground text-center [word-break:break-word]">
                {name}
              </div>
              <div className="text-xs leading-5 text-overlay-mask-foreground opacity-90">
                {formatSize(size)}
              </div>
            </div>
          )}
        </div>
        {/* Floating chunk badge or action button */}
        {!isNull(chunkingStatus) && chunkingStatus ? (
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
        )}
      </>
    );
  },
);

export default ImageFileItem;
