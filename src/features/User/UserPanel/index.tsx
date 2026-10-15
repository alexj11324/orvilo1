'use client';

import { memo, type PropsWithChildren, type ReactElement, Suspense, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import PanelContent from './PanelContent';
import PanelContentSkeleton from './PanelContentSkeleton';
import UpgradeBadge from './UpgradeBadge';
import { useNewVersion } from './useNewVersion';

const styles = {
  popoverContent: 'p-0',
};

const UserPanel = memo<PropsWithChildren>(({ children }) => {
  const hasNewVersion = useNewVersion();
  const [open, setOpen] = useState(false);

  return (
    <Suspense fallback={children}>
      <UpgradeBadge showBadge={hasNewVersion}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={children as ReactElement} />
          <PopoverContent align="start" className={styles.popoverContent} side="top">
            <Suspense fallback={<PanelContentSkeleton />}>
              <PanelContent closePopover={() => setOpen(false)} />
            </Suspense>
          </PopoverContent>
        </Popover>
      </UpgradeBadge>
    </Suspense>
  );
});

UserPanel.displayName = 'UserPanel';

export default UserPanel;
