import type { FC, HTMLAttributes as NativeAttributes } from 'react';

import type { IconType } from '../types';
import type { IconAvatarProps } from './IconAvatar';
import type { IconCombineProps } from './IconCombine';

type DivProps = NativeAttributes<HTMLDivElement>;
type ProviderIconType = FC<IconType & any> & {
  Avatar: FC<Omit<IconAvatarProps, 'Icon'> & any>;
  Brand?: FC<IconType & any>;
  BrandColor?: FC<IconType & any>;
  Color?: FC<IconType & any>;
  Combine?: FC<Omit<IconCombineProps, 'Icon' | 'Text'> & any>;
  Text?: FC<IconType & any>;
};
export interface ProviderMapping {
  Combine?: FC<
    DivProps & {
      size: number;
      type: 'color' | 'mono';
    }
  >;
  combineMultiple?: number;
  Icon: ProviderIconType;
  keywords: string[];
  props?: any;
}
export declare const providerMappings: ProviderMapping[];
export {};
