import { Skeleton } from '@lobehub/ui/base-ui';
import { Divider } from 'antd';
import { cssVar } from 'antd-style';
import { memo } from 'react';

/** Loading placeholder for {@link BriefCard}. */
const BriefCardSkeleton = memo(() => {
  return (
    <div
      className="flex flex-col gap-3 p-3 border"
      style={{
        borderColor: cssVar.colorBorderSecondary,
        background: cssVar.colorBgContainer,
        borderRadius: cssVar.borderRadiusLG,
      }}
    >
      <div className="flex items-center gap-4 justify-between">
        <div
          className="flex items-center gap-2"
          style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
        >
          <Skeleton.Avatar
            shape={'square'}
            size={28}
            style={{ borderRadius: cssVar.borderRadius, flex: 'none' }}
          />
          <Skeleton height={20} width={200} />
          <Skeleton height={14} width={72} />
        </div>
        <Skeleton.Avatar shape={'circle'} size={'small'} style={{ flex: 'none' }} />
      </div>

      <Divider dashed style={{ marginBlock: 0 }} />

      <Skeleton.Text fontSize={14} rows={3} style={{ marginBottom: 0 }} />

      <div className="flex gap-2" style={{ alignSelf: 'flex-end' }}>
        <Skeleton height={32} width={100} />
        <Skeleton height={32} width={80} />
      </div>
    </div>
  );
});

BriefCardSkeleton.displayName = 'BriefCardSkeleton';

export { BriefCardSkeleton };
