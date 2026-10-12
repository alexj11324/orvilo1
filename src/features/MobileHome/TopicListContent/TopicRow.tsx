import { AGENT_CHAT_TOPIC_URL } from '@orvilo/const';
import { formatAbsoluteDate } from '@orvilo/utils/time';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { MessageSquare } from 'lucide-react';
import { memo } from 'react';

import { TOPIC_STATUS_VISUALS } from '@/components/ExecutionStatus';
import UnreadDot from '@/components/UnreadDot';
import RunningGlyph from '@/features/Home/components/RunningGlyph';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import { type MobileTopicRow } from './mobileTopicRows';

const styles = {
  desc: 'flex min-h-5 items-center gap-1.5 text-xs leading-5 text-muted-foreground',
  row: 'flex min-h-11 items-center gap-3 px-4 pbs-2.5 pbe-2.5 text-foreground no-underline transition-[background-color] duration-(--orvilo-motion-mid) ease-[ease] motion-reduce:transition-none active:bg-accent focus-visible:outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-ring/50',
  time: 'flex-none text-xs leading-5 text-muted-foreground',
  title: 'truncate text-sm leading-5.5',
};

const formatRowTime = (updatedAt: Date | number) => {
  const time = dayjs(updatedAt);
  if (time.isSame(dayjs(), 'day')) return time.format('HH:mm');
  return formatAbsoluteDate(time);
};

/** Status mark for the secondary line — never a model badge. */
const StatusMark = ({ status }: { status: MobileTopicRow['status'] }) => {
  if (!status) return null;
  if (status === 'unread') return <UnreadDot />;
  if (status === 'running') return <RunningGlyph size={16} />;
  const visual = TOPIC_STATUS_VISUALS[status];
  if (!visual) return null;
  return <visual.icon className="flex-none" color={visual.color} size={16} />;
};

/**
 * A conversation row on the mobile 会话 tab: the topic title is the primary
 * visual and execution status is the only secondary line — the owning agent
 * lives in the composer's agent picker once the topic opens, never on the
 * row itself.
 */
const TopicRow = memo<{ topic: MobileTopicRow }>(({ topic }) => {
  const isUnread = topic.status === 'unread';

  return (
    <WorkspaceLink
      aria-label={topic.title}
      className={styles.row}
      to={AGENT_CHAT_TOPIC_URL(topic.agentId, topic.id, true)}
    >
      <span className="flex size-10 flex-none items-center justify-center rounded-full bg-selected">
        <MessageSquare className="text-muted-foreground" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn(styles.title, isUnread && 'font-semibold')}>{topic.title}</div>
        {topic.status ? (
          <div className={styles.desc}>
            <StatusMark status={topic.status} />
          </div>
        ) : null}
      </div>
      <div className={styles.time}>{formatRowTime(topic.updatedAt)}</div>
    </WorkspaceLink>
  );
});

TopicRow.displayName = 'MobileTopicRow';

export default TopicRow;
