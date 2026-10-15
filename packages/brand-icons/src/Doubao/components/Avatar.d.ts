import type * as ReactTypes from 'react';

import { type IconAvatarProps } from '../../features/IconAvatar';

export type AvatarProps = Omit<IconAvatarProps, 'Icon'>;
declare const Avatar: ReactTypes.NamedExoticComponent<AvatarProps>;
export default Avatar;
