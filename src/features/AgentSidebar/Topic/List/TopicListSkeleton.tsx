'use client';

import { cssVar } from 'antd-style';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the grouped topic list frame (12px group caption + icon-led 36px
// rows) so the deferred-mount frame reads as the layout it resolves into,
// unlike the avatar-style generic SkeletonList.
const GROUPS = [
  { header: 44, rows: ['82%', '58%', '70%'] },
  { header: 60, rows: ['64%', '76%', '48%', '68%'] },
];

const RowSkeleton = memo<{ width: string }>(({ width }) => (
  <div className="flex items-center gap-2 h-[36px]" style={{ paddingInline: 4 }}>
    <Skeleton
      style={{
        borderRadius: cssVar.borderRadiusSM,
        height: 16,
        maxHeight: 16,
        maxWidth: 16,
        minWidth: 16,
      }}
    />
    <div className="flex flex-col flex-1">
      <Skeleton
        style={{
          borderRadius: cssVar.borderRadius,
          height: 14,
          margin: 0,
          maxHeight: 14,
          opacity: 0.5,
          padding: 0,
          width,
        }}
      />
    </div>
  </div>
));

RowSkeleton.displayName = 'TopicRowSkeleton';

const TopicListSkeleton = memo(() => (
  <div className="flex flex-col gap-0.5">
    {GROUPS.map((group, i) => (
      <div
        className="flex flex-col gap-[1px]"
        key={i}
        style={{ paddingBlock: 4, paddingInline: '8px 4px' }}
      >
        <div className="flex items-center h-[24px]">
          <Skeleton
            style={{
              borderRadius: cssVar.borderRadiusSM,
              height: 12,
              maxHeight: 12,
              maxWidth: group.header,
              minWidth: group.header,
              opacity: 0.6,
            }}
          />
        </div>
        {group.rows.map((width) => (
          <RowSkeleton key={width} width={width} />
        ))}
      </div>
    ))}
  </div>
));

TopicListSkeleton.displayName = 'TopicListSkeleton';

export default TopicListSkeleton;
