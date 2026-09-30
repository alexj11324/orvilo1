import React, { memo, useCallback, useMemo } from 'react';

import { Accordion } from '@/components/ui/accordion';
import { useAgentStore } from '@/store/agent';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import Topic from './Topic';

export enum ChatSidebarKey {
  Topic = 'topic',
}

const DEFAULT_EXPANDED: Record<string, boolean> = {
  [ChatSidebarKey.Topic]: true,
};

const Body = memo(() => {
  const agentId = useAgentStore((s) => s.activeAgentId);
  // Per-agent expand/collapse state, so switching agents remembers each one's
  // own sidebar layout instead of sharing a single (uncontrolled) accordion.
  const sections = useGlobalStore(systemStatusSelectors.agentSidebarSections(agentId));
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  const expandedKeys = useMemo(() => {
    const resolved = { ...DEFAULT_EXPANDED, ...sections };
    return Object.keys(resolved).filter((key) => resolved[key]);
  }, [sections]);

  const handleExpandedChange = useCallback(
    (keys: string[]) => {
      if (!agentId) return;
      updateSystemStatus({
        expandAgentSidebarSectionsByAgent: {
          [agentId]: {
            [ChatSidebarKey.Topic]: keys.includes(ChatSidebarKey.Topic),
          },
        },
      });
    },
    [agentId, updateSystemStatus],
  );

  return (
    <div className="flex flex-col" style={{ paddingInline: 4 }}>
      <Accordion
        multiple
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        value={expandedKeys}
        onValueChange={(next) => handleExpandedChange(next as string[])}
      >
        <Topic
          expanded={expandedKeys.includes(ChatSidebarKey.Topic)}
          itemKey={ChatSidebarKey.Topic}
        />
      </Accordion>
    </div>
  );
});

export default Body;
