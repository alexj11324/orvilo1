import React, { memo, type PropsWithChildren, type ReactElement, Suspense } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import List from '@/features/HomeSidebar/Body/Agent/List';
import { AgentModalProvider } from '@/features/HomeSidebar/Body/Agent/ModalProvider';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

const SwitchPanel = memo<PropsWithChildren>(({ children }) => {
  const navigate = useWorkspaceAwareNavigate();
  return (
    <Popover>
      <PopoverTrigger render={children as ReactElement} />
      <PopoverContent align="start" className="p-0" side="bottom" style={{ width: 240 }}>
        <Suspense fallback={<SkeletonList rows={6} />}>
          <AgentModalProvider>
            <div
              className="flex flex-col gap-1 p-2"
              style={{
                maxHeight: '50vh',
                overflowY: 'auto',
              }}
            >
              <List onMoreClick={() => navigate('/')} />
            </div>
          </AgentModalProvider>
        </Suspense>
      </PopoverContent>
    </Popover>
  );
});

export default SwitchPanel;
