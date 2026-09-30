import type { CSSProperties, ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SimpleTooltipProps {
  children?: ReactNode;
  contentStyle?: CSSProperties;
  side?: 'bottom' | 'inline-end' | 'inline-start' | 'left' | 'right' | 'top';
  title?: ReactNode;
}

export const SimpleTooltip = ({ children, contentStyle, side, title }: SimpleTooltipProps) =>
  title == null || title === '' ? (
    <>{children}</>
  ) : (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex">{children}</span>} />
      <TooltipContent side={side} style={contentStyle}>
        {title}
      </TooltipContent>
    </Tooltip>
  );
