'use client';

import { cssVar } from 'antd-style';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the grouped topic list frame (12px group caption + 36px text-led
// rows) so the deferred-mount frame reads as the layout it resolves into,
// unlike the avatar-style generic SkeletonList.
const GROUPS = [
  { header: 44, rows: ['82%', '58%', '70%'] },
  { header: 60, rows: ['64%', '76%', '48%', '68%'] },
];

// No leading square: a topic row carries no leading icon, so its title starts
// at the row's text inset. `paddingInline: 4` is that whole inset — it mirrors
// the NavItem's own `px-1`, since the group caption's 8px belongs to the
// header, not the rows. Without this the frame flashes an indented layout
// before snapping left.
const RowSkeleton = memo<{ width: string }>(({ width }) => (
  <div className="flex items-center h-[36px]" style={{ paddingInline: 4 }}>
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
      <div className="flex flex-col gap-[1px]" key={i} style={{ paddingBlock: 4 }}>
        {/* The 8px inline inset belongs to the group caption alone — the real
            list puts it on the AccordionTrigger, so rows sit flush at the
            container's own inset. Keeping it on the group wrapper would push
            every skeleton row 8px right of the real one. */}
        <div className="flex items-center h-[24px]" style={{ paddingInline: '8px 4px' }}>
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
