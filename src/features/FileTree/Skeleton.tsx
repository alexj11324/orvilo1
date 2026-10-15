'use client';

import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

interface FileTreeSkeletonProps {
  rows?: number;
  showRootFile?: boolean;
}

const FileTreeSkeleton = memo<FileTreeSkeletonProps>(({ rows = 8, showRootFile = true }) => {
  const skeletonRows = Array.from({ length: rows }, (_, index) => index);

  return (
    <div className="flex flex-col gap-0.5">
      {showRootFile && (
        <div className="flex h-8 flex-row items-center gap-1.5 px-2">
          <Skeleton className="size-4 min-w-4 rounded-(--radius-chip)" />
          <Skeleton className="h-4 min-w-20 w-2/5 rounded-(--radius-chip) opacity-60" />
        </div>
      )}
      {skeletonRows.map((rowIndex) => {
        const depth = rowIndex % 3;
        const width = `${40 + ((rowIndex * 13) % 45)}%`;

        return (
          <div
            className="flex h-8 flex-row items-center gap-1.5 px-2"
            key={rowIndex}
            style={{ paddingInlineStart: 8 + depth * 16 }}
          >
            <Skeleton className="size-4 min-w-4 rounded-(--radius-chip)" />
            <Skeleton
              className="h-4 min-w-17.5 rounded-(--radius-chip) opacity-55"
              style={{ width }}
            />
          </div>
        );
      })}
    </div>
  );
});

FileTreeSkeleton.displayName = 'FileTreeSkeleton';

export default FileTreeSkeleton;
