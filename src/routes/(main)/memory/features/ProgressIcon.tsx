import { Progress, type ProgressProps, Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ProgressIconProps extends Omit<ProgressProps, 'percent'> {
  percent?: number | null;
}

const ProgressIcon = memo<ProgressIconProps>(({ showInfo, format, percent, ...rest }) => {
  if (typeof percent !== 'number') return;

  const content = (
    <Progress
      format={format}
      percent={percent}
      segments={5}
      showInfo={false}
      size={12}
      variant={'segments'}
      {...rest}
    />
  );

  if (showInfo)
    return (
      <div className="flex items-center gap-2">
        <div style={{ width: 24 }}>{content}</div>
        <Text color={cssVar.colorTextSecondary} fontSize={12}>
          {format?.(percent)}
        </Text>
      </div>
    );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span style={{ display: 'inline-flex' }}>{content}</span>} />
        <TooltipContent>{format?.(percent)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

export default ProgressIcon;
