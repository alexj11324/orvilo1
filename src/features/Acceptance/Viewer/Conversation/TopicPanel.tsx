'use client';

import { ActionIcon, Avatar, Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { PanelRightClose } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
      <div
        className="flex flex-col h-full"
        style={{ background: cssVar.colorBgContainer, minHeight: 0, overflow: 'hidden' }}
      >
        <div
          className="flex items-center gap-2"
          style={{
            paddingBlock: 12,
            paddingInline: 12,
            borderBlockEnd: `1px solid ${cssVar.colorBorderSecondary}`,
            flexShrink: 0,
          }}
        >
          <Avatar
            avatar={agentAvatar ?? undefined}
            background={agentBackgroundColor ?? undefined}
            size={20}
          />
          <Text ellipsis strong style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
            {title}
          </Text>
          <ActionIcon
            icon={PanelRightClose}
            size={'small'}
            title={t('acceptance.ledger.collapse')}
            onClick={onCollapse}
          />
        </div>
        <div className="flex flex-col flex-1" style={{ minHeight: 0, overflow: 'hidden' }}>
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
