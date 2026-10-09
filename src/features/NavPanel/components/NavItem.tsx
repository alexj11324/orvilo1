'use client';

import { createStaticStyles, cssVar } from 'antd-style';
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

const styles = createStaticStyles(({ css }) => ({
  interactive: css`
    cursor: pointer;

    /* Hover and selected share the sidebar roles used by the primary rows:
       --sidebar-accent for hover, the stronger --selected for the current row.
       The doubled selector keeps the host's unlayered anchor reset (link colour,
       colour transition, blue focus outline) from overriding them. */
    &&:hover {
      background-color: var(--sidebar-accent);
      transition-property: none;
    }

    &&[data-active] {
      background-color: var(--selected);
    }

    /* Same ring as the Button primitive (focus-visible:ring-3 ring-ring/50): 3px at 50% of
       --ring. Drawn inset because rows sit flush in accordion / scroll-area wrappers
       (overflow: hidden) that would clip an outer ring. */
    &&:focus-visible {
      outline: 2px solid transparent;
      outline-offset: 2px;
      box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent);
    }
  `,
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

    const iconColor = active ? cssVar.colorText : cssVar.colorTextDescription;
    const textColor = titleColor ?? (active ? cssVar.colorText : cssVar.colorTextSecondary);

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
        className={cn(
          styles.container,
          className,
          'flex items-center gap-2 px-1',
          RootElement === 'button' && 'w-full text-left',
          !disabled && styles.interactive,
        )}
        style={{
          borderRadius: cssVar.borderRadius,
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
        {...interactiveProps}
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
          className={cn(CONTENT_CLASS_NAME, 'flex flex-1 items-center gap-2')}
          style={{ overflow: 'hidden' }}
        >
          {titlePrefix}
          {description ? (
            <div className="flex flex-col flex-1 gap-[3px]" style={{ overflow: 'hidden' }}>
              <div
                className="truncate font-medium text-[13px]"
                style={{ color: textColor }}
                title={typeof title === 'string' ? title : undefined}
              >
                {title}
              </div>
              {description}
            </div>
          ) : (
            <div
              className="flex-1 truncate font-medium text-[13px]"
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
            className={cn(ACTION_CLASS_NAME, 'flex items-center justify-end gap-0.5')}
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
