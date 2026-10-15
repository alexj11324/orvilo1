import type * as ReactTypes from 'react';

import { type IconAvatarProps } from '../../features/IconAvatar';

export interface AvatarProps extends Omit<IconAvatarProps, 'Icon'> {
  type?: 'normal' | 'gpt3' | 'gpt4' | 'gpt5' | 'o1' | 'o3' | 'oss' | 'platform';
}
declare const Avatar: ReactTypes.NamedExoticComponent<AvatarProps>;
export default Avatar;
