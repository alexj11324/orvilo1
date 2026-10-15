import type * as ReactTypes from 'react';
import type { CSSProperties } from 'react';

export interface ModelIconProps {
  className?: string;
  model?: string;
  shape?: 'circle' | 'square';
  size?: number;
  style?: CSSProperties;
  type?: 'avatar' | 'mono' | 'color' | 'combine' | 'combine-color';
}
declare const ModelIcon: ReactTypes.NamedExoticComponent<ModelIconProps>;
export default ModelIcon;
