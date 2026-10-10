'use client';

import { cssVar, useTheme } from 'antd-style';
import { cn } from 'cn';
import { type HTMLAttributes, type PropsWithChildren, type ReactNode, type Ref } from 'react';
import { memo } from 'react';

import { type SettingsContentWidth } from './settingsWidth';

interface SettingContainerProps extends HTMLAttributes<HTMLDivElement> {
  addonAfter?: ReactNode;
  addonBefore?: ReactNode;
  paddingBlock?: string | number;
  paddingInline?: string | number;
  ref?: Ref<HTMLDivElement>;
  variant?: 'default' | 'secondary';
  width?: SettingsContentWidth;
}
const SettingContainer = memo<PropsWithChildren<SettingContainerProps>>(
  ({
    variant,
    width = 'form',
    className,
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
        className={cn('flex h-full w-full flex-col items-center', className)}
        {...rest}
        ref={ref}
        style={{
          background:
            variant === 'secondary' ? theme.colorBgContainerSecondary : cssVar.colorBgContainer,
          overflowX: 'hidden',
          overflowY: 'auto',
          paddingBlock,
          paddingInline,
          ...style,
        }}
      >
        {addonBefore}
        <div
          className={cn(
            'flex w-full flex-1 flex-col gap-9',
            width === 'form' ? 'max-w-160' : 'max-w-256',
          )}
        >
          {children}
        </div>
        {addonAfter}
      </div>
    );
  },
);

export default SettingContainer;
