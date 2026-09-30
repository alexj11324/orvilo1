import { Skeleton } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';

const DetailsLoading = memo(() => {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4" style={{ width: '100%' }}>
          <Skeleton.Avatar shape={'square'} size={64} />
          <Skeleton height={36} width={200} />
        </div>
        <Skeleton height={28} width={200} />
      </div>
      <div
        className="flex gap-3"
        style={{
          height: 54,

          borderBottom: `1px solid ${cssVar.colorBorder}`,
        }}
      >
        <Skeleton height={36} />
        <Skeleton height={36} />
      </div>
      <div
        className="flex flex-col flex-1 gap-4"
        style={{
          width: '100%',

          overflow: 'hidden',
        }}
      >
        <Skeleton.Text rows={3} />
        <Skeleton.Text rows={8} />
        <Skeleton.Text rows={8} />
      </div>
    </div>
  );
});

export default DetailsLoading;
