import { cssVar } from 'antd-style';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

const SkeletonText = ({ rows }: { rows: number }) => (
  <div className="flex flex-col gap-2">
    {Array.from({ length: rows }, (_, i) => (
      <Skeleton key={i} style={{ height: 14, width: '100%' }} />
    ))}
  </div>
);

const DetailsLoading = memo(() => {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4" style={{ width: '100%' }}>
          <Skeleton className="rounded-md" style={{ height: 64, width: 64 }} />
          <Skeleton style={{ height: 36, width: 200 }} />
        </div>
        <Skeleton style={{ height: 28, width: 200 }} />
      </div>
      <div
        className="flex gap-3"
        style={{
          height: 54,

          borderBottom: `1px solid ${cssVar.colorBorder}`,
        }}
      >
        <Skeleton style={{ height: 36, width: 120 }} />
        <Skeleton style={{ height: 36, width: 120 }} />
      </div>
      <div
        className="flex flex-col flex-1 gap-4"
        style={{
          width: '100%',

          overflow: 'hidden',
        }}
      >
        <SkeletonText rows={3} />
        <SkeletonText rows={8} />
        <SkeletonText rows={8} />
      </div>
    </div>
  );
});

export default DetailsLoading;
