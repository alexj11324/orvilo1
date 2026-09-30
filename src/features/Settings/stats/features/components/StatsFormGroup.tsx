'use client';

import { type HTMLAttributes, type ReactNode } from 'react';
import { memo } from 'react';

interface StatsFormGroupProps extends HTMLAttributes<HTMLDivElement> {
  afterTitle?: ReactNode;
  children: ReactNode;
  extra?: ReactNode;
  fontSize?: number;
  title?: string;
}

const StatsFormGroup = memo<StatsFormGroupProps>(
  ({ fontSize = 18, afterTitle, children, extra, title, ...rest }) => {
    return (
      <div className="flex flex-col gap-4" {...rest}>
        <div
          className={'flex min-w-0'}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div
            className={'flex min-w-0'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}
          >
            <span style={{ fontSize, fontWeight: 500 }}>{title}</span>
            {afterTitle}
          </div>
          <div
            className={'flex min-w-0'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 'none' }}
          >
            {extra}
          </div>
        </div>
        {children}
      </div>
    );
  },
);

export default StatsFormGroup;
