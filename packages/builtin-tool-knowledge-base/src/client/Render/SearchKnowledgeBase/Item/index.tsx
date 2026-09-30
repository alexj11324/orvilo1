'use client';

import { MaterialFileTypeIcon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { FileSearchResult } from '@orvilo/types';
import { cx } from 'antd-style';
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
      className={cx(
        'flex flex-row items-center gap-1',
        cx(styles.container, isDarkMode ? styles.containerDark : styles.containerLight),
      )}
    >
      <MaterialFileTypeIcon filename={fileName} size={20} type={'file'} variant={'raw'} />
      <div className="flex flex-row gap-3 justify-between" style={{ maxWidth: 200 }}>
        <Text ellipsis>{fileName}</Text>
        <SimpleTooltip title={`Relevance: ${(relevanceScore * 100).toFixed(1)}%`}>
          <div className={cx('flex flex-col items-center justify-center', styles.badge)}>
            {relevanceScore.toFixed(2)}
          </div>
        </SimpleTooltip>
      </div>
    </div>
  );
});

export default FileItem;
