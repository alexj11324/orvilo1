'use client';

import { cx } from 'antd-style';
import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';
import {
  type ComponentType,
  createElement,
  type ElementType,
  type FocusEvent,
  type HTMLAttributes,
  isValidElement,
  type KeyboardEvent,
  memo,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { isModifierClick } from '@/utils/navigation';

import { renderSidebarMenuItems, type SidebarMenuItems } from './SidebarDropdownMenu';
import { type LazyActions, useLazyActions } from './useLazyActions';

const ACTION_CLASS_NAME = 'nav-item-actions';
const CONTENT_CLASS_NAME = 'nav-item-content';

// Preserve149's public Emotion cx boundary for the open caller className.
// Only the closed native defaults use cn; opaque registered caller classes never
// enter Tailwind merging. Container, caller, defaults retain the public order.
const twStyles = {
  container: 'group/nav-item relative min-w-8 overflow-hidden select-none',
  interactive:
    'cursor-pointer hover:bg-sidebar-accent hover:transition-none data-[active]:bg-selected data-[active]:hover:bg-selected focus-visible:outline-2 focus-visible:outline-transparent focus-visible:outline-offset-2 focus-visible:inset-ring-3 focus-visible:inset-ring-ring/50',
  actions: [
    'pointer-events-none absolute inset-y-0 end-0 pe-1.5 opacity-0',
    'group-hover/nav-item:pointer-events-auto group-hover/nav-item:opacity-100',
    'group-has-[.nav-item-actions_:focus-visible]/nav-item:pointer-events-auto group-has-[.nav-item-actions_:focus-visible]/nav-item:opacity-100',
    'group-has-[[data-popup-open]]/nav-item:pointer-events-auto group-has-[[data-popup-open]]/nav-item:opacity-100',
    '[@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100',
  ].join(' '),
  content: [
    'group-hover/nav-item:[mask-image:linear-gradient(to_right,black_calc(100%_-_var(--spacing)*14),transparent_calc(100%_-_var(--spacing)*7))]',
    'rtl:group-hover/nav-item:[mask-image:linear-gradient(to_left,black_calc(100%_-_var(--spacing)*14),transparent_calc(100%_-_var(--spacing)*7))]',
    'group-has-[.nav-item-actions_:focus-visible]/nav-item:[mask-image:linear-gradient(to_right,black_calc(100%_-_var(--spacing)*14),transparent_calc(100%_-_var(--spacing)*7))]',
    'rtl:group-has-[.nav-item-actions_:focus-visible]/nav-item:[mask-image:linear-gradient(to_left,black_calc(100%_-_var(--spacing)*14),transparent_calc(100%_-_var(--spacing)*7))]',
    'group-has-[[data-popup-open]]/nav-item:[mask-image:linear-gradient(to_right,black_calc(100%_-_var(--spacing)*14),transparent_calc(100%_-_var(--spacing)*7))]',
    'rtl:group-has-[[data-popup-open]]/nav-item:[mask-image:linear-gradient(to_left,black_calc(100%_-_var(--spacing)*14),transparent_calc(100%_-_var(--spacing)*7))]',
    '[@media(hover:none)]:[mask-image:linear-gradient(to_right,black_calc(100%_-_var(--spacing)*14),transparent_calc(100%_-_var(--spacing)*7))]',
    'rtl:[@media(hover:none)]:[mask-image:linear-gradient(to_left,black_calc(100%_-_var(--spacing)*14),transparent_calc(100%_-_var(--spacing)*7))]',
  ].join(' '),
};

export interface NavItemSlots {
  iconPostfix?: ReactNode;
  titlePrefix?: ReactNode;
}

export interface NavItemProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> {
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
  /** Native class overrides for the owned title and action layout slots. */
  classNames?: { actions?: string; title?: string };
  /** Keep the reveal fade by default; inline action rows can reserve their own space. */
  contentMask?: boolean;
  contextMenuItems?: SidebarMenuItems | (() => SidebarMenuItems);
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
  icon?: ComponentType | LucideIcon | ReactElement;
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
    classNames,
    contentMask = true,
    actions,
    contextMenuItems,
    active,
    href,
    icon,
    iconSize = 16,
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

    const handlePointerEnter = (e: PointerEvent<HTMLElement>) => {
      mountLazyActions();
      onPointerEnter?.(e);
    };

    // Focus, not just the pointer: a keyboard user reaches the row by tabbing,
    // which never fires `pointerenter`. Without this the actions would be absent
    // from the tab order entirely rather than merely invisible.
    const handleFocus = (e: FocusEvent<HTMLElement>) => {
      mountLazyActions();
      onFocus?.(e);
    };

    const iconColor = active ? 'var(--foreground)' : 'var(--foreground-description)';
    const textColor = titleColor ?? (active ? 'var(--foreground)' : 'var(--muted-foreground)');

    const { titlePrefix, iconPostfix } = slots || {};
    // A real anchor lets cmd+click open a new tab; without an href the row is a
    // real button, so it is focusable and Enter / Space activate it. A row that
    // carries its own action buttons cannot nest them inside a button, so it keeps
    // a div exposed as a button.
    const RootElement: ElementType = href ? 'a' : actions ? 'div' : 'button';
    const isPseudoButton = RootElement === 'div';
    const interactiveProps: HTMLAttributes<HTMLElement> & { type?: 'button' } = href
      ? {}
      : isPseudoButton
        ? {
            onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
              // Only the row itself: Enter / Space inside a nested action are its own.
              if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
              e.preventDefault();
              if (!disabled) onClick?.(e as unknown as MouseEvent<HTMLElement>);
            },
            role: 'button',
            tabIndex: disabled ? -1 : 0,
          }
        : { tabIndex: disabled ? -1 : undefined, type: 'button' };

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
      <RootElement
        aria-current={active && href ? 'page' : undefined}
        aria-disabled={disabled || undefined}
        data-active={active || undefined}
        style={mergedStyle}
        className={cx(
          twStyles.container,
          className,
          cn(
            'flex items-center gap-2 rounded-(--radius-button) px-1',
            description ? 'py-2' : 'h-8',
            RootElement === 'button' && 'w-full text-start',
            !disabled && twStyles.interactive,
          ),
        )}
        onClick={(e: MouseEvent<HTMLElement>) => {
          // Always prevent default <a> navigation for normal clicks to avoid full page reload.
          // This must run before any early return to ensure SPA navigation is never bypassed.
          if (href && !isModifierClick(e)) {
            e.preventDefault();
          }
          if (disabled) return;
          onClick?.(e);
        }}
        {...interactiveProps}
        {...rest}
        {...(href ? { href } : undefined)}
        onFocus={handleFocus}
        onPointerEnter={handlePointerEnter}
      >
        {icon && (
          <div
            // The 28px column carries identity tiles and public caller icons;
            // description aligns it to the unchanged 22px body title line.
            className={cn(
              'flex w-7 flex-none items-center justify-center',
              description ? 'h-5.5 self-start' : 'h-8',
            )}
          >
            {loading ? (
              <NeuralNetworkLoading size={iconSize} />
            ) : isValidElement(icon) ? (
              icon
            ) : (
              createElement(icon as ComponentType<{ color?: string; size?: number }>, {
                color: iconColor,
                size: iconSize,
              })
            )}
          </div>
        )}

        {iconPostfix}
        <div
          className={cn(
            CONTENT_CLASS_NAME,
            'flex flex-1 items-center gap-2 overflow-hidden',
            contentMask && twStyles.content,
          )}
        >
          {titlePrefix}
          {description ? (
            <div className="flex flex-col flex-1 gap-0.5 overflow-hidden">
              <div
                className={cn('truncate font-medium text-sm', classNames?.title)}
                style={{ color: textColor }}
                title={typeof title === 'string' ? title : undefined}
              >
                {title}
              </div>
              {description}
            </div>
          ) : (
            <div
              className={cn('flex-1 truncate font-medium text-sm', classNames?.title)}
              style={{ color: textColor }}
              title={typeof title === 'string' ? title : undefined}
            >
              {title}
            </div>
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
            className={cn(
              ACTION_CLASS_NAME,
              'flex items-center justify-end gap-0.5',
              twStyles.actions,
              classNames?.actions,
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {renderedActions}
          </div>
        )}
      </RootElement>
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
