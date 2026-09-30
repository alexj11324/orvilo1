'use client';

import { cssVar } from 'antd-style';
import { memo, type ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const SEGMENTS = 5;

interface ProgressIconProps {
  format?: (percent: number) => ReactNode;
  percent?: null | number;
  showInfo?: boolean;
}

const ProgressIcon = memo<ProgressIconProps>(({ showInfo, format, percent }) => {
  if (typeof percent !== 'number') return;

  const filled = Math.round((SEGMENTS * percent) / 100);
  const content = (
    <div className="flex items-center" style={{ gap: 2, height: 12, width: '100%' }}>
      {Array.from({ length: SEGMENTS }).map((_, i) => (
        <span
          key={i}
          style={{
            background: i < filled ? cssVar.colorPrimary : cssVar.colorFillTertiary,
            borderRadius: 1,
            flex: 1,
            height: '100%',
          }}
        />
      ))}
    </div>
  );

  if (showInfo)
    return (
      <div className="flex items-center gap-2">
        <div style={{ width: 24 }}>{content}</div>
        <div className="text-[12px]" style={{ color: cssVar.colorTextSecondary }}>
          {format?.(percent)}
        </div>
      </div>
    );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<span style={{ display: 'inline-flex', width: '100%' }}>{content}</span>}
        />
        <TooltipContent>{format?.(percent)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

export default ProgressIcon;
