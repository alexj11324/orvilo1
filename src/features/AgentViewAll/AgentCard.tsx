'use client';

import { AGENT_CHAT_URL, DEFAULT_AVATAR, GROUP_CHAT_URL } from '@orvilo/const';
import type { SidebarAgentItem } from '@orvilo/types';
import { agentDisplayName, agentSecondaryDisplayName } from '@orvilo/types';
import { createStaticStyles, cssVar, responsive } from 'antd-style';
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

import AgentAvatar from './AgentAvatar';
import { type AgentRowAuthor, formatUpdatedAt } from './AgentRow';
import ItemActions from './ItemActions';
import LabelTags from './LabelTags';

// Card layout: icon + title + trailing state on one row, a two-line
// description below, hover lift on the whole card.
export const cardStyles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: stretch;

    min-height: 104px;
    padding-block: 12px;
    padding-inline: 12px;

    transition:
      transform 0.18s,
      box-shadow 0.18s,
      border-color 0.18s;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgb(0 0 0 / 6%);
    }
  `,
  description: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    line-height: 1.5;
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;

    width: 100%;
    min-width: 0;

    ${responsive.md} {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    ${responsive.sm} {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  /* Top-right "…" slot, a SIBLING of the card link (absolutely positioned
     over it) — nesting an interactive menu trigger inside the <a> would put
     a button inside a link in the accessibility tree. Aligned with the
     card's 12px padding so it sits where the header row used to hold it. */
  actions: css`
    position: absolute;
    inset-block-start: 12px;
    inset-inline-end: 12px;
  `,
  link: css`
    display: block;
    min-width: 0;
    height: 100%;
    color: inherit;
  `,
  wrapper: css`
    position: relative;
    min-width: 0;
    height: 100%;
  `,
  updatedAt: css`
    flex: none;
    color: ${cssVar.colorTextQuaternary};
  `,
}));

interface AgentCardProps {
  /** Creator profile; rendered only when `showAuthor` is set. */
  author?: AgentRowAuthor | null;
  item: SidebarAgentItem;
  /** Whether to render the author info (workspace mode). */
  showAuthor?: boolean;
}

const AgentCard = memo<AgentCardProps>(({ author, item, showAuthor }) => {
  const { t } = useTranslation('common');
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
              className={cn('flex flex-col', cardStyles.card)}
              style={{
                cursor: 'pointer',
                height: '100%',
                border: `1px solid ${cssVar.colorBorder}`,
                borderRadius: cssVar.borderRadiusLG,
              }}
            >
              {/* Right padding reserves the header slot the absolutely
                  positioned "…" sibling overlays. */}
              <div
                className="flex items-center gap-2"
                style={{ minWidth: 0, paddingInlineEnd: 28 }}
              >
                <AgentAvatar item={item} size={24} />
                <div className="flex items-center flex-1 gap-1.5" style={{ minWidth: 0 }}>
                  <div className="truncate block font-semibold" style={{ minWidth: 0 }}>
                    {displayTitle}
                  </div>
                  {roleTag ? (
                    <Tag size="sm" style={{ flex: 'none' }}>
                      {roleTag}
                    </Tag>
                  ) : null}
                </div>
              </div>
              <div className={cn('text-[12px]', 'text-muted-foreground', cardStyles.description)}>
                {description}
              </div>
              {item.labels?.length ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <LabelTags labels={item.labels} />
                </div>
              ) : null}
              <div
                className="flex items-center gap-2 justify-between"
                style={{ marginBlockStart: 'auto' }}
              >
                {showAuthor ? (
                  <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                    {author ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span style={{ display: 'inline-flex' }}>
                                <Avatar avatar={author.avatar || DEFAULT_AVATAR} size={18} />
                              </span>
                            }
                          />
                          <TooltipContent>{author.name}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <div className="text-[12px] text-muted-foreground">–</div>
                    )}
                  </div>
                ) : (
                  <div />
                )}
                <div className={cn('text-[12px]', cardStyles.updatedAt)}>
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
