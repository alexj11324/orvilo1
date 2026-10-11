'use client';

import { useTheme } from 'antd-style';
import { type FC, type PropsWithChildren } from 'react';

const Container: FC<PropsWithChildren> = ({ children }) => {
  const theme = useTheme();

  return (
    <div
      className="relative flex flex-1 flex-col overflow-y-auto"
      style={{
        background: theme.colorBgContainerSecondary,
      }}
    >
      {children}
    </div>
  );
};

export default Container;
