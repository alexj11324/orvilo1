import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

const DetailLoading = memo(() => {
  return (
    <>
      <Skeleton style={{ height: 28, borderRadius: 999, width: 64 }} />
      <Skeleton style={{ height: 24, marginBlock: 2, width: '100%' }} />
      <div className="flex gap-2">
        <Skeleton style={{ height: 22, borderRadius: 4, width: 48 }} />
        <Skeleton style={{ height: 22, borderRadius: 4, width: 48 }} />
      </div>
      <div className="flex items-center gap-4 justify-between">
        <Skeleton style={{ height: 22, borderRadius: 4, width: 48 }} />
        <Skeleton style={{ height: 22, borderRadius: 4, width: 48 }} />
      </div>
      <Skeleton style={{ height: 21, marginBlock: 2, width: '100%' }} />
      <Skeleton style={{ height: 21, marginBlock: 2, width: '100%' }} />
      <Skeleton style={{ height: 21, marginBlock: 2, width: '100%' }} />
      <Skeleton style={{ height: 21, marginBlock: 2, width: '100%' }} />
      <Skeleton style={{ height: 21, marginBlock: 2, width: '100%' }} />
      <Skeleton style={{ height: 21, marginBlock: 2, width: '66%' }} />
    </>
  );
});

export default DetailLoading;
