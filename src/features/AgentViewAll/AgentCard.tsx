'use client';

import { AGENT_CHAT_URL, DEFAULT_AVATAR, GROUP_CHAT_URL } from '@orvilo/const';
import type { SidebarAgentItem } from '@orvilo/types';
import { agentDisplayName, agentSecondaryDisplayName } from '@orvilo/types';
import { cn } from 'cn';
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
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import AgentAvatar from './AgentAvatar';
import { type AgentRowAuthor, formatUpdatedAt } from './AgentRow';
import nativeStyles from './AgentViewAll.module.css';
import ItemActions from './ItemActions';

// Card layout: icon + title + trailing state on one row, a two-line
// description below, hover lift on the whole card.
export const cardStyles = {
  card: 'flex h-full min-h-26 cursor-pointer flex-col gap-2 items-stretch p-4 border border-divider rounded-(--radius-card) text-foreground transition-[transform,box-shadow,border-color] duration-(--orvilo-motion-mid) ease-[ease] hover:border-border hover:shadow-(--shadow-raised)',
  description: 'line-clamp-2 text-sm leading-5.5',
  grid: 'grid w-full min-w-0 grid-cols-3 gap-3 [@media(width<=767.98px)]:grid-cols-2 [@media(width<=575.98px)]:grid-cols-1',
  actions: 'absolute inset-bs-4 inset-e-4',
  link: nativeStyles.cardLink,
  wrapper: 'relative min-w-0 h-full',
  updatedAt: 'flex-none text-xs leading-5 text-muted-foreground',
};

interface AgentCardProps {
  /** Creator profile; rendered only when `showAuthor` is set. */
  author?: AgentRowAuthor | null;
  item: SidebarAgentItem;
  /** Whether to render the author info (workspace mode). */
  showAuthor?: boolean;
}

const AgentCard = memo<AgentCardProps>(({ author, item, showAuthor }) => {
  const { t } = useTranslation('common');
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const { description, id, type, updatedAt } = item;
  // Groups have no personal name, so this resolves to their title.
  const displayTitle = agentDisplayName(item, t('agentViewAll.untitled'));
  const roleTag = agentSecondaryDisplayName(item);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  // Right-click support — same bridge as AgentRow: the hook-bearing menu
  // mounts on the card's pointer-enter and hands its items back via ref.
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
        <div className={cardStyles.wrapper}>
          <WorkspaceLink
            aria-label={displayTitle}
            className={cardStyles.link}
            ref={setAnchor}
            to={type === 'group' ? GROUP_CHAT_URL(id) : AGENT_CHAT_URL(id, false)}
            onPointerEnter={activateMenu}
          >
            <div
              className={cn(
                cardStyles.card,
                animationMode !== 'disabled' && 'motion-safe:hover:-translate-y-px',
              )}
            >
              {/* Right padding reserves the header slot the absolutely
                  positioned "…" sibling overlays. */}
              <div className="flex min-w-0 items-center gap-2 pe-9">
                <AgentAvatar item={item} size={24} />
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <div className="block min-w-0 truncate text-sm leading-5.5 font-semibold">
                    {displayTitle}
                  </div>
                  {roleTag ? (
                    <Tag className="flex-none rounded-(--radius-chip) text-xs leading-5" size="sm">
                      {roleTag}
                    </Tag>
                  ) : null}
                </div>
              </div>
              <div className={cn('text-muted-foreground', cardStyles.description)}>
                {description}
              </div>
              <div className="flex items-center justify-between gap-2 mbs-auto">
                {showAuthor ? (
                  <div className="flex min-w-0 items-center gap-1.5">
                    {author ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="inline-flex">
                                <Avatar avatar={author.avatar || DEFAULT_AVATAR} size={18} />
                              </span>
                            }
                          />
                          <TooltipContent>{author.name}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <div className="text-xs leading-5 text-muted-foreground">–</div>
                    )}
                  </div>
                ) : (
                  <div />
                )}
                <div className={cn('text-xs', cardStyles.updatedAt)}>
                  {updatedAt ? formatUpdatedAt(updatedAt) : '–'}
                </div>
              </div>
            </div>
          </WorkspaceLink>
          <span className={cardStyles.actions}>
            {/* Visible "…" trigger AND right-click open the same menu — the
                context menu alone proved undiscoverable. Rendered as a
                SIBLING of the link (not inside it) so the menu button isn't a
                nested interactive control within the card's <a>. */}
            <ItemActions
              anchor={anchor}
              forceActivated={menuActivated}
              item={item}
              onMenuReady={handleMenuReady}
            />
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {renderSidebarMenuItems(getContextMenuItems(), [], 'context')}
      </ContextMenuContent>
    </ContextMenu>
  );
});

AgentCard.displayName = 'AgentCard';

export default AgentCard;
