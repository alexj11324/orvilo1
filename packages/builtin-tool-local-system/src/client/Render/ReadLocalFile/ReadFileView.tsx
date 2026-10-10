import { Image, Markdown, PreviewGroup } from '@lobehub/ui';
import { useToolRenderCapabilities } from '@orvilo/shared-tool-ui';
import type { ReadFileState } from '@orvilo/tool-runtime';
import { cn } from 'cn';
import { ExternalLink, FolderOpen } from 'lucide-react';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import FileIcon from '@/components/FileIcon';
import { InlineHtmlPreview, isHtmlFile } from '@/components/HtmlPreview';

const styles = {
  actions:
    'cursor-pointer text-[var(--ant-color-text-tertiary)] opacity-0 transition-opacity duration-200 ease-[var(--ant-motion-ease-in-out)] group-hover/local-file:opacity-100',
  container: 'group/local-file justify-between',
  fileName: 'ms-2 flex-1 text-muted-foreground hover:text-foreground',
  header: 'cursor-pointer',
  imageList: 'flex-wrap',
  path: 'mt-1 px-1 text-[12px] text-muted-foreground break-all',
  previewBox: 'relative overflow-hidden rounded-[8px] bg-card px-2 py-0',
  previewText: 'overflow-auto font-mono text-[12px] leading-[1.6] break-all whitespace-pre-wrap',
};

const ReadFileView = memo<ReadFileState>(
  ({ filename: filenameProp, path, fileType, content, images }) => {
    const { t } = useTranslation('tool');
    const { canOpenFile, canOpenFolder, openFile, openFolder, displayRelativePath } =
      useToolRenderCapabilities();
    const filename = filenameProp || path.split('/').pop() || path;

    // Reading an image is best shown as the image itself: no card, no header, no path.
    if (images && images.length > 0) {
      return (
        <PreviewGroup>
          <div className={cn('flex flex-row items-start gap-2', styles.imageList)}>
            {images.map((image, index) => (
              <Image
                alt={filename || image.mediaType || ''}
                key={image.url || index}
                maxHeight={600}
                objectFit={'contain'}
                src={image.url}
                style={{ borderRadius: 'var(--ant-border-radius-lg)' }}
                variant={'outlined'}
              />
            ))}
          </div>
        </PreviewGroup>
      );
    }

    const isHtml = isHtmlFile({ fileName: filename, fileType, path });

    const handleOpenFile =
      openFile && (canOpenFile?.(path) ?? true)
        ? (e: React.MouseEvent) => {
            e.stopPropagation();
            openFile(path);
          }
        : undefined;

    const handleOpenFolder =
      openFolder && (canOpenFolder?.(path) ?? true)
        ? (e: React.MouseEvent) => {
            e.stopPropagation();
            openFolder(path);
          }
        : undefined;

    const displayPath = displayRelativePath ? displayRelativePath(path) : path;

    return (
      <div className={cn('flex flex-col gap-2', styles.container)}>
        <div className="flex flex-col">
          <div className={cn('flex flex-row items-center gap-3 justify-between', styles.header)}>
            <div className="flex flex-row items-center flex-1 gap-0" style={{ overflow: 'hidden' }}>
              <FileIcon fileName={filename} fileType={fileType} size={16} variant={'raw'} />
              <div className="flex flex-row">
                <div className={cn('truncate', 'block', styles.fileName)}>{filename}</div>
                {(handleOpenFile || handleOpenFolder) && (
                  <div
                    className={cn('flex flex-row gap-0.5', styles.actions)}
                    style={{ marginLeft: 8 }}
                  >
                    {handleOpenFile && (
                      <ActionIcon
                        icon={ExternalLink}
                        size="small"
                        title={t('localFiles.openFile')}
                        onClick={handleOpenFile}
                      />
                    )}
                    {handleOpenFolder && (
                      <ActionIcon
                        icon={FolderOpen}
                        size="small"
                        title={t('localFiles.openFolder')}
                        onClick={handleOpenFolder}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={cn('truncate', 'block', 'text-muted-foreground', styles.path)}>
            {displayPath}
          </div>
        </div>

        <div
          className={cn('flex flex-col', styles.previewBox)}
          style={{ height: isHtml ? 240 : undefined, maxHeight: 240 }}
        >
          {isHtml ? (
            <InlineHtmlPreview content={content} />
          ) : fileType === 'md' ? (
            <Markdown style={{ overflow: 'auto' }}>{content}</Markdown>
          ) : (
            <div className={styles.previewText} style={{ width: '100%' }}>
              {content}
            </div>
          )}
        </div>
      </div>
    );
  },
);

export default ReadFileView;
