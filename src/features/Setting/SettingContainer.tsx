'use client';

import { cssVar, useTheme } from 'antd-style';
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
    const theme = useTheme(); // Keep for colorBgContainerSecondary (not in cssVar)
    return (
      <div
        className={
          variant === 'workspace'
            ? 'flex h-full w-full flex-col items-center overflow-x-hidden overflow-y-auto bg-card'
            : 'flex flex-col items-center h-full w-full'
        }
        {...rest}
        ref={ref}
        style={{
          ...(variant === 'workspace'
            ? {}
            : {
                background:
                  variant === 'secondary'
                    ? theme.colorBgContainerSecondary
                    : cssVar.colorBgContainer,
                overflowX: 'hidden',
                overflowY: 'auto',
              }),
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
