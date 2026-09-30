'use client';

import {
  type DropdownItem,
  type DropdownMenuProps as LegacyDropdownMenuProps,
  type IconProps,
  type MenuInfo,
  type MenuProps,
} from '@lobehub/ui';
import { cn } from 'cn';
import {
  type ComponentType,
  createElement,
  type CSSProperties,
  isValidElement,
  type Key,
  memo,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type MenuItems = (NonNullable<MenuProps['items']>[number] | DropdownItem)[];

interface RenderableItem {
  children?: MenuItems;
  closeOnClick?: boolean;
  danger?: boolean;
  desc?: ReactNode;
  disabled?: boolean;
  extra?: ReactNode;
  icon?: IconProps['icon'];
  key?: Key;
  label?: ReactNode;
  onClick?: (info: MenuInfo) => void;
  title?: ReactNode;
  type?: string;
}

interface LinkLabelProps {
  children?: ReactNode;
  className?: string;
  href?: unknown;
  style?: CSSProperties;
  to?: unknown;
}

export interface SidebarDropdownMenuProps {
  children: ReactElement;
  items: MenuItems | (() => MenuItems);
  onOpenChange?: LegacyDropdownMenuProps['onOpenChange'];
  open?: LegacyDropdownMenuProps['open'];
  placement?: LegacyDropdownMenuProps['placement'];
  portalProps?: LegacyDropdownMenuProps['portalProps'];
}

const getLabel = (item: RenderableItem) => item.label ?? item.title;

const getLinkLabel = (label: ReactNode) => {
  if (
    !isValidElement<LinkLabelProps>(label) ||
    (!('href' in label.props) && !('to' in label.props))
  ) {
    return undefined;
  }

  const { children, ...linkProps } = label.props;
  return {
    content: children,
    render: createElement(label.type, {
      ...linkProps,
      className: cn('text-inherit', label.props.className),
      style: { ...label.props.style, textDecoration: 'none' },
    }),
  };
};

const renderIcon = (icon: RenderableItem['icon']) => {
  if (!icon) return null;
  return isValidElement(icon)
    ? icon
    : createElement(icon as ComponentType<{ 'aria-hidden': boolean }>, { 'aria-hidden': true });
};

const renderContent = (item: RenderableItem, label: ReactNode) => (
  <>
    {renderIcon(item.icon)}
    {item.desc ? (
      <span className="flex min-w-0 flex-1 flex-col">
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">{item.desc}</span>
      </span>
    ) : (
      <span className="min-w-0 flex-1">{label}</span>
    )}
    {item.extra && <span className="ml-auto text-xs text-muted-foreground">{item.extra}</span>}
  </>
);

const invokeItemClick = (
  item: RenderableItem,
  keyPath: string[],
  event: MouseEvent<HTMLElement>,
) => {
  if (!item.onClick) return;
  const key = String(item.key ?? keyPath.at(-1) ?? '');
  item.onClick({ domEvent: event, item: event.currentTarget, key, keyPath } as MenuInfo);
};

export const renderSidebarMenuItems = (
  items: MenuItems,
  keyPath: string[] = [],
  variant: 'dropdown' | 'context' = 'dropdown',
): ReactNode[] => {
  const [Group, Item, Label, Separator, Sub, SubContent, SubTrigger] =
    variant === 'context'
      ? ([
          ContextMenuGroup,
          ContextMenuItem,
          ContextMenuLabel,
          ContextMenuSeparator,
          ContextMenuSub,
          ContextMenuSubContent,
          ContextMenuSubTrigger,
        ] as const)
      : ([
          DropdownMenuGroup,
          DropdownMenuItem,
          DropdownMenuLabel,
          DropdownMenuSeparator,
          DropdownMenuSub,
          DropdownMenuSubContent,
          DropdownMenuSubTrigger,
        ] as const);

  return items.map((sourceItem, index) => {
    if (!sourceItem) return null;
    const item = sourceItem as RenderableItem;
    const key = item.key ?? `${keyPath.join('-') || 'root'}-${index}`;
    const nextKeyPath = [...keyPath, String(key)];
    const label = getLabel(item);

    if (item.type === 'divider') return <Separator key={key} />;

    if (item.type === 'group') {
      return (
        <Group key={key}>
          {label && <Label>{label}</Label>}
          {item.children && renderSidebarMenuItems(item.children, nextKeyPath, variant)}
        </Group>
      );
    }

    if (item.type === 'submenu' || item.children) {
      return (
        <Sub key={key}>
          <SubTrigger
            className={item.danger ? 'text-destructive' : undefined}
            disabled={item.disabled}
          >
            {renderContent(item, label)}
          </SubTrigger>
          <SubContent>
            {renderSidebarMenuItems(item.children ?? [], nextKeyPath, variant)}
          </SubContent>
        </Sub>
      );
    }

    const linkLabel = getLinkLabel(label);
    return (
      <Item
        closeOnClick={item.closeOnClick}
        disabled={item.disabled}
        key={key}
        render={linkLabel?.render}
        variant={item.danger ? 'destructive' : 'default'}
        onClick={(event) => invokeItemClick(item, nextKeyPath, event)}
      >
        {renderContent(item, linkLabel ? linkLabel.content : label)}
      </Item>
    );
  });
};

const SidebarDropdownMenu = memo<SidebarDropdownMenuProps>(
  ({
    children,
    items,
    onOpenChange,
    open,
    placement = 'bottomLeft',
    portalProps: _portalProps,
  }) => {
    const resolvedItems = typeof items === 'function' ? items() : items;
    const side = placement.startsWith('top')
      ? 'top'
      : placement.startsWith('left')
        ? 'left'
        : placement.startsWith('right')
          ? 'right'
          : 'bottom';
    const align =
      placement.endsWith('Left') || placement.endsWith('Top')
        ? 'start'
        : placement.endsWith('Right') || placement.endsWith('Bottom')
          ? 'end'
          : 'center';

    return (
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger render={children} />
        <DropdownMenuContent align={align} side={side}>
          {renderSidebarMenuItems(resolvedItems)}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

SidebarDropdownMenu.displayName = 'SidebarDropdownMenu';

export default SidebarDropdownMenu;
