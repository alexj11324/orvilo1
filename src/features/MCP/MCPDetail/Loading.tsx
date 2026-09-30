import { cssVar } from 'antd-style';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

const DetailsLoading = memo(() => {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4" style={{ width: '100%' }}>
          <Skeleton style={{ height: 64, width: 64 }} />
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
        <Skeleton style={{ height: 36 }} />
        <Skeleton style={{ height: 36 }} />
      </div>
      <div
        className="flex flex-col flex-1 gap-4"
        style={{
          width: '100%',

          overflow: 'hidden',
        }}
      >
        <div className="flex flex-col gap-2">
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '66%' }} />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '66%' }} />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '66%' }} />
        </div>
      </div>
    </div>
  );
});

export default DetailsLoading;
