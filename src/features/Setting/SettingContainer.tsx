'use client';

import { cn } from 'cn';
import {
  type CSSProperties,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
  type Ref,
} from 'react';
import { memo } from 'react';

import { type SettingWidth, settingWidthClassNames } from './settingWidth';

export interface SettingContainerProps extends HTMLAttributes<HTMLDivElement> {
  addonAfter?: ReactNode;
  addonBefore?: ReactNode;
  paddingBlock?: CSSProperties['paddingBlock'];
  paddingInline?: CSSProperties['paddingInline'];
  ref?: Ref<HTMLDivElement>;
  variant?: 'default' | 'secondary' | 'workspace';
  width?: SettingWidth;
}
const SettingContainer = memo<PropsWithChildren<SettingContainerProps>>(
  ({
    variant,
    width = 'form',
    children,
    addonAfter,
    addonBefore,
    paddingBlock,
    paddingInline,
    style,
    ref,
    ...rest
  }) => {
    return (
      <div
        {...rest}
        ref={ref}
        className={
          variant === 'workspace'
            ? 'className' in rest
              ? rest.className
              : 'flex h-full w-full flex-col items-center overflow-x-hidden overflow-y-auto bg-card'
            : [
                !(style && 'background' in style && !style.background) &&
                  (variant === 'secondary' ? 'bg-surface-secondary' : 'bg-card'),
                !(style && 'overflowX' in style && !style.overflowX) && 'overflow-x-hidden',
                !(style && 'overflowY' in style && !style.overflowY) && 'overflow-y-auto',
                'className' in rest ? rest.className : 'flex flex-col items-center h-full w-full',
              ]
                .filter(Boolean)
                .join(' ')
        }
        style={{
          paddingBlock,
          paddingInline,
          ...style,
        }}
      >
        {addonBefore}
        <div className={cn('flex flex-col flex-1 gap-9 w-full', settingWidthClassNames[width])}>
          {children}
        </div>
        {addonAfter}
      </div>
    );
  },
);

export default SettingContainer;
