import type * as ReactTypes from 'react';
import type { CSSProperties } from 'react';

export interface AgentIconProps {
  agent?: string;
  className?: string;
  shape?: 'circle' | 'square';
  size?: number;
  style?: CSSProperties;
  type?: 'avatar' | 'mono' | 'color' | 'combine' | 'combine-color';
}
declare const AgentIcon: ReactTypes.NamedExoticComponent<AgentIconProps>;
export default AgentIcon;
