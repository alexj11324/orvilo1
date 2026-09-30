'use client';

import { memo } from 'react';

import AgentInfo from './AgentInfo';

/**
 * Welcome surface for viewers who do not own the agent (e.g. the agent-share
 * visitor page): agent identity only, without the owner-scoped opening
 * questions and tool-authorization alert that `AgentHome` renders.
 */
const ReadOnlyAgentHome = memo(() => (
  <>
    <div className="flex flex-col flex-1" />
    <div className="flex flex-col gap-8 w-full" style={{ paddingBottom: 'max(4vh, 16px)' }}>
      <AgentInfo />
    </div>
  </>
));

ReadOnlyAgentHome.displayName = 'ReadOnlyAgentHome';

export default ReadOnlyAgentHome;
