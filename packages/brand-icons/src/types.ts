import type { ComponentType, CSSProperties, HTMLAttributes, SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement> & { size?: string | number; title?: string };
export type IconType = ComponentType<IconProps>;
export interface IconAvatarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'color'> {
  background?: string;
  color?: string;
  Icon?: IconType;
  iconClassName?: string;
  iconMultiple?: number;
  iconStyle?: CSSProperties;
  shape?: 'circle' | 'square';
  size: number;
}
