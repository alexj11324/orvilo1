'use client';

import { cssVar } from 'antd-style';
import { Loader2 } from 'lucide-react';
import { memo } from 'react';

import { useTopicMigrationPending } from './MigrationBanner';
import type { MigrationTarget } from './useAgentTransferJob';

interface TopicMigrationIndicatorProps extends MigrationTarget {
  topicId: string;
}

/**
 * Tiny spinner next to a sidebar topic whose history is still migrating after
 * a transfer or a copy. The topic stays listed (hiding it would read as data
 * loss); opening it jumps it to the front of the backfill queue.
 */
const TopicMigrationIndicator = memo<TopicMigrationIndicatorProps>(
  ({ agentId, groupId, topicId }) => {
    const { topicPending } = useTopicMigrationPending({ agentId, groupId }, topicId);

    if (!topicPending) return null;

    return <Loader2 className="animate-spin" color={cssVar.colorTextQuaternary} size={12} />;
  },
);

TopicMigrationIndicator.displayName = 'TopicMigrationIndicator';

export default TopicMigrationIndicator;
