'use client';

import { Skeleton } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';

interface FileTreeSkeletonProps {
  rows?: number;
  showRootFile?: boolean;
}

const ROW_HEIGHT = 28;

const FileTreeSkeleton = memo<FileTreeSkeletonProps>(({ rows = 8, showRootFile = true }) => {
  const skeletonRows = Array.from({ length: rows }, (_, index) => index);

  return (
    <div className="flex flex-col gap-0.5">
      {showRootFile && (
        <div className="flex flex-row items-center gap-1.5 px-2" style={{ height: ROW_HEIGHT }}>
          <Skeleton
            style={{
              borderRadius: cssVar.borderRadius,
              height: 14,
              minWidth: 14,
              width: 14,
            }}
          />
          <Skeleton
            style={{
              borderRadius: cssVar.borderRadius,
              height: 16,
              minWidth: 80,
              opacity: 0.6,
              width: '40%',
            }}
          />
        </div>
      )}
      {skeletonRows.map((rowIndex) => {
        const depth = rowIndex % 3;
        const width = `${40 + ((rowIndex * 13) % 45)}%`;

        return (
          <div
            className="flex flex-row items-center gap-1.5 px-2"
            key={rowIndex}
            style={{ paddingInlineStart: 8 + depth * 16, height: ROW_HEIGHT }}
          >
            <Skeleton
              style={{
                borderRadius: cssVar.borderRadius,
                height: 14,
                minWidth: 14,
                width: 14,
              }}
            />
            <Skeleton
              style={{
                borderRadius: cssVar.borderRadius,
                height: 16,
                minWidth: 70,
                opacity: 0.55,
                width,
              }}
            />
          </div>
        );
      })}
    </div>
  );
});

FileTreeSkeleton.displayName = 'FileTreeSkeleton';

export default FileTreeSkeleton;
