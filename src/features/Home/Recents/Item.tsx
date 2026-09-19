import { DropdownMenu, Flexbox, Icon } from '@lobehub/ui';
import { ActionIcon } from '@lobehub/ui/base-ui';
import type { RecentItem } from '@orvilo/types';
import { cssVar } from 'antd-style';
import {
  BookmarkIcon,
  FileTextIcon,
  FolderKanbanIcon,
  HashIcon,
  MoreHorizontalIcon,
  UsersIcon,
} from 'lucide-react';
import { memo, useCallback, useState } from 'react';

import InlineRename from '@/components/InlineRename';
import TaskStatusIcon from '@/features/AgentTasks/features/TaskStatusIcon';
import RunningGlyph from '@/features/Home/components/RunningGlyph';
import NavItem from '@/features/NavPanel/components/NavItem';
import { usePrefetchAgent } from '@/hooks/usePrefetchAgent';
import { usePrefetchPage } from '@/hooks/usePrefetchPage';
import { getPlatformIcon } from '@/routes/(main)/agent/channel/const';

import { useRecentItemDropdownMenu } from './useDropdownMenu';

const TYPE_ICON_MAP: Partial<Record<RecentItem['type'], typeof FileTextIcon>> = {
  document: FileTextIcon,
  project: FolderKanbanIcon,
  savedView: BookmarkIcon,
  team: UsersIcon,
  topic: HashIcon,
};

const RecentListItem = memo<RecentItem>((item) => {
  const { title, type, agentId, id, metadata, status } = item;
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
    <Flexbox style={{ position: 'relative' }}>
      <NavItem
        contextMenuItems={hasOverflowMenu ? dropdownMenu : undefined}
        disabled={editing}
        title={title}
        actions={
          hasOverflowMenu ? (
            <DropdownMenu items={menuItems}>
              <ActionIcon icon={MoreHorizontalIcon} size={'small'} style={{ flex: 'none' }} />
            </DropdownMenu>
          ) : undefined
        }
        icon={(() => {
          if (type === 'task') {
            // Same liveness signal as running topics: an executing task wears
            // the animated running mark, not the static status glyph.
            if (status === 'running') return <RunningGlyph size={16} />;
            return <TaskStatusIcon size={16} status={status ?? 'backlog'} />;
          }

          if (type === 'topic' && metadata?.bot?.platform) {
            const ProviderIcon = getPlatformIcon(metadata.bot.platform);
            if (ProviderIcon) {
              return <ProviderIcon color={cssVar.colorTextDescription} size={16} />;
            }
          }
          return (
            <Icon
              icon={IconComponent}
              size={'small'}
              style={{ color: cssVar.colorTextDescription }}
            />
          );
        })()}
        onMouseEnter={handleMouseEnter}
      />
      <InlineRename
        open={editing}
        title={title}
        onOpenChange={(open) => toggleEditing(open)}
        onSave={handleRename}
      />
    </Flexbox>
  );
});

export default RecentListItem;
