'use client';

import { INBOX_SESSION_ID } from '@orvilo/const';
import { agentDisplayName } from '@orvilo/types';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { MoreHorizontalIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DEFAULT_AVATAR, DEFAULT_INBOX_AVATAR } from '@/const/meta';
import { type SidebarAgentItem } from '@/database/repositories/home';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useAgentStore } from '@/store/agent';
import { agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const VISIBLE_LIMIT = 5;
// Runtime branding is an identity image; use its public24 frame inside compact32.
const AVATAR_SIZE = 24;

interface SwitchItem {
  avatar?: string;
  background?: string;
  id: string;
  isInbox?: boolean;
  navId: string;
  title: string;
}

const styles = {
  active: 'border-primary bg-selected hover:bg-selected ring-2 ring-(color:--highlight-primary)',
  itemBtn:
    'cursor-pointer box-border inline-flex items-center justify-center size-8 p-0 border border-transparent rounded-(--radius-button) opacity-65 bg-transparent transition-[opacity,border-color,box-shadow] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-out) hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none',
  more: 'flex items-center justify-center size-8 border border-transparent rounded-(--radius-button) text-muted-foreground bg-muted hover:text-foreground hover:bg-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  popover: 'p-0',
  popoverContent: 'w-60 p-2',
  popoverEmpty: 'py-4 px-2 text-sm text-foreground-tertiary text-center',
  popoverList: 'overflow-auto max-h-60',
  popoverRow:
    'cursor-pointer flex gap-2 items-center min-h-8 py-1 px-2 rounded-(--radius-button) text-sm text-foreground hover:bg-selected',
};

const useSwitchItems = (): SwitchItem[] => {
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const inboxMeta = useAgentStore(
    (s) => (inboxAgentId ? agentSelectors.getAgentMetaById(inboxAgentId)(s) : undefined),
    isEqual,
  );
  const pinned = useHomeStore(homeAgentListSelectors.pinnedAgents, isEqual);
  const recent = useHomeStore(homeAgentListSelectors.ungroupedAgents, isEqual);

  return useMemo(() => {
    const inbox: SwitchItem = {
      avatar: inboxMeta?.avatar || DEFAULT_INBOX_AVATAR,
      background: inboxMeta?.backgroundColor,
      id: INBOX_SESSION_ID,
      isInbox: true,
      navId: INBOX_SESSION_ID,
      title: agentDisplayName(inboxMeta, 'Inbox'),
    };

    const fromAgent = (a: SidebarAgentItem): SwitchItem => ({
      avatar: typeof a.avatar === 'string' ? a.avatar : DEFAULT_AVATAR,
      background: a.backgroundColor || undefined,
      id: a.id,
      navId: a.id,
      title: agentDisplayName(a, 'Untitled'),
    });

    const isAgent = (a: SidebarAgentItem): boolean => a.type === 'agent';

    const merged = [
      inbox,
      ...pinned.filter(isAgent).map(fromAgent),
      ...recent.filter(isAgent).map(fromAgent),
    ];

    const seen = new Set<string>();
    return merged.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [inboxMeta, pinned, recent]);
};

const QuickChatAgentSwitcher = memo(() => {
  const { t } = useTranslation('chat');
  // Popup window has its own SPA boot — main sidebar's fetch never fires here,
  // so we trigger the agent list fetch ourselves.
  useFetchAgentList();

  const navigate = useWorkspaceAwareNavigate();
  const { aid } = useParams<{ aid: string }>();
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const items = useSwitchItems();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [search, setSearch] = useState('');

  const visible = items.slice(0, VISIBLE_LIMIT);
  const remaining = items.slice(VISIBLE_LIMIT);

  const filteredRemaining = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return remaining;
    return remaining.filter((i) => i.title.toLowerCase().includes(q));
  }, [remaining, search]);

  const isActive = (item: SwitchItem) => {
    if (item.isInbox) return aid === INBOX_SESSION_ID || aid === inboxAgentId;
    return aid === item.id;
  };

  const handleSelect = (item: SwitchItem) => {
    setPopoverOpen(false);
    setSearch('');
    if (isActive(item)) return;
    navigate(`/popup/agent/${item.navId}`, { replace: true });
  };

  const isReady = useHomeStore(homeAgentListSelectors.isAgentListInit);
  if (!isReady) return null;

  return (
    <div className="flex items-center gap-1.5 justify-start">
      {visible.map((item) => (
        <TooltipProvider key={item.id}>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <button
                    aria-label={item.title}
                    className={cn(styles.itemBtn, isActive(item) && styles.active)}
                    type={'button'}
                    onClick={() => handleSelect(item)}
                  >
                    <AssigneeAvatar agentId={item.id} size={AVATAR_SIZE} />
                  </button>
                </span>
              }
            />
            <TooltipContent>{item.title}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
      {remaining.length > 0 && (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            render={
              <button
                aria-label={t('agentSwitcher.moreAgents')}
                className={styles.more}
                type={'button'}
              >
                <MoreHorizontalIcon size={16} />
              </button>
            }
          />
          <PopoverContent align="center" className={styles.popover} side="bottom">
            <div className={styles.popoverContent}>
              <Input
                placeholder={t('agentSwitcher.searchPlaceholder')}
                value={search}
                visualSize="compact"
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className={cn(styles.popoverList, 'mbs-2')}>
                {filteredRemaining.length === 0 ? (
                  <div className={styles.popoverEmpty}>No agents found</div>
                ) : (
                  filteredRemaining.map((item) => (
                    <div
                      {...clickableProps()}
                      className={cn(styles.popoverRow, CLICKABLE_FOCUS_RING)}
                      key={item.id}
                      onClick={() => handleSelect(item)}
                    >
                      <AssigneeAvatar agentId={item.id} size={24} />
                      <span className="truncate">{item.title}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
});

QuickChatAgentSwitcher.displayName = 'QuickChatAgentSwitcher';

export default QuickChatAgentSwitcher;
