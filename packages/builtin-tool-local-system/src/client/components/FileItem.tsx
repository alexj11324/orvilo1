import { useToolRenderCapabilities } from '@orvilo/shared-tool-ui';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { FolderOpen } from 'lucide-react';
import nodePath from 'path-browserify-esm';
import React, { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import FileIcon from '@/components/FileIcon';
import { formatSize } from '@/utils/format';

const styles = {
  container: 'rounded-[4px] text-muted-foreground [&_:hover]:bg-accent [&_:hover]:text-foreground',
  dir: 'truncate font-mono text-[11px] leading-[1.3] text-[var(--ant-color-text-tertiary)]',
  size: 'min-w-[56px] shrink-0 text-end font-mono text-[11px] text-[var(--ant-color-text-tertiary)]',
  time: 'truncate text-[11px] leading-none text-[var(--ant-color-text-description)]',
  title: 'block truncate leading-[1.3] text-inherit',
};

interface FileItemProps {
  createdTime?: Date | string;
  isDirectory?: boolean;
  name?: string;
  path?: string;
  showTime?: boolean;
  size?: number;
  type?: string;
}

const FileItem = memo<FileItemProps>(
  ({ isDirectory, name: nameProp, path, size, type, showTime = false, createdTime }) => {
    const { t } = useTranslation('tool');
    const { openFile, openFolder, displayRelativePath } = useToolRenderCapabilities();
    const name = nameProp || path?.split('/').pop() || '';

    // Display the parent directory only — the filename is already shown above,
    // and the full path repeats it. Collapse $HOME to "~" when we have access
    // to the desktop state, so paths like `/Users/foo/Downloads/x` render as
    // `~/Downloads/x` and stay legible.
    const parentDir = useMemo(() => {
      if (!path || isDirectory) return '';
      const dir = nodePath.dirname(path);
      if (!dir || dir === '.' || dir === '/') return dir;
      return displayRelativePath?.(dir) ?? dir;
    }, [path, isDirectory, displayRelativePath]);

    const handleRowClick = () => {
      if (!path) return;
      if (isDirectory) openFolder?.(path);
      else openFile?.(path);
    };

    const handleOpenFolder = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (path) openFolder?.(path);
    };

    return (
      <div
        className={cn('flex flex-row items-center gap-3', styles.container)}
        style={{
          cursor: openFile || openFolder ? 'pointer' : 'default',
          fontSize: 12,
          width: '100%',
          padding: '4px 8px',
        }}
        onClick={handleRowClick}
      >
        <FileIcon
          fileName={name || ''}
          fileType={type}
          isDirectory={isDirectory}
          size={20}
          variant={'raw'}
        />
        <div className="flex flex-col flex-1 gap-0.5" style={{ overflow: 'hidden', minWidth: 0 }}>
          <div className={styles.title}>{name}</div>
          {showTime ? (
            createdTime && (
              <div className={styles.time}>{dayjs(createdTime).format('YYYY/MM/DD HH:mm')}</div>
            )
          ) : parentDir ? (
            <div className={styles.dir}>{parentDir}</div>
          ) : null}
        </div>
        {size !== undefined && <span className={styles.size}>{formatSize(size)}</span>}
        {!isDirectory && openFolder && path && (
          <ActionIcon
            icon={FolderOpen}
            size={'small'}
            style={{ height: 24, width: 24 }}
            title={t('localFiles.openFolder')}
            onClick={handleOpenFolder}
          />
        )}
      </div>
    );
  },
);

export default FileItem;
