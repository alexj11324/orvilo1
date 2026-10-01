'use client';

import { cssVar, useTheme } from 'antd-style';
import { type HTMLAttributes, type PropsWithChildren, type ReactNode, type Ref } from 'react';
import { memo } from 'react';

interface SettingContainerProps extends HTMLAttributes<HTMLDivElement> {
  addonAfter?: ReactNode;
  addonBefore?: ReactNode;
  maxWidth?: number | string;
  paddingBlock?: string | number;
  paddingInline?: string | number;
  ref?: Ref<HTMLDivElement>;
  variant?: 'default' | 'secondary';
}
const SettingContainer = memo<PropsWithChildren<SettingContainerProps>>(
  ({
    variant,
    maxWidth = 1024,
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
        className="flex flex-col items-center h-full w-full"
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
          className="flex flex-col flex-1 gap-[36px] w-full"
          style={{
            maxWidth,
          }}
        >
          {children}
        </div>
        {addonAfter}
      </div>
    );
  },
);

export default SettingContainer;
