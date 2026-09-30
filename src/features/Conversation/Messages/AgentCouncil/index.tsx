'use client';

import { type UIChatMessage } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { BotIcon, Columns2, Layers } from 'lucide-react';
import { memo, useState } from 'react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WideScreenContainer from '@/features/WideScreenContainer';

import { dataSelectors, useConversationStore } from '../../store';
import CouncilList from './components/CouncilList';

export type DisplayMode = 'horizontal' | 'tab';

interface AgentCouncilMessageProps {
  id: string;
  index: number;
  isLatestItem?: boolean;
}

const AgentCouncilMessage = memo<AgentCouncilMessageProps>(({ id }) => {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('horizontal');
  const [activeTab, setActiveTab] = useState(0);
  const item = useConversationStore(dataSelectors.getDisplayMessageById(id), isEqual)!;
  const members = (item as UIChatMessage)?.members?.filter(Boolean) as UIChatMessage[] | undefined;
  if (!members || members.length === 0) {
    return null;
  }

  return (
    <>
      <WideScreenContainer>
        <div className="flex items-center gap-2 justify-between py-2" style={{ height: 48 }}>
          {displayMode === 'tab' ? (
            <Tabs value={String(activeTab)} onValueChange={(key) => setActiveTab(Number(key))}>
              <TabsList>
                {members
                  .map((_, idx) => ({
                    icon: <BotIcon size={14} />,
                    key: String(idx),
                    label: null,
                  }))
                  .map((item) => (
                    <TabsTrigger key={item.key} value={item.key}>
                      {item.icon}
                      {item.label}
                    </TabsTrigger>
                  ))}
              </TabsList>
            </Tabs>
          ) : (
            <div />
          )}
          <Tabs value={displayMode} onValueChange={(key) => setDisplayMode(key as DisplayMode)}>
            <TabsList>
              <TabsTrigger value={'horizontal'}>
                <Columns2 />
                {null}
              </TabsTrigger>
              <TabsTrigger value={'tab'}>
                <Layers />
                {null}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </WideScreenContainer>
      <CouncilList activeTab={activeTab} displayMode={displayMode} members={members} />
    </>
  );
}, isEqual);

export default AgentCouncilMessage;
