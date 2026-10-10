'use client';

import { PanelRightClose } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { TopicChatDrawerBody } from '@/features/AgentTasks/AgentTaskDetail/TopicChatDrawer';

import type { OriginTopicPanelProps } from './originConversation';

/**
 * The origin conversation rendered in the acceptance workspace's existing
 * right rail. It deliberately reuses the drawer's conversation body without
 * mounting the floating drawer chrome.
 */
const TopicPanel = memo<OriginTopicPanelProps>(
  ({ agentAvatar, agentBackgroundColor, agentId, onCollapse, title, topicId }) => {
    const { t } = useTranslation('verify');

    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-card">
        <div className="flex shrink-0 items-center gap-2 p-3 border-b border-sidebar-border">
          <Avatar
            avatar={agentAvatar ?? undefined}
            background={agentBackgroundColor ?? undefined}
            size={20}
          />
          <div className="truncate min-w-0 flex-1 font-semibold text-[13px]">{title}</div>
          <ActionIcon
            icon={PanelRightClose}
            size={'small'}
            title={t('acceptance.ledger.collapse')}
            onClick={onCollapse}
          />
        </div>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <TopicChatDrawerBody
            defaultInputExpanded
            disableInputCollapse
            agentId={agentId}
            topicId={topicId}
          />
        </div>
      </div>
    );
  },
);

TopicPanel.displayName = 'TopicPanel';

export default TopicPanel;
