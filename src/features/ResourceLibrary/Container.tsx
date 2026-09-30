'use client';

import { useTheme } from 'antd-style';
import { type FC, type PropsWithChildren } from 'react';

const Container: FC<PropsWithChildren> = ({ children }) => {
  const theme = useTheme();

  return (
    <div
      className="flex flex-col flex-1"
      style={{
        background: theme.colorBgContainerSecondary,
        overflowY: 'auto',
        position: 'relative',
      }}
    >
      {children}
    </div>
  );
};

export default Container;
