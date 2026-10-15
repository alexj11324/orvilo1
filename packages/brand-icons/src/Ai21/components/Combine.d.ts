import type * as ReactTypes from 'react';

import { type IconCombineProps } from '../../features/IconCombine';

export interface CombineProps extends Omit<IconCombineProps, 'Icon' | 'Text'> {
  type: 'mono' | 'color';
}
declare const Combine: ReactTypes.NamedExoticComponent<CombineProps>;
export default Combine;
