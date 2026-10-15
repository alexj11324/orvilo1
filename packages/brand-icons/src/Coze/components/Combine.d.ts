import type * as ReactTypes from 'react';

import { type IconCombineProps } from '../../features/IconCombine';

export type CombineProps = Omit<IconCombineProps, 'Icon' | 'Text'>;
declare const Combine: ReactTypes.NamedExoticComponent<CombineProps>;
export default Combine;
