'use client';

import { type BlockProps } from '@lobehub/ui';
import { Block } from '@lobehub/ui';
import { type ReactNode } from 'react';
import { memo } from 'react';

interface StatsFormGroupProps extends Omit<BlockProps, 'title'> {
  afterTitle?: ReactNode;
  children: ReactNode;
  extra?: ReactNode;
  fontSize?: number;
  title?: string;
}

const StatsFormGroup = memo<StatsFormGroupProps>(
  ({ fontSize = 18, afterTitle, children, extra, title, ...rest }) => {
    return (
      <Block gap={16} variant={'borderless'} {...rest}>
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
      </Block>
    );
  },
);

export default StatsFormGroup;
