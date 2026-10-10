'use client';

import { AGENT_CHAT_URL, DEFAULT_AVATAR, GROUP_CHAT_URL } from '@orvilo/const';
import type { SidebarAgentItem } from '@orvilo/types';
import { agentDisplayName, agentSecondaryDisplayName } from '@orvilo/types';
import { formatAbsoluteDate, formatAbsoluteDateTime } from '@orvilo/utils/time';
import { createStaticStyles } from 'antd-style';
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
import ItemActions from './ItemActions';

/** Fixed action-column width (the "…" menu) so rows stay aligned. */
export const ACTION_COL_WIDTH = 32;

/** Author avatar slot — reserved even when the author is unknown. */
const AUTHOR_COL_WIDTH = 20;

const styles = createStaticStyles(({ css, cssVar }) => ({
  // The link spans the name column (not the whole row) — a management list
  // is for scanning and acting, and a full-row link turns clicks on the
  // author / timestamp / action columns into a navigation. The name column
  // stays a generous target, including the space right of a short title.
  identity: css`
    cursor: pointer;

    display: flex;
    flex: 1;
    gap: 12px;
    align-items: center;

    min-width: 0;

    color: inherit;

    &:hover .agent-row-title {
      text-decoration: underline;
    }
  `,
  row: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadiusLG};
    color: inherit;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  /**
   * Reserved width, right-aligned: "3 天前" and "2026-07-22" differ by ~30px,
   * and a content-sized column puts the author avatar and the label pills at a
   * different x on every row. `min-width` (not `width`) so an unusually long
   * relative string — en's "a few seconds ago" — grows instead of truncating.
   */
  updatedAt: css`
    flex: none;

    min-width: 88px;

    color: ${cssVar.colorTextQuaternary};
    text-align: end;
    white-space: nowrap;
  `,
}));

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
            <div className="flex flex-col flex-1" style={{ minWidth: 0 }}>
              {/* Single-line row (Linear-style density) — the description only
                renders in card mode, where there is room to browse. */}
              <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                <div className={cn('truncate', 'block', 'font-medium', 'agent-row-title')}>
                  {displayTitle}
                </div>
                {roleTag ? (
                  <Tag size="sm" style={{ flex: 'none' }}>
                    {roleTag}
                  </Tag>
                ) : null}
              </div>
            </div>
          </WorkspaceLink>
          {/* Trailing cluster (Task-list-style): author avatar +
            update time as one tight right-aligned group. */}
          <div
            className="flex items-center gap-2 justify-end"
            style={{ flex: 'none', maxWidth: 420, overflow: 'hidden' }}
          >
            {showAuthor && (
              // The slot is reserved even without an author, so an unknown
              // author doesn't shift the row's update time sideways.
              <div className="flex flex-col" style={{ flex: 'none', width: AUTHOR_COL_WIDTH }}>
                {author && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span style={{ display: 'inline-flex' }}>
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
              className={cn('text-[12px]', styles.updatedAt)}
              title={updatedAt ? formatAbsoluteDateTime(updatedAt) : undefined}
            >
              {updatedAt ? formatUpdatedAt(updatedAt) : '–'}
            </div>
          </div>
          <div
            className="flex items-center gap-1"
            style={{ flex: 'none', width: ACTION_COL_WIDTH }}
          >
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
