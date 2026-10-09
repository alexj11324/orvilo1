import { type SidebarAgentItem } from '@orvilo/types';
import { MoreHorizontal } from 'lucide-react';
import { type CSSProperties } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import NavItem from '@/features/NavPanel/components/NavItem';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { SessionDefaultGroup } from '@/types/session';

import GroupItem from './AgentGroupItem';
import AgentItem from './AgentItem';
import { useKeepSidebarListed } from './useAgentList';

interface SessionListProps {
  dataSource: SidebarAgentItem[];
  groupId?: string;
  itemClassName?: string;
  itemStyle?: CSSProperties;
  onMoreClick?: () => void;
  visibility?: 'private' | 'public';
}

const List = memo<SessionListProps>(
  ({ onMoreClick, dataSource, groupId, itemStyle, itemClassName }) => {
    const { t } = useTranslation('chat');

    // Check if this is defaultList and if there are more agents
    const isDefaultList = groupId === SessionDefaultGroup.Default;
    const ungroupedAgents = useHomeStore(homeAgentListSelectors.ungroupedAgents);
    const agentPageSize = useGlobalStore(systemStatusSelectors.agentPageSize);
    const openAllAgentsDrawer = useHomeStore((s) => s.openAllAgentsDrawer);
    const keep = useKeepSidebarListed();

    // Count what the sidebar can actually show (caller's unpins excluded) so
    // hidden items alone never surface a dangling "More" row.
    const hasMore = isDefaultList && keep(ungroupedAgents).length > agentPageSize;

    if (dataSource.length === 0) return null;

    return (
      <div className="flex flex-col gap-[1px]">
        {dataSource.map((item) =>
          item.type === 'group' ? (
            <GroupItem className={itemClassName} item={item} key={item.id} style={itemStyle} />
          ) : (
            <AgentItem className={itemClassName} item={item} key={item.id} style={itemStyle} />
          ),
        )}
        {hasMore && (
          <NavItem
            icon={MoreHorizontal}
            title={t('input.more')}
            onClick={onMoreClick || openAllAgentsDrawer}
          />
        )}
      </div>
    );
  },
);

export default List;
