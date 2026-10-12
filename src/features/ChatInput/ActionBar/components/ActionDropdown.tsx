'use client';

import {
  Menu as MenuPrimitive,
  type MenuPopupProps,
  type MenuPopupState,
} from '@base-ui/react/menu';
import { clsx as cx, cn } from 'cn';
import { type CSSProperties, type ReactElement, type ReactNode, type RefObject } from 'react';
import {
  isValidElement,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import DebugNode from '@/components/DebugNode';
import { POPUP_Z_CLASS } from '@/components/ui/zIndex';
import { useIsMobile } from '@/hooks/useIsMobile';

import { type ActionMenuItem, type MenuInfo, renderMenuItems } from '../../menuItems';
import { popoverPlacement } from '../../popoverPlacement';
import { type MenuOpenChangeDetails, shouldVetoMenuClose } from './menuCloseVeto';

const styles = {
  trigger:
    'outline-none focus-visible:rounded-(--radius-button) focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
};

export type ActionDropdownMenuItem = ActionMenuItem;

export type ActionDropdownMenuItems = ActionMenuItem[];

interface MenuItemsHostProps {
  close: () => void;
  decorate: (items: ActionDropdownMenuItems) => ActionDropdownMenuItems;
  useItems: (ctx: { close: () => void }) => ActionDropdownMenuItems;
}

/**
 * Rendered inside the popup, which Base UI only mounts while the menu is open —
 * so `useItems` and everything it subscribes to stays off the trigger's mount path.
 */
const MenuItemsHost = memo<MenuItemsHostProps>(({ close, decorate, useItems }) => {
  const items = useItems({ close });

  return <>{renderMenuItems(decorate(items ?? []))}</>;
});

MenuItemsHost.displayName = 'ActionDropdownMenuItemsHost';

export type ActionDropdownMenu = {
  className?: string;
  onClick?: (info: MenuInfo) => void;
  style?: CSSProperties;

  items?: ActionDropdownMenuItems | (() => ActionDropdownMenuItems);
  /**
   * Hook form of `items`, invoked from inside the popup so it only runs while the
   * menu is open. Use this when building the items needs hooks (store subscriptions,
   * SWR, local state) that would otherwise run on every mount of the trigger.
   */
  useItems?: (ctx: { close: () => void }) => ActionDropdownMenuItems;
};

export interface ActionDropdownProps {
  children?: ReactNode;
  defaultOpen?: boolean;
  disabled?: boolean;
  maxHeight?: number | string;
  maxWidth?: number | string;
  menu: ActionDropdownMenu;
  minHeight?: number | string;
  minWidth?: number | string;
  modal?: boolean;
  onOpenChange?: (open: boolean, details?: MenuOpenChangeDetails) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  open?: boolean;
  placement?: string;
  popupProps?: {
    className?: MenuPopupProps['className'];
    style?: MenuPopupProps['style'];
  };
  popupRender?: (menu: ReactNode) => ReactNode;
  portalProps?: { container?: HTMLElement | null | RefObject<HTMLElement | null> | ShadowRoot };
  positionerProps?: Record<string, unknown>;
  /**
   * Whether to pre-render the dropdown overlay on mount, to avoid rendering lag on first expand
   */
  prefetch?: boolean;
  trigger?: 'both' | 'click' | 'hover' | ('click' | 'hover')[];
  triggerProps?: Record<string, unknown>;
}

const ActionDropdown = memo<ActionDropdownProps>(
  ({
    children,
    defaultOpen,
    menu,
    trigger,
    maxHeight,
    maxWidth,
    minHeight,
    minWidth,
    onOpenChange,
    onOpenChangeComplete,
    open,
    placement = 'top',
    popupProps,
    popupRender,
    portalProps,
    positionerProps,
    prefetch,

    triggerProps,
    ...rest
  }) => {
    const isMobile = useIsMobile();
    const [uncontrolledOpen, setUncontrolledOpen] = useState(Boolean(defaultOpen));
    const menuItemsRef = useRef<ReactNode[] | null>(null);

    useEffect(() => {
      if (open === undefined) return;
      setUncontrolledOpen(open);
    }, [open]);

    const handleOpenChange = useCallback(
      (nextOpen: boolean, details: Parameters<NonNullable<typeof onOpenChange>>[1]) => {
        if (
          !nextOpen &&
          ((details as MenuOpenChangeDetails)?.reason === 'sibling-open' ||
            shouldVetoMenuClose(details as MenuOpenChangeDetails))
        ) {
          (details as MenuOpenChangeDetails)?.cancel?.();
          return;
        }
        onOpenChange?.(nextOpen, details);
        if (open === undefined) setUncontrolledOpen(nextOpen);
      },
      [onOpenChange, open],
    );

    const handleOpenChangeComplete = useCallback(
      (nextOpen: boolean) => {
        onOpenChangeComplete?.(nextOpen);
        if (!nextOpen) menuItemsRef.current = null;
      },
      [onOpenChangeComplete],
    );

    const isOpen = open ?? uncontrolledOpen;
    const openOnHover = useMemo(() => {
      if (!trigger) return undefined;
      if (trigger === 'both') return true;
      if (Array.isArray(trigger)) return trigger.includes('hover');
      return trigger === 'hover';
    }, [trigger]);
    const resolvedTriggerProps = useMemo(() => {
      if (openOnHover === undefined) return { ...triggerProps };
      return {
        ...triggerProps,
        openOnHover,
      };
    }, [openOnHover, triggerProps]);

    const decorateMenuItems = useCallback(
      (items: ActionDropdownMenuItems): ActionDropdownMenuItems => {
        if (!items) return items;

        return items.map((item) => {
          if (!item) return item;
          if (item.type === 'divider') return item;
          if (item.type === 'group') {
            return {
              ...item,
              children: item.children ? decorateMenuItems(item.children) : item.children,
            };
          }
          // Switch / checkbox items are self-contained: they toggle via `onCheckedChange`,
          // and Base UI already wires up "click the row or the control" for them. Pass them
          // through untouched instead of wrapping their click handler.
          if (item.type === 'switch' || item.type === 'checkbox') {
            return item;
          }

          // Any item carrying a `children` key is a submenu (children may be optional);
          // route them all here so plain items never inherit a submenu's click signature.
          if ('children' in item) {
            const itemOnOpenChange = item.onOpenChange;
            return {
              ...item,
              children: item.children ? decorateMenuItems(item.children) : item.children,
              onOpenChange: (open: boolean, details?: MenuOpenChangeDetails) => {
                if (!open && shouldVetoMenuClose(details)) {
                  details?.cancel?.();
                  return;
                }
                itemOnOpenChange?.(open, details);
              },
              type: 'submenu' as const,
            };
          }
          // Submenus are handled above; everything else is a plain menu item. Base UI's
          // types keep optional-`children` submenu members in scope here, so narrow to the
          // plain-item type before wrapping the click handler.
          const menuItem = item as ActionDropdownMenuItem;
          const itemOnClick = menuItem.onClick;
          const closeOnClick = menuItem.closeOnClick;
          const keepOpenOnClick = closeOnClick === false;
          const itemLabel = menuItem.label;
          const shouldKeepOpen = isValidElement(itemLabel);

          const resolvedCloseOnClick = closeOnClick ?? (shouldKeepOpen ? false : undefined);

          return {
            ...menuItem,
            ...(resolvedCloseOnClick !== undefined ? { closeOnClick: resolvedCloseOnClick } : null),
            onClick: (info: MenuInfo) => {
              if (keepOpenOnClick) {
                info.domEvent.stopPropagation();
                menu.onClick?.(info);
                itemOnClick?.(info);
                return;
              }

              info.domEvent.preventDefault();
              menu.onClick?.(info);
              itemOnClick?.(info);
            },
          };
        });
      },
      [menu],
    );

    const closePopup = useCallback(() => {
      onOpenChange?.(false, { reason: 'item-press' } as never);
      if (open === undefined) setUncontrolledOpen(false);
    }, [onOpenChange, open]);

    const renderedItems = useMemo(() => {
      if (menu.useItems) return null;
      if (!prefetch && !isOpen) return menuItemsRef.current;
      const sourceItems = typeof menu.items === 'function' ? menu.items() : menu.items;
      const nextItems = renderMenuItems(decorateMenuItems(sourceItems ?? []));

      menuItemsRef.current = nextItems;

      return nextItems;
    }, [decorateMenuItems, isOpen, menu, prefetch]);

    const menuContent = useMemo(() => {
      const body = menu.useItems ? (
        <MenuItemsHost close={closePopup} decorate={decorateMenuItems} useItems={menu.useItems} />
      ) : (
        renderedItems
      );

      if (!popupRender) return body;

      return popupRender(body ?? null);
    }, [closePopup, decorateMenuItems, menu.useItems, popupRender, renderedItems]);

    const resolvedPopupClassName = useMemo(() => {
      const popupClassName = popupProps?.className;
      if (typeof popupClassName === 'function') {
        return (state: MenuPopupState) =>
          cx(
            POPUP_Z_CLASS,
            'cn-menu-target cn-menu-translucent min-w-32 rounded-(--radius-overlay) bg-popover p-1 text-popover-foreground shadow-(--shadow-popover) leading-5.5 ring-1 ring-foreground/10 outline-none',
            menu.className,
            popupClassName(state),
          );
      }
      return cx(
        POPUP_Z_CLASS,
        'cn-menu-target cn-menu-translucent min-w-32 rounded-(--radius-overlay) bg-popover p-1 text-popover-foreground shadow-(--shadow-popover) leading-5.5 ring-1 ring-foreground/10 outline-none',
        menu.className,
        popupClassName,
      );
    }, [menu.className, popupProps?.className]);

    const resolvedPopupStyle = useMemo(() => {
      const baseStyle: CSSProperties = {
        maxHeight,
        maxWidth: isMobile ? undefined : maxWidth,
        minHeight,
        minWidth: isMobile ? undefined : minWidth,
        overflowX: 'hidden',
        overflowY: 'scroll',
        width: isMobile ? '100vw' : undefined,
      };
      const popupStyle = popupProps?.style;

      if (typeof popupStyle === 'function') {
        return (state: MenuPopupState) => ({
          ...baseStyle,
          ...menu.style,
          ...popupStyle(state),
        });
      }

      return {
        ...baseStyle,
        ...menu.style,
        ...popupStyle,
      };
    }, [isMobile, maxHeight, maxWidth, menu.style, minHeight, minWidth, popupProps?.style]);

    const resolvedPopupProps = useMemo(() => {
      if (!popupProps) {
        return {
          className: resolvedPopupClassName,
          style: resolvedPopupStyle,
        };
      }

      return {
        ...popupProps,
        className: resolvedPopupClassName,
        style: resolvedPopupStyle,
      };
    }, [popupProps, resolvedPopupClassName, resolvedPopupStyle]);

    const { container: portalContainer, ...restPortalProps } = portalProps ?? {};
    const resolvedPortalContainer = useMemo<HTMLElement | null | undefined>(() => {
      if (!portalContainer) return portalContainer ?? undefined;
      if (typeof portalContainer === 'object' && 'current' in portalContainer) {
        const current = portalContainer.current;
        if (!current) return null;
        if (typeof ShadowRoot !== 'undefined' && current instanceof ShadowRoot) {
          return current.host as HTMLElement;
        }
        return current as HTMLElement;
      }
      if (typeof ShadowRoot !== 'undefined' && portalContainer instanceof ShadowRoot) {
        return portalContainer.host as HTMLElement;
      }
      return portalContainer as HTMLElement;
    }, [portalContainer]);

    const { align, side } = popoverPlacement(isMobile ? 'top' : placement);

    return (
      <>
        <MenuPrimitive.Root
          {...rest}
          defaultOpen={defaultOpen}
          modal={false}
          open={open}
          onOpenChange={handleOpenChange}
          onOpenChangeComplete={handleOpenChangeComplete}
        >
          <MenuPrimitive.Trigger
            className={styles.trigger}
            render={children as ReactElement}
            {...resolvedTriggerProps}
          />
          <MenuPrimitive.Portal container={resolvedPortalContainer} {...restPortalProps}>
            <MenuPrimitive.Positioner
              align={align}
              className={cn('isolate outline-none', POPUP_Z_CLASS)}
              data-hover-trigger={resolvedTriggerProps?.openOnHover ? '' : undefined}
              data-placement={isMobile ? 'top' : placement}
              side={side}
              sideOffset={6}
              {...positionerProps}
            >
              <MenuPrimitive.Popup data-slot="dropdown-menu-content" {...resolvedPopupProps}>
                <Suspense fallback={<DebugNode trace="ActionDropdown > popup" />}>
                  {menuContent}
                </Suspense>
              </MenuPrimitive.Popup>
            </MenuPrimitive.Positioner>
          </MenuPrimitive.Portal>
        </MenuPrimitive.Root>
      </>
    );
  },
);

export default ActionDropdown;
