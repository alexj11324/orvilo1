'use client';

import isEqual from 'fast-deep-equal';
import { memo } from 'react';

import ToolAuthAlert from '@/features/Conversation/AgentWelcome/ToolAuthAlert';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import AgentInfo from './AgentInfo';
import OpeningQuestions from './OpeningQuestions';
import { useWelcomeExtra } from './WelcomeExtraContext';

const AgentHome = memo(() => {
  const openingQuestions = useAgentStore(agentSelectors.openingQuestions, isEqual);
  const extra = useWelcomeExtra();

  return (
    <>
      <div className="flex flex-col flex-1" />
      <div className="flex flex-col gap-8 w-full" style={{ paddingBottom: 'max(4vh, 16px)' }}>
        <AgentInfo />
        {extra}
        {openingQuestions.length > 0 && <OpeningQuestions questions={openingQuestions} />}
        <ToolAuthAlert />
      </div>
    </>
  );
});

export default AgentHome;
