import { cssVar } from 'antd-style';
import { memo } from 'react';

import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

/** Loading placeholder for {@link BriefCard}. */
const BriefCardSkeleton = memo(() => {
  return (
    <div
      className="flex flex-col gap-3 p-3"
      style={{
        border: `1px solid ${cssVar.colorBorder}`,
        borderRadius: cssVar.borderRadiusLG,
        borderRadius: cssVar.borderRadiusLG,
      }}
    >
      <div className="flex items-center gap-4 justify-between">
        <div
          className="flex items-center gap-2"
          style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
        >
          <Skeleton
            className="rounded-md shrink-0"
            style={{ borderRadius: cssVar.borderRadius, flex: 'none', width: 28, height: 28 }}
          />
          <Skeleton style={{ height: 20, width: 200 }} />
          <Skeleton style={{ height: 14, width: 72 }} />
        </div>
        <Skeleton
          className="rounded-full shrink-0"
          style={{ flex: 'none', width: 24, height: 24 }}
        />
      </div>

      <Separator
        className="bg-transparent border-t border-dashed border-border"
        style={{ marginBlock: 0 }}
      />

      <div className="flex flex-col gap-2" style={{ marginBottom: 0 }}>
        <Skeleton className="h-3.5" />
        <Skeleton className="h-3.5" />
        <Skeleton className="h-3.5 w-[60%]" />
      </div>

      <div className="flex gap-2" style={{ alignSelf: 'flex-end' }}>
        <Skeleton style={{ height: 32, width: 100 }} />
        <Skeleton style={{ height: 32, width: 80 }} />
      </div>
    </div>
  );
});

BriefCardSkeleton.displayName = 'BriefCardSkeleton';

export { BriefCardSkeleton };
