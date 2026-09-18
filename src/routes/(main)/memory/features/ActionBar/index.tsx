'use client';

import { Flexbox } from '@lobehub/ui';
import { type PropsWithChildren } from 'react';
import { memo } from 'react';

import PurgeButton from './PurgeButton';

interface Props extends PropsWithChildren {
  gap?: number;
  showPurge?: boolean;
}

const ActionBar = memo<Props>(({ children, gap = 8, showPurge }) => {
  return (
    <Flexbox horizontal gap={gap}>
      {showPurge && <PurgeButton iconOnly />}
      {children}
    </Flexbox>
  );
});

ActionBar.displayName = 'MemoryActionBar';

export default ActionBar;
export { default as PurgeButton } from './PurgeButton';
