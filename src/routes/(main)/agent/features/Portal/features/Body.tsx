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
      style={{ flex: 1, height: 0, position: 'relative', width: '100%' }}
    >
      {children}
    </div>
  );
};

export default Body;
