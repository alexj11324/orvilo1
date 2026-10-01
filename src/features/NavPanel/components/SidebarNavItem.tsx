'use client';

import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import {
  type ButtonHTMLAttributes,
  type ComponentType,
  createElement,
  type FocusEvent,
  isValidElement,
  memo,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { isModifierClick } from '@/utils/navigation';

import type { NavItemProps } from './NavItem';
import SidebarContextMenu from './SidebarContextMenu';
import { useLazyActions } from './useLazyActions';

const hostStyles = createStaticStyles(({ css }) => ({
  row: css`
    color: inherit;
    text-decoration: none;
  `,
}));

export interface SidebarNavItemProps extends Omit<NavItemProps, 'ref'> {
  ref?: Ref<HTMLElement>;
  render?: ReactElement;
}

const Title = ({ children, color }: { children: ReactNode; color?: string }) => (
  <span className="min-w-0 flex-1 truncate" style={{ color }}>
    {children}
  </span>
);

const SidebarNavItem = memo(
  ({
    ref,
    actions,
    active,
    className,
    contextMenuItems,
    description,
    disabled,
    extra,
    href,
    icon,
    iconSize = 16,
    loading,
    onClick,
    onFocus,
    onPointerEnter,
    render,
    slots,
    style,
    title,
    titleColor,
    ...rest
  }: SidebarNavItemProps) => {
    const { mount: mountLazyActions, node: renderedActions } = useLazyActions(actions);
    const buttonRender = render ?? (href ? <a href={href} /> : undefined);
    const buttonProps = rest as unknown as ButtonHTMLAttributes<HTMLButtonElement>;

    const handleClick = (event: MouseEvent<HTMLElement>) => {
      if (disabled) {
        event.preventDefault();
        return;
      }
      if (href && isModifierClick(event)) return;
      if (href && onClick) event.preventDefault();
      onClick?.(event as unknown as MouseEvent<HTMLDivElement>);
    };

    const handleFocus = (event: FocusEvent<HTMLElement>) => {
      mountLazyActions();
      onFocus?.(event as unknown as FocusEvent<HTMLDivElement>);
    };

    const handlePointerEnter = (event: PointerEvent<HTMLElement>) => {
      mountLazyActions();
      onPointerEnter?.(event as unknown as PointerEvent<HTMLDivElement>);
    };

    const button = (
      <SidebarMenuButton
        {...buttonProps}
        aria-current={active && (href || render) ? 'page' : buttonProps['aria-current']}
        aria-disabled={disabled || buttonProps['aria-disabled']}
        isActive={active}
        ref={ref as Ref<HTMLButtonElement>}
        render={buttonRender}
        style={{ ...(buttonRender ? { textDecoration: 'none' } : undefined), ...style }}
        tabIndex={disabled ? -1 : buttonProps.tabIndex}
        tooltip={typeof title === 'string' ? title : undefined}
        type={buttonRender ? undefined : 'button'}
        className={cn(
          hostStyles.row,
          description && 'h-auto items-start py-2',
          disabled && 'cursor-not-allowed opacity-50',
          !disabled && 'cursor-pointer',
          className,
        )}
        onClick={handleClick}
        onFocus={handleFocus}
        onPointerEnter={handlePointerEnter}
      >
        {icon && (
          <span className="flex size-4 shrink-0 items-center justify-center">
            {loading ? (
              <NeuralNetworkLoading size={iconSize} />
            ) : isValidElement(icon) ? (
              icon
            ) : typeof icon === 'function' || typeof icon === 'object' ? (
              createElement(icon as ComponentType<{ size: number }>, { size: iconSize })
            ) : (
              icon
            )}
          </span>
        )}
        {slots?.iconPostfix}
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden group-data-[collapsible=icon]:hidden">
          {slots?.titlePrefix}
          {description ? (
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
              <Title color={titleColor}>{title}</Title>
              {description}
            </div>
          ) : (
            <Title color={titleColor}>{title}</Title>
          )}
        </div>
      </SidebarMenuButton>
    );

    return (
      <SidebarMenuItem>
        {contextMenuItems ? (
          <SidebarContextMenu items={contextMenuItems}>{button}</SidebarContextMenu>
        ) : (
          button
        )}
        {extra && (
          <SidebarMenuBadge
            className={cn(
              actions && 'group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0',
            )}
          >
            {extra}
          </SidebarMenuBadge>
        )}
        {actions && renderedActions}
      </SidebarMenuItem>
    );
  },
);

SidebarNavItem.displayName = 'SidebarNavItem';

export default SidebarNavItem;
