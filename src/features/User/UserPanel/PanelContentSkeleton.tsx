'use client';

import { cssVar } from 'antd-style';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

const PanelContentSkeleton = memo(() => {
  return (
    <div className="flex flex-col gap-0.5" style={{ minWidth: 300 }}>
      {/* UserInfo + DataStatistics area */}
      <div className="flex flex-col gap-2" style={{ padding: '12px 16px' }}>
        <div className="flex items-center gap-3">
          <Skeleton
            style={{
              borderRadius: cssVar.borderRadius,
              height: 40,
              minWidth: 40,
              width: 40,
            }}
          />
          <div className="flex flex-col flex-1 gap-1">
            <Skeleton
              style={{
                borderRadius: cssVar.borderRadius,
                height: 16,
                maxWidth: 120,
                opacity: 0.6,
              }}
            />
            <Skeleton
              style={{
                borderRadius: cssVar.borderRadius,
                height: 12,
                maxWidth: 80,
                opacity: 0.4,
              }}
            />
          </div>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              style={{
                borderRadius: cssVar.borderRadius,
                flex: 1,
                height: 36,
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      </div>

      {/* Menu items */}
      {[1, 2].map((row) => (
        <div className="flex flex-col gap-0.5" key={row} style={{ padding: '0 8px' }}>
          {[1, 2].map((i) => (
            <div className="flex items-center gap-2" key={i} style={{ height: 36 }}>
              <Skeleton
                style={{
                  borderRadius: cssVar.borderRadius,
                  height: 20,
                  minWidth: 20,
                  width: 20,
                }}
              />
              <Skeleton
                style={{
                  borderRadius: cssVar.borderRadius,
                  height: 14,
                  opacity: 0.5,
                }}
              />
            </div>
          ))}
        </div>
      ))}

      {/* Footer: BrandWatermark + LangButton */}
      <div
        className="flex items-center gap-1 justify-between"
        style={{ padding: '6px 8px 6px 16px' }}
      >
        <Skeleton
          style={{
            borderRadius: cssVar.borderRadius,
            height: 20,
            width: 80,
            opacity: 0.4,
          }}
        />
        <Skeleton
          style={{
            borderRadius: cssVar.borderRadius,
            height: 28,
            minWidth: 28,
            width: 28,
          }}
        />
      </div>
    </div>
  );
});

PanelContentSkeleton.displayName = 'PanelContentSkeleton';

export default PanelContentSkeleton;
