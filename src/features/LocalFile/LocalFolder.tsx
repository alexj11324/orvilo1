import { cn } from 'cn';
import path from 'path-browserify-esm';
import React from 'react';

import FileIcon from '@/components/FileIcon';
import { localFileService } from '@/services/electron/localFileService';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = {
  container:
    'cursor-pointer py-0.5 ps-1 pe-2 rounded-(--radius-chip) text-muted-foreground [&:hover]:text-foreground [&:hover]:bg-accent',
  title: 'overflow-hidden block leading-5 text-inherit text-ellipsis whitespace-nowrap',
};

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
      className={cn('flex flex-row items-center gap-1', styles.container, CLICKABLE_FOCUS_RING)}
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
