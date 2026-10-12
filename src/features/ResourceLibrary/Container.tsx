'use client';

import { type FC, type PropsWithChildren } from 'react';

const Container: FC<PropsWithChildren> = ({ children }) => {
  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto bg-surface-secondary">
      {children}
    </div>
  );
};

export default Container;
