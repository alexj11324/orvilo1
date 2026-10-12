import { AGENT_CHAT_TOPIC_URL } from '@orvilo/const';
import { cn } from 'cn';
import { memo, type ReactNode } from 'react';

import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import Time from '@/features/Home/components/Time';
import { inboxRowSelectKeyDown } from '@/features/WorkInbox/inboxRowKeyboard';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { resolveTopicTriggerTime, RunningElapsedTime } from './RunningElapsedTime';
import { type InboxTopic } from './useHomeInboxTopics';

const styles = {
  row: 'cursor-pointer py-2 px-2.5 rounded-(--radius-card) transition-[background-color] duration-(--orvilo-motion-fast) ease-[ease] hover:bg-accent',
};

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
      className={cn(
        styles.row,
        'flex items-center gap-2.5 outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
      )}
      onClick={open}
      onKeyDown={(event) => inboxRowSelectKeyDown(event, open)}
    >
      {leading}
      {agent && <AssigneeAvatar agentId={topic.agentId} size={22} />}
      <div className="flex items-center flex-1 min-w-0 gap-1.5">
        <div className="truncate block text-sm leading-5.5 min-w-0">{topic.title}</div>
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
