'use client';

import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import type { LucideIcon } from 'lucide-react';
import {
  type ComponentProps,
  createElement,
  type ElementType,
  type FocusEvent,
  memo,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { isModifierClick } from '@/utils/navigation';

import { renderSidebarMenuItems, type SidebarDropdownMenuProps } from './SidebarDropdownMenu';
import { type LazyActions, useLazyActions } from './useLazyActions';

type SidebarMenuItemData = Exclude<SidebarDropdownMenuProps['items'], () => unknown>[number];

const ACTION_CLASS_NAME = 'nav-item-actions';
const CONTENT_CLASS_NAME = 'nav-item-content';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    user-select: none;
    overflow: hidden;
    min-width: 32px;

    /* Overlay instead of in-flow so revealing the actions never re-truncates the title. */
    .${ACTION_CLASS_NAME} {
      pointer-events: none;

      position: absolute;
      inset-block: 0;
      inset-inline-end: 0;

      padding-inline-end: 6px;

      opacity: 0;
    }

    /* focus-visible, not focus-within: closing a dropdown hands focus back to its
       trigger, which would pin the actions open after the pointer has left. */
    &:hover,
    &:has(.${ACTION_CLASS_NAME} :focus-visible),
    &:has([data-popup-open]) {
      .${ACTION_CLASS_NAME} {
        pointer-events: auto;
        opacity: 1;
      }

      /* Fade the covered text itself instead of painting a row-colored plate over it,
         so the overlay matches any row background (hover / active / none). */
      .${CONTENT_CLASS_NAME} {
        mask-image: linear-gradient(
          to right,
          #000 calc(100% - 56px),
          transparent calc(100% - 28px)
        );
      }
    }

    @media (hover: none) {
      .${ACTION_CLASS_NAME} {
        pointer-events: auto;
        opacity: 1;
      }

      .${CONTENT_CLASS_NAME} {
        mask-image: linear-gradient(
          to right,
          #000 calc(100% - 56px),
          transparent calc(100% - 28px)
        );
      }
    }
  `,
}));

export interface NavItemSlots {
  iconPostfix?: ReactNode;
  titlePrefix?: ReactNode;
}

export interface NavItemProps extends Omit<ComponentProps<'div'>, 'children' | 'title'> {
  /**
   * Pass a thunk to defer mounting until the row is first pointed at or focused.
   * Hover-capable pointers keep actions invisible until `:hover`; `@media (hover: none)`
   * keeps them visible. An overlay-bearing action (a dropdown, a popover) costs a
   * dozen fibers per row — enough to matter in a list. Focus counts as well as the
   * pointer: a keyboard user tabs to the row and must still find the actions in the
   * tab order. Once mounted it stays mounted, so an open popup survives the pointer
   * leaving the row.
   */
  actions?: LazyActions;
  active?: boolean;
  contextMenuItems?: SidebarMenuItemData[] | (() => SidebarMenuItemData[]);
  /**
   * Optional second line rendered under the title (e.g. a topic's project
   * directory). When set, the row grows to fit both lines; when omitted the
   * layout is byte-identical to a single-line row.
   */
  description?: ReactNode;
  disabled?: boolean;
  extra?: ReactNode;
  /**
   * Optional href for cmd+click to open in new tab
   */
  href?: string;
  icon?: LucideIcon;
  iconSize?: number;
  loading?: boolean;
  slots?: NavItemSlots;
  title: ReactNode;
  /**
   * Override the title text color. Defaults to colorText when active and
   * colorTextSecondary otherwise. Pass cssVar.colorText to keep a row's title
   * fully emphasized regardless of active state (e.g. topic titles).
   */
  titleColor?: string;
}

const NavItem = memo<NavItemProps>(
  ({
    className,
    actions,
    contextMenuItems,
    active,
    href,
    icon,
    iconSize = 18,
    title,
    titleColor,
    description,
    onClick,
    disabled,
    loading,
    extra,
    slots,
    style,
    onFocus,
    onPointerEnter,
    ...rest
  }) => {
    const { mount: mountLazyActions, node: renderedActions } = useLazyActions(actions);

    const handlePointerEnter = (e: PointerEvent<HTMLDivElement>) => {
      mountLazyActions();
      onPointerEnter?.(e);
    };

    // Focus, not just the pointer: a keyboard user reaches the row by tabbing,
    // which never fires `pointerenter`. Without this the actions would be absent
    // from the tab order entirely rather than merely invisible.
    const handleFocus = (e: FocusEvent<HTMLDivElement>) => {
      mountLazyActions();
      onFocus?.(e);
    };

    const iconColor = active ? cssVar.colorText : cssVar.colorTextDescription;
    const textColor = titleColor ?? (active ? cssVar.colorText : cssVar.colorTextSecondary);

    const { titlePrefix, iconPostfix } = slots || {};
    // Render a real anchor so cmd+click can open in a new tab
    const Tag: ElementType = href ? 'a' : 'div';

    const mergedStyle =
      href || disabled || style
        ? {
            ...(href ? { color: 'inherit', textDecoration: 'none' } : undefined),
            // `disabled` only blocks the click by itself — dim the row so the
            // blocked state is visible instead of a silently dead button.
            ...(disabled ? { cursor: 'not-allowed', opacity: 0.5 } : undefined),
            ...style,
          }
        : undefined;

    const Content = (
      <Tag
        className={cx(
          cx(styles.container, className),
          'flex items-center gap-2 px-1',
          !disabled && 'cursor-pointer hover:bg-[var(--ant-color-fill-secondary)]',
        )}
        style={{
          borderRadius: cssVar.borderRadius,
          ...(active ? { background: cssVar.colorFillTertiary } : undefined),
          height: description ? undefined : 28,
          paddingBlock: description ? 8 : undefined,
          ...mergedStyle,
        }}
        onClick={(e: MouseEvent<HTMLElement>) => {
          // Always prevent default <a> navigation for normal clicks to avoid full page reload.
          // This must run before any early return to ensure SPA navigation is never bypassed.
          if (href && !isModifierClick(e)) {
            e.preventDefault();
          }
          if (disabled) return;
          onClick?.(e);
        }}
        {...rest}
        {...(href ? { href } : undefined)}
        onFocus={handleFocus}
        onPointerEnter={handlePointerEnter}
      >
        {icon && (
          <div
            className="flex flex-none items-center justify-center"
            // With a description the row is two lines tall; align the leading icon
            // to the title's first line (match its line-height) instead of letting
            // it center across both lines, which drops it into the gap.
            style={{
              alignSelf: description ? 'flex-start' : undefined,
              height: description ? 22 : 28,
              width: 28,
            }}
          >
            {loading ? (
              <NeuralNetworkLoading size={iconSize} />
            ) : (
              createElement(icon, { color: iconColor, size: iconSize })
            )}
          </div>
        )}

        {iconPostfix}
        <div
          className={cx(CONTENT_CLASS_NAME, 'flex items-center flex-1 gap-2')}
          style={{ overflow: 'hidden' }}
        >
          {titlePrefix}
          {description ? (
            <div className="flex flex-col flex-1 gap-[3px]" style={{ overflow: 'hidden' }}>
              <Text
                color={textColor}
                ellipsis={{ tooltipWhenOverflow: true }}
                fontSize={13}
                weight={500}
              >
                {title}
              </Text>
              {description}
            </div>
          ) : (
            <Text
              color={textColor}
              fontSize={13}
              style={{ flex: 1 }}
              weight={500}
              ellipsis={{
                tooltipWhenOverflow: true,
              }}
            >
              {title}
            </Text>
          )}
          {extra && (
            <div
              className="flex items-center gap-0.5 justify-end"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {extra}
            </div>
          )}
        </div>
        {actions && (
          <div
            className={cx(ACTION_CLASS_NAME, 'flex items-center gap-0.5 justify-end')}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {renderedActions}
          </div>
        )}
      </Tag>
    );
    if (!contextMenuItems) return Content;
    return (
      <ContextMenu>
        <ContextMenuTrigger render={Content} />
        <ContextMenuContent>
          {renderSidebarMenuItems(
            typeof contextMenuItems === 'function' ? contextMenuItems() : contextMenuItems,
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  },
);

NavItem.displayName = 'NavItem';

export default NavItem;
