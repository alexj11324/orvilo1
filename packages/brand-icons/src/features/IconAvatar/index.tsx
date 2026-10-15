import type { IconAvatarProps } from '../../types';
import styles from './IconAvatar.module.css';

/** Native brand tile. Artwork colors belong to the brand, geometry to DESIGN.md. */
const IconAvatar = ({
  shape = 'circle',
  color = '#fff',
  background,
  size,
  style,
  iconMultiple = 0.75,
  Icon,
  iconStyle,
  iconClassName,
  className,
  ...rest
}: IconAvatarProps) => (
  <div
    {...rest}
    className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${shape === 'circle' ? 'rounded-full' : styles.square} ${className ?? ''}`}
    style={{ background, color, height: size, width: size, ...style }}
  >
    {Icon && (
      <Icon
        className={iconClassName}
        color={color}
        size={size}
        style={{ transform: `scale(${iconMultiple})`, ...iconStyle }}
      />
    )}
  </div>
);
export default IconAvatar;

export type { IconAvatarProps } from '../../types';
