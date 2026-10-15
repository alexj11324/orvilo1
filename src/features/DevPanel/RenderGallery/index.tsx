'use client';

import { cn } from 'cn';
import { useEffect, useState } from 'react';

import { useAgentStore } from '@/store/agent';
import { useAgentGroupStore } from '@/store/agentGroup';

import {
  DEVTOOLS_AGENT_ID,
  DEVTOOLS_AGENT_META,
  DEVTOOLS_GROUP_DETAIL,
  DEVTOOLS_GROUP_ID,
} from './fixtures';
import Sidebar from './Sidebar';
import ToolPage from './ToolPage';
import { useDevtoolsEntries } from './useDevtoolsEntries';

const styles = {
  empty: 'flex-1 items-center justify-center text-sm leading-5.5 text-foreground-tertiary',
  main: 'overflow-hidden flex-1 min-w-0 min-h-0 bg-card',
  page: 'overflow-hidden w-full h-full bg-card',
};

const RenderGallery = () => {
  const { defaultToolset, menuItems, toolsetMap } = useDevtoolsEntries();
  const [identifier, setIdentifier] = useState<string | undefined>(defaultToolset?.identifier);
  const toolset = identifier ? toolsetMap.get(identifier) : undefined;

  useEffect(() => {
    const previousGroupState = useAgentGroupStore.getState();

    useAgentGroupStore.setState({
      activeGroupId: DEVTOOLS_GROUP_ID,
      groupMap: {
        ...previousGroupState.groupMap,
        [DEVTOOLS_GROUP_ID]: DEVTOOLS_GROUP_DETAIL as any,
      },
    });

    // Seed the Aggregate-preview agent meta so its turns read as "Orvilo AI"
    // (avatar + name) instead of the unresolved-agent fallback.
    const previousAgentMap = useAgentStore.getState().agentMap;
    useAgentStore.setState({
      agentMap: { ...previousAgentMap, [DEVTOOLS_AGENT_ID]: DEVTOOLS_AGENT_META as any },
    });

    return () => {
      useAgentGroupStore.setState({
        activeGroupId: previousGroupState.activeGroupId,
        groupMap: previousGroupState.groupMap,
      });
      useAgentStore.setState({ agentMap: previousAgentMap });
    };
  }, []);

  return (
    <div className={cn(styles.page, 'flex')}>
      <Sidebar items={menuItems} selectedKey={identifier} onSelect={setIdentifier} />
      <div className={cn(styles.main, 'flex flex-col')}>
        {toolset ? (
          <ToolPage toolset={toolset} />
        ) : (
          <div className={cn(styles.empty, 'flex flex-col')}>
            No builtin tool renders registered.
          </div>
        )}
      </div>
    </div>
  );
};

export default RenderGallery;
