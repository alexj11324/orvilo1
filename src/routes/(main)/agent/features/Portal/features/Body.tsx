'use client';

import { css, cx } from 'antd-style';
import { cn } from 'cn';
import { type PropsWithChildren } from 'react';

const body = css`
  :has(.portal-artifact) {
    overflow: hidden;
    padding-block-end: 12px;
  }
`;

const Body = ({ children }: PropsWithChildren) => {
  return (
    <div
      className={cn('flex flex-col', cx(body, 'portal-body'))}
      style={{ height: '100%', width: '100%', flex: 1, height: 0, position: 'relative' }}
    >
      {children}
    </div>
  );
};

export default Body;
