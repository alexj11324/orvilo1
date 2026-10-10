'use client';

import { memo } from 'react';

import ToolAuthAlert from '@/features/Conversation/AgentWelcome/ToolAuthAlert';

import AgentInfo from './AgentInfo';
import { useWelcomeExtra } from './WelcomeExtraContext';

const AgentHome = memo(() => {
  const extra = useWelcomeExtra();

  return (
    <>
      <div className="flex flex-col flex-1" />
      <div className="flex flex-col gap-8 w-full" style={{ paddingBottom: 'max(4vh, 16px)' }}>
        <AgentInfo />
        {extra}
        <ToolAuthAlert />
      </div>
    </>
  );
});

export default AgentHome;
