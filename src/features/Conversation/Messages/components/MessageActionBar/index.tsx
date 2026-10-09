import { MoreHorizontalIcon } from 'lucide-react';
import {
  createElement,
  type ElementType,
  isValidElement,
  memo,
  type ReactNode,
  useMemo,
} from 'react';
import { useTranslation } from 'react-i18next';

import { MessageAction, MessageActions } from '@/components/ai-elements/message';
import SidebarDropdownMenu, {
  type SidebarMenuItems,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import { usePermission } from '@/hooks/usePermission';

import { type MessageActionItem, type MessageActionItemOrDivider } from '../../../types';
import { resolveSlots } from './resolveSlots';
import { type MessageActionContext, type MessageActionSlot } from './types';
import { useBuildActions } from './useBuildActions';

const VIEWER_BAR: MessageActionSlot[] = ['copy', 'comments'];

// The menu adapter owns keyboard/submenu behavior; each action keeps its real
// callback, including nested entries. Permission filtering stays in the registry.
const toMenu = (items: MessageActionItemOrDivider[]): SidebarMenuItems =>
  items.map((item) => {
    if ('type' in item && item.type === 'divider') return item;
    const { handleClick, children, ...rest } = item as MessageActionItem;
    return {
      ...rest,
      children: children ? toMenu(children) : undefined,
      onClick: () => {
        void handleClick?.();
      },
    };
  });

interface MessageActionBarProps {
  /** Bar slots (always visible as icons) */
  bar: MessageActionSlot[];
  /** Runtime context passed to every action's builder */
  ctx: MessageActionContext;
  /** Custom control rendered first inside the shared action container */
  leading?: ReactNode;
  /** Menu slots (shown in the overflow dropdown); defaults to `bar` when omitted */
  menu?: MessageActionSlot[];
}

/**
 * Universal action bar. Resolves declarative slot keys (`'copy'`, `'edit'`,
 * `'divider'`, ...) against the registry and renders AI Elements actions.
 */
export const MessageActionBar = memo<MessageActionBarProps>(({ ctx, bar, leading, menu }) => {
  const built = useBuildActions(ctx);
  const { allowed: canEdit } = usePermission('edit_own_content');

  const effectiveBar = canEdit ? bar : VIEWER_BAR;
  const effectiveMenu = canEdit ? menu : undefined;
  const [barSlots, menuSlots] = useMemo(() => {
    const shouldPromoteComments =
      Boolean(built.comments) &&
      !effectiveBar.includes('comments') &&
      Boolean(effectiveMenu?.includes('comments'));

    return [
      shouldPromoteComments ? [...effectiveBar, 'comments'] : effectiveBar,
      shouldPromoteComments ? effectiveMenu?.filter((slot) => slot !== 'comments') : effectiveMenu,
    ];
  }, [built.comments, effectiveBar, effectiveMenu]);

  const barItems = useMemo(() => resolveSlots(barSlots, built), [barSlots, built]);
  const menuItems = useMemo(
    () => (menuSlots ? resolveSlots(menuSlots, built) : undefined),
    [menuSlots, built],
  );

  const { t } = useTranslation('common');
  const renderedMenu = useMemo(
    () => (menuItems?.length ? toMenu(menuItems) : undefined),
    [menuItems],
  );
  return (
    <MessageActions aria-label={t('more')} role="toolbar">
      {leading}
      {barItems.map((item, index) => {
        if ('type' in item && item.type === 'divider') return null;
        const action = item as MessageActionItem;
        const label = typeof action.label === 'string' ? action.label : String(action.key);
        const control = (
          <MessageAction
            disabled={action.disabled}
            key={String(action.key ?? index)}
            tooltip={label}
            onClick={() => {
              void action.handleClick?.();
            }}
          >
            {action.icon
              ? isValidElement(action.icon)
                ? action.icon
                : createElement(action.icon as ElementType, {
                    className: action.spin ? 'size-4 animate-spin' : 'size-4',
                  })
              : action.label}
          </MessageAction>
        );
        return action.children?.length ? (
          <SidebarDropdownMenu items={toMenu(action.children)} key={String(action.key)}>
            {control}
          </SidebarDropdownMenu>
        ) : (
          control
        );
      })}
      {renderedMenu && (
        <SidebarDropdownMenu items={renderedMenu}>
          <MessageAction label={t('more')}>
            <MoreHorizontalIcon className="size-4" />
          </MessageAction>
        </SidebarDropdownMenu>
      )}
    </MessageActions>
  );
});

MessageActionBar.displayName = 'MessageActionBar';

export type { MessageActionContext, MessageActionSlot } from './types';
export { DIVIDER_KEY } from './types';
