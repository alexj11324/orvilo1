'use client';

import { Flexbox } from '@lobehub/ui';
import { Drawer } from '@lobehub/ui/base-ui';
import { memo } from 'react';

import { PortalContent } from '@/features/Portal/router';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { isAcceptancePortalView } from './acceptancePortalView';
import { usePortalColumnHost } from './usePortalColumnHost';

/**
 * Home has no persistent chat portal column. Internal acceptance links still
 * use the shared portal stack, so host that content in a right-side drawer and
 * keep the user anchored in the inbox report they were reading.
 *
 * That is the case the drawer exists for, and the routes with a column are the
 * ones it must stay out of: `AgentTaskManager` renders `PortalContent` under the
 * same condition (`index.tsx:24-38` — the predicate is hand-copied there), so
 * both would show one acceptance view. The product's own flow makes that happen
 * rather than merely allowing it: `useOpenAcceptanceInPanel` pushes the view AND
 * expands the panel.
 *
 * The column having been matched is not sufficient. `DraggablePanel` keeps its
 * children mounted and only sizes them to zero when collapsed, so a collapsed
 * column holds the view *invisibly* — closing the drawer then would leave the
 * user with nothing. Both conditions are required.
 */
const AcceptancePortalDrawer = memo(() => {
  const [viewType, clearPortalStack] = useChatStore((state) => [
    chatPortalSelectors.currentViewType(state),
    state.clearPortalStack,
  ]);
  const columnHost = usePortalColumnHost();
  const columnExpanded = useGlobalStore(systemStatusSelectors.showTaskAgentPanel);
  const open = isAcceptancePortalView(viewType) && !(columnHost && columnExpanded);

  return (
    <Drawer
      noHeader
      closable={false}
      containerMaxWidth={'100%'}
      open={open}
      placement={'right'}
      width={'min(960px, 92vw)'}
      styles={{
        bodyContent: { height: '100%', minHeight: 0, overflow: 'hidden', padding: 0 },
      }}
      onClose={clearPortalStack}
    >
      {open && (
        <Flexbox height={'100%'} style={{ minHeight: 0, overflow: 'hidden' }}>
          <PortalContent />
        </Flexbox>
      )}
    </Drawer>
  );
});

AcceptancePortalDrawer.displayName = 'AcceptancePortalDrawer';

export default AcceptancePortalDrawer;
