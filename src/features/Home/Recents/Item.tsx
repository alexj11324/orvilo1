import type { RecentItem } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { BookmarkIcon, FileTextIcon, HashIcon, MoreHorizontalIcon, UsersIcon } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import InlineRename from '@/components/InlineRename';
import TaskStatusIcon from '@/features/AgentTasks/features/TaskStatusIcon';
import RunningGlyph from '@/features/Home/components/RunningGlyph';
import NavItem from '@/features/NavPanel/components/NavItem';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { usePrefetchAgent } from '@/hooks/usePrefetchAgent';
import { usePrefetchPage } from '@/hooks/usePrefetchPage';

import { useRecentItemDropdownMenu } from './useDropdownMenu';

const TYPE_ICON_MAP: Partial<Record<RecentItem['type'], typeof FileTextIcon>> = {
  document: FileTextIcon,
  project: PROJECT_ENTITY_ICON,
  savedView: BookmarkIcon,
  team: UsersIcon,
  topic: HashIcon,
};

const RecentListItem = memo<RecentItem>((item) => {
  const { t: tCommon } = useTranslation('common');
  const { title, type, agentId, id, status } = item;
  const IconComponent = TYPE_ICON_MAP[type] || FileTextIcon;
  const [editing, setEditing] = useState(false);
  const prefetchAgent = usePrefetchAgent();
  const prefetchPage = usePrefetchPage();

  const toggleEditing = useCallback((visible?: boolean) => {
    setEditing(!!visible);
  }, []);

  const handleMouseEnter = useCallback(() => {
    switch (type) {
      case 'topic':
      case 'task': {
        if (agentId) prefetchAgent(agentId);
        break;
      }
      case 'document': {
        prefetchPage(id);
        break;
      }
    }
  }, [type, agentId, id, prefetchAgent, prefetchPage]);

  const { dropdownMenu, handleRename } = useRecentItemDropdownMenu(item, toggleEditing);
  const menuItems = dropdownMenu();
  const hasOverflowMenu = (menuItems?.length ?? 0) > 0;

  return (
    <div className="flex flex-col" style={{ position: 'relative' }}>
      <NavItem
        contextMenuItems={hasOverflowMenu ? dropdownMenu : undefined}
        disabled={editing}
        title={title}
        actions={
          hasOverflowMenu ? (
            <SidebarDropdownMenu items={menuItems}>
              <ActionIcon
                aria-label={tCommon('more')}
                icon={MoreHorizontalIcon}
                size={'small'}
                style={{ flex: 'none' }}
              />
            </SidebarDropdownMenu>
          ) : undefined
        }
        icon={(() => {
          if (type === 'task') {
            // Same liveness signal as running topics: an executing task wears
            // the animated running mark, not the static status glyph.
            if (status === 'running') return <RunningGlyph size={16} />;
            return <TaskStatusIcon size={16} status={status ?? 'backlog'} />;
          }

          return <IconComponent size={'small'} style={{ color: cssVar.colorTextDescription }} />;
        })()}
        onMouseEnter={handleMouseEnter}
      />
      <InlineRename
        open={editing}
        title={title}
        onOpenChange={(open) => toggleEditing(open)}
        onSave={handleRename}
      />
    </div>
  );
});

export default RecentListItem;
