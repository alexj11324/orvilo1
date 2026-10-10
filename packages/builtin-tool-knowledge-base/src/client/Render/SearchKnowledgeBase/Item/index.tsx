'use client';

import { MaterialFileTypeIcon } from '@lobehub/ui';
import type { FileSearchResult } from '@orvilo/types';
import { cn } from 'cn';
import { useTheme } from 'next-themes';
import { memo } from 'react';

import { SimpleTooltip } from '@/components/ui/tooltip';

import { styles } from './style';

export interface FileItemProps extends FileSearchResult {
  index: number;
}

const FileItem = memo<FileItemProps>(({ fileId, fileName, relevanceScore }) => {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  return (
    <div
      key={fileId}
      className={cn(
        'flex flex-row items-center gap-1',
        cn(styles.container, isDarkMode ? styles.containerDark : styles.containerLight),
      )}
    >
      <MaterialFileTypeIcon filename={fileName} size={20} type={'file'} variant={'raw'} />
      <div className="flex flex-row gap-3 justify-between" style={{ maxWidth: 200 }}>
        <div className="truncate block">{fileName}</div>
        <SimpleTooltip title={`Relevance: ${(relevanceScore * 100).toFixed(1)}%`}>
          <div className={cn('flex flex-col items-center justify-center', styles.badge)}>
            {relevanceScore.toFixed(2)}
          </div>
        </SimpleTooltip>
      </div>
    </div>
  );
});

export default FileItem;
