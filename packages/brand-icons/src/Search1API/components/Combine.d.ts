import type * as ReactTypes from 'react';

import { type IconCombineProps } from '../../features/IconCombine';

export interface CombineProps extends Omit<IconCombineProps, 'Icon' | 'Text'> {
  type?: 'color' | 'mono';
}
declare const Combine: ReactTypes.NamedExoticComponent<CombineProps>;
export default Combine;
