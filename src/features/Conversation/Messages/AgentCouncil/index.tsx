'use client';

import { Tabs } from '@lobehub/ui/base-ui';
import { type UIChatMessage } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { BotIcon, Columns2, Layers } from 'lucide-react';
import { memo, useState } from 'react';

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
            <Tabs
              activeKey={String(activeTab)}
              size="small"
              items={members.map((_, idx) => ({
                icon: <BotIcon size={14} />,
                key: String(idx),
                label: null,
              }))}
              onChange={(key) => setActiveTab(Number(key))}
            />
          ) : (
            <div />
          )}
          <Tabs
            activeKey={displayMode}
            size="small"
            items={[
              { icon: <Columns2 />, key: 'horizontal', label: null },
              { icon: <Layers />, key: 'tab', label: null },
            ]}
            onChange={(key) => setDisplayMode(key as DisplayMode)}
          />
        </div>
      </WideScreenContainer>
      <CouncilList activeTab={activeTab} displayMode={displayMode} members={members} />
    </>
  );
}, isEqual);

export default AgentCouncilMessage;
