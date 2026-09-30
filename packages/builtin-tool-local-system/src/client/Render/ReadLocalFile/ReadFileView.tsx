import { Image, Markdown, PreviewGroup } from '@lobehub/ui';
import { useToolRenderCapabilities } from '@orvilo/shared-tool-ui';
import type { ReadFileState } from '@orvilo/tool-runtime';
import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { ExternalLink, FolderOpen } from 'lucide-react';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import FileIcon from '@/components/FileIcon';
import { InlineHtmlPreview, isHtmlFile } from '@/components/HtmlPreview';

const styles = createStaticStyles(({ css, cssVar }) => ({
  actions: css`
    cursor: pointer;
    color: ${cssVar.colorTextTertiary};
    opacity: 0;
    transition: opacity 0.2s ${cssVar.motionEaseInOut};
  `,
  container: css`
    justify-content: space-between;

    .local-file-actions {
      opacity: 0;
    }

    &:hover .local-file-actions {
      opacity: 1;
    }
  `,
  fileName: css`
    flex: 1;
    margin-inline-start: 8px;
    color: ${cssVar.colorTextSecondary};

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  header: css`
    cursor: pointer;
  `,
  image: css`
    border-radius: ${cssVar.borderRadiusLG};
  `,
  imageList: css`
    flex-wrap: wrap;
  `,
  path: css`
    margin-block-start: 4px;
    padding-inline: 4px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    word-break: break-all;
  `,
  previewBox: css`
    position: relative;

    overflow: hidden;

    padding-block: 0;
    padding-inline: 8px;
    border-radius: 8px;

    background: ${cssVar.colorBgContainer};
  `,
  previewText: css`
    overflow: auto;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    line-height: 1.6;
    word-break: break-all;
    white-space: pre-wrap;
  `,
}));

const ReadFileView = memo<ReadFileState>(
  ({ filename: filenameProp, path, fileType, content, images }) => {
    const { t } = useTranslation('tool');
    const { openFile, openFolder, displayRelativePath } = useToolRenderCapabilities();
    const filename = filenameProp || path.split('/').pop() || path;

    // Reading an image is best shown as the image itself: no card, no header, no path.
    if (images && images.length > 0) {
      return (
        <PreviewGroup>
          <div className={cx('flex flex-row items-start gap-2', styles.imageList)}>
            {images.map((image, index) => (
              <Image
                alt={filename || image.mediaType || ''}
                className={styles.image}
                key={image.url || index}
                maxHeight={600}
                objectFit={'contain'}
                src={image.url}
                variant={'outlined'}
              />
            ))}
          </div>
        </PreviewGroup>
      );
    }

    const isHtml = isHtmlFile({ fileName: filename, fileType, path });

    const handleOpenFile = openFile
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          openFile(path);
        }
      : undefined;

    const handleOpenFolder = openFolder
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          openFolder(path);
        }
      : undefined;

    const displayPath = displayRelativePath ? displayRelativePath(path) : path;

    return (
      <div className={cx('flex flex-col gap-2', styles.container)}>
        <div className="flex flex-col">
          <div className={cx('flex flex-row items-center gap-3 justify-between', styles.header)}>
            <div className="flex flex-row items-center flex-1 gap-0" style={{ overflow: 'hidden' }}>
              <FileIcon fileName={filename} fileType={fileType} size={16} variant={'raw'} />
              <div className="flex flex-row">
                <div className={cn('truncate', 'block', styles.fileName)}>{filename}</div>
                {(handleOpenFile || handleOpenFolder) && (
                  <div
                    className={cx('flex flex-row gap-0.5', `${styles.actions} local-file-actions`)}
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
          className={cx('flex flex-col', styles.previewBox)}
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
