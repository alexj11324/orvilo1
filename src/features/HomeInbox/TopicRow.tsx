import { AGENT_CHAT_TOPIC_URL } from '@orvilo/const';
import { agentDisplayName } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { memo, type ReactNode } from 'react';

import Avatar from '@/components/Avatar';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import Time from '@/features/Home/components/Time';
import { inboxRowSelectKeyDown } from '@/features/WorkInbox/inboxRowKeyboard';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { resolveTopicTriggerTime, RunningElapsedTime } from './RunningElapsedTime';
import { type InboxTopic } from './useHomeInboxTopics';

const styles = createStaticStyles(({ css, cssVar }) => ({
  row: css`
    cursor: pointer;

    padding-block: 8px;
    padding-inline: 10px;
    border-radius: ${cssVar.borderRadius};

    transition: background ${cssVar.motionDurationFast};

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
}));

interface TopicRowProps {
  /** Status glyph or live spinner — supplied by the caller so a running row can spin. */
  leading: ReactNode;
  topic: InboxTopic;
  trailing?: ReactNode;
}

const TopicRow = memo<TopicRowProps>(({ topic, leading, trailing }) => {
  const navigate = useWorkspaceAwareNavigate();
  const agent = useAgentDisplayMeta(topic.agentId);

  const open = () => {
    if (!topic.agentId) return;
    navigate(AGENT_CHAT_TOPIC_URL(topic.agentId, topic.id));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={cx(
        styles.row,
        'flex items-center gap-2.5 outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
      )}
      onClick={open}
      onKeyDown={(event) => inboxRowSelectKeyDown(event, open)}
    >
      {leading}
      {agent && (
        <Avatar
          avatar={agent.avatar}
          background={agent.backgroundColor}
          shape={'circle'}
          size={22}
          style={{ flex: 'none' }}
          title={agentDisplayName(agent)}
        />
      )}
      <div className="flex items-center flex-1 gap-1.5" style={{ minWidth: 0 }}>
        <div className="truncate block text-[13px]" style={{ minWidth: 0 }}>
          {topic.title}
        </div>
        <RunningElapsedTime startTime={topic.runStartedAt} />
      </div>
      {trailing}
      <Time
        date={resolveTopicTriggerTime(topic.runStartedAt, topic.updatedAt ?? topic.createdAt)}
      />
    </div>
  );
});

export default TopicRow;
