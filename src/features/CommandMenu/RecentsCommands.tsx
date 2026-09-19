import type { RecentItem } from '@orvilo/types';
import { Command } from 'cmdk';
import { BookmarkIcon, FolderKanbanIcon, ListTodo, UsersIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useCacheScope } from '@/libs/swr/useCacheScope';
import { RECENT_SIDEBAR_TYPES, recentService } from '@/services/recent';
import { useGlobalStore } from '@/store/global';

import { useCommandMenuContext } from './CommandMenuContext';
import { CommandItem } from './components';

const RECENT_ICON_MAP: Record<(typeof RECENT_SIDEBAR_TYPES)[number], typeof ListTodo> = {
  project: FolderKanbanIcon,
  savedView: BookmarkIcon,
  task: ListTodo,
  team: UsersIcon,
};

const recentRoutePath = (item: RecentItem) =>
  item.type === 'task'
    ? taskDetailPath(item.id, item.agentId ?? undefined, item.slugTitle)
    : item.routePath;

const RecentsCommands = memo(() => {
  const { t } = useTranslation('common');
  const { onClose } = useCommandMenuContext();
  const navigate = useWorkspaceAwareNavigate();
  const scope = useCacheScope();
  const open = useGlobalStore((s) => s.status.showCommandMenu);

  const { data: recents } = useSWR(open ? ['cmdk-recents', scope] : null, () =>
    recentService.getAll(8, RECENT_SIDEBAR_TYPES),
  );

  if (!recents?.length) return null;

  return (
    <Command.Group heading={t('recents')}>
      {recents.map((item) => {
        const ItemIcon = RECENT_ICON_MAP[item.type as keyof typeof RECENT_ICON_MAP];
        if (!ItemIcon) return null;
        return (
          <CommandItem
            icon={<ItemIcon />}
            key={`${item.type}:${item.id}`}
            keywords={[item.type]}
            value={`recent ${item.type} ${item.title}`}
            onSelect={() => {
              navigate(recentRoutePath(item));
              onClose();
            }}
          >
            {item.title}
          </CommandItem>
        );
      })}
    </Command.Group>
  );
});

RecentsCommands.displayName = 'RecentsCommands';

export default RecentsCommands;
