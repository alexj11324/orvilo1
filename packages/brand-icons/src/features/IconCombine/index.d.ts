import type * as ReactTypes from 'react';
import type { CSSProperties } from 'react';

import type { IconType } from '../../types';
import type { IconAvatarProps } from '../IconAvatar';
import type IconAvatar from '../IconAvatar';
import type { NativeIconLayoutProps as FlexboxProps } from '../NativeIconLayout';

export interface IconCombineProps extends FlexboxProps {
  color?: string;
  extra?: string;
  extraClassName?: string;
  extraStyle?: CSSProperties;
  Icon?: IconType | typeof IconAvatar;
  iconProps?: Partial<IconAvatarProps>;
  inverse?: boolean;
  showLogo?: boolean;
  showText?: boolean;
  size?: number;
  spaceMultiple?: number;
  Text?: IconType;
  textMultiple?: number;
}
declare const IconCombine: ReactTypes.NamedExoticComponent<IconCombineProps>;
export default IconCombine;
