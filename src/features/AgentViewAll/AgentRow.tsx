'use client';

import { AGENT_CHAT_URL, DEFAULT_AVATAR, GROUP_CHAT_URL } from '@orvilo/const';
import type { SidebarAgentItem } from '@orvilo/types';
import { agentDisplayName, agentSecondaryDisplayName } from '@orvilo/types';
import { formatAbsoluteDate, formatAbsoluteDateTime } from '@orvilo/utils/time';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { Badge as Tag } from '@/components/reui/badge';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  renderSidebarMenuItems,
  type SidebarMenuItems,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import AgentAvatar from './AgentAvatar';
import nativeStyles from './AgentViewAll.module.css';
import ItemActions from './ItemActions';

/** Author avatar slot — reserved even when the author is unknown. */
const AUTHOR_COL_WIDTH = 20;

const styles = {
  identity: nativeStyles.identity,
  row: 'py-2 px-3 rounded-(--radius-card) text-foreground hover:bg-muted',
  updatedAt:
    'flex-none min-w-22 text-xs leading-5 text-muted-foreground text-end whitespace-nowrap',
};

/** < 7 days → relative time; older → plain date (mirrors TopicSelector). */
export const formatUpdatedAt = (updatedAt: Date | number | string) =>
  dayjs().diff(dayjs(updatedAt), 'd') < 7
    ? dayjs(updatedAt).fromNow()
    : formatAbsoluteDate(updatedAt);

export interface AgentRowAuthor {
  avatar?: string | null;
  name?: string | null;
}

interface AgentRowProps {
  /** Creator profile; rendered only when `showAuthor` is set. */
  author?: AgentRowAuthor | null;
  item: SidebarAgentItem;
  /** Whether to render the author column (workspace mode). */
  showAuthor?: boolean;
}

const AgentRow = memo<AgentRowProps>(({ author, item, showAuthor }) => {
  const { t } = useTranslation('common');
  const { id, type, updatedAt } = item;
  // Groups have no personal name, so this resolves to their title.
  const displayTitle = agentDisplayName(item, t('agentViewAll.untitled'));
  const roleTag = agentSecondaryDisplayName(item);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  // Right-click support (Task-List-style): the hook-bearing menu mounts on
  // the ROW's pointer-enter (which always precedes a right-click) and hands
  // its filtered items back via ref for the ContextMenuTrigger.
  const [menuActivated, setMenuActivated] = useState(false);
  const activateMenu = useCallback(() => setMenuActivated(true), []);
  const [contextMenuItems, setContextMenuItems] = useState<SidebarMenuItems>([]);
  const handleMenuReady = useCallback((getItems: () => SidebarMenuItems) => {
    setContextMenuItems(getItems());
  }, []);
  const getContextMenuItems = useCallback(() => contextMenuItems, [contextMenuItems]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={cn('flex items-center gap-3', styles.row)}
          ref={setAnchor}
          onPointerEnter={activateMenu}
        >
          <WorkspaceLink
            aria-label={displayTitle}
            className={styles.identity}
            to={type === 'group' ? GROUP_CHAT_URL(id) : AGENT_CHAT_URL(id, false)}
          >
            <AgentAvatar item={item} size={28} />
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Single-line row (Linear-style density) — the description only
                renders in card mode, where there is room to browse. */}
              <div className="flex min-w-0 items-center gap-1.5">
                <div
                  className={cn(
                    'truncate',
                    'block',
                    'text-sm leading-5.5 font-medium',
                    'agent-row-title',
                    nativeStyles.rowTitle,
                  )}
                >
                  {displayTitle}
                </div>
                {roleTag ? (
                  <Tag className="flex-none rounded-(--radius-chip) text-xs leading-5" size="sm">
                    {roleTag}
                  </Tag>
                ) : null}
              </div>
            </div>
          </WorkspaceLink>
          {/* Trailing cluster (Task-list-style): author avatar +
            update time as one tight right-aligned group. */}
          <div className="flex flex-none max-w-105 items-center justify-end gap-2 overflow-hidden">
            {showAuthor && (
              // The slot is reserved even without an author, so an unknown
              // author doesn't shift the row's update time sideways.
              <div className="flex flex-none w-5 flex-col">
                {author && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="inline-flex">
                            <Avatar
                              avatar={author.avatar || DEFAULT_AVATAR}
                              size={AUTHOR_COL_WIDTH}
                            />
                          </span>
                        }
                      />
                      <TooltipContent>{author.name}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
            <div
              className={cn('text-xs', styles.updatedAt)}
              title={updatedAt ? formatAbsoluteDateTime(updatedAt) : undefined}
            >
              {updatedAt ? formatUpdatedAt(updatedAt) : '–'}
            </div>
          </div>
          <div className="flex flex-none w-8 items-center gap-1">
            {/* Visible "…" trigger AND right-click open the same menu — the
              context menu alone proved undiscoverable (users assumed rows had
              no actions). */}
            <ItemActions
              anchor={anchor}
              forceActivated={menuActivated}
              item={item}
              onMenuReady={handleMenuReady}
            />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {renderSidebarMenuItems(getContextMenuItems(), [], 'context')}
      </ContextMenuContent>
    </ContextMenu>
  );
});

AgentRow.displayName = 'AgentRow';

export default AgentRow;
