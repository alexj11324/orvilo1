import type * as ReactTypes from 'react';
import type { HTMLAttributes as NativeAttributes, ReactNode } from 'react';

type DivProps = NativeAttributes<HTMLDivElement>;
declare const Combine: ReactTypes.NamedExoticComponent<
  DivProps & {
    left: ReactNode;
    right: ReactNode;
    size: number;
  }
>;
export default Combine;
