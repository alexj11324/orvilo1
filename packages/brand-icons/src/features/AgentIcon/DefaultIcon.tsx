import { Bot } from 'lucide-react';

import type { IconProps } from '../../types';

const DefaultIcon = ({ size = 12, color, className, ...rest }: IconProps) => (
  <Bot
    {...rest}
    className={`text-foreground-description ${className ?? ''}`}
    color={color}
    size={size}
  />
);
export default DefaultIcon;
