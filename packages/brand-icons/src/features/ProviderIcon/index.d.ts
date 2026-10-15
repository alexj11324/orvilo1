import type * as ReactTypes from 'react';
import type { CSSProperties } from 'react';

import type { ModelProviderKey } from '../providerEnum';

export interface ProviderIconProps {
  className?: string;
  forceMono?: boolean;
  provider?: ModelProviderKey | string;
  shape?: 'circle' | 'square';
  size?: number;
  style?: CSSProperties;
  type?: 'avatar' | 'mono' | 'color' | 'combine' | 'combine-color';
}
declare const ProviderIcon: ReactTypes.NamedExoticComponent<ProviderIconProps>;
export default ProviderIcon;
