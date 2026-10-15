import type * as ReactTypes from 'react';

import type { NativeIconLayoutProps as FlexboxProps } from '../NativeIconLayout';
import type { ModelProviderKey } from '../providerEnum';

export interface ProviderCombineProps extends Omit<
  FlexboxProps,
  'children' | 'horizontal' | 'height' | 'width' | 'align' | 'justify'
> {
  provider?: ModelProviderKey | string;
  size?: number;
  type?: 'mono' | 'color';
}
declare const ProviderCombine: ReactTypes.NamedExoticComponent<ProviderCombineProps>;
export default ProviderCombine;
