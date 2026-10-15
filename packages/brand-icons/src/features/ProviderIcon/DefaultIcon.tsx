import type { IconProps } from '../../types';
import ProviderFallback from '../ProviderFallback';

const DefaultIcon = ({ size = 12, color, className, ...rest }: IconProps) => (
  <ProviderFallback
    {...rest}
    className={`text-foreground-description ${className ?? ''}`}
    color={color}
    size={size}
  />
);
export default DefaultIcon;
