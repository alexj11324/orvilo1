import {
  CUSTOM_DOCUMENT_FILE_TYPE,
  CUSTOM_FOLDER_FILE_TYPE,
  MARKDOWN_MIME_TYPES,
} from '@orvilo/const';
import { clsx as cx, cn } from 'cn';
import { LockIcon } from 'lucide-react';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { Checkbox } from '@/components/ui/checkbox';
import { SimpleTooltip } from '@/components/ui/tooltip';
import {
  getTransparentDragImage,
  useDragActive,
  useSetCurrentDrag,
} from '@/features/ResourceManager/DndContextWrapper';
import { showContextMenu } from '@/libs/contextMenu';
import { type NativeContextMenuItem } from '@/libs/contextMenu/types';
import { getChunkTargetId, useFileStore } from '@/store/file';
import { type FileListItem } from '@/types/files';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { useFileItemClick } from '../../hooks/useFileItemClick';
import DropdownMenu from '../../ItemDropdown/DropdownMenu';
import { useFileItemDropdown } from '../../ItemDropdown/useFileItemDropdown';
import AudioFileItem from './AudioFileItem';
import DefaultFileItem from './DefaultFileItem';
import ImageFileItem from './ImageFileItem';
import MarkdownFileItem from './MarkdownFileItem';
import nativeStyles from './MasonryItem.module.css';
import NoteFileItem from './NoteFileItem';
import VideoFileItem from './VideoFileItem';
import WebpageFileItem from './WebpageFileItem';

// Image file types
const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

// Markdown file types
const MARKDOWN_TYPES = new Set(MARKDOWN_MIME_TYPES);

// Custom note file type
const CUSTOM_NOTE_TYPE = CUSTOM_DOCUMENT_FILE_TYPE;

// Helper to check if filename ends with .md or is a custom note
const isMarkdownFile = (name: string, fileType?: string) => {
  return (
    name.toLowerCase().endsWith('.md') ||
    name.toLowerCase().endsWith('.markdown') ||
    (fileType && MARKDOWN_TYPES.has(fileType))
  );
};

// Helper to check if it's a custom page that should be rendered
// PDF and Office files should not be treated as pages even if they have fileType='custom/document'
const isCustomPage = (fileType?: string, name?: string) => {
  const lowerName = name?.toLowerCase();
  const isPDF = fileType?.toLowerCase() === 'pdf' || lowerName?.endsWith('.pdf');
  const isOfficeFile =
    lowerName?.endsWith('.xls') ||
    lowerName?.endsWith('.xlsx') ||
    lowerName?.endsWith('.doc') ||
    lowerName?.endsWith('.docx') ||
    lowerName?.endsWith('.ppt') ||
    lowerName?.endsWith('.pptx') ||
    lowerName?.endsWith('.odt');
  return !isPDF && !isOfficeFile && fileType === CUSTOM_NOTE_TYPE;
};

const styles = {
  card: cn(
    'relative cursor-pointer overflow-hidden rounded-(--radius-card) border border-divider bg-card transition-[border-color,box-shadow,background-color] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-out) hover:border-primary hover:shadow-(--shadow-raised)',
    nativeStyles.card,
  ),
  privateBadge:
    'absolute z-2 inset-be-2 start-2 flex items-center justify-center rounded-(--radius-chip) bg-overlay-mask p-1 text-overlay-mask-foreground',
  dragOver: nativeStyles.dragOver,
  selected: cn('border-primary bg-selected', nativeStyles.selected),
};

const twStyles = {
  actions:
    'opacity-0 transition-opacity duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-out)',
  checkbox:
    'absolute z-2 inset-bs-2 start-2 opacity-0 transition-opacity duration-(--orvilo-motion-mid)',
  content: 'relative',
  contentWithPadding: 'p-4',
  dragging: 'will-change-transform opacity-50',
  dropdown:
    'absolute z-2 inset-bs-2 end-2 opacity-0 transition-opacity duration-(--orvilo-motion-mid)',
};

interface MasonryFileItemProps extends FileListItem {
  knowledgeBaseId?: string;
  onOpen?: (id: string) => void;
  onSelectedChange: (id: string, selected: boolean) => void;
  selectable?: boolean;
  selected?: boolean;
  slug?: string | null;
}

const MasonryFileItem = memo<MasonryFileItemProps>(
  ({
    chunkingError,
    embeddingError,
    embeddingStatus,
    finishEmbedding,
    chunkCount,
    contentPreview,
    url,
    name,
    fileType,
    fileId,
    id,
    selected,
    selectable = true,
    chunkingStatus,
    onSelectedChange,
    knowledgeBaseId,
    size,
    onOpen,
    metadata,
    sourceType,
    slug,
    userId,
    visibility,
  }) => {
    const { t } = useTranslation(['components', 'chat']);
    const chunkTargetId = getChunkTargetId({ fileId, id });
    const isDragActive = useDragActive();
    const setCurrentDrag = useSetCurrentDrag();
    const [isDragging, setIsDragging] = useState(false);
    const [isOver, setIsOver] = useState(false);

    // Memoize computed values that don't change
    const computedValues = useMemo(
      () => ({
        isAudio: !!fileType?.startsWith('audio'),
        isFolder: fileType === CUSTOM_FOLDER_FILE_TYPE,
        isImage: fileType && IMAGE_TYPES.has(fileType),
        isMarkdown: isMarkdownFile(name, fileType),
        isPage: isCustomPage(fileType, name),
        isVideo: !!fileType?.startsWith('video'),
        // web clippings: article documents plus raw html captures
        isWebpage: fileType === 'article' || !!fileType?.startsWith('text/html'),
      }),
      [fileType, name],
    );

    const { isAudio, isImage, isMarkdown, isPage, isFolder, isVideo, isWebpage } = computedValues;

    // Use shared click handler hook
    const handleItemClick = useFileItemClick({
      id,
      isFolder,
      isPage,
      libraryId: knowledgeBaseId,
      onOpen,
      slug,
    });

    // Memoize drag data to prevent recreation
    const dragData = useMemo(
      () => ({
        fileType,
        isFolder,
        name,
        sourceType,
      }),
      [fileType, isFolder, name, sourceType],
    );

    // Native HTML5 drag event handlers
    const handleDragStart = useCallback(
      (e: React.DragEvent) => {
        if (!knowledgeBaseId) {
          e.preventDefault();
          return;
        }

        setIsDragging(true);
        const parentKey = useFileStore.getState().queryParams?.parentId ?? '';
        setCurrentDrag({
          data: dragData,
          id,
          parentKey,
          type: isFolder ? 'folder' : 'file',
        });

        // Set drag image to be transparent (we use custom overlay)
        const img = getTransparentDragImage();
        if (img) {
          e.dataTransfer.setDragImage(img, 0, 0);
        }
        e.dataTransfer.effectAllowed = 'move';
      },
      [knowledgeBaseId, dragData, id, isFolder, setCurrentDrag],
    );

    const handleDragEnd = useCallback(() => {
      setIsDragging(false);
    }, []);

    const handleDragOver = useCallback(
      (e: React.DragEvent) => {
        if (!isFolder || !isDragActive) return;

        e.preventDefault();
        e.stopPropagation();
        setIsOver(true);
      },
      [isFolder, isDragActive],
    );

    const handleDragLeave = useCallback(() => {
      setIsOver(false);
    }, []);

    const cardRef = useRef<HTMLDivElement>(null);
    const [isInView, setIsInView] = useState(false);

    // Use Intersection Observer to detect when card enters viewport
    useEffect(() => {
      if (!cardRef.current) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !isInView) {
              setIsInView(true);
            }
          });
        },
        {
          rootMargin: '200px', // Increased margin to load content earlier
          threshold: 0.01, // Lower threshold for earlier triggering
        },
      );

      observer.observe(cardRef.current);

      return () => {
        observer.disconnect();
      };
    }, [isInView]);

    const { menuItems } = useFileItemDropdown({
      fileId,
      fileType,
      filename: name,
      id,
      libraryId: knowledgeBaseId,
      size,
      sourceType,
      url,
      userId,
      visibility,
    });

    // Personal mode has no second audience, so `visibility` carries no meaning
    // there and every card would wear a lock for nothing.
    const activeWorkspaceId = useActiveWorkspaceId();
    const isPrivate = Boolean(activeWorkspaceId) && visibility === 'private';

    return (
      <div
        data-drop-target-id={id}
        data-is-folder={isFolder}
        data-slot="resource-masonry-card"
        draggable={!!knowledgeBaseId}
        ref={cardRef}
        className={cx(
          'orvilo-motion-scope',
          styles.card,
          selected && styles.selected,
          isDragging && twStyles.dragging,
          isOver && styles.dragOver,
        )}
        onDragEnd={handleDragEnd}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        onContextMenu={(e) => {
          e.preventDefault();
          showContextMenu(menuItems() as NativeContextMenuItem[]);
        }}
      >
        <div
          className={cx('checkbox', twStyles.checkbox)}
          style={{ cursor: selectable ? 'pointer' : 'not-allowed' }}
          title={selectable ? undefined : t('FileManager.selection.onlyOwn')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (!selectable) return;
            onSelectedChange(id, !selected);
          }}
        >
          <Checkbox checked={selected} disabled={!selectable} />
        </div>

        <div
          className={cx('dropdown', twStyles.dropdown)}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DropdownMenu items={menuItems} />
        </div>

        {isPrivate && (
          <SimpleTooltip title={t('resources.visibility.privateTooltip', { ns: 'chat' })}>
            <div className={styles.privateBadge}>
              <span className="anticon" role="img">
                <LockIcon fill={'transparent'} height={16} size={16} width={16} />
              </span>
            </div>
          </SimpleTooltip>
        )}

        <div
          {...clickableProps()}
          className={cn(
            twStyles.content,
            !isImage &&
              !isMarkdown &&
              !isPage &&
              !isVideo &&
              !isAudio &&
              !isWebpage &&
              twStyles.contentWithPadding,
            CLICKABLE_FOCUS_RING,
          )}
          onClick={handleItemClick}
        >
          {(() => {
            switch (true) {
              case isWebpage: {
                return <WebpageFileItem contentPreview={contentPreview} name={name} url={url} />;
              }
              case isVideo && !!url: {
                return <VideoFileItem isInView={isInView} name={name} size={size} url={url} />;
              }
              case isAudio && !!url: {
                return <AudioFileItem isInView={isInView} name={name} size={size} url={url} />;
              }
              case isImage && !!url: {
                return (
                  <ImageFileItem
                    chunkCount={chunkCount ?? undefined}
                    chunkingError={chunkingError}
                    chunkingStatus={chunkingStatus ?? undefined}
                    embeddingError={embeddingError}
                    embeddingStatus={embeddingStatus ?? undefined}
                    fileType={fileType}
                    finishEmbedding={finishEmbedding}
                    id={chunkTargetId}
                    isInView={isInView}
                    metadata={metadata}
                    name={name}
                    size={size}
                    url={url}
                  />
                );
              }
              case isPage: {
                return (
                  <NoteFileItem
                    chunkCount={chunkCount ?? undefined}
                    chunkingError={chunkingError}
                    chunkingStatus={chunkingStatus ?? undefined}
                    contentPreview={contentPreview}
                    embeddingError={embeddingError}
                    embeddingStatus={embeddingStatus ?? undefined}
                    fileType={fileType}
                    finishEmbedding={finishEmbedding}
                    id={chunkTargetId}
                    metadata={metadata}
                    name={name}
                  />
                );
              }
              case isMarkdown: {
                return (
                  <MarkdownFileItem
                    chunkCount={chunkCount ?? undefined}
                    chunkingError={chunkingError}
                    chunkingStatus={chunkingStatus ?? undefined}
                    contentPreview={contentPreview}
                    embeddingError={embeddingError}
                    embeddingStatus={embeddingStatus ?? undefined}
                    fileType={fileType}
                    finishEmbedding={finishEmbedding}
                    id={chunkTargetId}
                    name={name}
                    size={size}
                  />
                );
              }
              default: {
                return (
                  <DefaultFileItem
                    chunkCount={chunkCount ?? undefined}
                    chunkingError={chunkingError}
                    chunkingStatus={chunkingStatus ?? undefined}
                    embeddingError={embeddingError}
                    embeddingStatus={embeddingStatus ?? undefined}
                    fileType={fileType}
                    finishEmbedding={finishEmbedding}
                    id={chunkTargetId}
                    name={name}
                    size={size}
                  />
                );
              }
            }
          })()}
        </div>
      </div>
    );
  },
);

export default MasonryFileItem;
