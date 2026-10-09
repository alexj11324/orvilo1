import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import path from 'path-browserify-esm';
import React from 'react';

import FileIcon from '@/components/FileIcon';
import { localFileService } from '@/services/electron/localFileService';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    cursor: pointer;

    padding-block: 2px;
    padding-inline: 4px 8px;
    border-radius: 4px;

    color: ${cssVar.colorTextSecondary};

    :hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  title: css`
    overflow: hidden;
    display: block;

    line-height: 20px;
    color: inherit;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

interface LocalFolderProps {
  path: string;
  size?: number;
}

export const LocalFolder = ({ path: pathname, size = 22 }: LocalFolderProps) => {
  const handleClick = () => {
    if (!path) return;

    localFileService.openLocalFolder({ isDirectory: true, path: pathname });
  };

  const { base } = path.parse(pathname);

  return (
    <div
      {...clickableProps()}
      className={cn(cx('flex flex-row items-center gap-1', styles.container), CLICKABLE_FOCUS_RING)}
      style={{ display: 'inline-flex', verticalAlign: 'middle' }}
      onClick={handleClick}
    >
      <FileIcon isDirectory fileName={base} size={size} variant={'raw'} />
      <div
        className="flex flex-row items-baseline gap-1"
        style={{ overflow: 'hidden', width: '100%' }}
      >
        <div className={styles.title}>{base}</div>
      </div>
    </div>
  );
};
