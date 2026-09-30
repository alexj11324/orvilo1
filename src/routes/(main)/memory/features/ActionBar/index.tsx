'use client';

import { type PropsWithChildren } from 'react';
import { memo } from 'react';

import PurgeButton from './PurgeButton';

interface Props extends PropsWithChildren {
  gap?: number;
  showPurge?: boolean;
}

const ActionBar = memo<Props>(({ children, gap = 8, showPurge }) => {
  return (
    <div className="flex" style={{ gap }}>
      {showPurge && <PurgeButton iconOnly />}
      {children}
    </div>
  );
});

ActionBar.displayName = 'MemoryActionBar';

export default ActionBar;
export { default as PurgeButton } from './PurgeButton';
