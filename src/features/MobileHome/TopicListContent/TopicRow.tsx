import { AGENT_CHAT_TOPIC_URL } from '@orvilo/const';
import { createStaticStyles, cx } from 'antd-style';
import dayjs from 'dayjs';
import { memo } from 'react';

import Avatar from '@/components/Avatar';
import { TOPIC_STATUS_VISUALS } from '@/components/ExecutionStatus';
import UnreadDot from '@/components/UnreadDot';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import RunningGlyph from '@/features/Home/components/RunningGlyph';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import { type MobileTopicRow } from './mobileTopicRows';

const styles = createStaticStyles(({ css, cssVar }) => ({
  desc: css`
    display: flex;
    gap: 6px;
    align-items: center;

    font-size: 12px;
    line-height: 1.2;
    color: ${cssVar.colorTextDescription};
  `,
  row: css`
    display: flex;
    gap: 12px;
    align-items: center;

    padding-block: 10px;
    padding-inline: 16px;

    color: inherit;
    text-decoration: none;

    transition: background ${cssVar.motionDurationFast};

    &:active {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  time: css`
    flex: none;
    font-size: 12px;
    color: ${cssVar.colorTextPlaceholder};
  `,
  title: css`
    overflow: hidden;

    font-size: 15px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

const formatRowTime = (updatedAt: Date | number) => {
  const time = dayjs(updatedAt);
  if (time.isSame(dayjs(), 'day')) return time.format('HH:mm');
  if (time.isSame(dayjs(), 'year')) return time.format('MM-DD');
  return time.format('YYYY-MM-DD');
};

/** Status mark for the secondary line — never a model badge. */
const StatusMark = ({ status }: { status: MobileTopicRow['status'] }) => {
  if (!status) return null;
  if (status === 'unread') return <UnreadDot />;
  if (status === 'running') return <RunningGlyph size={12} />;
  const visual = TOPIC_STATUS_VISUALS[status];
  if (!visual) return null;
  return <visual.icon color={visual.color} size={12} style={{ flex: 'none' }} />;
};

/**
 * A conversation row on the mobile 会话 tab: topic title is the primary
 * visual, the owning agent is weak secondary metadata (status + name only —
 * model/provider is configuration and never appears here).
 */
const TopicRow = memo<{ topic: MobileTopicRow }>(({ topic }) => {
  const agent = useAgentDisplayMeta(topic.agentId);
  const isUnread = topic.status === 'unread';

  return (
    <WorkspaceLink
      aria-label={topic.title}
      className={cx(styles.row)}
      to={AGENT_CHAT_TOPIC_URL(topic.agentId, topic.id, true)}
    >
      <Avatar
        avatar={agent?.avatar}
        background={agent?.backgroundColor}
        shape={'circle'}
        size={40}
        style={{ flex: 'none' }}
        title={agent?.title}
      />
      <div className="min-w-0 flex-1">
        <div className={styles.title} style={isUnread ? { fontWeight: 600 } : undefined}>
          {topic.title}
        </div>
        <div className={styles.desc}>
          <StatusMark status={topic.status} />
          <span className="truncate">{agent?.title ?? '—'}</span>
        </div>
      </div>
      <div className={styles.time}>{formatRowTime(topic.updatedAt)}</div>
    </WorkspaceLink>
  );
});

TopicRow.displayName = 'MobileTopicRow';

export default TopicRow;
