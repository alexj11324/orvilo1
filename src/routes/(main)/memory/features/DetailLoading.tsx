import { Skeleton } from '@lobehub/ui/base-ui';
import { memo } from 'react';

const DetailLoading = memo(() => {
  return (
    <>
      <Skeleton height={28} radius={999} width={64} />
      <Skeleton.Text fontSize={20} lineHeight={1.4} />
      <div className="flex gap-2">
        <Skeleton height={22} radius={4} width={48} />
        <Skeleton height={22} radius={4} width={48} />
      </div>
      <div className="flex items-center gap-4 justify-between">
        <Skeleton height={22} radius={4} width={48} />
        <Skeleton height={22} radius={4} width={48} />
      </div>
      <Skeleton.Text fontSize={16} rows={6} />
    </>
  );
});

export default DetailLoading;
