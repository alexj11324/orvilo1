import { cssVar } from 'antd-style';
import { CircleHelp } from 'lucide-react';
import { type CSSProperties, type ReactNode } from 'react';
import { memo } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface InfoTooltipProps {
  iconStyle?: CSSProperties;
  size?: number;
  title?: ReactNode;
}

const InfoTooltip = memo<InfoTooltipProps>(({ size, iconStyle, title }) => {
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <CircleHelp size={size ?? 16} style={{ color: cssVar.colorTextTertiary, ...iconStyle }} />
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
});

export default InfoTooltip;
